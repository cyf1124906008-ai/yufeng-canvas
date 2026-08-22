import { Context } from '@deepseek-ai/cordis'
import { createScope } from '@deepseek-ai/dsh-scope'

import { WorkbenchSession } from '../workbench/WorkbenchSession.js'
import { sanitizeWorkbenchValue } from '../workbench/protocol.js'
import {
  DEEPSEEK_HARNESS_UPSTREAM,
  DEEPSEEK_HARNESS_VERSIONS,
  HARNESS_PLUGIN_IDS,
  HARNESS_SERVICES
} from './constants.js'
import {
  createBootstrapSessionFactory,
  createHarnessPluginDefinitions
} from './plugins.js'

const FIBER_STATES = Object.freeze([
  'pending',
  'loading',
  'active',
  'failed',
  'disposed',
  'unloading'
])

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const entry of Object.values(value)) deepFreeze(entry, seen)
  return Object.freeze(value)
}

function harnessError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined)
  error.code = code
  return error
}

function fiberState(fiber) {
  if (!fiber) return 'missing'
  return FIBER_STATES[fiber.state] || 'unknown'
}

function sessionLifecyclePlugin(_ctx, config) {
  return () => config.session.cancel('DeepSeek Harness session scope disposed')
}

sessionLifecyclePlugin.inject = []

export class WorkbenchHarnessKernel {
  constructor({
    plannerFactory,
    toolRegistry,
    SessionClass = WorkbenchSession,
    now = Date.now
  } = {}) {
    if (typeof plannerFactory !== 'function') {
      throw new TypeError('WorkbenchHarnessKernel requires plannerFactory')
    }
    if (!toolRegistry || typeof toolRegistry.list !== 'function') {
      throw new TypeError('WorkbenchHarnessKernel requires toolRegistry')
    }

    this.context = new Context()
    this.now = now
    this.lifecycle = 'starting'
    this.disposed = false
    this.activationSequence = 0
    this.errors = []
    this.listeners = new Set()
    this.sessionRecords = new Map()
    this.pluginRecords = new Map()
    this.bootstrapSessionFactory = createBootstrapSessionFactory({
      plannerFactory,
      toolRegistry,
      SessionClass
    })

    const onActivate = id => {
      const record = this.pluginRecords.get(id)
      if (record && record.activationIndex == null) {
        record.activationIndex = ++this.activationSequence
      }
    }
    const onDeactivate = id => {
      const record = this.pluginRecords.get(id)
      if (record) record.deactivationCount += 1
    }

    try {
      const definitions = createHarnessPluginDefinitions({
        plannerFactory,
        toolRegistry,
        SessionClass,
        onActivate,
        onDeactivate
      })
      for (const definition of definitions) this.#mount(definition)
    } catch (error) {
      this.#recordError('HARNESS_BOOTSTRAP_FAILED', error, 'kernel')
      this.lifecycle = 'degraded'
    }

    this.ready = this.#settlePlugins()
  }

  #mount(definition) {
    const fiber = this.context.plugin(definition.plugin, definition.config)
    this.pluginRecords.set(definition.id, {
      ...definition,
      fiber,
      activationIndex: null,
      deactivationCount: 0,
      requestedUnload: false
    })
    return fiber
  }

  async #settlePlugins() {
    const records = [...this.pluginRecords.values()]
    let results = []
    for (let pass = 0; pass < 8; pass += 1) {
      await Promise.resolve()
      results = await Promise.allSettled(records.map(record => record.fiber.await()))
      if (records.every(record => !['pending', 'loading', 'unloading'].includes(fiberState(record.fiber)))) {
        break
      }
    }
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index]
      if (result.status === 'rejected') {
        this.#recordError('HARNESS_PLUGIN_START_FAILED', result.reason, records[index].id)
      }
    }
    if (!this.disposed) {
      const coreActive = [
        HARNESS_PLUGIN_IDS.planner,
        HARNESS_PLUGIN_IDS.tools,
        HARNESS_PLUGIN_IDS.sessions
      ].every(id => fiberState(this.pluginRecords.get(id)?.fiber) === 'active')
      this.lifecycle = coreActive && this.errors.length === 0 ? 'ready' : 'degraded'
      this.#notify()
    }
    return this.snapshot()
  }

  #recordError(code, error, source) {
    const sanitized = sanitizeWorkbenchValue({
      message: String(error?.message || error || code)
    })
    this.errors.push({
      code,
      source,
      message: sanitized.message,
      timestamp: this.now()
    })
    if (this.errors.length > 32) this.errors = this.errors.slice(-32)
    this.#notify()
  }

  #notify() {
    if (this.listeners.size === 0) return
    const snapshot = this.snapshot()
    for (const listener of [...this.listeners]) {
      try {
        listener(snapshot)
      } catch {
        // Runtime observers are diagnostic only and cannot break the kernel.
      }
    }
  }

  subscribe(listener) {
    if (typeof listener !== 'function') return () => {}
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  snapshot() {
    const plugins = [...this.pluginRecords.values()].map(record => ({
      id: record.id,
      state: fiberState(record.fiber),
      inject: [...record.inject],
      provides: [...record.provides],
      activationIndex: record.activationIndex,
      deactivationCount: record.deactivationCount
    }))
    const services = Object.entries(HARNESS_SERVICES).map(([role, name]) => ({
      role,
      name,
      available: this.context.get(name) !== undefined,
      provider: plugins.find(plugin => plugin.provides.includes(name))?.id || null
    }))
    const activeSessions = [...this.sessionRecords.values()].filter(record => !record.disposed)
    return deepFreeze({
      lifecycle: this.lifecycle,
      mode: 'cordis',
      upstream: { ...DEEPSEEK_HARNESS_UPSTREAM },
      versions: { ...DEEPSEEK_HARNESS_VERSIONS },
      pluginCount: plugins.length,
      plugins,
      serviceCount: services.filter(service => service.available).length,
      services,
      scopes: {
        lifecycleScoped: true,
        authorityBoundary: false,
        sessionCount: activeSessions.length,
        active: activeSessions.map(record => record.session.sessionId)
      },
      scopeCount: activeSessions.length,
      sessionCount: activeSessions.length,
      errors: this.errors.map(error => ({ ...error }))
    })
  }

  createSession(options = {}) {
    if (this.disposed) {
      throw harnessError('HARNESS_DISPOSED', 'DeepSeek Harness kernel 已销毁，不能创建任务')
    }

    const mountedFactory = this.context.get(HARNESS_SERVICES.sessionFactory)
    if (this.lifecycle !== 'starting' && !mountedFactory) {
      const error = harnessError(
        'HARNESS_SESSION_FACTORY_UNAVAILABLE',
        'DeepSeek Harness session factory 不可用；已停止创建未受管任务'
      )
      this.#recordError(error.code, error, HARNESS_PLUGIN_IDS.sessions)
      throw error
    }

    let binding
    try {
      binding = (mountedFactory || this.bootstrapSessionFactory).create(options)
    } catch (error) {
      this.#recordError('HARNESS_SESSION_CREATE_FAILED', error, HARNESS_PLUGIN_IDS.sessions)
      throw error
    }

    const key = Object.freeze({
      kind: 'dataeyes.workbench-session',
      sessionId: binding.session.sessionId
    })
    let scope
    try {
      scope = createScope(this.context, key)
      scope.ctx.plugin(sessionLifecyclePlugin, { session: binding.session })
    } catch (error) {
      binding.session.cancel('DeepSeek Harness scope creation failed')
      void scope?.dispose()
      const wrapped = harnessError(
        'HARNESS_SESSION_SCOPE_CREATE_FAILED',
        'DeepSeek Harness 无法为任务建立生命周期 scope',
        error
      )
      this.#recordError(wrapped.code, error, binding.session.sessionId)
      throw wrapped
    }

    this.sessionRecords.set(binding.session, {
      ...binding,
      key,
      scope,
      disposed: false,
      disposePromise: null
    })
    this.#notify()
    return binding.session
  }

  plannerFor(session) {
    return this.sessionRecords.get(session)?.planner || null
  }

  contextForSession(session) {
    const record = this.sessionRecords.get(session)
    return record && !record.disposed ? record.scope.ctx : null
  }

  async disposeSession(session, reason = 'DeepSeek Harness session disposed') {
    const record = this.sessionRecords.get(session)
    if (!record) return false
    if (record.disposePromise) return record.disposePromise
    record.disposed = true
    session.cancel(reason)
    this.#notify()
    record.disposePromise = Promise.resolve(record.scope.dispose())
      .catch(error => {
        this.#recordError('HARNESS_SESSION_SCOPE_DISPOSE_FAILED', error, session.sessionId)
        throw error
      })
      .finally(() => {
        this.sessionRecords.delete(session)
        this.#notify()
      })
      .then(() => true)
    return record.disposePromise
  }

  async unloadPlugin(id) {
    const record = this.pluginRecords.get(String(id || ''))
    if (!record) return false
    record.requestedUnload = true
    await record.fiber.dispose()
    if (!this.disposed) this.lifecycle = 'degraded'
    this.#notify()
    return true
  }

  async dispose() {
    if (this.disposed) return this.disposePromise
    this.disposed = true
    this.lifecycle = 'disposing'
    this.#notify()
    this.disposePromise = (async () => {
      const sessions = [...this.sessionRecords.keys()]
      await Promise.allSettled(sessions.map(session => this.disposeSession(
        session,
        'DeepSeek Harness kernel disposed'
      )))
      await this.context.fiber.dispose()
      this.lifecycle = 'disposed'
      this.listeners.clear()
      return this.snapshot()
    })()
    return this.disposePromise
  }
}

export function createWorkbenchHarnessKernel(options) {
  return new WorkbenchHarnessKernel(options)
}

export function createCompatibilityWorkbenchHarness({
  plannerFactory,
  toolRegistry,
  SessionClass = WorkbenchSession,
  error,
  now = Date.now
} = {}) {
  const sessions = new Map()
  const listeners = new Set()
  let disposed = false
  const bootstrap = createBootstrapSessionFactory({ plannerFactory, toolRegistry, SessionClass })
  const sanitizedFailure = sanitizeWorkbenchValue({
    message: String(error?.message || error || 'Cordis kernel unavailable')
  })
  const failure = {
    code: error?.code || 'HARNESS_COMPATIBILITY_FALLBACK',
    source: 'kernel',
    message: sanitizedFailure.message,
    timestamp: now()
  }
  const makeSnapshot = () => deepFreeze({
    lifecycle: disposed ? 'disposed' : 'degraded',
    mode: 'compatibility-fallback',
    upstream: { ...DEEPSEEK_HARNESS_UPSTREAM },
    versions: { ...DEEPSEEK_HARNESS_VERSIONS },
    pluginCount: 0,
    plugins: [],
    serviceCount: disposed ? 0 : 3,
    services: Object.entries(HARNESS_SERVICES).map(([role, name]) => ({
      role,
      name,
      available: !disposed,
      provider: 'compatibility-fallback'
    })),
    scopes: {
      lifecycleScoped: false,
      authorityBoundary: false,
      sessionCount: sessions.size,
      active: [...sessions.keys()].map(item => item.sessionId)
    },
    scopeCount: 0,
    sessionCount: sessions.size,
    errors: [{ ...failure }]
  })
  const notify = () => {
    const snapshot = makeSnapshot()
    for (const listener of [...listeners]) listener(snapshot)
  }

  return {
    ready: Promise.resolve().then(makeSnapshot),
    snapshot: makeSnapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    createSession(options) {
      if (disposed) throw harnessError('HARNESS_DISPOSED', '兼容运行时已销毁')
      const binding = bootstrap.create(options)
      sessions.set(binding.session, binding)
      notify()
      return binding.session
    },
    plannerFor: session => sessions.get(session)?.planner || null,
    contextForSession: () => null,
    async disposeSession(session, reason) {
      if (!sessions.has(session)) return false
      session.cancel(reason)
      sessions.delete(session)
      notify()
      return true
    },
    async dispose() {
      if (disposed) return makeSnapshot()
      disposed = true
      for (const session of sessions.keys()) session.cancel('Compatibility harness disposed')
      sessions.clear()
      listeners.clear()
      return makeSnapshot()
    }
  }
}

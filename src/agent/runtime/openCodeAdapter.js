/**
 * Optional OpenCode runtime adapter.
 *
 * OpenCode remains an external, local sidecar.  This module deliberately uses
 * the documented HTTP surface instead of importing the OpenCode SDK so the
 * renderer bundle does not acquire a second agent runtime (or credentials).
 * It targets the v1-compatible endpoints exposed by OpenCode 1.x:
 *
 *   https://opencode.ai/docs/server
 *   https://github.com/anomalyco/opencode
 *   https://github.com/anomalyco/opencode-sdk-js
 *
 * The adapter is transport-only.  It does not persist sessions, start a
 * process, or silently copy YUFENG API keys into OpenCode.  Electron/desktop
 * code can inject a base URL and a process manager later; web builds can use a
 * user-managed `opencode serve` instance.
 */

import { normalizeNextAction, sanitizeWorkbenchValue } from '../workbench/index.js'
import { parseAction } from './workbenchPlanner.js'

export const OPENCODE_DEFAULT_URL = 'http://127.0.0.1:4096'
export const OPENCODE_PROTOCOL = Object.freeze({
  api: 'v1-compatible',
  server: 'opencode serve',
  sdk: '@opencode-ai/sdk',
  source: 'https://github.com/anomalyco/opencode'
})

function cleanString(value) {
  return String(value || '').trim()
}

function normalizeBaseUrl(value = OPENCODE_DEFAULT_URL) {
  const source = cleanString(value || OPENCODE_DEFAULT_URL).replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(source)) {
    const error = new TypeError('OpenCode 地址必须使用 http(s) 协议')
    error.code = 'OPENCODE_INVALID_URL'
    throw error
  }
  return source
}

function queryString(query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach(item => params.append(key, String(item)))
    else params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

function pathForSession(sessionId, suffix = '') {
  const id = cleanString(sessionId)
  if (!id) {
    const error = new TypeError('OpenCode sessionId 不能为空')
    error.code = 'OPENCODE_SESSION_REQUIRED'
    throw error
  }
  return `/session/${encodeURIComponent(id)}${suffix}`
}

function modelReference(value) {
  if (!value) return undefined
  if (typeof value === 'object') {
    const providerID = cleanString(value.providerID || value.provider || value.providerId)
    const modelID = cleanString(value.modelID || value.model || value.id)
    if (!providerID || !modelID) return undefined
    return { providerID, modelID }
  }

  const source = cleanString(value)
  if (!source) return undefined
  const separator = source.indexOf('/')
  if (separator < 1 || separator === source.length - 1) return undefined
  return {
    providerID: source.slice(0, separator),
    modelID: source.slice(separator + 1)
  }
}

async function parseResponseBody(response) {
  if (!response || response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function errorMessage(payload, status) {
  const message = payload?.data?.message || payload?.error?.message || payload?.message
  return cleanString(message) || `OpenCode 请求失败（HTTP ${status}）`
}

export class OpenCodeRequestError extends Error {
  constructor(message, { status = 0, payload = null, path = '' } = {}) {
    super(message)
    this.name = 'OpenCodeRequestError'
    this.code = 'OPENCODE_REQUEST_FAILED'
    this.status = Number(status) || 0
    this.path = cleanString(path)
    // Keep the raw payload available to the caller, but never stringify it in
    // the message (provider responses can contain credentials or media URLs).
    this.payload = payload
  }
}

function combineAbortSignals(signal, controller) {
  if (!signal) return () => {}
  const forward = () => controller.abort(signal.reason)
  if (signal.aborted) forward()
  else signal.addEventListener('abort', forward, { once: true })
  return () => signal.removeEventListener('abort', forward)
}

function parseEventData(data) {
  const source = cleanString(data)
  if (!source) return null
  try {
    return JSON.parse(source)
  } catch {
    return source
  }
}

/**
 * Parse one or more SSE frames.  OpenCode sends `event: message` and JSON in
 * one or more `data:` lines; comments and heartbeat frames are ignored.
 */
export function parseOpenCodeSseChunk(source, { final = false } = {}) {
  let buffer = String(source || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const events = []
  let separator = buffer.indexOf('\n\n')
  while (separator >= 0) {
    const frame = buffer.slice(0, separator)
    buffer = buffer.slice(separator + 2)
    const data = frame
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n')
    const parsed = parseEventData(data)
    if (parsed !== null) events.push(parsed)
    separator = buffer.indexOf('\n\n')
  }

  if (final && buffer.trim()) {
    const data = buffer
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, ''))
      .join('\n')
    const parsed = parseEventData(data)
    if (parsed !== null) events.push(parsed)
    buffer = ''
  }
  return { events, remainder: buffer }
}

async function consumeSseBody(body, onEvent, signal) {
  if (!body) return
  let remainder = ''

  // Browser/Electron fetch exposes a ReadableStream reader.
  if (typeof body.getReader === 'function') {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    try {
      while (true) {
        if (signal?.aborted) return
        const next = await reader.read()
        if (next.done) break
        remainder += decoder.decode(next.value, { stream: true })
        const parsed = parseOpenCodeSseChunk(remainder)
        remainder = parsed.remainder
        for (const event of parsed.events) await onEvent(event)
      }
      remainder += decoder.decode()
    } finally {
      try { reader.releaseLock?.() } catch { /* best effort */ }
    }
  } else if (body[Symbol.asyncIterator]) {
    const decoder = new TextDecoder()
    for await (const chunk of body) {
      if (signal?.aborted) return
      remainder += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      const parsed = parseOpenCodeSseChunk(remainder)
      remainder = parsed.remainder
      for (const event of parsed.events) await onEvent(event)
    }
    remainder += decoder.decode()
  }

  const final = parseOpenCodeSseChunk(remainder, { final: true })
  for (const event of final.events) await onEvent(event)
}

function flattenProviderModels(payload) {
  const providers = Array.isArray(payload?.all) ? payload.all : []
  return providers.flatMap(provider => Object.entries(provider.models || {}).map(([modelId, model]) => ({
    key: `${provider.id}/${modelId}`,
    id: modelId,
    model: modelId,
    modelID: modelId,
    provider: provider.id,
    providerID: provider.id,
    providerLabel: provider.name || provider.id,
    label: model.name || modelId,
    reasoning: model.capabilities?.reasoning === true || model.reasoning === true,
    toolCall: model.capabilities?.toolcall === true || model.tool_call === true,
    attachment: model.capabilities?.attachment === true || model.attachment === true,
    capabilities: model.capabilities || {},
    variants: model.variants || {},
    limit: model.limit || {},
    cost: model.cost || undefined,
    status: model.status || 'active'
  })))
}

function textParts(response) {
  const parts = Array.isArray(response?.parts) ? response.parts : []
  return parts
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('')
}

function plannerResponseText(response) {
  const fromParts = textParts(response)
  if (fromParts) return fromParts
  const info = response?.info || response
  if (typeof info?.content === 'string') return info.content
  if (typeof info?.output_text === 'string') return info.output_text
  if (Array.isArray(info?.content)) return info.content.map(part => part?.text || '').join('')
  return ''
}

function actionFromOpenCode(response) {
  const text = plannerResponseText(response)
  if (!text.trim()) {
    const error = new Error('OpenCode Planner 返回为空')
    error.code = 'EMPTY_OPENCODE_PLAN'
    throw error
  }
  return parseAction(text)
}

/**
 * Create a small, dependency-free client for a user-managed OpenCode server.
 */
export function createOpenCodeAdapter({
  baseUrl = OPENCODE_DEFAULT_URL,
  directory = '',
  fetchImpl = globalThis.fetch,
  headers = {},
  username = '',
  password = ''
} = {}) {
  if (typeof fetchImpl !== 'function') throw new TypeError('OpenCode adapter 需要 fetch 实现')
  const origin = normalizeBaseUrl(baseUrl)
  const defaultDirectory = cleanString(directory)
  const defaultHeaders = {
    Accept: 'application/json',
    ...headers
  }
  if (username || password) {
    const credentials = `${username}:${password}`
    // btoa is not guaranteed in older Node versions; Buffer is only selected
    // when available and is never bundled into the browser path.
    const encoded = typeof btoa === 'function'
      ? btoa(credentials)
      : globalThis.Buffer?.from(credentials).toString('base64')
    if (encoded) defaultHeaders.Authorization = `Basic ${encoded}`
  }

  const request = async (path, {
    method = 'GET',
    query = {},
    body,
    signal,
    requestHeaders = {}
  } = {}) => {
    const url = `${origin}${path}${queryString(query)}`
    const response = await fetchImpl(url, {
      method,
      headers: {
        ...defaultHeaders,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...requestHeaders
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal
    })
    const payload = await parseResponseBody(response)
    if (!response.ok) {
      throw new OpenCodeRequestError(errorMessage(payload, response.status), {
        status: response.status,
        payload,
        path
      })
    }
    return payload
  }

  const withDirectory = query => ({
    ...(defaultDirectory ? { directory: defaultDirectory } : {}),
    ...(query || {})
  })

  const directoryQuery = options => withDirectory(
    cleanString(options?.directory) ? { directory: cleanString(options.directory) } : {}
  )

  const health = options => request('/global/health', {
    signal: options?.signal,
    requestHeaders: { Accept: 'application/json' }
  })

  const listProviders = (options = {}) => request('/provider', {
    query: directoryQuery(options),
    signal: options.signal
  })

  const listModels = async (options = {}) => {
    const payload = await listProviders(options)
    return {
      models: flattenProviderModels(payload),
      providers: Array.isArray(payload?.all) ? payload.all : [],
      connected: Array.isArray(payload?.connected) ? payload.connected : [],
      defaults: payload?.default || {}
    }
  }

  const listTools = (options = {}) => {
    const model = modelReference(options.model)
    if (!model?.providerID || !model?.modelID) {
      const error = new TypeError('OpenCode listTools 需要 provider/model')
      error.code = 'OPENCODE_MODEL_REQUIRED'
      throw error
    }
    return request('/experimental/tool', {
      query: {
        ...directoryQuery(options),
        provider: model.providerID,
        model: model.modelID
      },
      signal: options.signal
    })
  }

  const createSession = (options = {}) => request('/session', {
    method: 'POST',
    query: directoryQuery(options),
    body: {
      ...(cleanString(options.parentID) ? { parentID: cleanString(options.parentID) } : {}),
      ...(cleanString(options.title) ? { title: cleanString(options.title) } : {})
    },
    signal: options.signal
  })

  const prompt = (options = {}) => {
    const sessionId = options.sessionId || options.id
    const text = cleanString(options.text ?? options.content)
    const parts = Array.isArray(options.parts) && options.parts.length
      ? options.parts
      : text ? [{ type: 'text', text }] : []
    if (!parts.length) throw new TypeError('OpenCode prompt 需要 text 或 parts')
    const model = modelReference(options.model)
    return request(pathForSession(sessionId, '/message'), {
      method: 'POST',
      query: directoryQuery(options),
      body: {
        parts,
        ...(model ? { model } : {}),
        ...(cleanString(options.messageID) ? { messageID: cleanString(options.messageID) } : {}),
        ...(cleanString(options.agent) ? { agent: cleanString(options.agent) } : {}),
        ...(cleanString(options.system) ? { system: options.system } : {}),
        ...(cleanString(options.variant) ? { variant: cleanString(options.variant) } : {}),
        ...(options.noReply === true ? { noReply: true } : {}),
        ...(options.tools && typeof options.tools === 'object' ? { tools: options.tools } : {})
      },
      signal: options.signal
    })
  }

  const promptAsync = (options = {}) => {
    const sessionId = options.sessionId || options.id
    const text = cleanString(options.text ?? options.content)
    const parts = Array.isArray(options.parts) && options.parts.length
      ? options.parts
      : text ? [{ type: 'text', text }] : []
    if (!parts.length) throw new TypeError('OpenCode promptAsync 需要 text 或 parts')
    const model = modelReference(options.model)
    return request(pathForSession(sessionId, '/prompt_async'), {
      method: 'POST',
      query: directoryQuery(options),
      body: {
        parts,
        ...(model ? { model } : {}),
        ...(cleanString(options.agent) ? { agent: cleanString(options.agent) } : {}),
        ...(cleanString(options.system) ? { system: options.system } : {}),
        ...(cleanString(options.variant) ? { variant: cleanString(options.variant) } : {})
      },
      signal: options.signal
    })
  }

  const messages = (options = {}) => request(pathForSession(options.sessionId || options.id, '/message'), {
    query: directoryQuery(options),
    signal: options.signal
  })

  const abort = (options = {}) => request(pathForSession(options.sessionId || options.id, '/abort'), {
    method: 'POST',
    query: directoryQuery(options),
    signal: options.signal
  })

  const shell = (options = {}) => request(pathForSession(options.sessionId || options.id, '/shell'), {
    method: 'POST',
    query: directoryQuery(options),
    body: {
      command: cleanString(options.command),
      agent: cleanString(options.agent || 'build'),
      ...(modelReference(options.model) ? { model: modelReference(options.model) } : {})
    },
    signal: options.signal
  })

  const command = (options = {}) => request(pathForSession(options.sessionId || options.id, '/command'), {
    method: 'POST',
    query: directoryQuery(options),
    body: {
      command: cleanString(options.command),
      arguments: options.arguments || {},
      ...(cleanString(options.agent) ? { agent: cleanString(options.agent) } : {}),
      ...(modelReference(options.model) ? { model: modelReference(options.model) } : {})
    },
    signal: options.signal
  })

  const listPermissions = (options = {}) => request('/permission', {
    query: directoryQuery(options),
    signal: options.signal
  })

  const replyPermission = (options = {}) => {
    const requestId = cleanString(options.requestId || options.permissionId || options.id)
    if (!requestId) throw new TypeError('OpenCode permission requestId 不能为空')
    const reply = cleanString(options.reply || options.response)
    if (!['once', 'always', 'reject'].includes(reply)) {
      const error = new TypeError('OpenCode permission reply 必须是 once、always 或 reject')
      error.code = 'OPENCODE_INVALID_PERMISSION_REPLY'
      throw error
    }
    return request(`/permission/${encodeURIComponent(requestId)}/reply`, {
      method: 'POST',
      query: directoryQuery(options),
      body: {
        reply,
        ...(cleanString(options.message) ? { message: cleanString(options.message) } : {})
      },
      signal: options.signal
    })
  }

  const legacyReplyPermission = (options = {}) => {
    const sessionId = options.sessionId || options.session
    const permissionId = cleanString(options.permissionId || options.requestId || options.id)
    if (!permissionId) throw new TypeError('OpenCode permissionId 不能为空')
    const response = cleanString(options.response || options.reply)
    if (!['once', 'always', 'reject'].includes(response)) {
      const error = new TypeError('OpenCode legacy permission response 无效')
      error.code = 'OPENCODE_INVALID_PERMISSION_REPLY'
      throw error
    }
    return request(pathForSession(sessionId, `/permissions/${encodeURIComponent(permissionId)}`), {
      method: 'POST',
      query: directoryQuery(options),
      body: { response },
      signal: options.signal
    })
  }

  const subscribeEvents = async ({
    scope = 'global',
    directory: eventDirectory = defaultDirectory,
    signal,
    onEvent
  } = {}) => {
    if (typeof onEvent !== 'function') throw new TypeError('OpenCode events 需要 onEvent 回调')
    const controller = new AbortController()
    const detach = combineAbortSignals(signal, controller)
    const path = scope === 'instance' ? '/event' : '/global/event'
    const response = await fetchImpl(`${origin}${path}${queryString(
      eventDirectory ? { directory: eventDirectory } : {}
    )}`, {
      headers: {
        ...defaultHeaders,
        Accept: 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    })
    if (!response.ok) {
      const payload = await parseResponseBody(response)
      detach()
      throw new OpenCodeRequestError(errorMessage(payload, response.status), {
        status: response.status,
        payload,
        path
      })
    }
    const done = consumeSseBody(response.body, onEvent, controller.signal)
      .finally(detach)
    return {
      close: () => controller.abort(),
      done,
      response
    }
  }

  return {
    baseUrl: origin,
    directory: defaultDirectory,
    protocol: OPENCODE_PROTOCOL,
    request,
    health,
    listProviders,
    listModels,
    listTools,
    createSession,
    prompt,
    promptAsync,
    messages,
    abort,
    shell,
    command,
    listPermissions,
    replyPermission,
    legacyReplyPermission,
    subscribeEvents,
    events: subscribeEvents
  }
}

/**
 * Adapt OpenCode's text response to the existing Workbench planner contract.
 * OpenCode is asked for one JSON action at a time; its own built-in tools are
 * disabled for this mode so execution remains inside YUFENG's approval and
 * Electron tool boundary.
 */
export function createOpenCodePlanner({
  adapter,
  model,
  agent = 'plan',
  systemPrompt = '你是 YUFENG Desktop Agent 的单步调度器。严格只返回一个 JSON next action，不要调用 OpenCode 内置工具。',
  disabledTools = {
    bash: false,
    read: false,
    write: false,
    edit: false,
    apply_patch: false,
    glob: false,
    grep: false,
    task: false,
    question: false,
    todowrite: false,
    webfetch: false,
    websearch: false
  }
} = {}) {
  if (!adapter || typeof adapter.createSession !== 'function' || typeof adapter.prompt !== 'function') {
    throw new TypeError('OpenCode planner 需要兼容的 adapter')
  }
  let remoteSessionId = ''

  return {
    get sessionId() {
      return remoteSessionId
    },
    async reset() {
      remoteSessionId = ''
    },
    async nextAction({ session, tools, signal } = {}) {
      if (!remoteSessionId) {
        const created = await adapter.createSession({
          title: String(session?.messages?.[0]?.content || 'YUFENG Agent').slice(0, 120),
          signal
        })
        remoteSessionId = created?.id || ''
        if (!remoteSessionId) {
          const error = new Error('OpenCode 创建 session 后没有返回 id')
          error.code = 'OPENCODE_SESSION_ID_MISSING'
          throw error
        }
      }

      const safeSession = sanitizeWorkbenchValue({
        status: session?.status,
        approvalMode: session?.approvalMode,
        turnCount: session?.turnCount,
        messages: session?.messages,
        toolCalls: session?.toolCalls,
        observations: session?.observations,
        plan: session?.plan,
        guidancePending: session?.guidancePending,
        lastGuidance: session?.lastGuidance
      })
      const prompt = [
        '每次只能返回一个 next action JSON 对象。',
        '允许：{"type":"tool_call","name":"工具名","input":{}}、{"type":"message","content":"..."}、{"type":"finish","result":{"content":"..."}}。',
        '不要输出 Markdown，不要执行或模拟任何工具，不要声称未观察到的结果。',
        `YUFENG 可用工具：${JSON.stringify(sanitizeWorkbenchValue(tools || []))}`,
        `当前 Workbench 状态：${JSON.stringify(safeSession)}`
      ].join('\n\n')
      const response = await adapter.prompt({
        sessionId: remoteSessionId,
        text: prompt,
        model,
        agent,
        system: systemPrompt,
        tools: disabledTools,
        signal
      })
      const action = actionFromOpenCode(response)
      // Re-run the same strict normalization as Workbench. This prevents a
      // future OpenCode response shape from widening the local action contract.
      if (action?.type === 'tool_call') return normalizeNextAction(action)
      return action
    }
  }
}

export {
  flattenProviderModels,
  modelReference,
  normalizeBaseUrl,
  plannerResponseText
}

export default createOpenCodeAdapter

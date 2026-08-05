/**
 * Optional OpenCode sidecar manager for the Electron main process.
 *
 * Electron Main owns this safe, testable boundary for starting a
 * user-installed/bundled `opencode` server and for talking to its stable
 * v1-compatible HTTP endpoints. The renderer opts in through narrowly scoped
 * IPC methods; process discovery and provider credentials never cross the
 * context bridge.
 */

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn, spawnSync } = require('node:child_process')

const DEFAULT_HOSTNAME = '127.0.0.1'
const DEFAULT_PORT = 4096
const DEFAULT_TIMEOUT_MS = 20_000
const DEFAULT_HEALTH_INTERVAL_MS = 120

function clean(value) {
  return String(value || '').trim()
}

function fileExists(value, fsImpl = fs) {
  const candidate = clean(value)
  if (!candidate) return false
  try {
    return fsImpl.existsSync(candidate) && fsImpl.statSync(candidate).isFile()
  } catch {
    return false
  }
}

function isExecutable(candidate, fsImpl = fs, platform = process.platform) {
  if (!fileExists(candidate, fsImpl)) return false
  // Windows does not expose Unix execute bits; existence is sufficient there.
  if (platform === 'win32') return true
  try {
    fsImpl.accessSync(candidate, fs.constants.X_OK)
    return true
  } catch {
    // A packaged binary may lose its mode bit when copied by a user. It is
    // still useful to return it so spawn() can provide the actionable error.
    return true
  }
}

function commandNames(platform = process.platform) {
  // The npm launcher is named `opencode.exe` on every platform, while PATH
  // installs commonly expose `opencode`. Check both so packaged macOS builds
  // can discover the official optional dependency as well.
  return platform === 'win32'
    ? ['opencode.exe', 'opencode']
    : ['opencode', 'opencode.exe']
}

function pathCandidates({ env = process.env, cwd = process.cwd(), appPath = '', resourcesPath = '', platform = process.platform } = {}) {
  const executables = commandNames(platform)
  const result = []
  const add = value => {
    const candidate = clean(value)
    if (candidate && !result.includes(candidate)) result.push(candidate)
  }

  add(env.OPENCODE_BIN)
  add(env.YUFENG_OPENCODE_BIN)

  const roots = [
    clean(appPath),
    clean(resourcesPath),
    clean(cwd),
    clean(__dirname),
    clean(path.join(cwd, 'node_modules')),
    clean(path.join(cwd, '..'))
  ].filter(Boolean)
  // GUI-launched Electron does not always inherit the shell PATH. Include
  // the official per-user install location used by `opencode` on macOS/Linux
  // (and harmlessly probe the analogous user bin directories on Windows).
  const home = clean(env.HOME || env.USERPROFILE)
  if (home) {
    for (const executable of executables) {
      add(path.join(home, '.opencode', 'bin', executable))
      add(path.join(home, '.local', 'bin', executable))
      add(path.join(home, 'bin', executable))
    }
  }
  for (const root of roots) {
    for (const executable of executables) {
      add(path.join(root, executable))
      add(path.join(root, 'bin', executable))
      add(path.join(root, 'node_modules', '.bin', executable))
      add(path.join(root, 'node_modules', 'opencode-ai', 'bin', executable))
      add(path.join(root, 'resources', 'opencode', executable))
      add(path.join(root, 'resources', 'app.asar.unpacked', 'node_modules', 'opencode-ai', 'bin', executable))
    }
  }

  // `opencode-ai`'s postinstall package places a platform-specific binary in
  // an optional dependency and leaves a tiny launcher in bin/. Resolve it from
  // the current app first, without requiring the package to be installed.
  try {
    const packageJson = require.resolve('opencode-ai/package.json', { paths: roots })
    for (const executable of executables) add(path.join(path.dirname(packageJson), 'bin', executable))
  } catch {
    // Optional dependency; discovery must remain a no-op when absent.
  }
  return result
}

function discoverFromPath({ env = process.env, platform = process.platform, spawnSyncImpl = spawnSync } = {}) {
  const lookup = platform === 'win32' ? 'where' : 'which'
  for (const command of commandNames(platform)) {
    try {
      const result = spawnSyncImpl(lookup, [command], {
        env,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      if (result?.status === 0) {
        const first = clean(result.stdout).split(/\r?\n/)[0]
        if (first) return first
      }
    } catch {
      // Try the next spelling.
    }
  }
  return ''
}

/**
 * Find an OpenCode executable without downloading or installing anything.
 * Returned paths are never persisted automatically.
 */
function discoverOpenCodeBinary(options = {}) {
  const {
    env = process.env,
    cwd = process.cwd(),
    appPath = '',
    resourcesPath = '',
    platform = process.platform,
    fsImpl = fs,
    spawnSyncImpl = spawnSync
  } = options
  const fromPath = discoverFromPath({ env, platform, spawnSyncImpl })
  if (isExecutable(fromPath, fsImpl, platform)) return fromPath
  for (const candidate of pathCandidates({ env, cwd, appPath, resourcesPath, platform })) {
    if (isExecutable(candidate, fsImpl, platform)) return candidate
  }
  return ''
}

function normalizeBaseUrl(value, hostname = DEFAULT_HOSTNAME, port = DEFAULT_PORT) {
  const source = clean(value)
  if (source) {
    if (!/^https?:\/\//i.test(source)) throw new TypeError('OpenCode baseUrl 必须使用 http(s) 协议')
    return source.replace(/\/+$/, '')
  }
  if (!Number.isInteger(Number(port)) || Number(port) < 0 || Number(port) > 65535) {
    throw new TypeError('OpenCode port 无效')
  }
  return `http://${hostname}:${Number(port)}`
}

function queryString(query = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

function parseModel(value) {
  if (!value) return undefined
  if (typeof value === 'object') {
    const providerID = clean(value.providerID || value.provider || value.providerId)
    const modelID = clean(value.modelID || value.model || value.id)
    return providerID && modelID ? { providerID, modelID } : undefined
  }
  const source = clean(value)
  const slash = source.indexOf('/')
  return slash > 0 && slash < source.length - 1
    ? { providerID: source.slice(0, slash), modelID: source.slice(slash + 1) }
    : undefined
}

function abortError(reason = 'OpenCode runtime aborted') {
  const error = reason instanceof Error ? reason : new Error(String(reason))
  if (!error.name) error.name = 'AbortError'
  error.code ||= 'OPENCODE_ABORTED'
  return error
}

function sleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError(signal.reason))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError(signal.reason))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function readPayload(response) {
  if (!response || response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}

class OpenCodeRuntimeError extends Error {
  constructor(message, { code = 'OPENCODE_RUNTIME_ERROR', status = 0, payload = null } = {}) {
    super(message)
    this.name = 'OpenCodeRuntimeError'
    this.code = code
    this.status = Number(status) || 0
    this.payload = payload
  }
}

// Keep connection failures stable and intentionally URL-free. Electron
// surfaces only the error code/message to the renderer, so a fetch error must
// never echo a local path, remote URL, or provider credential.
const openCodeUnavailableError = (status = 0) => new OpenCodeRuntimeError(
  'OpenCode 服务不可用',
  { code: 'OPENCODE_UNAVAILABLE', status, payload: null }
)

class OpenCodeRuntime {
  constructor({
    binaryPath = '',
    baseUrl = '',
    hostname = DEFAULT_HOSTNAME,
    port = DEFAULT_PORT,
    directory = '',
    appPath = '',
    resourcesPath = '',
    env = process.env,
    spawnImpl = spawn,
    fetchImpl = globalThis.fetch,
    fsImpl = fs,
    now = Date.now,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    healthIntervalMs = DEFAULT_HEALTH_INTERVAL_MS,
    logger = null
  } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('OpenCodeRuntime 需要 fetch')
    this.options = {
      binaryPath: clean(binaryPath),
      baseUrl: clean(baseUrl),
      hostname: clean(hostname) || DEFAULT_HOSTNAME,
      port: Number(port) || DEFAULT_PORT,
      directory: clean(directory),
      appPath: clean(appPath),
      resourcesPath: clean(resourcesPath),
      env,
      spawnImpl,
      fetchImpl,
      fsImpl,
      now,
      timeoutMs: Math.max(500, Number(timeoutMs) || DEFAULT_TIMEOUT_MS),
      healthIntervalMs: Math.max(20, Number(healthIntervalMs) || DEFAULT_HEALTH_INTERVAL_MS),
      logger
    }
    this.child = null
    this.resolvedBinaryPath = this.options.binaryPath
    this.url = this.options.baseUrl
    this.state = 'stopped'
    this.startedAt = 0
    this.lastError = null
    this.healthInfo = null
    this._startPromise = null
  }

  status() {
    return {
      state: this.state,
      pid: this.child?.pid || 0,
      url: this.url || '',
      binaryPath: this.resolvedBinaryPath || this.options.binaryPath || '',
      directory: this.options.directory || '',
      startedAt: this.startedAt || 0,
      ...(this.healthInfo && typeof this.healthInfo === 'object'
        ? {
            healthy: this.healthInfo.healthy === true,
            version: clean(this.healthInfo.version)
          }
        : {}),
      lastError: this.lastError
        ? { code: this.lastError.code || 'OPENCODE_RUNTIME_ERROR', message: this.lastError.message }
        : null
    }
  }

  get binaryPath() {
    return this.options.binaryPath || discoverOpenCodeBinary({
      env: this.options.env,
      cwd: this.options.directory || process.cwd(),
      appPath: this.options.appPath,
      resourcesPath: this.options.resourcesPath,
      fsImpl: this.options.fsImpl
    })
  }

  async health({ signal } = {}) {
    const url = this.url || normalizeBaseUrl(this.options.baseUrl, this.options.hostname, this.options.port)
    let response
    let payload
    try {
      response = await this.options.fetchImpl(`${url}/global/health`, { signal })
      payload = await readPayload(response)
    } catch (error) {
      if (signal?.aborted) throw abortError(signal.reason)
      const unavailable = openCodeUnavailableError()
      this.lastError = unavailable
      this.healthInfo = null
      if (this.state === 'running') this.state = 'error'
      throw unavailable
    }
    if (!response.ok || payload?.healthy !== true) {
      const unavailable = openCodeUnavailableError(response.status)
      this.lastError = unavailable
      this.healthInfo = null
      if (this.state === 'running') this.state = 'error'
      throw unavailable
    }
    this.lastError = null
    this.healthInfo = payload
    return payload
  }

  async start({ signal } = {}) {
    if (this.state === 'running') {
      try {
        this.healthInfo = await this.health({ signal })
        return this.status()
      } catch {
        this.state = 'stopped'
      }
    }
    if (this._startPromise) return this._startPromise
    this._startPromise = this._start(signal).finally(() => { this._startPromise = null })
    return this._startPromise
  }

  async _start(signal) {
    // If another OpenCode instance is already listening, adopt it instead of
    // spawning a second server. This also allows web/portable installs to use
    // a separately managed `opencode serve` process without a local binary.
    const configuredUrl = this.url || normalizeBaseUrl(
      this.options.baseUrl,
      this.options.hostname,
      this.options.port
    )
    try {
      const response = await this.options.fetchImpl(`${configuredUrl}/global/health`, { signal })
      if (response.ok) {
        const payload = await readPayload(response)
        if (payload?.healthy === true) {
          this.url = configuredUrl
          this.healthInfo = payload
          this.lastError = null
          this.state = 'running'
          return this.statusWithHealth(payload)
        }
      }
    } catch (error) {
      if (signal?.aborted) throw abortError(signal.reason)
    }

    const binaryPath = this.binaryPath
    if (!binaryPath) {
      const error = new OpenCodeRuntimeError('未找到 OpenCode 可执行文件', { code: 'OPENCODE_BINARY_NOT_FOUND' })
      this.lastError = error
      this.state = 'error'
      throw error
    }
    const cwd = this.options.directory || process.cwd()
    const port = this.options.port
    const args = ['serve', '--hostname', this.options.hostname, '--port', String(port)]
    this.state = 'starting'
    this.lastError = null
    let child
    try {
      child = this.options.spawnImpl(binaryPath, args, {
        cwd,
        env: { ...this.options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false
      })
    } catch (error) {
      const wrapped = new OpenCodeRuntimeError(`启动 OpenCode 失败：${error.message}`, {
        code: 'OPENCODE_SPAWN_FAILED'
      })
      this.lastError = wrapped
      this.state = 'error'
      throw wrapped
    }
    this.child = child
    this.resolvedBinaryPath = binaryPath
    this.startedAt = this.options.now()
    const log = chunk => {
      const text = clean(chunk)
      const match = text.match(/https?:\/\/[^\s]+/i)
      if (match && !this.options.baseUrl) this.url = match[0].replace(/[.)]+$/, '')
      try { this.options.logger?.(text) } catch { /* observability only */ }
    }
    child.stdout?.on?.('data', log)
    child.stderr?.on?.('data', log)
    child.once?.('error', error => {
      this.lastError = new OpenCodeRuntimeError(`OpenCode 进程错误：${error.message}`, {
        code: 'OPENCODE_PROCESS_ERROR'
      })
      if (this.state === 'starting' || this.state === 'running') this.state = 'error'
    })
    child.once?.('exit', (code, exitSignal) => {
      if (this.child === child) {
        this.child = null
        if (this.state !== 'stopped') {
          this.state = 'error'
          this.lastError ||= new OpenCodeRuntimeError('OpenCode 进程已退出', {
            code: 'OPENCODE_PROCESS_EXITED'
          })
          this.lastError.exitCode = code
          this.lastError.exitSignal = exitSignal
        }
      }
    })

    const deadline = this.options.now() + this.options.timeoutMs
    while (this.options.now() < deadline) {
      if (signal?.aborted) {
        await this.stop()
        throw abortError(signal.reason)
      }
      if (this.lastError && this.state === 'error') throw this.lastError
      const candidateUrl = this.url || normalizeBaseUrl(this.options.baseUrl, this.options.hostname, this.options.port)
      try {
        const response = await this.options.fetchImpl(`${candidateUrl}/global/health`, { signal })
        if (response.ok) {
          const payload = await readPayload(response)
          if (payload?.healthy === true) {
            this.url = candidateUrl
            this.healthInfo = payload
            this.lastError = null
            this.state = 'running'
            return this.statusWithHealth(payload)
          }
        }
      } catch (error) {
        if (signal?.aborted) throw abortError(signal.reason)
      }
      await sleep(this.options.healthIntervalMs, signal)
    }
    const timeout = new OpenCodeRuntimeError('等待 OpenCode 服务就绪超时', { code: 'OPENCODE_START_TIMEOUT' })
    this.lastError = timeout
    this.healthInfo = null
    this.state = 'error'
    await this.stop()
    throw timeout
  }

  statusWithHealth(health) {
    return { ...this.status(), health: health || null }
  }

  async stop() {
    const child = this.child
    this.child = null
    this.state = 'stopped'
    this.healthInfo = null
    if (!child) return this.status()
    try {
      if (typeof child.kill === 'function') child.kill('SIGTERM')
    } catch {
      // Process may have already exited.
    }
    return this.status()
  }

  _url(pathname, query = {}) {
    const base = this.url || normalizeBaseUrl(this.options.baseUrl, this.options.hostname, this.options.port)
    return `${base}${pathname}${queryString({
      ...(this.options.directory ? { directory: this.options.directory } : {}),
      ...query
    })}`
  }

  async request(pathname, { method = 'GET', body, query = {}, signal } = {}) {
    const response = await this.options.fetchImpl(this._url(pathname, query), {
      method,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal
    })
    const payload = await readPayload(response)
    if (!response.ok) {
      throw new OpenCodeRuntimeError(`OpenCode 请求失败（HTTP ${response.status}）`, {
        status: response.status,
        payload
      })
    }
    return payload
  }

  listProviders({ signal } = {}) {
    return this.request('/provider', { signal })
  }

  createSession({ title = '', parentID = '', signal } = {}) {
    return this.request('/session', {
      method: 'POST',
      body: {
        ...(clean(title) ? { title: clean(title) } : {}),
        ...(clean(parentID) ? { parentID: clean(parentID) } : {})
      },
      signal
    })
  }

  sessionStatus({ sessionId, signal } = {}) {
    const id = clean(sessionId)
    if (!id) throw new TypeError('sessionStatus 需要 sessionId')
    return this.request('/session/status', { signal }).then(payload => payload?.[id] || null)
  }

  abort({ sessionId, signal } = {}) {
    const id = clean(sessionId)
    if (!id) throw new TypeError('abort 需要 sessionId')
    return this.request(`/session/${encodeURIComponent(id)}/abort`, {
      method: 'POST',
      signal
    })
  }

  prompt({ sessionId, text, model, agent = '', system = '', variant = '', tools, signal } = {}) {
    const id = clean(sessionId)
    const content = clean(text)
    if (!id || !content) throw new TypeError('prompt 需要 sessionId 和 text')
    return this.request(`/session/${encodeURIComponent(id)}/message`, {
      method: 'POST',
      body: {
        parts: [{ type: 'text', text: content }],
        ...(parseModel(model) ? { model: parseModel(model) } : {}),
        ...(clean(agent) ? { agent: clean(agent) } : {}),
        ...(clean(system) ? { system: clean(system) } : {}),
        ...(clean(variant) ? { variant: clean(variant) } : {}),
        ...(tools && typeof tools === 'object' ? { tools } : {})
      },
      signal
    })
  }
}

module.exports = {
  DEFAULT_HOSTNAME,
  DEFAULT_PORT,
  OpenCodeRuntime,
  OpenCodeRuntimeError,
  discoverOpenCodeBinary,
  normalizeBaseUrl,
  pathCandidates,
  parseModel
}

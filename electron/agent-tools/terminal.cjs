const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')
const {
  assertBoundedInput,
  assertNoBidiControls,
  boundedString,
  requireApproval,
  toolError
} = require('./security.cjs')

const DEFAULT_TIMEOUT_MS = 30_000
const MAX_TIMEOUT_MS = 5 * 60_000
const DEFAULT_OUTPUT_BYTES = 1024 * 1024
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024
const MAX_JOBS = 100
const MAX_ACTIVE_JOBS = 8
const TERMINATION_GUARANTEE = Object.freeze({
  guarantee: 'best_effort',
  scope: process.platform === 'win32' ? 'direct_process' : 'process_group',
  descendantsGuaranteed: false
})

/**
 * GUI-launched Electron apps do not inherit the user's login-shell PATH.
 * Finder/LaunchServices commonly leaves only /usr/bin:/bin, which makes
 * node/npm/pnpm (and user-installed CLIs) appear to be missing even though
 * they work in Terminal. Keep the command contract executable+args (no shell)
 * while adding only conventional, user-owned executable directories.
 */
function executionPath({ env = process.env, platform = process.platform } = {}) {
  const delimiter = platform === 'win32' ? ';' : ':'
  const home = String(env.HOME || env.USERPROFILE || '').trim()
  const localAppData = String(env.LOCALAPPDATA || '').trim()
  const programFiles = String(env.ProgramW6432 || env.ProgramFiles || '').trim()
  const programFilesX86 = String(env['ProgramFiles(x86)'] || '').trim()
  const pnpmHome = String(env.PNPM_HOME || '').trim()
  const nvmBin = String(env.NVM_BIN || '').trim()
  const fnmPath = String(env.FNM_MULTISHELL_PATH || '').trim()
  const miseBin = String(env.MISE_BIN_PATH || '').trim()
  const bunInstall = String(env.BUN_INSTALL || '').trim()
  const denoInstall = String(env.DENO_INSTALL || '').trim()
  const voltaHome = String(env.VOLTA_HOME || '').trim()
  const extras = platform === 'win32'
    ? [
        pnpmHome,
        home && path.join(home, 'AppData', 'Roaming', 'npm'),
        home && path.join(home, 'AppData', 'Local', 'pnpm'),
        home && path.join(home, 'AppData', 'Roaming', 'pnpm'),
        localAppData && path.join(localAppData, 'Programs', 'nodejs'),
        programFiles && path.join(programFiles, 'nodejs'),
        programFilesX86 && path.join(programFilesX86, 'nodejs'),
        home && path.join(home, '.volta', 'bin'),
        voltaHome && path.join(voltaHome, 'bin'),
        home && path.join(home, 'scoop', 'shims')
      ]
    : [
        pnpmHome,
        home && path.join(home, '.local', 'bin'),
        home && path.join(home, 'Library', 'pnpm'),
        home && path.join(home, '.local', 'share', 'pnpm'),
        home && path.join(home, '.pnpm'),
        home && path.join(home, '.npm-global', 'bin'),
        home && path.join(home, '.volta', 'bin'),
        voltaHome && path.join(voltaHome, 'bin'),
        home && path.join(home, '.asdf', 'shims'),
        nvmBin,
        fnmPath,
        fnmPath && path.join(fnmPath, 'bin'),
        miseBin,
        home && path.join(home, '.local', 'share', 'mise', 'shims'),
        home && path.join(home, '.cargo', 'bin'),
        bunInstall && path.join(bunInstall, 'bin'),
        denoInstall && path.join(denoInstall, 'bin'),
        home && path.join(home, '.bun', 'bin'),
        home && path.join(home, '.deno', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
        '/opt/local/bin',
        '/usr/bin',
        '/bin',
        '/usr/sbin',
        '/sbin'
      ]
  const entries = String(env.PATH || '')
    .split(delimiter)
    .concat(extras)
    .map(value => String(value || '').trim())
    .filter(Boolean)
  return [...new Set(entries)].join(delimiter)
}

function safeEnvironment({ env = process.env, platform = process.platform } = {}) {
  const blocked = /(?:KEY|TOKEN|SECRET|PASSWORD|AUTH|COOKIE|CREDENTIAL|SESSION)/i
  const safe = Object.fromEntries(Object.entries(env).filter(([key]) => !blocked.test(key) && !['NODE_OPTIONS', 'ELECTRON_RUN_AS_NODE'].includes(key)))
  safe.PATH = executionPath({ env, platform })
  return safe
}

async function resolveExecutable(command, { env = process.env, platform = process.platform } = {}) {
  const name = boundedString(command, { name: 'command', maxLength: 128 })
  if (name !== path.basename(name) || /[\\/]/.test(name) || name.startsWith('.')) {
    throw toolError('INVALID_COMMAND', 'command 只能是 executable name，不能包含路径分隔符')
  }
  const delimiter = platform === 'win32' ? ';' : ':'
  const pathEntries = executionPath({ env, platform }).split(delimiter).filter(Boolean)
  const extensions = platform === 'win32'
    ? String(env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : ['']
  for (const directory of pathEntries.slice(0, 128)) {
    if (!path.isAbsolute(directory)) continue
    const names = platform === 'win32' && path.extname(name)
      ? [name]
      : extensions.map(extension => platform === 'win32' ? `${name}${extension}` : name)
    for (const candidateName of names) {
      const candidate = path.resolve(directory, candidateName)
      try {
        const stat = await fs.promises.stat(candidate)
        if (!stat.isFile()) continue
        if (platform !== 'win32') await fs.promises.access(candidate, fs.constants.X_OK)
        return await fs.promises.realpath(candidate)
      } catch {
        // Continue searching the bounded PATH list.
      }
    }
  }
  throw toolError('COMMAND_NOT_FOUND', `找不到可执行命令: ${name}`)
}

function publicJob(job) {
  return {
    ok: true,
    jobId: job.jobId,
    status: job.status,
    command: job.command,
    cwd: job.cwdRelative,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    stdout: job.stdout,
    stderr: job.stderr,
    outputBytes: job.outputBytes,
    maxOutputBytes: job.maxOutputBytes,
    exitCode: job.exitCode,
    signal: job.signal,
    truncated: job.truncated,
    timedOut: job.timedOut,
    termination: { ...job.termination }
  }
}

class TerminalManager {
  constructor({
    workspace,
    spawnProcess = spawn,
    platform = process.platform,
    environment = process.env,
    killProcess = process.kill,
    killGraceMs = 1_000,
    terminationGraceMs = 2_000,
    forceFinalizeMs = 250
  } = {}) {
    this.workspace = workspace
    this.spawnProcess = spawnProcess
    this.platform = platform
    this.environment = environment
    this.killProcess = killProcess
    this.killGraceMs = killGraceMs
    this.terminationGraceMs = terminationGraceMs
    this.forceFinalizeMs = forceFinalizeMs
    this.jobs = new Map()
    this.pendingStarts = new Map()
    this.shuttingDown = false
    this.generation = 0
  }

  async start(input = {}) {
    assertBoundedInput(input)
    requireApproval(input.approval, 'terminal.run')
    if (this.shuttingDown) throw toolError('TERMINAL_SHUTTING_DOWN', '终端管理器正在关闭，不能启动新命令')
    const activeJobs = [...this.jobs.values()].filter(job => ['running', 'cancelling'].includes(job.status)).length
    if (activeJobs + this.pendingStarts.size >= MAX_ACTIVE_JOBS) throw toolError('TOO_MANY_ACTIVE_COMMANDS', '同时运行的终端任务已达到上限')
    const command = assertNoBidiControls(boundedString(input.command, { name: 'command', maxLength: 128 }), 'command')
    const args = Array.isArray(input.args) ? input.args : []
    if (args.length > 64) throw toolError('TOO_MANY_ARGUMENTS', '命令参数不能超过 64 个')
    let argumentBytes = 0
    const normalizedArgs = args.map((value) => {
      if (typeof value !== 'string' || value.includes('\0') || value.length > 4_096) {
        throw toolError('INVALID_COMMAND_ARGUMENT', '命令参数必须是长度不超过 4096 的字符串')
      }
      argumentBytes += Buffer.byteLength(value, 'utf8')
      assertNoBidiControls(value, '命令参数')
      return value
    })
    if (argumentBytes > 32 * 1024) throw toolError('COMMAND_ARGUMENTS_TOO_LARGE', '命令参数总长度超过限制')

    const cwdInput = input.cwd == null ? '.' : input.cwd
    const startGeneration = this.generation
    const reservationId = crypto.randomUUID()
    this.pendingStarts.set(reservationId, startGeneration)
    let cwd
    let executable
    try {
      ;[cwd, executable] = await Promise.all([
        this.workspace.resolveBound(cwdInput, { type: 'directory' }, input),
        resolveExecutable(command, { env: this.environment, platform: this.platform })
      ])
      this.#assertStartAllowed(reservationId, startGeneration)
      this.workspace.assertBinding(input)
    } catch (error) {
      this.pendingStarts.delete(reservationId)
      throw error
    }
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || DEFAULT_TIMEOUT_MS, 100), MAX_TIMEOUT_MS)
    const maxOutputBytes = Math.min(Math.max(Number(input.maxOutputBytes) || DEFAULT_OUTPUT_BYTES, 1_024), MAX_OUTPUT_BYTES)
    const jobId = crypto.randomUUID()
    const job = {
      jobId,
      status: 'running',
      command,
      args: normalizedArgs,
      cwdRelative: path.relative(cwd.workspaceRoot, cwd.path).split(path.sep).join('/') || '.',
      startedAt: Date.now(),
      completedAt: null,
      stdout: '',
      stderr: '',
      outputBytes: 0,
      maxOutputBytes,
      truncated: false,
      timedOut: false,
      exitCode: null,
      signal: null,
      child: null,
      timeout: null,
      killTimer: null,
      finalizeTimer: null,
      listeners: null,
      termination: {
        guarantee: 'best_effort',
        scope: this.platform === 'win32' ? 'direct_process' : 'process_group',
        descendantsGuaranteed: false,
        requested: false,
        forced: false,
        signalSent: false,
        directProcessExitObserved: false,
        unconfirmed: false
      }
    }
    this.#assertStartAllowed(reservationId, startGeneration)
    this.jobs.set(jobId, job)
    this.pendingStarts.delete(reservationId)
    this.#trimJobs()

    let child
    try {
      this.workspace.assertBinding(input)
      child = this.spawnProcess(executable, normalizedArgs, {
        cwd: cwd.path,
        shell: false,
        detached: this.platform !== 'win32',
        windowsHide: true,
        env: safeEnvironment({ env: this.environment, platform: this.platform }),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      job.child = child
    } catch (error) {
      job.status = 'failed'
      job.completedAt = Date.now()
      job.stderr = String(error?.message || error).slice(0, 4_000)
      return publicJob(job)
    }

    const append = (field, chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      const remaining = job.maxOutputBytes - job.outputBytes
      if (remaining <= 0) {
        job.truncated = true
        return
      }
      const accepted = buffer.subarray(0, remaining)
      job[field] += accepted.toString('utf8')
      job.outputBytes += accepted.length
      if (accepted.length < buffer.length) job.truncated = true
    }
    const onStdout = chunk => append('stdout', chunk)
    const onStderr = chunk => append('stderr', chunk)
    const onError = (error) => {
      append('stderr', error?.message || String(error))
      if (job.status === 'running') job.status = 'failed'
    }
    const onClose = (exitCode, signal) => {
      this.#clearJobTimers(job)
      job.exitCode = Number.isInteger(exitCode) ? exitCode : null
      job.signal = signal || null
      job.completedAt = Date.now()
      job.termination.directProcessExitObserved = true
      job.termination.unconfirmed = false
      if (job.status === 'cancelled' || job.status === 'timed_out') {
        // A termination watchdog already finalized the public job state.
      } else if (job.timedOut) job.status = 'timed_out'
      else if (job.status === 'cancelling') job.status = 'cancelled'
      else job.status = exitCode === 0 ? 'completed' : 'failed'
      this.#detachProcess(job)
    }
    job.listeners = { onStdout, onStderr, onError, onClose }
    child.stdout?.on('data', onStdout)
    child.stderr?.on('data', onStderr)
    child.once('error', onError)
    child.once('close', onClose)
    job.timeout = setTimeout(() => {
      if (job.status !== 'running') return
      job.timedOut = true
      job.status = 'cancelling'
      this.#terminate(job)
    }, timeoutMs)
    job.timeout.unref?.()
    return { ok: true, jobId, status: 'running' }
  }

  get(input = {}) {
    assertBoundedInput(input, 4 * 1024)
    const jobId = boundedString(input.jobId, { name: 'jobId', maxLength: 128 })
    const job = this.jobs.get(jobId)
    if (!job) throw toolError('COMMAND_JOB_NOT_FOUND', '终端任务不存在')
    return publicJob(job)
  }

  cancel(input = {}) {
    assertBoundedInput(input, 4 * 1024)
    const jobId = boundedString(input.jobId, { name: 'jobId', maxLength: 128 })
    const job = this.jobs.get(jobId)
    if (!job) throw toolError('COMMAND_JOB_NOT_FOUND', '终端任务不存在')
    if (!['running', 'cancelling'].includes(job.status)) return publicJob(job)
    job.status = 'cancelling'
    this.#terminate(job)
    return { ok: true, jobId, status: 'cancelling' }
  }

  cancelAll({ force = false } = {}) {
    const pendingCancelled = this.pendingStarts.size
    this.generation += 1
    this.pendingStarts.clear()
    const cancelled = []
    for (const job of this.jobs.values()) {
      if (!['running', 'cancelling'].includes(job.status)) continue
      job.status = 'cancelling'
      cancelled.push(job.jobId)
      this.#terminate(job, { force })
    }
    return {
      ok: true,
      cancelled,
      pendingCancelled,
      termination: { ...TERMINATION_GUARANTEE }
    }
  }

  shutdown({ force = true } = {}) {
    this.shuttingDown = true
    return this.cancelAll({ force })
  }

  #terminate(job, { force = false } = {}) {
    if (!job.child?.pid) return
    clearTimeout(job.killTimer)
    clearTimeout(job.finalizeTimer)
    job.termination.requested = true
    job.termination.forced = force || job.termination.forced
    job.termination.signalSent = this.#signalProcess(job, force ? 'SIGKILL' : 'SIGTERM') || job.termination.signalSent
    if (!force) {
      job.killTimer = setTimeout(() => {
        if (!job.child?.pid) return
        job.termination.forced = true
        job.termination.signalSent = this.#signalProcess(job, 'SIGKILL') || job.termination.signalSent
      }, this.killGraceMs)
      job.killTimer.unref?.()
    }
    job.finalizeTimer = setTimeout(() => {
      if (!['running', 'cancelling'].includes(job.status)) return
      job.status = 'termination_unconfirmed'
      job.completedAt = Date.now()
      job.termination.unconfirmed = true
      this.#clearJobTimers(job)
      this.#detachProcess(job)
    }, force ? this.forceFinalizeMs : this.terminationGraceMs)
    job.finalizeTimer.unref?.()
  }

  #signalProcess(job, signal) {
    if (!job.child?.pid) return false
    try {
      if (this.platform !== 'win32') this.killProcess(-job.child.pid, signal)
      else job.child.kill(signal)
      return true
    } catch {
      try { return job.child.kill(signal) } catch { return false }
    }
  }

  #clearJobTimers(job) {
    clearTimeout(job.timeout)
    clearTimeout(job.killTimer)
    clearTimeout(job.finalizeTimer)
    job.timeout = null
    job.killTimer = null
    job.finalizeTimer = null
  }

  #detachProcess(job) {
    const child = job.child
    const listeners = job.listeners
    if (!child) return
    if (listeners) {
      child.stdout?.off('data', listeners.onStdout)
      child.stderr?.off('data', listeners.onStderr)
      child.off('error', listeners.onError)
      child.off('close', listeners.onClose)
    }
    child.stdout?.destroy()
    child.stderr?.destroy()
    job.listeners = null
    job.child = null
  }

  #assertStartAllowed(reservationId, generation) {
    const reservationValid = reservationId == null || this.pendingStarts.get(reservationId) === generation
    if (this.shuttingDown || generation !== this.generation || !reservationValid) {
      throw toolError('COMMAND_START_CANCELLED', '终端命令在启动前被取消')
    }
  }

  #trimJobs() {
    if (this.jobs.size <= MAX_JOBS) return
    for (const [jobId, job] of this.jobs) {
      if (job.status === 'running' || job.status === 'cancelling') continue
      this.jobs.delete(jobId)
      if (this.jobs.size <= MAX_JOBS) break
    }
  }
}

module.exports = {
  TERMINATION_GUARANTEE,
  TerminalManager,
  executionPath,
  resolveExecutable,
  safeEnvironment
}

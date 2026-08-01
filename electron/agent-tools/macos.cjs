const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawn } = require('child_process')
const {
  assertBoundedInput,
  assertNoBidiControls,
  boundedString,
  requireApproval,
  toolError,
  unavailable
} = require('./security.cjs')

const MAX_SCREENSHOT_BYTES = 25 * 1024 * 1024
const MAX_FIXED_OUTPUT_BYTES = 64 * 1024

const CLICK_SCRIPT = `on run argv
  set px to item 1 of argv as integer
  set py to item 2 of argv as integer
  tell application "System Events" to click at {px, py}
end run`

const TYPE_SCRIPT = `on run argv
  set inputText to item 1 of argv
  tell application "System Events" to keystroke inputText
end run`

const FRONTMOST_APPLICATION_SCRIPT = `tell application "System Events"
  return name of first application process whose frontmost is true
end tell`

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function runFixed(executable, args, { timeoutMs = 10_000, maxOutputBytes = MAX_FIXED_OUTPUT_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let outputBytes = 0
    let truncated = false
    const append = (field, chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
      const remaining = maxOutputBytes - outputBytes
      if (remaining <= 0) {
        truncated = true
        return
      }
      const accepted = buffer.subarray(0, remaining)
      if (field === 'stdout') stdout += accepted.toString('utf8')
      else stderr += accepted.toString('utf8')
      outputBytes += accepted.length
      if (accepted.length < buffer.length) truncated = true
    }
    child.stdout?.on('data', chunk => append('stdout', chunk))
    child.stderr?.on('data', chunk => append('stderr', chunk))
    child.once('error', reject)
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    timer.unref?.()
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer)
      resolve({ ok: exitCode === 0, exitCode, signal, stdout, stderr, truncated })
    })
  })
}

async function waitForFrontmostApplication(application, {
  runCommand = runFixed,
  timeoutMs = 3_000,
  pollMs = 100,
  now = Date.now,
  sleep = delay
} = {}) {
  const deadline = now() + Math.min(Math.max(Number(timeoutMs) || 3_000, 100), 10_000)
  let observed = ''
  do {
    const result = await runCommand(
      '/usr/bin/osascript',
      ['-e', FRONTMOST_APPLICATION_SCRIPT],
      { timeoutMs: 1_000 }
    )
    observed = result.ok ? String(result.stdout || '').trim() : ''
    if (observed === application) {
      return { ok: true, expectedApplication: application, observedApplication: observed }
    }
    if (now() >= deadline) break
    await sleep(Math.min(Math.max(Number(pollMs) || 100, 10), 500))
  } while (now() <= deadline)
  return {
    ok: false,
    available: true,
    reason: 'FRONTMOST_APPLICATION_MISMATCH',
    expectedApplication: application,
    observedApplication: observed
  }
}

function applicationName(value) {
  const application = assertNoBidiControls(boundedString(value, { name: 'application', maxLength: 128 }), 'application')
  if (application.startsWith('-') || !/^[\p{L}\p{N} ._()+-]+$/u.test(application)) {
    throw toolError('INVALID_APPLICATION_NAME', '应用名称包含不允许的字符')
  }
  return application
}

class MacOSComputerTools {
  constructor({
    platform = process.platform,
    systemPreferences = null,
    tempPath = '',
    runCommand = runFixed,
    frontmostTimeoutMs = 3_000,
    frontmostPollMs = 100,
    now = Date.now,
    sleep = delay
  } = {}) {
    this.platform = platform
    this.systemPreferences = systemPreferences
    this.tempPath = tempPath
    this.runCommand = runCommand
    this.frontmostTimeoutMs = frontmostTimeoutMs
    this.frontmostPollMs = frontmostPollMs
    this.now = now
    this.sleep = sleep
  }

  getPermissions() {
    if (this.platform !== 'darwin') return unavailable('computer.permissions', this.platform)
    let screen = 'unknown'
    let accessibility = false
    try { screen = this.systemPreferences?.getMediaAccessStatus?.('screen') || 'unknown' } catch {}
    try { accessibility = this.systemPreferences?.isTrustedAccessibilityClient?.(false) === true } catch {}
    return {
      ok: true,
      available: true,
      platform: this.platform,
      permissions: { screen, accessibility }
    }
  }

  async captureScreen(input = {}) {
    assertBoundedInput(input, 4 * 1024)
    requireApproval(input.approval, 'computer.capture_screen')
    if (this.platform !== 'darwin') return unavailable('computer.capture_screen', this.platform)
    const permissions = this.getPermissions()
    if (permissions.permissions.screen !== 'granted') {
      return { ok: false, available: true, capability: 'computer.capture_screen', reason: 'SCREEN_PERMISSION_REQUIRED' }
    }
    if (input.application) {
      const target = applicationName(input.application)
      const activated = await this.#activateAndVerify(target, 'computer.capture_screen')
      if (!activated.ok) return activated
    }
    const filePath = path.join(this.tempPath, `yufeng-agent-screen-${crypto.randomUUID()}.png`)
    try {
      const result = await this.runCommand('/usr/sbin/screencapture', ['-x', filePath], { timeoutMs: 15_000 })
      if (!result.ok) return { ...result, capability: 'computer.capture_screen' }
      const stat = await fs.promises.stat(filePath)
      if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_SCREENSHOT_BYTES) {
        throw toolError('SCREENSHOT_SIZE_INVALID', '屏幕截图大小无效')
      }
      const buffer = await fs.promises.readFile(filePath)
      return { ok: true, available: true, mimeType: 'image/png', size: buffer.length, dataUrl: `data:image/png;base64,${buffer.toString('base64')}` }
    } finally {
      await fs.promises.unlink(filePath).catch(() => null)
    }
  }

  async openApplication(input = {}) {
    assertBoundedInput(input, 4 * 1024)
    requireApproval(input.approval, 'computer.open_application')
    if (this.platform !== 'darwin') return unavailable('computer.open_application', this.platform)
    const application = applicationName(input.application)
    return { ...(await this.runCommand('/usr/bin/open', ['-a', application])), available: true, capability: 'computer.open_application' }
  }

  async click(input = {}) {
    assertBoundedInput(input, 4 * 1024)
    requireApproval(input.approval, 'computer.click')
    if (this.platform !== 'darwin') return unavailable('computer.click', this.platform)
    if (this.getPermissions().permissions.accessibility !== true) {
      return { ok: false, available: true, capability: 'computer.click', reason: 'ACCESSIBILITY_PERMISSION_REQUIRED' }
    }
    const application = applicationName(input.application)
    const x = Number(input.x)
    const y = Number(input.y)
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 100_000 || y > 100_000) {
      throw toolError('INVALID_CLICK_COORDINATES', '点击坐标必须是非负整数')
    }
    const activated = await this.#activateAndVerify(application, 'computer.click')
    if (!activated.ok) return activated
    return {
      ...(await this.runCommand('/usr/bin/osascript', ['-e', CLICK_SCRIPT, '--', String(x), String(y)])),
      available: true,
      capability: 'computer.click'
    }
  }

  async typeText(input = {}) {
    assertBoundedInput(input, 16 * 1024)
    requireApproval(input.approval, 'computer.type_text')
    if (this.platform !== 'darwin') return unavailable('computer.type_text', this.platform)
    if (this.getPermissions().permissions.accessibility !== true) {
      return { ok: false, available: true, capability: 'computer.type_text', reason: 'ACCESSIBILITY_PERMISSION_REQUIRED' }
    }
    const application = applicationName(input.application)
    if (typeof input.text !== 'string' || !input.text || input.text.length > 4_000 || input.text.includes('\0')) {
      throw toolError('INVALID_TEXT_INPUT', '输入文本为空或超过 4000 字符')
    }
    assertNoBidiControls(input.text, '输入文本')
    const activated = await this.#activateAndVerify(application, 'computer.type_text')
    if (!activated.ok) return activated
    return {
      ...(await this.runCommand('/usr/bin/osascript', ['-e', TYPE_SCRIPT, '--', input.text])),
      available: true,
      capability: 'computer.type_text'
    }
  }

  async #activateAndVerify(application, capability) {
    const opened = await this.runCommand('/usr/bin/open', ['-a', application])
    if (!opened.ok) return { ...opened, available: true, capability, reason: 'APPLICATION_OPEN_FAILED' }
    const frontmost = await waitForFrontmostApplication(application, {
      runCommand: this.runCommand,
      timeoutMs: this.frontmostTimeoutMs,
      pollMs: this.frontmostPollMs,
      now: this.now,
      sleep: this.sleep
    })
    return frontmost.ok
      ? { ok: true, available: true, capability, application }
      : { ...frontmost, capability }
  }
}

module.exports = {
  MacOSComputerTools,
  CLICK_SCRIPT,
  FRONTMOST_APPLICATION_SCRIPT,
  TYPE_SCRIPT,
  applicationName,
  runFixed,
  waitForFrontmostApplication
}

const crypto = require('crypto')
const path = require('path')
const {
  assertBoundedInput,
  assertNoBidiControls,
  boundedString,
  toolError
} = require('./security.cjs')

const MAX_NATIVE_WRITE_BYTES = 32 * 1024
const MAX_NATIVE_INPUT_BYTES = 64 * 1024
const C0_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const NON_TEXT_C0_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u

function assertNoControlCharacters(value, name, { allowTextWhitespace = false } = {}) {
  const pattern = allowTextWhitespace ? NON_TEXT_C0_CONTROL_PATTERN : C0_CONTROL_PATTERN
  if (typeof value === 'string' && pattern.test(value)) {
    throw toolError('CONTROL_CHARACTER_FORBIDDEN', `${name}包含不允许的控制字符`)
  }
  return value
}

function safeString(value, { name, maxLength, allowEmpty = false, allowTextWhitespace = false } = {}) {
  const normalized = boundedString(value, { name, maxLength, allowEmpty })
  assertNoBidiControls(normalized, name)
  assertNoControlCharacters(normalized, name, { allowTextWhitespace })
  return normalized
}

function freezePayload(value) {
  if (Array.isArray(value)) {
    value.forEach(freezePayload)
    return Object.freeze(value)
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezePayload)
    return Object.freeze(value)
  }
  return value
}

function normalizeRelativePath(value, name = 'path') {
  const input = safeString(value, { name, maxLength: 2_048 })
  if (path.isAbsolute(input)) throw toolError('ABSOLUTE_PATH_FORBIDDEN', `${name}必须是 workspace 相对路径`)
  const normalized = path.normalize(input)
  if (normalized === '.' || normalized === '..' || normalized.startsWith(`..${path.sep}`) || path.isAbsolute(normalized)) {
    throw toolError('PATH_OUTSIDE_WORKSPACE', `${name}超出 workspace root`)
  }
  return normalized
}

function normalizeApplication(value, { required = true } = {}) {
  if (!required && (value == null || value === '')) return undefined
  const application = safeString(value, { name: 'application', maxLength: 128 })
  if (application.startsWith('-') || !/^[\p{L}\p{N} ._()+-]+$/u.test(application)) {
    throw toolError('INVALID_APPLICATION_NAME', '应用名称包含不允许的字符')
  }
  return application
}

function canonicalizeTerminal(input) {
  assertBoundedInput(input, MAX_NATIVE_INPUT_BYTES)
  const command = safeString(input.command, { name: 'command', maxLength: 128 })
  if (command !== path.basename(command) || /[\\/]/.test(command) || command.startsWith('.')) {
    throw toolError('INVALID_COMMAND', 'command 只能是 executable name，不能包含路径分隔符')
  }
  const rawArgs = input.args == null ? [] : input.args
  if (!Array.isArray(rawArgs)) throw toolError('INVALID_COMMAND_ARGUMENT', 'args 必须是字符串数组')
  if (rawArgs.length > 64) throw toolError('TOO_MANY_ARGUMENTS', '命令参数不能超过 64 个')
  let argumentBytes = 0
  const args = rawArgs.map((value) => {
    if (typeof value !== 'string' || value.length > 4_096) {
      throw toolError('INVALID_COMMAND_ARGUMENT', '命令参数必须是长度不超过 4096 的字符串')
    }
    assertNoBidiControls(value, '命令参数')
    assertNoControlCharacters(value, '命令参数')
    argumentBytes += Buffer.byteLength(value, 'utf8')
    return value
  })
  if (argumentBytes > 32 * 1024) throw toolError('COMMAND_ARGUMENTS_TOO_LARGE', '命令参数总长度超过限制')
  const cwd = input.cwd == null ? '.' : normalizeRelativePath(input.cwd, 'cwd')
  const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || 30_000, 100), 5 * 60_000)
  const maxOutputBytes = Math.min(Math.max(Number(input.maxOutputBytes) || 1024 * 1024, 1_024), 4 * 1024 * 1024)
  return freezePayload({ command, args, cwd, timeoutMs, maxOutputBytes })
}

function canonicalizeWorkspaceWrite(input) {
  assertBoundedInput(input, MAX_NATIVE_WRITE_BYTES + 16 * 1024)
  const pathValue = normalizeRelativePath(input.path)
  if (typeof input.content !== 'string') throw toolError('INVALID_TOOL_INPUT', 'content 必须是字符串')
  assertNoBidiControls(input.content, 'content')
  assertNoControlCharacters(input.content, 'content', { allowTextWhitespace: true })
  const bytes = Buffer.byteLength(input.content, 'utf8')
  if (bytes > MAX_NATIVE_WRITE_BYTES) {
    throw toolError(
      'NATIVE_APPROVAL_PREVIEW_TOO_LARGE',
      `单次原生审批最多完整展示 ${MAX_NATIVE_WRITE_BYTES} 字节；请拆分写入或使用明确批准的终端命令`
    )
  }
  return freezePayload({ path: pathValue, content: input.content, create: input.create === true })
}

function canonicalizeComputer(action, input) {
  assertBoundedInput(input, MAX_NATIVE_INPUT_BYTES)
  if (action === 'computer.capture_screen') {
    const application = normalizeApplication(input.application, { required: false })
    const instruction = input.instruction == null || input.instruction === ''
      ? ''
      : safeString(input.instruction, {
          name: 'instruction',
          maxLength: 4_000,
          allowTextWhitespace: true
        })
    return freezePayload({ ...(application ? { application } : {}), ...(instruction ? { instruction } : {}) })
  }
  const application = normalizeApplication(input.application)
  if (action === 'computer.open_application') return freezePayload({ application })
  if (action === 'computer.click') {
    const x = Number(input.x)
    const y = Number(input.y)
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 100_000 || y > 100_000) {
      throw toolError('INVALID_CLICK_COORDINATES', '点击坐标必须是 0 到 100000 的整数')
    }
    return freezePayload({ application, x, y })
  }
  if (action === 'computer.type_text') {
    const text = safeString(input.text, { name: 'text', maxLength: 4_000 })
    return freezePayload({ application, text })
  }
  throw toolError('UNKNOWN_APPROVAL_ACTION', `未知电脑操作: ${action}`)
}

function canonicalizeAgentToolPayload(action, input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw toolError('INVALID_TOOL_INPUT', '工具参数必须是对象')
  }
  if (action === 'workspace.write') return canonicalizeWorkspaceWrite(input)
  if (action === 'terminal.run') return canonicalizeTerminal(input)
  if (action === 'workspace.set') {
    assertBoundedInput(input, 8 * 1024)
    const candidate = safeString(input.path, { name: 'workspace root', maxLength: 2_048 })
    return freezePayload({ path: path.resolve(candidate) })
  }
  if (action.startsWith('computer.')) return canonicalizeComputer(action, input)
  throw toolError('UNKNOWN_APPROVAL_ACTION', `未知审批操作: ${action}`)
}

function agentToolApprovalDetail(action, payload) {
  if (action === 'workspace.write') {
    return [
      `文件: ${JSON.stringify(payload.path)}`,
      `新建: ${payload.create ? '是' : '否'}`,
      `UTF-8 字节: ${Buffer.byteLength(payload.content, 'utf8')}`,
      `SHA-256: ${crypto.createHash('sha256').update(payload.content).digest('hex')}`,
      '完整内容:',
      JSON.stringify(payload.content)
    ].join('\n')
  }
  if (action === 'terminal.run') {
    return [
      `命令: ${JSON.stringify(payload.command)}`,
      `参数: ${JSON.stringify(payload.args)}`,
      `目录: ${JSON.stringify(payload.cwd)}`,
      `超时: ${payload.timeoutMs} ms`,
      `输出上限: ${payload.maxOutputBytes} 字节`
    ].join('\n')
  }
  if (action === 'computer.capture_screen') {
    return `目标应用: ${JSON.stringify(payload.application || '当前屏幕')}\n用途: ${JSON.stringify(payload.instruction || '')}`
  }
  if (action === 'computer.open_application') return `应用: ${JSON.stringify(payload.application)}`
  if (action === 'computer.click') return `应用: ${JSON.stringify(payload.application)}\n坐标: (${payload.x}, ${payload.y})`
  if (action === 'computer.type_text') return `应用: ${JSON.stringify(payload.application)}\n文本: ${JSON.stringify(payload.text)}`
  if (action === 'workspace.set') return `工作区: ${JSON.stringify(payload.path)}`
  throw toolError('UNKNOWN_APPROVAL_ACTION', `未知审批操作: ${action}`)
}

function attachNativeApproval(action, payload) {
  const payloadSha256 = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return freezePayload({
    ...payload,
    approval: { granted: true, action, nativeConfirmed: true, payloadSha256 }
  })
}

module.exports = {
  MAX_NATIVE_WRITE_BYTES,
  agentToolApprovalDetail,
  attachNativeApproval,
  canonicalizeAgentToolPayload
}

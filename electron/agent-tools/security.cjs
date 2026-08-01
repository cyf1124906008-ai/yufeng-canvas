const path = require('path')
const fs = require('fs')

const MAX_IPC_INPUT_BYTES = 64 * 1024
const BIDI_CONTROL_PATTERN = /[\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u

function toolError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function assertBoundedInput(value, maxBytes = MAX_IPC_INPUT_BYTES) {
  let serialized
  try {
    serialized = JSON.stringify(value ?? null)
  } catch {
    throw toolError('INVALID_TOOL_INPUT', '工具参数必须可序列化')
  }
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw toolError('TOOL_INPUT_TOO_LARGE', '工具参数超过大小限制')
  }
  return value
}

function requireApproval(approval, action) {
  assertBoundedInput(approval, 2 * 1024)
  if (!approval || approval.granted !== true || approval.action !== action) {
    throw toolError('APPROVAL_REQUIRED', `操作需要显式审批: ${action}`)
  }
  return true
}

function boundedString(value, { name = '参数', maxLength = 4_096, allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw toolError('INVALID_TOOL_INPUT', `${name}必须是字符串`)
  const result = value.trim()
  if ((!allowEmpty && !result) || result.length > maxLength || result.includes('\0')) {
    throw toolError('INVALID_TOOL_INPUT', `${name}无效或超过长度限制`)
  }
  return result
}

function assertNoBidiControls(value, name = '参数') {
  if (typeof value === 'string' && BIDI_CONTROL_PATTERN.test(value)) {
    throw toolError('BIDI_CONTROL_FORBIDDEN', `${name}包含可能隐藏真实内容的双向控制字符`)
  }
  return value
}

function isCredentialReference(value) {
  return /^(?:\$\{|<[^>]+>$|process\.env(?:\.|\[)|import\.meta\.env\.|Deno\.env\.get\(|Bun\.env\.|(?:config|settings|env|secrets?|credentials?)\.)/i.test(
    String(value || '').trim()
  )
}

function redactSensitiveAssignment(_match, prefix, quote, value) {
  if (isCredentialReference(value)) return `${prefix}${quote}${value}${quote}`
  return `${prefix}${quote}[redacted]${quote}`
}

function redactCredentialText(value) {
  return String(value)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private-key-redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{16})\b/g, '[credential-redacted]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt-redacted]')
    .replace(
      /((?:["'])?[A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|password|passwd|credentials?|authorization|auth|cookie|private[_-]?key)[A-Za-z0-9_.-]*(?:["'])?\s*[:=]\s*)(["']?)([^\s,;"']+)\2/gi,
      redactSensitiveAssignment
    )
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, '$1$2:[redacted]@')
    .replace(/([?&](?:api[_-]?key|token|access[_-]?token|auth|authorization|signature|sig|secret)=)[^&#\s]+/gi, '$1[redacted]')
}

function isWithin(root, target) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

async function resolveExistingWithinRoot(root, relativePath = '.', { type = 'any' } = {}) {
  if (!root) throw toolError('WORKSPACE_NOT_SET', '请先选择 workspace root')
  const input = boundedString(relativePath == null ? '.' : String(relativePath), {
    name: 'path',
    maxLength: 2_048
  })
  if (path.isAbsolute(input)) throw toolError('ABSOLUTE_PATH_FORBIDDEN', 'Agent 工具只接受 workspace 相对路径')

  const lexical = path.resolve(root, input)
  if (!isWithin(root, lexical)) throw toolError('PATH_OUTSIDE_WORKSPACE', '路径超出 workspace root')

  const relative = path.relative(root, lexical)
  let cursor = root
  for (const part of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part)
    let stat
    try {
      stat = await fs.promises.lstat(cursor)
    } catch (error) {
      if (error?.code === 'ENOENT') throw toolError('PATH_NOT_FOUND', 'workspace 路径不存在')
      throw error
    }
    if (stat.isSymbolicLink()) throw toolError('SYMLINK_FORBIDDEN', 'Agent 工具不跟随 workspace 内的符号链接')
  }

  let realPath
  try {
    realPath = await fs.promises.realpath(lexical)
  } catch (error) {
    if (error?.code === 'ENOENT') throw toolError('PATH_NOT_FOUND', 'workspace 路径不存在')
    throw error
  }
  if (!isWithin(root, realPath)) throw toolError('PATH_OUTSIDE_WORKSPACE', '真实路径超出 workspace root')
  const stat = await fs.promises.stat(realPath)
  if (type === 'file' && !stat.isFile()) throw toolError('NOT_A_FILE', '目标不是文件')
  if (type === 'directory' && !stat.isDirectory()) throw toolError('NOT_A_DIRECTORY', '目标不是目录')
  return { path: realPath, stat }
}

function unavailable(capability, platform = process.platform) {
  return {
    ok: false,
    available: false,
    capability,
    platform,
    reason: 'UNSUPPORTED_PLATFORM'
  }
}

module.exports = {
  MAX_IPC_INPUT_BYTES,
  assertNoBidiControls,
  assertBoundedInput,
  boundedString,
  isWithin,
  requireApproval,
  redactCredentialText,
  resolveExistingWithinRoot,
  toolError,
  unavailable
}

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const {
  assertNoBidiControls,
  assertBoundedInput,
  boundedString,
  isWithin,
  redactCredentialText,
  requireApproval,
  resolveExistingWithinRoot,
  toolError
} = require('./security.cjs')

const MAX_READ_BYTES = 4 * 1024 * 1024
const MAX_SEARCH_FILE_BYTES = 1024 * 1024
const MAX_SEARCH_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_SEARCH_FILES = 5_000
const MAX_WRITE_BYTES = 4 * 1024 * 1024
const MAX_PATCH_BYTES = 64 * 1024
const MAX_PATCH_HUNKS = 128
const MAX_PATCH_LINES = 2_000
const SEARCH_IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'dist-desktop', 'release', '.cache'])
const SENSITIVE_FILE_PATTERN = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.s3cfg|\.boto|id_(?:rsa|dsa|ecdsa|ed25519)|credentials?|secrets?|tokens?|auth\.json|application_default_credentials\.json|service[-_]?account.*\.json|.*(?:firebase-adminsdk|service[-_]?account).*\.json|.*\.(?:pem|key|p12|pfx|keystore))$/i
const SENSITIVE_DIRECTORY_PATTERN = /^(?:\.ssh|\.aws|\.gnupg|\.azure|\.kube|\.oci|\.docker|\.terraform\.d)$/i
const SENSITIVE_PATH_PATTERNS = [
  /(?:^|\/)\.config\/(?:gcloud|gh|hub|doctl|rclone)(?:\/|$)/i
]

function isSensitiveRelativePath(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/').replace(/^\.\//, '')
  const parts = normalized.split('/').filter(Boolean)
  return SENSITIVE_PATH_PATTERNS.some(pattern => pattern.test(normalized)) || parts.some((part, index) => (
    SENSITIVE_DIRECTORY_PATTERN.test(part) ||
    (index === parts.length - 1 && SENSITIVE_FILE_PATTERN.test(part))
  ))
}

async function readFileNoFollow(filePath) {
  const noFollow = fs.constants.O_NOFOLLOW || 0
  const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | noFollow)
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw toolError('NOT_A_FILE', '读取目标不是普通文件')
    return { stat, buffer: await handle.readFile() }
  } finally {
    await handle.close()
  }
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function sameFileIdentity(left, right) {
  if (!left || !right) return false
  const stableFields = ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']
  return stableFields.every(field => Number(left[field]) === Number(right[field]))
}

function assertSameFileSnapshot(opened, current, expectedSha256, message) {
  if (!sameFileIdentity(opened?.stat, current?.stat) || sha256(current?.buffer || Buffer.alloc(0)) !== expectedSha256) {
    throw toolError('PATCH_BASE_MISMATCH', message)
  }
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    throw toolError('BINARY_FILE_FORBIDDEN', '文件不是有效的 UTF-8 文本')
  }
}

function normalizePatchLine(value, name) {
  if (typeof value !== 'string' || value.length > 16_384 || /[\r\n\0]/u.test(value)) {
    throw toolError('INVALID_PATCH_LINE', `${name}必须是不含换行符且长度不超过 16384 的字符串`)
  }
  assertNoBidiControls(value, name)
  if (/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
    throw toolError('CONTROL_CHARACTER_FORBIDDEN', `${name}包含不允许的控制字符`)
  }
  return value
}

function normalizePatchHunks(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PATCH_HUNKS) {
    throw toolError('INVALID_PATCH', `hunks 必须包含 1 到 ${MAX_PATCH_HUNKS} 个补丁块`)
  }
  let totalLines = 0
  const hunks = value.map((hunk, index) => {
    if (!hunk || typeof hunk !== 'object' || Array.isArray(hunk)) {
      throw toolError('INVALID_PATCH', `hunks[${index}] 必须是对象`)
    }
    const startLine = Number(hunk.startLine)
    if (!Number.isInteger(startLine) || startLine < 1 || startLine > 10_000_000) {
      throw toolError('INVALID_PATCH', `hunks[${index}].startLine 必须是正整数`)
    }
    if (!Array.isArray(hunk.oldLines) || !Array.isArray(hunk.newLines)) {
      throw toolError('INVALID_PATCH', `hunks[${index}] 必须包含 oldLines 和 newLines 数组`)
    }
    if (hunk.oldLines.length === 0 && hunk.newLines.length === 0) {
      throw toolError('INVALID_PATCH', `hunks[${index}] 不能是空操作`)
    }
    totalLines += hunk.oldLines.length + hunk.newLines.length
    if (totalLines > MAX_PATCH_LINES) {
      throw toolError('PATCH_TOO_LARGE', `补丁行数不能超过 ${MAX_PATCH_LINES}`)
    }
    return {
      startLine,
      oldLines: hunk.oldLines.map((line, lineIndex) => normalizePatchLine(line, `hunks[${index}].oldLines[${lineIndex}]`)),
      newLines: hunk.newLines.map((line, lineIndex) => normalizePatchLine(line, `hunks[${index}].newLines[${lineIndex}]`))
    }
  }).sort((left, right) => left.startLine - right.startLine)

  let previousStart = 0
  let previousEnd = 0
  for (const hunk of hunks) {
    const start = hunk.startLine - 1
    if (hunk.startLine <= previousStart || start < previousEnd) {
      throw toolError('OVERLAPPING_PATCH_HUNKS', '补丁块必须按原文件行号排列且不能重叠')
    }
    previousStart = hunk.startLine
    previousEnd = start + hunk.oldLines.length
  }
  return hunks
}

function parseTextDocument(content) {
  const hasCrLf = content.includes('\r\n')
  const withoutCrLf = content.replaceAll('\r\n', '')
  if (withoutCrLf.includes('\r') || (hasCrLf && withoutCrLf.includes('\n'))) {
    throw toolError('MIXED_LINE_ENDINGS', '结构化补丁暂不支持混合换行符文件')
  }
  const eol = hasCrLf ? '\r\n' : '\n'
  const finalNewline = content.endsWith(eol)
  const body = finalNewline ? content.slice(0, -eol.length) : content
  return {
    eol,
    finalNewline,
    lines: body === '' ? (content === '' ? [] : ['']) : body.split(eol)
  }
}

function applyLineHunks(document, hunks, finalNewline) {
  const lines = [...document.lines]
  for (const hunk of hunks) {
    const start = hunk.startLine - 1
    if (start > document.lines.length || start + hunk.oldLines.length > document.lines.length) {
      throw toolError('PATCH_CONTEXT_MISMATCH', `第 ${hunk.startLine} 行的补丁范围超出当前文件`)
    }
    const actual = document.lines.slice(start, start + hunk.oldLines.length)
    if (actual.length !== hunk.oldLines.length || actual.some((line, index) => line !== hunk.oldLines[index])) {
      throw toolError('PATCH_CONTEXT_MISMATCH', `第 ${hunk.startLine} 行的旧内容与当前文件不一致`)
    }
  }
  for (const hunk of [...hunks].reverse()) {
    lines.splice(hunk.startLine - 1, hunk.oldLines.length, ...hunk.newLines)
  }
  const keepFinalNewline = finalNewline == null ? document.finalNewline : finalNewline
  return `${lines.join(document.eol)}${keepFinalNewline ? document.eol : ''}`
}

function reversePatchHunks(hunks) {
  let lineOffset = 0
  return hunks.map((hunk) => {
    const reversed = {
      startLine: hunk.startLine + lineOffset,
      oldLines: [...hunk.newLines],
      newLines: [...hunk.oldLines]
    }
    lineOffset += hunk.newLines.length - hunk.oldLines.length
    return reversed
  })
}

function applyReverseLineHunks(document, reverseHunks, finalNewline) {
  const lines = [...document.lines]
  for (const hunk of [...reverseHunks].reverse()) {
    const start = hunk.startLine - 1
    if (start > lines.length || start + hunk.oldLines.length > lines.length) {
      throw toolError('PATCH_CONTEXT_MISMATCH', `第 ${hunk.startLine} 行的逆向补丁范围超出当前文件`)
    }
    const actual = lines.slice(start, start + hunk.oldLines.length)
    if (actual.length !== hunk.oldLines.length || actual.some((line, index) => line !== hunk.oldLines[index])) {
      throw toolError('PATCH_CONTEXT_MISMATCH', `第 ${hunk.startLine} 行的当前内容与逆向补丁不一致`)
    }
    lines.splice(start, hunk.oldLines.length, ...hunk.newLines)
  }
  return `${lines.join(document.eol)}${finalNewline ? document.eol : ''}`
}

class WorkspaceManager {
  constructor({ settingsPath = '' } = {}) {
    this.settingsPath = settingsPath
    this.root = ''
    this.generation = 0
    this.initialized = false
    // Raw rollback hunks are intentionally memory-only. Persisted Workbench
    // events receive a sanitized diff plus this opaque token.
    this.rollbackRecords = new Map()
  }

  prepareRevertPatch(input = {}) {
    assertBoundedInput(input, 4 * 1024)
    const rollbackId = boundedString(input.rollbackId, { name: 'rollbackId', maxLength: 128 })
    const record = this.rollbackRecords.get(rollbackId)
    if (!record) throw toolError('ROLLBACK_RECORD_NOT_FOUND', '回滚记录已过期或属于另一次应用会话')
    if (record.workspaceRoot !== this.root || record.workspaceGeneration !== this.generation) {
      this.rollbackRecords.delete(rollbackId)
      throw toolError('WORKSPACE_IDENTITY_MISMATCH', '回滚记录属于另一个 workspace root 或已过期世代')
    }
    const revertsDiffId = input.revertsDiffId == null
      ? undefined
      : boundedString(input.revertsDiffId, { name: 'revertsDiffId', maxLength: 128 })
    return {
      path: record.path,
      expectedCurrentSha256: record.expectedCurrentSha256,
      expectedRevertedSha256: record.expectedRevertedSha256,
      hunks: record.hunks.map(hunk => ({
        startLine: hunk.startLine,
        oldLines: [...hunk.oldLines],
        newLines: [...hunk.newLines]
      })),
      finalNewlineBefore: record.finalNewlineBefore,
      finalNewlineAfter: record.finalNewlineAfter,
      rollbackId,
      workspaceRoot: record.workspaceRoot,
      workspaceGeneration: record.workspaceGeneration,
      ...(revertsDiffId ? { revertsDiffId } : {})
    }
  }

  async initialize() {
    if (this.initialized) return this.root
    this.initialized = true
    if (!this.settingsPath) return this.root
    try {
      const parsed = JSON.parse(await fs.promises.readFile(this.settingsPath, 'utf8'))
      if (typeof parsed?.workspaceRoot === 'string') await this.setRoot(parsed.workspaceRoot, { persist: false })
    } catch {
      this.root = ''
    }
    return this.root
  }

  async getRoot() {
    await this.initialize()
    return { ok: true, workspaceRoot: this.root || null }
  }

  async getIdentity() {
    await this.initialize()
    return {
      ok: true,
      workspaceRoot: this.root || null,
      workspaceGeneration: this.generation
    }
  }

  async setRoot(candidate, { persist = true } = {}) {
    const input = boundedString(candidate, { name: 'workspace root', maxLength: 2_048 })
    let realPath
    try {
      realPath = await fs.promises.realpath(input)
    } catch (error) {
      if (error?.code === 'ENOENT') throw toolError('WORKSPACE_NOT_FOUND', 'workspace root 不存在')
      throw error
    }
    const stat = await fs.promises.stat(realPath)
    if (!stat.isDirectory()) throw toolError('WORKSPACE_NOT_DIRECTORY', 'workspace root 必须是目录')
    if (this.root !== realPath) {
      this.rollbackRecords.clear()
      this.generation += 1
    }
    this.root = realPath
    this.initialized = true
    if (persist && this.settingsPath) {
      await fs.promises.mkdir(path.dirname(this.settingsPath), { recursive: true })
      const temporary = `${this.settingsPath}.${process.pid}.tmp`
      await fs.promises.writeFile(temporary, JSON.stringify({ workspaceRoot: realPath }), { mode: 0o600 })
      await fs.promises.rename(temporary, this.settingsPath)
    }
    return { ok: true, workspaceRoot: realPath }
  }

  async resolve(relativePath, options) {
    await this.initialize()
    return resolveExistingWithinRoot(this.root, relativePath, options)
  }

  async resolveBound(relativePath, options, input = {}) {
    await this.initialize()
    const binding = this.#assertWorkspaceBinding(input)
    const target = await resolveExistingWithinRoot(binding.workspaceRoot, relativePath, options)
    this.#assertWorkspaceBinding(input)
    return { ...target, ...binding }
  }

  assertBinding(input = {}) {
    return this.#assertWorkspaceBinding(input)
  }

  #assertWorkspaceBinding(input = {}) {
    const workspaceRoot = boundedString(input.workspaceRoot, { name: 'workspaceRoot', maxLength: 2_048 })
    const workspaceGeneration = Number(input.workspaceGeneration)
    if (!path.isAbsolute(workspaceRoot) || !Number.isSafeInteger(workspaceGeneration) || workspaceGeneration < 1) {
      throw toolError('WORKSPACE_IDENTITY_INVALID', 'workspace mutation 缺少有效的 workspace identity')
    }
    if (workspaceRoot !== this.root || workspaceGeneration !== this.generation) {
      throw toolError('WORKSPACE_IDENTITY_MISMATCH', 'workspace root 在审批后已发生变化，请重新发起操作')
    }
    return { workspaceRoot, workspaceGeneration }
  }

  #bindingIsCurrent(binding) {
    return Boolean(binding) && binding.workspaceRoot === this.root && binding.workspaceGeneration === this.generation
  }

  async listFiles(input = {}) {
    assertBoundedInput(input)
    const maxEntries = Math.min(Math.max(Number(input.maxEntries) || 200, 1), 500)
    const target = await this.resolve(input.path || '.', { type: 'directory' })
    const entries = await fs.promises.readdir(target.path, { withFileTypes: true })
    const result = []
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name)).slice(0, maxEntries)) {
      const entryPath = path.join(target.path, entry.name)
      const lstat = await fs.promises.lstat(entryPath)
      result.push({
        name: entry.name,
        path: path.relative(this.root, entryPath).split(path.sep).join('/'),
        type: lstat.isSymbolicLink() ? 'symlink' : lstat.isDirectory() ? 'directory' : lstat.isFile() ? 'file' : 'other',
        size: lstat.isFile() ? lstat.size : null,
        modifiedAt: lstat.mtimeMs
      })
    }
    return { ok: true, path: path.relative(this.root, target.path) || '.', entries: result, truncated: entries.length > maxEntries }
  }

  async readFile(input = {}) {
    assertBoundedInput(input)
    const maxBytes = Math.min(Math.max(Number(input.maxBytes) || 1024 * 1024, 1), MAX_READ_BYTES)
    if (isSensitiveRelativePath(input.path)) {
      throw toolError('SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS', '敏感凭证文件不能由自动读取工具访问')
    }
    const target = await this.resolve(input.path, { type: 'file' })
    if (target.stat.size > maxBytes) throw toolError('FILE_TOO_LARGE', `文件超过 ${maxBytes} 字节读取上限`)
    const { stat, buffer } = await readFileNoFollow(target.path)
    if (stat.size > maxBytes) throw toolError('FILE_TOO_LARGE', `文件超过 ${maxBytes} 字节读取上限`)
    if (buffer.includes(0)) throw toolError('BINARY_FILE_FORBIDDEN', 'readFile 只读取文本文件')
    return {
      ok: true,
      path: path.relative(this.root, target.path).split(path.sep).join('/'),
      size: buffer.length,
      encoding: 'utf8',
      sha256: sha256(buffer),
      content: redactCredentialText(decodeUtf8(buffer))
    }
  }

  async writeFile(input = {}) {
    assertBoundedInput(input, MAX_WRITE_BYTES + 16 * 1024)
    requireApproval(input.approval, 'workspace.write')
    await this.initialize()
    if (!this.root) throw toolError('WORKSPACE_NOT_SET', '请先选择 workspace root')
    const workspaceBinding = this.#assertWorkspaceBinding(input)
    const boundRoot = workspaceBinding.workspaceRoot
    const relativePath = assertNoBidiControls(
      boundedString(input.path, { name: 'path', maxLength: 2_048 }),
      'path'
    )
    if (path.isAbsolute(relativePath)) throw toolError('ABSOLUTE_PATH_FORBIDDEN', 'Agent 工具只接受 workspace 相对路径')
    if (typeof input.content !== 'string' || input.content.includes('\0')) {
      throw toolError('BINARY_FILE_FORBIDDEN', 'writeFile 只写入 UTF-8 文本')
    }
    const content = Buffer.from(input.content, 'utf8')
    if (content.length > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '写入内容超过 4MB 上限')

    const lexicalTarget = path.resolve(boundRoot, relativePath)
    if (!isWithin(boundRoot, lexicalTarget) || lexicalTarget === boundRoot) {
      throw toolError('PATH_OUTSIDE_WORKSPACE', '写入路径超出 workspace root')
    }
    const parent = await resolveExistingWithinRoot(boundRoot, path.dirname(relativePath), { type: 'directory' })
    const target = path.join(parent.path, path.basename(lexicalTarget))
    if (!isWithin(boundRoot, target)) throw toolError('PATH_OUTSIDE_WORKSPACE', '写入路径超出 workspace root')

    let created = false
    let before = null
    let mode = 0o600
    try {
      const lstat = await fs.promises.lstat(target)
      if (lstat.isSymbolicLink()) throw toolError('SYMLINK_FORBIDDEN', '不能通过符号链接写入文件')
      if (!lstat.isFile()) throw toolError('NOT_A_FILE', '写入目标不是普通文件')
      if (lstat.size > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '现有文件超过 4MB 上限')
      const previous = (await readFileNoFollow(target)).buffer
      if (previous.includes(0)) throw toolError('BINARY_FILE_FORBIDDEN', '不允许覆盖二进制文件')
      before = sha256(previous)
      mode = lstat.mode & 0o777
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      if (input.create !== true) throw toolError('FILE_NOT_FOUND', '文件不存在；创建新文件必须显式传入 create:true')
      created = true
    }

    const temporary = path.join(parent.path, `.yufeng-agent-${process.pid}-${crypto.randomUUID()}.tmp`)
    try {
      const parentRealPath = await fs.promises.realpath(parent.path)
      if (parentRealPath !== parent.path || !isWithin(boundRoot, parentRealPath)) {
        throw toolError('SYMLINK_FORBIDDEN', '写入父目录在审批后发生了变化')
      }
      this.#assertWorkspaceBinding(input)
      await fs.promises.writeFile(temporary, content, { flag: 'wx', mode })
      const parentBeforeRename = await fs.promises.realpath(parent.path)
      if (parentBeforeRename !== parent.path || !isWithin(boundRoot, parentBeforeRename)) {
        throw toolError('SYMLINK_FORBIDDEN', '写入父目录在执行期间发生了变化')
      }
      this.#assertWorkspaceBinding(input)
      await fs.promises.rename(temporary, target)
    } finally {
      await fs.promises.unlink(temporary).catch(() => null)
    }
    return {
      ok: true,
      path: path.relative(boundRoot, target).split(path.sep).join('/'),
      created,
      bytes: content.length,
      beforeSha256: before,
      afterSha256: sha256(content)
    }
  }

  async applyPatch(input = {}) {
    assertBoundedInput(input, MAX_PATCH_BYTES)
    requireApproval(input.approval, 'workspace.patch')
    await this.initialize()
    if (!this.root) throw toolError('WORKSPACE_NOT_SET', '请先选择 workspace root')
    const workspaceBinding = this.#assertWorkspaceBinding(input)
    const boundRoot = workspaceBinding.workspaceRoot
    const relativePath = assertNoBidiControls(
      boundedString(input.path, { name: 'path', maxLength: 2_048 }),
      'path'
    )
    if (isSensitiveRelativePath(relativePath)) {
      throw toolError('SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS', '敏感凭证文件不能由结构化补丁工具访问')
    }
    const expectedSha256 = boundedString(input.beforeSha256, { name: 'beforeSha256', maxLength: 64 }).toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw toolError('INVALID_PATCH_BASE', 'beforeSha256 必须是 64 位 SHA-256')
    }
    const hunks = normalizePatchHunks(input.hunks)
    const finalNewline = input.finalNewline == null ? null : input.finalNewline
    if (finalNewline != null && typeof finalNewline !== 'boolean') {
      throw toolError('INVALID_PATCH', 'finalNewline 必须是布尔值')
    }

    const target = await resolveExistingWithinRoot(boundRoot, relativePath, { type: 'file' })
    if (target.stat.size > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '现有文件超过 4MB 上限')
    const opened = await readFileNoFollow(target.path)
    if (opened.buffer.includes(0)) throw toolError('BINARY_FILE_FORBIDDEN', '不允许修改二进制文件')
    const beforeSha256 = sha256(opened.buffer)
    if (beforeSha256 !== expectedSha256) {
      throw toolError('PATCH_BASE_MISMATCH', '文件自读取后已发生变化，请重新读取后生成补丁')
    }
    const beforeContent = decodeUtf8(opened.buffer)
    const document = parseTextDocument(beforeContent)
    const afterContent = applyLineHunks(document, hunks, finalNewline)
    if (afterContent === beforeContent) throw toolError('PATCH_NO_CHANGES', '补丁没有产生任何文件变化')
    const afterBuffer = Buffer.from(afterContent, 'utf8')
    if (afterBuffer.length > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '补丁后的文件超过 4MB 上限')

    const parentPath = path.dirname(target.path)
    const mode = opened.stat.mode & 0o777
    const temporary = path.join(parentPath, `.yufeng-agent-patch-${process.pid}-${crypto.randomUUID()}.tmp`)
    try {
      const parentRealPath = await fs.promises.realpath(parentPath)
      if (parentRealPath !== parentPath || !isWithin(boundRoot, parentRealPath)) {
        throw toolError('SYMLINK_FORBIDDEN', '补丁父目录在审批后发生了变化')
      }
      this.#assertWorkspaceBinding(input)
      const current = await readFileNoFollow(target.path)
      assertSameFileSnapshot(opened, current, beforeSha256, '文件在补丁执行期间发生了变化')
      await fs.promises.writeFile(temporary, afterBuffer, { flag: 'wx', mode })
      const parentBeforeRename = await fs.promises.realpath(parentPath)
      if (parentBeforeRename !== parentPath || !isWithin(boundRoot, parentBeforeRename)) {
        throw toolError('SYMLINK_FORBIDDEN', '补丁父目录在写入临时文件后发生了变化')
      }
      this.#assertWorkspaceBinding(input)
      const targetBeforeRename = await readFileNoFollow(target.path)
      assertSameFileSnapshot(opened, targetBeforeRename, beforeSha256, '文件在补丁提交前发生了变化')
      await fs.promises.rename(temporary, target.path)
    } finally {
      await fs.promises.unlink(temporary).catch(() => null)
    }

    const afterSha256 = sha256(afterBuffer)
    const relativeTarget = path.relative(boundRoot, target.path).split(path.sep).join('/')
    const rollbackId = this.#bindingIsCurrent(workspaceBinding) ? this.#rememberRollback({
      workspaceRoot: boundRoot,
      workspaceGeneration: workspaceBinding.workspaceGeneration,
      path: relativeTarget,
      expectedCurrentSha256: afterSha256,
      expectedRevertedSha256: beforeSha256,
      hunks,
      finalNewlineBefore: document.finalNewline,
      finalNewlineAfter: finalNewline == null ? document.finalNewline : finalNewline
    }) : null
    return {
      ok: true,
      path: relativeTarget,
      bytesBefore: opened.buffer.length,
      bytesAfter: afterBuffer.length,
      beforeSha256,
      afterSha256,
      changedLines: hunks.reduce((total, hunk) => total + Math.max(hunk.oldLines.length, hunk.newLines.length), 0),
      diff: {
        operation: 'apply',
        rollbackId,
        path: relativeTarget,
        beforeSha256,
        afterSha256,
        hunks,
        finalNewlineBefore: document.finalNewline,
        finalNewlineAfter: finalNewline == null ? document.finalNewline : finalNewline
      }
    }
  }

  async revertPatch(input = {}) {
    assertBoundedInput(input, MAX_PATCH_BYTES)
    requireApproval(input.approval, 'workspace.revert_patch')
    await this.initialize()
    if (!this.root) throw toolError('WORKSPACE_NOT_SET', '请先选择 workspace root')
    const workspaceBinding = this.#assertWorkspaceBinding(input)
    const boundRoot = workspaceBinding.workspaceRoot
    const relativePath = assertNoBidiControls(
      boundedString(input.path, { name: 'path', maxLength: 2_048 }),
      'path'
    )
    if (isSensitiveRelativePath(relativePath)) {
      throw toolError('SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS', '敏感凭证文件不能由结构化回滚工具访问')
    }
    const expectedCurrentSha256 = boundedString(input.expectedCurrentSha256, {
      name: 'expectedCurrentSha256',
      maxLength: 64
    }).toLowerCase()
    const expectedRevertedSha256 = boundedString(input.expectedRevertedSha256, {
      name: 'expectedRevertedSha256',
      maxLength: 64
    }).toLowerCase()
    if (!/^[a-f0-9]{64}$/.test(expectedCurrentSha256) || !/^[a-f0-9]{64}$/.test(expectedRevertedSha256)) {
      throw toolError('INVALID_PATCH_BASE', '回滚必须提供有效的当前与目标 SHA-256')
    }
    const originalHunks = normalizePatchHunks(input.hunks)
    const reverseHunks = reversePatchHunks(originalHunks)
    const finalNewlineBefore = input.finalNewlineBefore
    const finalNewlineAfter = input.finalNewlineAfter
    if (typeof finalNewlineBefore !== 'boolean' || typeof finalNewlineAfter !== 'boolean') {
      throw toolError('INVALID_PATCH', '回滚必须包含原 diff 的 finalNewlineBefore 和 finalNewlineAfter')
    }
    const revertsDiffId = input.revertsDiffId == null
      ? null
      : boundedString(input.revertsDiffId, { name: 'revertsDiffId', maxLength: 128 })
    const sourceRollbackId = input.rollbackId == null
      ? null
      : boundedString(input.rollbackId, { name: 'rollbackId', maxLength: 128 })

    const target = await resolveExistingWithinRoot(boundRoot, relativePath, { type: 'file' })
    if (target.stat.size > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '现有文件超过 4MB 上限')
    const opened = await readFileNoFollow(target.path)
    if (opened.buffer.includes(0)) throw toolError('BINARY_FILE_FORBIDDEN', '不允许修改二进制文件')
    const currentSha256 = sha256(opened.buffer)
    if (currentSha256 !== expectedCurrentSha256) {
      throw toolError('PATCH_BASE_MISMATCH', '文件已在原补丁后发生变化，不能安全回滚')
    }
    const document = parseTextDocument(decodeUtf8(opened.buffer))
    if (document.finalNewline !== finalNewlineAfter) {
      throw toolError('PATCH_CONTEXT_MISMATCH', '当前文件的最终换行状态与原 diff 不一致')
    }
    const revertedContent = applyReverseLineHunks(document, reverseHunks, finalNewlineBefore)
    const revertedBuffer = Buffer.from(revertedContent, 'utf8')
    if (revertedBuffer.length > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '回滚后的文件超过 4MB 上限')
    const revertedSha256 = sha256(revertedBuffer)
    if (revertedSha256 !== expectedRevertedSha256) {
      throw toolError('PATCH_REVERT_HASH_MISMATCH', '逆向补丁结果与原始文件 SHA-256 不一致，已拒绝写入')
    }

    const parentPath = path.dirname(target.path)
    const mode = opened.stat.mode & 0o777
    const temporary = path.join(parentPath, `.yufeng-agent-revert-${process.pid}-${crypto.randomUUID()}.tmp`)
    try {
      const parentRealPath = await fs.promises.realpath(parentPath)
      if (parentRealPath !== parentPath || !isWithin(boundRoot, parentRealPath)) {
        throw toolError('SYMLINK_FORBIDDEN', '回滚父目录在审批后发生了变化')
      }
      this.#assertWorkspaceBinding(input)
      const current = await readFileNoFollow(target.path)
      assertSameFileSnapshot(opened, current, currentSha256, '文件在回滚执行期间发生了变化')
      await fs.promises.writeFile(temporary, revertedBuffer, { flag: 'wx', mode })
      const parentBeforeRename = await fs.promises.realpath(parentPath)
      if (parentBeforeRename !== parentPath || !isWithin(boundRoot, parentBeforeRename)) {
        throw toolError('SYMLINK_FORBIDDEN', '回滚父目录在写入临时文件后发生了变化')
      }
      this.#assertWorkspaceBinding(input)
      const targetBeforeRename = await readFileNoFollow(target.path)
      assertSameFileSnapshot(opened, targetBeforeRename, currentSha256, '文件在回滚提交前发生了变化')
      await fs.promises.rename(temporary, target.path)
    } finally {
      await fs.promises.unlink(temporary).catch(() => null)
    }

    if (sourceRollbackId) this.rollbackRecords.delete(sourceRollbackId)
    const relativeTarget = path.relative(boundRoot, target.path).split(path.sep).join('/')
    const rollbackId = this.#bindingIsCurrent(workspaceBinding) ? this.#rememberRollback({
      workspaceRoot: boundRoot,
      workspaceGeneration: workspaceBinding.workspaceGeneration,
      path: relativeTarget,
      expectedCurrentSha256: revertedSha256,
      expectedRevertedSha256: currentSha256,
      hunks: reverseHunks,
      finalNewlineBefore: finalNewlineAfter,
      finalNewlineAfter: finalNewlineBefore
    }) : null
    return {
      ok: true,
      path: relativeTarget,
      bytesBefore: opened.buffer.length,
      bytesAfter: revertedBuffer.length,
      beforeSha256: currentSha256,
      afterSha256: revertedSha256,
      changedLines: reverseHunks.reduce((total, hunk) => total + Math.max(hunk.oldLines.length, hunk.newLines.length), 0),
      diff: {
        operation: 'revert',
        rollbackId,
        ...(revertsDiffId ? { revertsDiffId } : {}),
        path: relativeTarget,
        beforeSha256: currentSha256,
        afterSha256: revertedSha256,
        hunks: reverseHunks,
        finalNewlineBefore: finalNewlineAfter,
        finalNewlineAfter: finalNewlineBefore
      }
    }
  }

  #rememberRollback(record) {
    const rollbackId = crypto.randomUUID()
    this.rollbackRecords.set(rollbackId, record)
    while (this.rollbackRecords.size > 100) {
      this.rollbackRecords.delete(this.rollbackRecords.keys().next().value)
    }
    return rollbackId
  }

  async searchFiles(input = {}) {
    assertBoundedInput(input)
    const query = boundedString(input.query, { name: 'query', maxLength: 256 })
    const maxResults = Math.min(Math.max(Number(input.maxResults) || 100, 1), 200)
    const caseSensitive = input.caseSensitive === true
    const needle = caseSensitive ? query : query.toLowerCase()
    const target = await this.resolve(input.path || '.', { type: 'directory' })
    if (isSensitiveRelativePath(input.path || '.')) {
      throw toolError('SENSITIVE_FILE_REQUIRES_EXPLICIT_ACCESS', '敏感凭证目录不能由自动搜索工具访问')
    }
    const pending = [target.path]
    const matches = []
    let scannedFiles = 0
    let scannedBytes = 0
    let truncated = false

    while (pending.length && matches.length < maxResults && scannedFiles < MAX_SEARCH_FILES && scannedBytes < MAX_SEARCH_TOTAL_BYTES) {
      const directory = pending.pop()
      try {
        const realDirectory = await fs.promises.realpath(directory)
        if (realDirectory !== directory || !isWithin(this.root, realDirectory)) continue
      } catch {
        continue
      }
      let entries
      try {
        entries = await fs.promises.readdir(directory, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name)
        const relativeEntryPath = path.relative(this.root, entryPath).split(path.sep).join('/')
        if (entry.isSymbolicLink() || isSensitiveRelativePath(relativeEntryPath) || (entry.isDirectory() && SEARCH_IGNORED_DIRS.has(entry.name))) continue
        if (entry.isDirectory()) {
          pending.push(entryPath)
          continue
        }
        if (!entry.isFile()) continue
        let realEntryPath
        try {
          realEntryPath = await fs.promises.realpath(entryPath)
        } catch {
          continue
        }
        if (realEntryPath !== entryPath || !isWithin(this.root, realEntryPath)) continue
        const stat = await fs.promises.stat(realEntryPath)
        if (stat.size <= 0 || stat.size > MAX_SEARCH_FILE_BYTES || scannedBytes + stat.size > MAX_SEARCH_TOTAL_BYTES) continue
        scannedFiles += 1
        scannedBytes += stat.size
        let buffer
        try {
          const opened = await readFileNoFollow(realEntryPath)
          buffer = opened.buffer
        } catch {
          continue
        }
        if (buffer.includes(0)) continue
        const lines = redactCredentialText(buffer.toString('utf8')).split(/\r?\n/)
        for (let index = 0; index < lines.length; index += 1) {
          const haystack = caseSensitive ? lines[index] : lines[index].toLowerCase()
          const column = haystack.indexOf(needle)
          if (column < 0) continue
          matches.push({
            path: path.relative(this.root, realEntryPath).split(path.sep).join('/'),
            line: index + 1,
            column: column + 1,
            text: lines[index].slice(0, 1_000)
          })
          if (matches.length >= maxResults) break
        }
        if (matches.length >= maxResults) break
      }
    }
    if (pending.length || matches.length >= maxResults || scannedFiles >= MAX_SEARCH_FILES || scannedBytes >= MAX_SEARCH_TOTAL_BYTES) truncated = true
    return { ok: true, query, matches, scannedFiles, truncated }
  }
}

module.exports = { WorkspaceManager, isSensitiveRelativePath, readFileNoFollow }

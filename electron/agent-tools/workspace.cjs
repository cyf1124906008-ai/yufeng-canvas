const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const {
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

class WorkspaceManager {
  constructor({ settingsPath = '' } = {}) {
    this.settingsPath = settingsPath
    this.root = ''
    this.initialized = false
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
      content: redactCredentialText(buffer.toString('utf8'))
    }
  }

  async writeFile(input = {}) {
    assertBoundedInput(input, MAX_WRITE_BYTES + 16 * 1024)
    requireApproval(input.approval, 'workspace.write')
    await this.initialize()
    if (!this.root) throw toolError('WORKSPACE_NOT_SET', '请先选择 workspace root')
    const relativePath = boundedString(input.path, { name: 'path', maxLength: 2_048 })
    if (path.isAbsolute(relativePath)) throw toolError('ABSOLUTE_PATH_FORBIDDEN', 'Agent 工具只接受 workspace 相对路径')
    if (typeof input.content !== 'string' || input.content.includes('\0')) {
      throw toolError('BINARY_FILE_FORBIDDEN', 'writeFile 只写入 UTF-8 文本')
    }
    const content = Buffer.from(input.content, 'utf8')
    if (content.length > MAX_WRITE_BYTES) throw toolError('FILE_TOO_LARGE', '写入内容超过 4MB 上限')

    const lexicalTarget = path.resolve(this.root, relativePath)
    if (!isWithin(this.root, lexicalTarget) || lexicalTarget === this.root) {
      throw toolError('PATH_OUTSIDE_WORKSPACE', '写入路径超出 workspace root')
    }
    const parent = await this.resolve(path.dirname(relativePath), { type: 'directory' })
    const target = path.join(parent.path, path.basename(lexicalTarget))
    if (!isWithin(this.root, target)) throw toolError('PATH_OUTSIDE_WORKSPACE', '写入路径超出 workspace root')

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
      before = crypto.createHash('sha256').update(previous).digest('hex')
      mode = lstat.mode & 0o777
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      if (input.create !== true) throw toolError('FILE_NOT_FOUND', '文件不存在；创建新文件必须显式传入 create:true')
      created = true
    }

    const temporary = path.join(parent.path, `.yufeng-agent-${process.pid}-${crypto.randomUUID()}.tmp`)
    try {
      const parentRealPath = await fs.promises.realpath(parent.path)
      if (parentRealPath !== parent.path || !isWithin(this.root, parentRealPath)) {
        throw toolError('SYMLINK_FORBIDDEN', '写入父目录在审批后发生了变化')
      }
      await fs.promises.writeFile(temporary, content, { flag: 'wx', mode })
      const parentBeforeRename = await fs.promises.realpath(parent.path)
      if (parentBeforeRename !== parent.path || !isWithin(this.root, parentBeforeRename)) {
        throw toolError('SYMLINK_FORBIDDEN', '写入父目录在执行期间发生了变化')
      }
      await fs.promises.rename(temporary, target)
    } finally {
      await fs.promises.unlink(temporary).catch(() => null)
    }
    return {
      ok: true,
      path: path.relative(this.root, target).split(path.sep).join('/'),
      created,
      bytes: content.length,
      beforeSha256: before,
      afterSha256: crypto.createHash('sha256').update(content).digest('hex')
    }
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

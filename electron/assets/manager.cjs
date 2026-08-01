const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { app } = require('electron')

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const MAX_DATA_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 512
const MAX_AGENT_RUN_BYTES = 250 * 1024 * 1024
const MAX_AGENT_TOTAL_BYTES = 2 * 1024 * 1024 * 1024
const AGENT_RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/
const AGENT_FILE_PATTERN = /^\d{8}\/asset_\d+_[a-z0-9]+\.(?:png|jpe?g|webp|gif)$/i
const MIME_EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

let agentAssetSecret = null
let agentWriteQueue = Promise.resolve()

function getAssetsRoot() {
  return path.join(app.getPath('userData'), 'yufeng-canvas', 'assets')
}

function normalizeAgentRunId(runId) {
  const value = String(runId || '').trim()
  return AGENT_RUN_ID_PATTERN.test(value) ? value : ''
}

function getAgentNamespace(runId) {
  const normalized = normalizeAgentRunId(runId)
  return normalized ? `agent-${normalized}` : ''
}

function getProjectDir(projectId) {
  const safe = String(projectId || 'canvas-default').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 160)
  return path.join(getAssetsRoot(), safe || 'canvas-default')
}

function getDatedDir(projectId) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const root = getAssetsRoot()
  fs.mkdirSync(root, { recursive: true })
  const projectDir = getProjectDir(projectId)
  fs.mkdirSync(projectDir, { recursive: true })
  const realRoot = fs.realpathSync(root)
  const realProjectDir = fs.realpathSync(projectDir)
  if (!realProjectDir.startsWith(realRoot + path.sep) && realProjectDir !== realRoot) {
    throw new Error('非法资产路径')
  }
  const dir = path.join(realProjectDir, d)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function generateAssetId() {
  return `asset_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

function getAgentAssetSecret() {
  if (agentAssetSecret) return agentAssetSecret
  const root = getAssetsRoot()
  fs.mkdirSync(root, { recursive: true })
  const secretPath = path.join(root, '.agent-assets.key')
  try {
    const existing = fs.readFileSync(secretPath)
    if (existing.length === 32) {
      agentAssetSecret = existing
      return agentAssetSecret
    }
  } catch {}

  const generated = crypto.randomBytes(32)
  try {
    fs.writeFileSync(secretPath, generated, { flag: 'wx', mode: 0o600 })
    agentAssetSecret = generated
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    agentAssetSecret = fs.readFileSync(secretPath)
  }
  if (agentAssetSecret.length !== 32) throw new Error('资产授权密钥无效')
  return agentAssetSecret
}

function signAgentAssetRef(runId, assetRef) {
  const normalizedRunId = normalizeAgentRunId(runId)
  if (!normalizedRunId) return ''
  return crypto.createHmac('sha256', getAgentAssetSecret())
    .update(`${normalizedRunId}\0${assetRef}`)
    .digest('hex')
}

function isAgentRefForRun(assetRef, runId) {
  const namespace = getAgentNamespace(runId)
  if (!namespace || typeof assetRef !== 'string' || path.isAbsolute(assetRef)) return false
  const normalized = assetRef.replaceAll('\\', '/')
  const prefix = `${namespace}/`
  return normalized.startsWith(prefix) && AGENT_FILE_PATTERN.test(normalized.slice(prefix.length))
}

function verifyAgentAssetRef(assetRef, runId, proof) {
  if (!isAgentRefForRun(assetRef, runId) || !/^[a-f0-9]{64}$/i.test(String(proof || ''))) return false
  const expected = Buffer.from(signAgentAssetRef(runId, assetRef), 'hex')
  const received = Buffer.from(String(proof), 'hex')
  return expected.length === received.length && crypto.timingSafeEqual(expected, received)
}

function hasExpectedSignature(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return false
  if (mimeType === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  if (mimeType === 'image/webp') return buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  if (mimeType === 'image/gif') return ['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))
  return false
}

function decodeImageDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > MAX_DATA_URL_LENGTH) {
    return { ok: false, error: '图片数据超出 25MB 上限' }
  }
  const match = dataUrl.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-zA-Z0-9+/]+={0,2})$/i)
  if (!match) return { ok: false, error: '无效的 data URL 格式' }
  const mimeType = match[1].toLowerCase()
  const buffer = Buffer.from(match[2], 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || !hasExpectedSignature(buffer, mimeType)) {
    return { ok: false, error: '图片内容或文件签名无效' }
  }
  return { ok: true, mimeType, buffer }
}

async function directorySize(root, { agentOnly = false } = {}) {
  let total = 0
  let entries
  try {
    entries = await fs.promises.readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return 0
    throw error
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    if (agentOnly && !entry.name.startsWith('agent-')) continue
    const target = path.join(root, entry.name)
    if (entry.isDirectory()) total += await directorySize(target)
    else if (entry.isFile()) total += (await fs.promises.stat(target)).size
  }
  return total
}

function withAgentWriteLock(operation) {
  const pending = agentWriteQueue.catch(() => null).then(operation)
  agentWriteQueue = pending.catch(() => null)
  return pending
}

async function writeImageAsset(decoded, projectId, { runId = '' } = {}) {
  const ext = MIME_EXTENSIONS[decoded.mimeType]
  const assetId = generateAssetId()
  const dir = getDatedDir(projectId)
  const fileName = `${assetId}.${ext}`
  const realRoot = await fs.promises.realpath(getAssetsRoot())
  const realDir = await fs.promises.realpath(dir)
  if (!realDir.startsWith(realRoot + path.sep) && realDir !== realRoot) {
    return { ok: false, error: '非法资产路径' }
  }

  if (runId) {
    const runBytes = await directorySize(path.join(realRoot, getAgentNamespace(runId)))
    const totalBytes = await directorySize(realRoot, { agentOnly: true })
    if (runBytes + decoded.buffer.length > MAX_AGENT_RUN_BYTES || totalBytes + decoded.buffer.length > MAX_AGENT_TOTAL_BYTES) {
      return { ok: false, error: 'Agent 资产累计空间已达到上限' }
    }
  }

  const safeFilePath = path.join(realDir, fileName)
  await fs.promises.writeFile(safeFilePath, decoded.buffer, { flag: 'wx', mode: 0o600 })
  const assetRef = path.relative(realRoot, safeFilePath).split(path.sep).join('/')
  return {
    ok: true,
    assetPath: safeFilePath,
    assetRef,
    assetProof: runId ? signAgentAssetRef(runId, assetRef) : '',
    assetId,
    fileName,
    mimeType: decoded.mimeType
  }
}

async function saveDataUrl(dataUrl, projectId) {
  const decoded = decodeImageDataUrl(dataUrl)
  if (!decoded.ok) return decoded
  return writeImageAsset(decoded, projectId)
}

async function saveAgentDataUrl(dataUrl, runId) {
  const normalizedRunId = normalizeAgentRunId(runId)
  if (!normalizedRunId) return { ok: false, error: 'Agent runId 无效' }
  const decoded = decodeImageDataUrl(dataUrl)
  if (!decoded.ok) return decoded
  return withAgentWriteLock(() => writeImageAsset(decoded, getAgentNamespace(normalizedRunId), { runId: normalizedRunId }))
}

async function readImagePath(resolved) {
  const root = getAssetsRoot()
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return { ok: false, error: '非法资产路径' }
  try {
    const fileLstat = await fs.promises.lstat(resolved)
    if (fileLstat.isSymbolicLink()) return { ok: false, error: '非法资产路径' }
    const realRoot = await fs.promises.realpath(root)
    const realPath = await fs.promises.realpath(resolved)
    if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) return { ok: false, error: '非法资产路径' }
    const stat = await fs.promises.stat(realPath)
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_IMAGE_BYTES) return { ok: false, error: '资产文件大小无效' }
    const ext = path.extname(realPath).toLowerCase().replace('.', '')
    const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
    const mime = mimeMap[ext]
    if (!mime) return { ok: false, error: '不支持的资产类型' }
    const buffer = await fs.promises.readFile(realPath)
    if (!hasExpectedSignature(buffer, mime)) return { ok: false, error: '资产文件签名无效' }
    return { ok: true, dataUrl: `data:${mime};base64,${buffer.toString('base64')}` }
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return { ok: false, error: '资产文件不存在' }
    throw error
  }
}

// Legacy Canvas path reader. Agent history must use readAgentAsDataUrl.
async function readAsDataUrl(assetPath) {
  if (!assetPath || typeof assetPath !== 'string' || !path.isAbsolute(assetPath)) {
    return { ok: false, error: '非法资产路径' }
  }
  return readImagePath(path.resolve(assetPath))
}

async function readAgentAsDataUrl(assetRef, runId, assetProof = '') {
  if (!verifyAgentAssetRef(assetRef, runId, assetProof)) return { ok: false, error: '资产授权失败' }
  return readImagePath(path.resolve(getAssetsRoot(), assetRef))
}

async function deleteAgentRefs(runId, assetRefs, retainedRefs = []) {
  const normalizedRunId = normalizeAgentRunId(runId)
  if (!normalizedRunId) return { ok: false, error: 'Agent runId 无效', deleted: 0, skipped: 0 }
  const refs = Array.isArray(assetRefs) ? assetRefs.slice(0, 500) : []
  const retained = new Set((Array.isArray(retainedRefs) ? retainedRefs : [])
    .filter(value => value?.ref && verifyAgentAssetRef(value.ref, normalizedRunId, value.proof))
    .map(value => value.ref))
  const root = getAssetsRoot()
  if (!fs.existsSync(root)) return { ok: true, deleted: 0, skipped: refs.length }
  const realRoot = await fs.promises.realpath(root)
  let deleted = 0
  let skipped = 0

  for (const descriptor of refs) {
    const value = descriptor?.ref
    const proof = descriptor?.proof
    if (!verifyAgentAssetRef(value, normalizedRunId, proof) || retained.has(value)) {
      skipped += 1
      continue
    }
    const resolved = path.resolve(root, value)
    try {
      const fileLstat = await fs.promises.lstat(resolved)
      if (fileLstat.isSymbolicLink()) {
        skipped += 1
        continue
      }
      const realPath = await fs.promises.realpath(resolved)
      const stat = await fs.promises.stat(realPath)
      if ((!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) || !stat.isFile()) {
        skipped += 1
        continue
      }
      await fs.promises.unlink(realPath)
      deleted += 1
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error?.code)) throw error
      skipped += 1
    }
  }
  return { ok: true, deleted, skipped }
}

module.exports = {
  getAssetsRoot,
  saveDataUrl,
  readAsDataUrl,
  saveAgentDataUrl,
  readAgentAsDataUrl,
  deleteAgentRefs,
  MAX_AGENT_RUN_BYTES,
  MAX_AGENT_TOTAL_BYTES
}

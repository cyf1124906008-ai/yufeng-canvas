const path = require('path')
const fs = require('fs')
const { app } = require('electron')

function getAssetsRoot() {
  return path.join(app.getPath('userData'), 'yufeng-canvas', 'assets')
}

function getProjectDir(projectId) {
  const safe = String(projectId || 'canvas-default').replace(/[^a-zA-Z0-9_-]/g, '_')
  return path.join(getAssetsRoot(), safe)
}

function getDatedDir(projectId) {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const dir = path.join(getProjectDir(projectId), d)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function generateAssetId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function saveDataUrl(dataUrl, projectId) {
  const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/)
  if (!match) return { ok: false, error: '无效的 data URL 格式' }

  const mimeType = match[1]
  const ext = mimeType.split('/')[1] || 'png'
  const base64 = match[2]
  const assetId = generateAssetId()
  const dir = getDatedDir(projectId)
  const fileName = `${assetId}.${ext}`
  const filePath = path.join(dir, fileName)

  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'))

  return {
    ok: true,
    assetPath: filePath,
    assetId,
    fileName,
    mimeType
  }
}

function readAsDataUrl(assetPath) {
  if (!assetPath || typeof assetPath !== 'string') {
    return { ok: false, error: '非法资产路径' }
  }

  const resolved = path.resolve(assetPath)
  const root = getAssetsRoot()
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return { ok: false, error: '非法资产路径' }
  }

  if (!fs.existsSync(resolved)) {
    return { ok: false, error: '资产文件不存在' }
  }

  const ext = path.extname(resolved).toLowerCase().replace('.', '')
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }
  const mime = mimeMap[ext] || 'image/png'
  const buffer = fs.readFileSync(resolved)
  const base64 = buffer.toString('base64')

  return {
    ok: true,
    dataUrl: `data:${mime};base64,${base64}`
  }
}

module.exports = { getAssetsRoot, saveDataUrl, readAsDataUrl }

const runtime = () => window.desktopApp?.comfyRuntime
const assets = () => window.desktopApp?.assets

export async function comfyQueuePrompt(baseUrl, workflow) {
  const r = runtime()
  if (!r) throw new Error('请先在设置 > Comfy 引擎测试连接')
  const result = await r.queuePrompt(baseUrl, workflow)
  if (!result.ok) throw new Error(result.error)
  return result.promptId
}

export async function comfyGetHistory(baseUrl, promptId) {
  const r = runtime()
  if (!r) throw new Error('请先在设置 > Comfy 引擎测试连接')
  const result = await r.getHistory(baseUrl, promptId)
  if (!result.ok) throw new Error(result.error)
  return result.history
}

export async function comfyFetchImageAsDataUrl(baseUrl, imageMeta) {
  const r = runtime()
  if (!r) throw new Error('请先在设置 > Comfy 引擎测试连接')
  const result = await r.fetchImage(baseUrl, imageMeta)
  if (!result.ok) throw new Error(result.error)
  return result.dataUrl
}

export function extractOutputImages(historyItem) {
  if (!historyItem?.outputs) return []
  const images = []
  for (const output of Object.values(historyItem.outputs)) {
    if (Array.isArray(output.images)) {
      for (const img of output.images) {
        if (img.filename) images.push(img)
      }
    }
  }
  return images
}

export async function saveAsset(dataUrl, projectId) {
  const a = assets()
  if (!a) return null
  const result = await a.saveDataUrl(dataUrl, projectId)
  if (!result.ok) return null
  return result
}

export async function readAssetAsDataUrl(assetPath) {
  const a = assets()
  if (!a) return null
  const result = await a.readAsDataUrl(assetPath)
  if (!result.ok) return null
  return result.dataUrl
}

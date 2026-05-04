const ALLOWED_HOSTS = ['127.0.0.1', 'localhost', '[::1]', '::1']

export function validateBaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return null
  let url
  try { url = new URL(raw.trim()) } catch { return null }
  if (url.protocol !== 'http:') return null
  if (!ALLOWED_HOSTS.includes(url.hostname.toLowerCase())) return null
  return `http://${url.hostname}:${url.port || '8188'}`
}

export async function comfyQueuePrompt(baseUrl, workflow) {
  const base = validateBaseUrl(baseUrl)
  if (!base) throw new Error('请先在设置 > Comfy 引擎测试连接')
  const resp = await fetch(`${base}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'yufeng-canvas' }),
    signal: AbortSignal.timeout(10000)
  })
  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Comfy 返回错误 (${resp.status}): ${text.slice(0, 200)}`)
  }
  const data = await resp.json()
  if (!data.prompt_id) throw new Error('Comfy 没有返回任务 ID')
  return data.prompt_id
}

export async function comfyGetHistory(baseUrl, promptId) {
  const base = validateBaseUrl(baseUrl)
  if (!base) throw new Error('请先在设置 > Comfy 引擎测试连接')
  const resp = await fetch(`${base}/history/${promptId}`, {
    signal: AbortSignal.timeout(10000)
  })
  if (!resp.ok) return null
  const data = await resp.json()
  return data[promptId] || data
}

export async function comfyFetchImageAsDataUrl(baseUrl, img) {
  const base = validateBaseUrl(baseUrl)
  if (!base) throw new Error('请先在设置 > Comfy 引擎测试连接')
  const params = new URLSearchParams({ filename: img.filename })
  if (img.subfolder) params.set('subfolder', img.subfolder)
  if (img.type) params.set('type', img.type)
  const resp = await fetch(`${base}/view?${params}`, {
    signal: AbortSignal.timeout(30000)
  })
  if (!resp.ok) throw new Error(`获取图片失败: HTTP ${resp.status}`)
  const blob = await resp.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
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

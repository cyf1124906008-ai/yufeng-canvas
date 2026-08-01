import { createAnalyzeImageTool } from './analyzeImageTool.js'

function cleanString(value) {
  return String(value || '').trim()
}

function artifactIdFrom(input = {}, runtime = {}) {
  const latest = runtime.state?.latestOutput?.('image')?.value
  return cleanString(
    input.artifactId ||
    input.imageArtifactId ||
    input.sourceArtifactId ||
    latest?.artifactId ||
    latest?.id
  )
}

function getArtifact(store, id) {
  if (!id) return null
  if (typeof store?.get === 'function') return store.get(id)
  return null
}

function artifactSource(artifact) {
  return [artifact?.source, artifact?.url, artifact?.imageUrl, artifact?.src]
    .find(value => typeof value === 'string' && value.trim()) || ''
}

/**
 * Resolve a compact Agent artifact reference into the private media source,
 * then delegate to the shared technical/Vision reviewer. Canvas is never read.
 */
export function createHeadlessAnalyzeImageTool({
  artifactStore,
  analyze,
  ...reviewOptions
} = {}) {
  if (!artifactStore?.get) {
    throw new Error('Headless analyze_image 需要 artifactStore')
  }
  const analyzeImage = analyze || createAnalyzeImageTool({
    ...reviewOptions,
    presentReview: null
  })

  return async function analyzeHeadlessImage(input = {}, runtime = {}) {
    const artifactId = artifactIdFrom(input, runtime)
    if (!artifactId) {
      const error = new Error('analyze_image 缺少图片 artifactId')
      error.code = 'IMAGE_ARTIFACT_REQUIRED'
      throw error
    }

    const artifact = getArtifact(artifactStore, artifactId)
    if (!artifact) {
      const error = new Error(`analyze_image 找不到图片作品：${artifactId}`)
      error.code = 'IMAGE_ARTIFACT_NOT_FOUND'
      throw error
    }
    const image = artifactSource(artifact)
    if (!image) {
      const error = new Error(`图片作品没有可检查的媒体源：${artifactId}`)
      error.code = 'IMAGE_ARTIFACT_SOURCE_MISSING'
      throw error
    }

    const result = await analyzeImage({
      ...input,
      artifactId,
      imageArtifactId: artifactId,
      image,
      prompt: input.prompt || artifact.prompt || '',
      artifactRef: input.artifactRef || `artifact:${artifactId}`
    }, runtime)

    return {
      ...result,
      artifactId,
      imageArtifactId: artifactId
    }
  }
}

export { artifactIdFrom, artifactSource }

export default createHeadlessAnalyzeImageTool

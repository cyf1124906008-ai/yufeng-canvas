import {
  nodes,
  addNode,
  addEdge,
  startBatchOperation,
  endBatchOperation
} from '@/stores/canvas'

const REVIEW_COLUMN_GAP = 380
const REVIEW_ROW_GAP = 220

function normalizePosition(position, fallback) {
  return {
    x: Number.isFinite(Number(position?.x)) ? Number(position.x) : fallback.x,
    y: Number.isFinite(Number(position?.y)) ? Number(position.y) : fallback.y
  }
}

function normalizeReview(review = {}) {
  const reviewMode = review.reviewMode === 'vision' ? 'vision' : 'degraded'
  const numericScore = Number(review.overallScore)

  return {
    schemaVersion: review.schemaVersion || '1',
    artifactRef: review.artifactRef || '',
    reviewMode,
    overallScore: reviewMode === 'degraded' || !Number.isFinite(numericScore)
      ? null
      : Math.max(0, Math.min(100, numericScore)),
    dimensions: review.dimensions || null,
    hardFailures: Array.isArray(review.hardFailures) ? [...review.hardFailures] : [],
    blockingReasons: Array.isArray(review.blockingReasons) ? [...review.blockingReasons] : [],
    decision: reviewMode === 'degraded' ? 'unverified' : (review.decision || 'retry'),
    accepted: review.accepted === true,
    qualityUnverified: review.qualityUnverified === true || reviewMode === 'degraded',
    summary: String(review.summary || '').trim(),
    improvements: Array.isArray(review.improvements) ? [...review.improvements] : [],
    suggestedPrompt: review.suggestedPrompt || { additions: [], negative: [] },
    technical: review.technical || null,
    usage: review.usage || null
  }
}

/**
 * Add a read-only quality review node without replacing any generated image.
 *
 * @returns {string} the created qualityCheck node id
 */
export function presentReview({
  review,
  imageNodeId,
  attempt = 1,
  basePosition
} = {}) {
  if (!review || typeof review !== 'object') {
    throw new TypeError('presentReview 需要结构化 review')
  }

  const imageNode = nodes.value.find((node) => node.id === imageNodeId)
  if (!imageNode || imageNode.type !== 'image') {
    throw new Error('presentReview 需要已存在的图片节点')
  }

  const normalizedAttempt = Math.max(1, Math.floor(Number(attempt) || 1))
  const fallbackPosition = {
    x: Number(imageNode.position?.x ?? 120) + REVIEW_COLUMN_GAP,
    y: Number(imageNode.position?.y ?? 160) + ((normalizedAttempt - 1) * REVIEW_ROW_GAP)
  }
  const position = normalizePosition(basePosition, fallbackPosition)
  const normalizedReview = normalizeReview(review)

  startBatchOperation()
  try {
    const reviewNodeId = addNode('qualityCheck', position, {
      label: `质量检查 · 尝试 #${normalizedAttempt}`,
      sourceImageNodeId: imageNodeId,
      attempt: normalizedAttempt,
      qualityUnverified: normalizedReview.reviewMode === 'degraded',
      ...normalizedReview
    })

    addEdge({
      source: imageNodeId,
      target: reviewNodeId,
      sourceHandle: 'right',
      targetHandle: 'left',
      data: {
        relationship: 'quality_review',
        attempt: normalizedAttempt,
        decision: normalizedReview.decision
      }
    })

    return reviewNodeId
  } finally {
    endBatchOperation()
  }
}

export { normalizeReview }

export default presentReview

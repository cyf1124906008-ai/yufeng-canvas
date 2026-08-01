import {
  PromptImprover,
  normalizeImageReview,
  evaluateImageReview
} from '../observation/index.js'
import { appendRuntimeLog, sanitizeValue } from './runtimeLog.js'
import { inspectImageTechnical } from './imageTechnicalInspection.js'

const VISION_CAPABILITY_PATTERN = /(?:vision|multimodal|image[_\s-]?(?:input|understanding|analysis)|visual[_\s-]?(?:input|understanding))/i
const VISION_MODEL_NAME_PATTERN = /(?:vision|multimodal|gpt-4o|gpt-4\.1|gpt-5|claude-(?:3|4)|gemini|qwen[^\s]*(?:vl|vision)|(?:^|[-_])vl(?:[-_]|$)|glm-4v|doubao[^\s]*vision)/i

const REVIEW_JSON_EXAMPLE = {
  reviewMode: 'vision',
  overallScore: 84,
  dimensions: {
    goalAlignment: { score: 88, feedback: '' },
    subjectIntegrity: { score: 92, feedback: '' },
    composition: { score: 82, feedback: '' },
    visualQuality: { score: 86, feedback: '' },
    styleMatch: { score: 80, feedback: '' },
    textIntegrity: { score: null, feedback: '' }
  },
  hardFailures: [],
  decision: 'accept',
  summary: '',
  improvements: [],
  suggestedPrompt: { additions: [], negative: [] }
}

function collectCapabilityStrings(value, path = '') {
  if (value == null) return []
  if (typeof value === 'string') return [value]
  if (typeof value === 'boolean') return value && path ? [path] : []
  if (Array.isArray(value)) return value.flatMap((item) => collectCapabilityStrings(item, path))
  if (typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => {
      if (item === false || item == null) return []
      return [key, ...collectCapabilityStrings(item, path ? `${path}.${key}` : key)]
    })
  }
  return []
}

export function detectVisionSupport(profile = {}) {
  if (profile.supportsVision === false) {
    return { supported: false, source: 'supportsVision:false' }
  }
  if (profile.supportsVision === true) {
    return { supported: true, source: 'supportsVision' }
  }

  const modalityValues = collectCapabilityStrings(
    profile.modalities ?? profile.inputModalities ?? profile.supportedModalities
  )
  if (modalityValues.some((value) => /^(?:image|vision|visual)$/i.test(value) || VISION_CAPABILITY_PATTERN.test(value))) {
    return { supported: true, source: 'modalities' }
  }

  const capabilityValues = collectCapabilityStrings(
    profile.capabilities ?? profile.supports ?? profile.features
  )
  if (capabilityValues.some((value) => VISION_CAPABILITY_PATTERN.test(value))) {
    return { supported: true, source: 'capabilities' }
  }

  const modelName = [profile.key, profile.id, profile.name, profile.label].filter(Boolean).join(' ')
  if (VISION_MODEL_NAME_PATTERN.test(modelName)) {
    return { supported: true, source: 'model_name_compatibility' }
  }

  return { supported: false, source: 'not_declared' }
}

function directImageArtifact(input = {}, runtime = {}) {
  const latest = runtime.state?.latestOutput?.('image')?.value
  const url = [
    input.image,
    input.imageUrl,
    input.sourceImage,
    latest?.url,
    latest?.imageUrl,
    latest?.src
  ].find(value => typeof value === 'string' && value.trim())
  if (!url) return null

  return {
    id: String(
      input.artifactId ||
      input.imageArtifactId ||
      latest?.artifactId ||
      latest?.id ||
      `artifact-${runtime.state?.stepCount || Date.now()}`
    ),
    type: 'image',
    data: {
      url,
      prompt: input.prompt || latest?.prompt || '',
      loading: false,
      error: ''
    }
  }
}

async function resolveImageNode(input = {}, runtime = {}) {
  const directArtifact = directImageArtifact(input, runtime)
  if (directArtifact) return directArtifact
  return null
}

function extractResponseText(response) {
  if (typeof response === 'string') return response
  if (typeof response?.output_text === 'string') return response.output_text
  if (typeof response?.content === 'string') return response.content
  if (Array.isArray(response?.content)) {
    return response.content.map((item) => item?.text || '').join('')
  }
  return response?.choices?.[0]?.message?.content || ''
}

function parseStrictJson(response) {
  const text = extractResponseText(response).trim()
  if (!text) throw new SyntaxError('Vision 模型返回为空')
  if (text.startsWith('```') || !text.startsWith('{') || !text.endsWith('}')) {
    throw new SyntaxError('Vision 模型必须只返回 JSON 对象')
  }
  const parsed = JSON.parse(text)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SyntaxError('Vision 模型返回值必须是 JSON 对象')
  }
  return parsed
}

function toObservationTechnical(technical) {
  return {
    ...technical,
    decodable: technical?.decoded === true
  }
}

function buildVisionPrompt({ goal, prompt, technical }) {
  return `你是 YUFENG Canvas 的作品质检器。请观察随请求附带的真实图片，按创作目标评价作品质量。

创作目标：${goal || '未提供'}
生成提示词：${prompt || goal || '未提供'}
技术检查：${JSON.stringify(technical)}

只返回一个严格 JSON 对象，不要 markdown、代码围栏或解释文字。字段必须完整，格式如下：
${JSON.stringify(REVIEW_JSON_EXAMPLE)}

规则：
- 所有 score 必须是 0-100 的数字；画面没有预期文字时 textIntegrity.score 填 null。
- feedback、summary 必须基于图片中可见证据，不能声称看到了不存在的内容。
- hardFailures 只能填写以下明确阻断问题：UNDECODABLE、MISSING_SUBJECT、SEVERE_DEFORMATION、WRONG_ASPECT_RATIO、REQUIRED_TEXT_BROKEN、GOAL_MISMATCH。
- suggestedPrompt.additions 和 negative 用于下一次生成修正。
- decision 为 retry 时，improvements 或 suggestedPrompt 中必须至少包含一条可执行修正建议。
- decision 只能是 accept 或 retry。
- 不要返回图片 URL、base64 或任何媒体内容。`
}

function buildRepairPrompt(invalidResponse, validationError) {
  return `把下面的内容修复成符合指定 schema 的严格 JSON。只返回 JSON 对象，不要 markdown 或说明。不要改变已有评价含义，不要加入图片 URL。

Schema 示例：${JSON.stringify(REVIEW_JSON_EXAMPLE)}
校验错误：${validationError?.message || 'JSON 格式不合法'}
待修复内容：${String(invalidResponse || '').slice(0, 10_000)}`
}

function collectPreviousPromptHashes(state = {}) {
  const hashes = []
  const add = (value) => {
    if (typeof value === 'string' && value.trim() && !hashes.includes(value.trim())) {
      hashes.push(value.trim())
    }
  }
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    add(value.hash)
    add(value.promptHash)
    add(value.nextPromptHash)
    add(value.promptRevision?.hash)
  }

  ;(state.actions || []).forEach((action) => visit(action.input))
  ;(state.observations || []).forEach((observation) => visit(observation.result))
  ;(state.outputs || []).forEach((output) => visit(output.value))
  return hashes
}

async function presentSafely(presentReview, review, refs, runtimeLogs) {
  if (typeof presentReview !== 'function') return null
  try {
    return await presentReview({
      review,
      imageNodeId: refs.imageNodeId,
      attempt: refs.attempt || 1,
      basePosition: refs.basePosition
    })
  } catch (error) {
    appendRuntimeLog(runtimeLogs, 'warning', '图片评价已完成，但评价面板展示失败', {
      error: error?.message || String(error),
      imageNodeId: refs.imageNodeId
    })
    return null
  }
}

function createDegradedRaw(summary, technical) {
  return {
    reviewMode: 'degraded',
    overallScore: null,
    dimensions: null,
    hardFailures: [],
    decision: 'unverified',
    summary,
    technical,
    improvements: [],
    suggestedPrompt: { additions: [], negative: [] }
  }
}

const BLOCKING_REASON_SUGGESTIONS = {
  UNDECODABLE: '确保输出为可正常解码、尺寸有效的完整图片',
  MISSING_SUBJECT: '补全并突出用户要求的核心主体',
  SEVERE_DEFORMATION: '修正主体结构、肢体或物体的明显畸变',
  WRONG_ASPECT_RATIO: '严格匹配用户要求的画幅比例和构图方向',
  REQUIRED_TEXT_BROKEN: '减少乱码并准确呈现用户要求的画内文字',
  GOAL_MISMATCH: '加强画面与用户原始创作目标的匹配',
  TOTAL_SCORE_BELOW_MINIMUM: '整体提升主体清晰度、构图完成度和视觉质感'
}

function ensureActionableReview(evaluation) {
  const review = evaluation.review || {}
  const existing = [
    ...(Array.isArray(review.improvements) ? review.improvements : []),
    ...(Array.isArray(review.suggestedPrompt?.additions) ? review.suggestedPrompt.additions : []),
    ...(Array.isArray(review.suggestedPrompt?.negative) ? review.suggestedPrompt.negative : [])
  ].filter(value => typeof value === 'string' && value.trim())
  if (existing.length > 0) return review

  const additions = []
  for (const reason of evaluation.blockingReasons || []) {
    const dimensionFeedback = reason.dimension && review.dimensions?.[reason.dimension]?.feedback
    const suggestion = String(
      dimensionFeedback ||
      BLOCKING_REASON_SUGGESTIONS[reason.code] ||
      (reason.dimension ? `提升 ${reason.dimension} 维度的完成度` : '')
    ).trim()
    if (suggestion && !additions.includes(suggestion)) additions.push(suggestion)
  }

  if (additions.length === 0) {
    additions.push('加强画面与用户目标的匹配，并提升主体完整性和整体完成度')
  }

  return {
    ...review,
    improvements: additions.slice(0, 6)
  }
}

function toVisionSchemaError(error) {
  if (error?.code === 'VISION_SCHEMA_INVALID') return error
  const schemaError = new Error(`Vision 返回无法通过图片评价 schema: ${error?.message || String(error)}`)
  schemaError.name = 'ImageReviewValidationError'
  schemaError.code = 'VISION_SCHEMA_INVALID'
  schemaError.cause = error
  return schemaError
}

/**
 * Canvas image observation tool. It always performs a local browser decode;
 * semantic quality evaluation is added only when the routed chat model
 * explicitly supports vision.
 */
export function createAnalyzeImageTool({
  modelRouter,
  sendChat,
  runtimeLogs,
  presentReview,
  technicalTimeoutMs,
  qualityPolicy
} = {}) {
  if (!modelRouter?.route) throw new Error('createAnalyzeImageTool 需要 modelRouter')
  const promptImprover = new PromptImprover()

  return async function analyzeImage(input = {}, runtime = {}) {
    const imageNode = await resolveImageNode(input, runtime)
    if (!imageNode) throw new Error('analyze_image 找不到对应的图片作品')
    if (imageNode.data?.error) throw new Error(imageNode.data.error)
    if (imageNode.data?.loading === true || !imageNode.data?.url) {
      throw new Error('analyze_image 只能检查已生成完成的真实图片')
    }

    const imageNodeId = imageNode.id
    const artifactRef = String(input.artifactRef || imageNodeId).trim()
    const refs = {
      imageNodeId,
      outputNodeId: imageNodeId,
      artifactRef,
      attempt: Number(input.attempt || 1),
      basePosition: input.basePosition
    }
    const goal = String(input.goal || runtime.state?.goal || '').trim()
    const prompt = String(input.prompt || imageNode.data?.prompt || goal).trim()

    appendRuntimeLog(runtimeLogs, 'info', '开始检查生成图片', refs)

    let technical
    try {
      technical = await inspectImageTechnical(imageNode.data.url, {
        signal: runtime.signal,
        timeoutMs: technicalTimeoutMs
      })
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      technical = {
        decoded: false,
        decodable: false,
        warnings: ['browser_decode_failed'],
        errorCode: 'browser_decode_failed'
      }
      appendRuntimeLog(runtimeLogs, 'warning', '浏览器无法完成图片解码检查', {
        ...refs,
        error: error?.message || String(error)
      })
    }

    const observationTechnical = toObservationTechnical(technical)
    let route = null
    let degradedReason = ''

    if (typeof sendChat !== 'function') {
      degradedReason = '未配置 Vision 调用器，仅完成图片技术检查'
    } else {
      try {
        route = modelRouter.route('analyze_image')
        const visionSupport = detectVisionSupport(route.profile)
        if (!visionSupport.supported) {
          degradedReason = '当前文本模型未声明图片理解能力，仅完成图片技术检查'
        }
      } catch (error) {
        degradedReason = '当前没有可用的 Vision 模型，仅完成图片技术检查'
        appendRuntimeLog(runtimeLogs, 'warning', degradedReason, {
          ...refs,
          error: error?.message || String(error)
        })
      }
    }

    const finishReview = async (rawReview, reviewMode) => {
      const normalized = normalizeImageReview(rawReview, {
        artifactRef,
        technical: observationTechnical
      })
      // Policy configuration is owned by the host runtime, never by LLM tool
      // input, so the Agent cannot lower its own acceptance threshold.
      const evaluation = evaluateImageReview(normalized, qualityPolicy)
      let reviewForResult = evaluation.review
      let promptRevision = null
      if (reviewMode === 'vision' && evaluation.decision === 'retry') {
        reviewForResult = ensureActionableReview(evaluation)
        promptRevision = promptImprover.improve({
          goal,
          prompt: prompt || goal,
          negativePrompt: input.negativePrompt || imageNode.data?.negative_prompt || '',
          review: reviewForResult,
          revision: Math.max(2, Number(input.attempt || 1) + 1),
          retryOf: artifactRef,
          reviewRef: `review:${artifactRef}`,
          previousHashes: collectPreviousPromptHashes(runtime.state)
        })
      }
      const result = sanitizeValue({
        status: 'completed',
        imageNodeId,
        outputNodeId: imageNodeId,
        artifactRef,
        reviewMode,
        accepted: evaluation.accepted,
        decision: evaluation.decision,
        score: evaluation.score,
        qualityUnverified: evaluation.qualityUnverified,
        blockingReasons: evaluation.blockingReasons,
        review: reviewForResult,
        nextPrompt: promptRevision?.prompt || '',
        nextNegativePrompt: promptRevision?.negativePrompt || '',
        nextPromptHash: promptRevision?.hash || '',
        promptRevision
      })

      const reviewNodeId = await presentSafely(presentReview, {
        ...result.review,
        accepted: result.accepted,
        decision: result.decision,
        overallScore: result.score,
        qualityUnverified: result.qualityUnverified,
        blockingReasons: result.blockingReasons
      }, refs, runtimeLogs)
      result.reviewNodeId = reviewNodeId || null
      appendRuntimeLog(runtimeLogs, reviewMode === 'vision' ? 'success' : 'warning',
        reviewMode === 'vision' ? '图片语义评价完成' : '图片技术检查完成，语义质量未验证', {
          ...refs,
          decision: result.decision,
          score: result.score,
          qualityUnverified: result.qualityUnverified
        })
      return result
    }

    if (degradedReason || !route) {
      return finishReview(createDegradedRaw(degradedReason, observationTechnical), 'degraded')
    }

    let firstResponse
    try {
      firstResponse = await sendChat(
        buildVisionPrompt({ goal, prompt, technical: observationTechnical }),
        true,
        {
          model: route.model,
          images: [imageNode.data.url],
          isolated: true,
          signal: runtime.signal
        }
      )
    } catch (error) {
      if (error?.name === 'AbortError') throw error
      appendRuntimeLog(runtimeLogs, 'error', 'Vision 图片评价请求失败', {
        ...refs,
        error: error?.message || String(error)
      })
      throw error
    }

    try {
      const parsed = parseStrictJson(firstResponse)
      // Normalize before accepting the response. A syntactically valid object
      // with the wrong schema is also eligible for the single repair attempt.
      normalizeImageReview(parsed, { artifactRef, technical: observationTechnical })
      return finishReview(parsed, 'vision')
    } catch (firstFormatError) {
      appendRuntimeLog(runtimeLogs, 'warning', 'Vision 返回格式不合法，尝试修复一次', {
        ...refs,
        code: firstFormatError?.code || firstFormatError?.name || 'INVALID_JSON'
      })

      let repairedResponse
      try {
        repairedResponse = await sendChat(
          buildRepairPrompt(extractResponseText(firstResponse), firstFormatError),
          true,
          {
            model: route.model,
            isolated: true,
            signal: runtime.signal
          }
        )
      } catch (repairRequestError) {
        if (repairRequestError?.name === 'AbortError') throw repairRequestError
        appendRuntimeLog(runtimeLogs, 'error', 'Vision 格式修复请求失败', {
          ...refs,
          error: repairRequestError?.message || String(repairRequestError)
        })
        throw repairRequestError
      }

      try {
        const repaired = parseStrictJson(repairedResponse)
        return finishReview(repaired, 'vision')
      } catch (repairError) {
        if (repairError?.name === 'AbortError') throw repairError
        appendRuntimeLog(runtimeLogs, 'error', 'Vision 格式修复后仍无法通过评价 schema', {
          ...refs,
          code: repairError?.code || repairError?.name || 'INVALID_JSON'
        })
        throw toVisionSchemaError(repairError)
      }
    }
  }
}

export {
  REVIEW_JSON_EXAMPLE,
  buildVisionPrompt,
  collectPreviousPromptHashes,
  parseStrictJson,
  resolveImageNode,
  toVisionSchemaError
}

export default createAnalyzeImageTool

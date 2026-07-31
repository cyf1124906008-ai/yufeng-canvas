import { nodes, addNode, addEdge } from '@/stores/canvas'
import { createModelRouter } from '../ModelRouter.js'
import { appendRuntimeLog } from './runtimeLog.js'
import { waitForGeneratedMedia } from './waitForCanvasOutput.js'

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const COLUMN_GAP = 380
const ROW_GAP = 240

function normalizePosition(position) {
  return {
    x: Number.isFinite(Number(position?.x)) ? Number(position.x) : 120,
    y: Number.isFinite(Number(position?.y)) ? Number(position.y) : 160
  }
}

function modelDefault(route, key, fallback) {
  return route.profile?.defaultParams?.[key] ?? route.profile?.[`default${key[0].toUpperCase()}${key.slice(1)}`] ?? fallback
}

function resolveImageNodeId(input, runtime) {
  const candidates = [
    input?.imageNodeId,
    input?.image?.outputNodeId,
    input?.image?.value?.outputNodeId,
    runtime?.state?.latestOutput?.('image')?.value?.outputNodeId
  ].filter(Boolean)

  return candidates.find((id) => nodes.value.some((node) => node.id === id && node.type === 'image')) || ''
}

function connect(source, target, data) {
  return addEdge({
    source,
    target,
    sourceHandle: 'right',
    targetHandle: 'left',
    ...(data ? { data } : {})
  })
}

function createImageTool({ modelRouter, runtimeLogs, getBasePosition, timeoutMs }) {
  return async function generateImage(input = {}, runtime = {}) {
    const route = modelRouter.route(input.capability || 'text_to_image')
    const goal = String(input.goal || runtime.state?.goal || input.prompt || '').trim()
    const prompt = String(input.prompt || goal).trim()

    if (!prompt) throw new Error('generate_image 需要图片提示词')

    const base = normalizePosition(getBasePosition?.(runtime, input))
    appendRuntimeLog(runtimeLogs, 'info', '开始创建图片生成工作流', {
      capability: route.capability,
      model: route.model
    })

    const goalNodeId = addNode('text', base, {
      content: goal || prompt,
      label: '用户目标'
    })
    const promptNodeId = addNode('text', { x: base.x + COLUMN_GAP, y: base.y }, {
      content: prompt,
      label: '图片提示词'
    })
    const imageConfigNodeId = addNode('imageConfig', { x: base.x + COLUMN_GAP * 2, y: base.y }, {
      label: input.purpose === 'video_start_frame' ? '视频首帧生成' : 'AI 图片生成',
      model: route.model,
      size: input.size || modelDefault(route, 'size', '1024x1024'),
      quality: input.quality || modelDefault(route, 'quality', 'standard'),
      autoExecute: true
    })

    connect(goalNodeId, promptNodeId)
    connect(promptNodeId, imageConfigNodeId, { promptOrder: 1 })

    appendRuntimeLog(runtimeLogs, 'info', '图片节点已创建，等待真实生成结果', {
      goalNodeId,
      promptNodeId,
      imageConfigNodeId
    })

    const output = await waitForGeneratedMedia(imageConfigNodeId, 'image', {
      timeoutMs,
      signal: runtime.signal
    })

    appendRuntimeLog(runtimeLogs, 'success', '图片生成完成', {
      imageConfigNodeId,
      outputNodeId: output.outputNodeId
    })

    // Deliberately do not return the media URL. The Agent only receives stable
    // canvas references and completion state.
    return {
      status: 'completed',
      goalNodeId,
      promptNodeId,
      configNodeId: imageConfigNodeId,
      outputNodeId: output.outputNodeId
    }
  }
}

function createVideoTool({ modelRouter, runtimeLogs, getBasePosition, timeoutMs }) {
  return async function generateVideo(input = {}, runtime = {}) {
    const route = modelRouter.route(input.capability || 'image_to_video')
    const prompt = String(input.prompt || runtime.state?.goal || '').trim()
    if (!prompt) throw new Error('generate_video 需要视频提示词')

    const imageNodeId = resolveImageNodeId(input, runtime)
    if (!imageNodeId) {
      throw new Error('generate_video 需要前一步已完成的图片节点')
    }

    const imageNode = nodes.value.find((node) => node.id === imageNodeId)
    if (!imageNode?.data?.url || imageNode.data?.loading === true) {
      throw new Error('generate_video 的图片输入尚未生成完成')
    }

    const fallbackBase = {
      x: Number(imageNode.position?.x || 120),
      y: Number(imageNode.position?.y || 160) + ROW_GAP
    }
    const requestedBase = getBasePosition?.(runtime, input)
    const base = normalizePosition(requestedBase || fallbackBase)
    const videoPromptPosition = {
      x: Math.max(base.x + COLUMN_GAP, Number(imageNode.position?.x || base.x)),
      y: Math.max(base.y + ROW_GAP, Number(imageNode.position?.y || base.y) + ROW_GAP)
    }

    appendRuntimeLog(runtimeLogs, 'info', '开始创建图生视频工作流', {
      capability: route.capability,
      model: route.model,
      imageNodeId
    })

    const promptNodeId = addNode('text', videoPromptPosition, {
      content: prompt,
      label: '视频提示词'
    })
    const videoConfigNodeId = addNode('videoConfig', {
      x: videoPromptPosition.x + COLUMN_GAP,
      y: videoPromptPosition.y
    }, {
      label: 'AI 图生视频',
      model: route.model,
      ratio: input.ratio || modelDefault(route, 'ratio', '16:9'),
      dur: Number(input.duration || input.dur || modelDefault(route, 'duration', 5)),
      duration: Number(input.duration || input.dur || modelDefault(route, 'duration', 5)),
      autoExecute: true
    })

    connect(promptNodeId, videoConfigNodeId, { promptOrder: 1 })
    connect(imageNodeId, videoConfigNodeId, { imageRole: 'first_frame_image' })

    appendRuntimeLog(runtimeLogs, 'info', '视频节点已创建，等待真实生成结果', {
      promptNodeId,
      imageNodeId,
      videoConfigNodeId
    })

    const output = await waitForGeneratedMedia(videoConfigNodeId, 'video', {
      timeoutMs,
      signal: runtime.signal
    })

    appendRuntimeLog(runtimeLogs, 'success', '视频生成完成', {
      videoConfigNodeId,
      outputNodeId: output.outputNodeId
    })

    return {
      status: 'completed',
      promptNodeId,
      sourceImageNodeId: imageNodeId,
      configNodeId: videoConfigNodeId,
      outputNodeId: output.outputNodeId
    }
  }
}

export function createCanvasCreativeTools({
  modelStore,
  modelRouter = createModelRouter(modelStore),
  runtimeLogs,
  getBasePosition = () => ({ x: 120, y: 160 }),
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  if (!modelStore) throw new Error('Canvas Creative Tools 需要 modelStore')

  const options = { modelRouter, runtimeLogs, getBasePosition, timeoutMs }
  return {
    generate_image: {
      metadata: {
        description: '按能力路由图片模型，创建 Canvas 节点并等待真实图片结果',
        capability: 'text_to_image'
      },
      execute: createImageTool(options)
    },
    generate_video: {
      metadata: {
        description: '使用前一步图片创建图生视频节点并等待真实视频结果',
        capability: 'image_to_video'
      },
      execute: createVideoTool(options)
    }
  }
}

export { normalizePosition, resolveImageNodeId }

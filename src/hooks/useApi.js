/**
 * API Hooks | API Hooks
 * Simplified hooks for open source version | 开源版简化 hooks
 */

import { ref, reactive, onUnmounted } from 'vue'
import {
  generateImage,
  generateImageWithChat,
  buildImageEditFormData,
  createVideoTask,
  getVideoTaskStatus,
  streamChatCompletions
} from '@/api'
import { getModelByName } from '@/config/models'
import { useApiConfig } from './useApiConfig'
import { useProvider } from './useProvider'
import { useModelStore } from '@/stores/pinia'
import { getCapabilityLabel, getModelCapabilityConflict } from '@/utils/modelCapability'
import { addRuntimeLog } from '@/stores/canvas'

const isGeminiImageModel = (model = '') =>
  /gemini/i.test(model) && /image/i.test(model)

const extractImageUrlsFromChatContent = (content) => {
  const urls = []

  const visit = (value) => {
    if (!value) return

    if (typeof value === 'string') {
      const markdownMatches = [...value.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)]
      markdownMatches.forEach((match) => urls.push(match[1]))

      const htmlMatches = [...value.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
      htmlMatches.forEach((match) => urls.push(match[1]))

      const dataMatches = [...value.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g)]
      dataMatches.forEach((match) => urls.push(match[0]))

      const urlMatches = [...value.matchAll(/https?:\/\/[^\s)"']+\.(?:png|jpe?g|webp|gif)(?:\?[^\s)"']*)?/gi)]
      urlMatches.forEach((match) => urls.push(match[0]))
      return
    }

    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }

    if (typeof value === 'object') {
      if (value.image_url?.url) urls.push(value.image_url.url)
      if (value.url) urls.push(value.url)
      if (value.b64_json) urls.push(`data:image/png;base64,${value.b64_json}`)
      if (value.text) visit(value.text)
      if (value.content) visit(value.content)
    }
  }

  visit(content)
  return [...new Set(urls)]
}

const normalizeGeminiImageResponse = (response) => {
  const candidates = [
    response?.choices?.[0]?.message?.content,
    response?.choices?.[0]?.delta?.content,
    response?.data,
    response?.content,
    response
  ]

  const urls = candidates.flatMap(extractImageUrlsFromChatContent)
  return urls.map((url) => ({ url, revisedPrompt: '' }))
}

/**
 * Base API state hook | 基础 API 状态 Hook
 */
export const useApiState = () => {
  const loading = ref(false)
  const error = ref(null)
  const status = ref('idle')

  const reset = () => {
    loading.value = false
    error.value = null
    status.value = 'idle'
  }

  const setLoading = (isLoading) => {
    loading.value = isLoading
    status.value = isLoading ? 'running' : status.value
  }

  const setError = (err) => {
    error.value = err
    status.value = 'error'
    loading.value = false
  }

  const setSuccess = () => {
    status.value = 'success'
    loading.value = false
    error.value = null
  }

  return { loading, error, status, reset, setLoading, setError, setSuccess }
}

/**
 * Chat composable | 问答组合式函数
 */
export const useChat = (options = {}) => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const { adaptRequest, adaptResponse } = useProvider()
  const modelStore = useModelStore()

  const messages = ref([])
  const currentResponse = ref('')
  let abortController = null

  const send = async (content, stream = true, chatOptions = {}) => {
    setLoading(true)
    currentResponse.value = ''

    try {
      const chatModel = chatOptions.model || options.model || modelStore.selectedChatModel
      if (!chatModel) {
        throw new Error('请先在模型配置里添加文本模型')
      }

      const conflict = getModelCapabilityConflict(chatModel, 'chat')
      if (conflict) {
        throw new Error(`当前选择的是${getCapabilityLabel(conflict)}模型，不能用于文本/AI 润色。请在文本模型里填写对话模型。`)
      }

      const configuredChatModel = modelStore.availableChatModels.find((model) => model.key === chatModel)
      if (!configuredChatModel) {
        throw new Error('当前模型不在文本模型列表中，请先配置正确的文本模型')
      }

      // 构建用户消息内容（支持参考图片）
      addRuntimeLog('info', `AI 文本请求：${chatModel}`, {
        capability: 'chat'
      })

      let userContent
      const images = chatOptions.images || options.images || []

      if (images.length > 0) {
        // 多模态消息：文本 + 图片
        userContent = [
          { type: 'text', text: content },
          ...images.map(img => ({
            type: 'image_url',
            image_url: { url: img.url || img }
          }))
        ]
      } else {
        userContent = content
      }

      const msgList = [
        ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
        ...messages.value,
        { role: 'user', content: userContent }
      ]

      // 适配请求参数
      const adaptedParams = adaptRequest('chat', {
        model: chatModel,
        messages: msgList
      })

      if (stream) {
        status.value = 'streaming'
        abortController = new AbortController()
        let fullResponse = ''

        // 使用 modelStore 获取完整 URL
        const chatUrl = modelStore.getChatEndpoint()
        const endpoint = new URL(chatUrl).pathname

        for await (const chunk of streamChatCompletions(
          adaptedParams,
          abortController.signal,
          { baseUrl: new URL(chatUrl).origin, endpoint }
        )) {
          fullResponse += chunk
          currentResponse.value = fullResponse
        }

        messages.value.push({ role: 'user', content })
        messages.value.push({ role: 'assistant', content: fullResponse })
        addRuntimeLog('success', `AI 文本完成：${chatModel}`)
        setSuccess()
        return fullResponse
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        addRuntimeLog('error', `AI 文本失败：${err.message || '未知错误'}`)
        setError(err)
        throw err
      }
    }
  }

  const stop = () => {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  const clear = () => {
    messages.value = []
    currentResponse.value = ''
    reset()
  }

  onUnmounted(() => stop())

  return { loading, error, status, messages, currentResponse, send, stop, clear, reset }
}

/**
 * Image generation composable | 图片生成组合式函数
 * Simplified for open source - fixed input/output format
 */
export const useImageGeneration = () => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const { adaptRequest, adaptResponse } = useProvider()
  const modelStore = useModelStore()

  const images = ref([])
  const currentImage = ref(null)

  /**
   * Generate image with fixed params | 固定参数生成图片
   * @param {Object} params - { model, prompt, size, n, image (optional ref image) }
   */
  const generate = async (params) => {
    setLoading(true)
    images.value = []
    currentImage.value = null

    try {
      if (!params.model) {
        throw new Error('请先在模型配置里添加图片模型')
      }

      const conflict = getModelCapabilityConflict(params.model, 'image')
      if (conflict) {
        throw new Error(`当前选择的是${getCapabilityLabel(conflict)}模型，不能用于图片生成。请在图片模型里填写 gpt-image-2 这类图片模型。`)
      }

      const imageModel = modelStore.availableImageModels.find((model) => model.key === params.model)
      if (!imageModel) {
        throw new Error('当前模型不在图片模型列表中，请先配置正确的图片模型')
      }

      const modelConfig = getModelByName(params.model)
      addRuntimeLog('info', `图片生成开始：${params.model}`, {
        size: params.size,
        hasReference: !!params.image
      })

      // Build request data | 构建请求数据
      const requestData = {
        model: params.model,
        prompt: params.prompt,
        size: params.size || modelConfig?.defaultParams?.size || '2048x2048',
        // n: params.n || 1
      }

      // Add reference image if provided | 添加参考图
      if (params.image) {
        requestData.image = params.image
      }

      // 适配请求参数
      const adaptedParams = adaptRequest('image', requestData)

      // Call API | 调用 API
      const hasReferenceImages = Array.isArray(adaptedParams.image)
        ? adaptedParams.image.length > 0
        : !!adaptedParams.image

      let adaptedData = []

      const imageProtocol = modelStore.getImageModelProtocol(params.model)

      if (imageProtocol === 'chat') {
        const promptText = [
          params.prompt,
          params.size ? `\n\nTarget image size/aspect ratio: ${params.size}.` : ''
        ].filter(Boolean).join('')

        const content = [
          { type: 'text', text: promptText }
        ]

        if (hasReferenceImages) {
          const imageSources = Array.isArray(adaptedParams.image) ? adaptedParams.image : [adaptedParams.image]
          imageSources.filter(Boolean).forEach((url) => {
            content.push({
              type: 'image_url',
              image_url: { url }
            })
          })
        }

        addRuntimeLog('info', `图片模型使用 Chat 图片通道：${params.model}`)
        const response = await generateImageWithChat({
          model: params.model,
          messages: [
            {
              role: 'user',
              content
            }
          ]
        }, {
          endpoint: modelStore.getChatEndpoint()
        })

        adaptedData = normalizeGeminiImageResponse(response)
      } else {
        const response = hasReferenceImages
          ? await generateImage(await buildImageEditFormData(adaptedParams), {
              requestType: 'formdata',
              endpoint: modelStore.getImageEditEndpoint()
            })
          : await generateImage(adaptedParams, {
              requestType: 'json',
              endpoint: modelStore.getImageEndpoint()
            })

        // 适配响应数据
        adaptedData = adaptResponse('image', response)
      }

      if (!adaptedData[0]?.url) {
        throw new Error(imageProtocol === 'chat'
          ? 'Chat 图片通道返回成功，但没有解析到图片链接。请打开运行日志查看原始响应格式。'
          : '图片接口返回成功，但没有拿到图片地址或 base64 数据')
      }

      images.value = adaptedData
      currentImage.value = adaptedData[0] || null
      addRuntimeLog('success', `图片生成完成：${params.model}`, {
        count: adaptedData.length
      })
      setSuccess()
      return adaptedData
    } catch (err) {
      addRuntimeLog('error', `图片生成失败：${err.message || '未知错误'}`, {
        model: params.model
      })
      setError(err)
      throw err
    }
  }

  return { loading, error, status, images, currentImage, generate, reset }
}

/**
 * Video generation composable | 视频生成组合式函数
 * Simplified for open source - fixed input/output format
 */

export const useVideoGeneration = () => {
  const { loading, error, status, reset, setLoading, setError, setSuccess } = useApiState()
  const { adaptRequest, adaptResponse } = useProvider()
  const modelStore = useModelStore()

  const video = ref(null)
  const taskId = ref(null)
  const progress = reactive({
    attempt: 0,
    maxAttempts: 120,
    percentage: 0
  })

  /**
   * Create video task only (no polling) | 仅创建视频任务（不轮询）
   */
  const createVideoTaskOnly = async (params) => {
    if (!params.model) {
      throw new Error('请先在模型配置里添加视频模型')
    }

    const conflict = getModelCapabilityConflict(params.model, 'video')
    if (conflict) {
      throw new Error(`当前选择的是${getCapabilityLabel(conflict)}模型，不能用于视频生成。请在视频模型里填写 kling-v2-5-turbo 这类视频模型。`)
    }

    const videoModel = modelStore.availableVideoModels.find((model) => model.key === params.model)
    if (!videoModel) {
      throw new Error('当前模型不在视频模型列表中，请先配置正确的视频模型')
    }

    const modelConfig = getModelByName(params.model)
    addRuntimeLog('info', `视频任务创建开始：${params.model}`, {
      ratio: params.ratio,
      duration: params.dur,
      hasFirstFrame: !!params.first_frame_image,
      hasLastFrame: !!params.last_frame_image
    })

    // Build request data | 构建请求数据
    const requestData = {
      model: params.model,
      prompt: params.prompt || ''
    }
    // Add optional params | 添加可选参数
    if (params.first_frame_image) requestData.first_frame_image = params.first_frame_image
    if (params.last_frame_image) requestData.last_frame_image = params.last_frame_image
    if (params.ratio) requestData.size = params.ratio
    if (params.resolution || modelConfig?.defaultParams?.resolution || modelConfig?.defaultResolution) {
      requestData.resolution = params.resolution || modelConfig?.defaultParams?.resolution || modelConfig?.defaultResolution
    }
    if (params.dur) requestData.seconds = params.dur

    // 适配请求参数
    const adaptedParams = adaptRequest('video', requestData)

    // Call API to create task | 调用 API 创建任务
    const task = await createVideoTask(adaptedParams, {
      requestType: 'json',
      endpoint: modelStore.getVideoEndpoint()
    })

    // Check if async (need polling) | 检查是否异步
    const isAsync = modelConfig?.async !== false

    // If has video URL directly, return | 如果直接有视频 URL，返回
    if (!isAsync || task.data?.url || task.url || task.content?.video_url) {
      addRuntimeLog('success', `视频直接返回完成：${params.model}`)
      return {
        taskId: null,
        url: task.data?.url || task.url || task.content?.video_url
      }
    }

    // Get task ID | 获取任务 ID
    const newTaskId =
      task.id ||
      task.task_id ||
      task.taskId ||
      task.data?.id ||
      task.data?.task_id ||
      task.data?.taskId
    if (!newTaskId) {
      throw new Error('未获取到任务 ID')
    }

    addRuntimeLog('success', `视频任务已创建：${newTaskId}`, {
      model: params.model
    })
    return { taskId: newTaskId }
  }

  /**
   * Poll video task | 轮询视频任务
   */
  const pollVideoTask = async (pollTaskId, onProgress = () => {}) => {
    const maxAttempts = 36
    const interval = 5000
    addRuntimeLog('info', `开始轮询视频任务：${pollTaskId}`, {
      maxSeconds: Math.round((maxAttempts * interval) / 1000)
    })

    for (let i = 0; i < maxAttempts; i++) {
      onProgress(i + 1, Math.min(Math.round((i / maxAttempts) * 100), 99))

      // 获取任务查询端点，支持 {taskId} 占位符替换
      let taskEndpoint = modelStore.getVideoTaskEndpoint()
      if (taskEndpoint.includes('{taskId}')) {
        taskEndpoint = taskEndpoint.replace('{taskId}', pollTaskId)
      }

      const result = await getVideoTaskStatus(pollTaskId, {
        endpoint: taskEndpoint
      })

      // 适配轮询响应
      const adaptedResult = adaptResponse('video', result)

      // Check for completion | 检查是否完成
      if (result.status === 'completed' || result.status === 'succeeded' || result.data) {
        const videoUrl = adaptedResult.url || result.data?.url || result.data?.[0]?.url || result.url || result.content?.video_url || result.video_url
        if (!videoUrl && (result.status === 'completed' || result.status === 'succeeded')) {
          addRuntimeLog('error', `视频任务完成但没有返回视频地址：${pollTaskId}`)
          throw new Error('视频任务完成但没有返回视频地址，请在后台记录里查看原始结果')
        }
        if (!videoUrl) {
          await new Promise(resolve => setTimeout(resolve, interval))
          continue
        }
        addRuntimeLog('success', `视频任务完成：${pollTaskId}`)
        return { ...adaptedResult, url: videoUrl,  }
      }

      // Check for failure | 检查是否失败
      if (result.status === 'failed' || result.status === 'error') {
        addRuntimeLog('error', `视频任务失败：${result.error?.message || result.message || '生成失败'}`, {
          taskId: pollTaskId
        })
        throw new Error(result.error?.message || result.message || '视频生成失败')
      }

      // Wait before next poll | 等待下次轮询
      await new Promise(resolve => setTimeout(resolve, interval))
    }

    addRuntimeLog('error', `视频任务轮询超时：${pollTaskId}`, {
      maxSeconds: Math.round((maxAttempts * interval) / 1000)
    })
    throw new Error('视频生成超时（已等待 3 分钟）。任务可能仍在后台生成，请稍后到后台查看记录，或重新发起一次。')
  }

  /**
   * Generate video with fixed params (includes polling) | 固定参数生成视频（含轮询）
   * @param {Object} params - { model, prompt, first_frame_image, last_frame_image, ratio, duration }
   */
  const generate = async (params) => {
    setLoading(true)
    video.value = null
    taskId.value = null
    progress.attempt = 0
    progress.percentage = 0

    try {
      // 创建任务
      const { taskId: newTaskId, url } = await createVideoTaskOnly(params)

      // 如果有直接 URL，返回
      if (url) {
        video.value = { url }
        setSuccess()
        return video.value
      }

      // 需要轮询
      taskId.value = newTaskId
      status.value = 'polling'

      // 轮询获取结果
      const result = await pollVideoTask(newTaskId, (attempt, percentage) => {
        progress.attempt = attempt
        progress.percentage = percentage
      })

      video.value = result
      setSuccess()
      return result
    } catch (err) {
      setError(err)
      throw err
    }
  }

  return { loading, error, status, video, taskId, progress, generate, reset, createVideoTaskOnly, pollVideoTask }
}

/**
 * Combined API composable | 综合 API 组合式函数
 */
export const useApi = () => {
  const config = useApiConfig()
  const chat = useChat()
  const image = useImageGeneration()
  const videoGen = useVideoGeneration()

  return { config, chat, image, video: videoGen }
}

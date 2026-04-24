/**
 * API provider adapters.
 */

const toDisplayableImageUrl = (item) => {
  if (item.url) {
    return item.url
  }

  if (item.b64_json) {
    return `data:image/png;base64,${item.b64_json}`
  }

  return ''
}

const createOpenAICompatibleProvider = (label, defaultBaseUrl) => ({
  label,
  defaultBaseUrl,
  endpoints: {
    chat: '/v1/chat/completions',
    image: '/v1/images/generations',
    imageEdit: '/v1/images/edits',
    video: '/v1/videos',
    videoQuery: '/v1/videos/{taskId}'
  },
  requestAdapter: {
    chat: (params) => {
      const adapted = {
        model: params.model,
        messages: params.messages
      }
      if (params.temperature !== undefined) adapted.temperature = params.temperature
      if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
      if (params.stream !== undefined) adapted.stream = params.stream
      return adapted
    },
    image: (params) => {
      const adapted = {
        model: params.model,
        prompt: params.prompt
      }
      if (params.size) adapted.size = params.size
      if (params.n) adapted.n = params.n
      if (params.quality) adapted.quality = params.quality
      if (params.style) adapted.style = params.style
      if (params.image) adapted.image = params.image
      return adapted
    },
    video: (params) => {
      const adapted = {
        model: params.model,
        prompt: params.prompt || ''
      }
      if (params.first_frame_image) adapted.first_frame_image = params.first_frame_image
      if (params.last_frame_image) adapted.last_frame_image = params.last_frame_image
      if (params.size) adapted.size = params.size
      if (params.resolution) adapted.resolution = params.resolution
      if (params.seconds !== undefined) adapted.seconds = String(params.seconds)
      return adapted
    }
  },
  responseAdapter: {
    chat: (response) => {
      if (response.choices && response.choices.length > 0) {
        return response.choices[0].message?.content || ''
      }
      return ''
    },
    image: (response) => {
      const data = response.data || response
      return (Array.isArray(data) ? data : [data]).map((item) => ({
        url: toDisplayableImageUrl(item),
        revisedPrompt: item.revised_prompt || ''
      }))
    },
    video: (response) => ({
      url: response.data?.url || response.url || response.data?.[0]?.url || '',
      ...response
    })
  }
})

export const PROVIDERS = {
  yufeng: {
    label: 'YUFENG',
    defaultBaseUrl: 'https://cloud.dataeyes.ai',
    endpoints: {
      chat: '/v1/chat/completions',
      image: '/v1/images/generations',
      imageEdit: '/v1/images/edits',
      video: '/v1/video/generations',
      videoQuery: '/v1/video/task/{taskId}'
    },
    requestAdapter: {
      chat: (params) => {
        const adapted = {
          model: params.model,
          messages: params.messages
        }
        if (params.temperature !== undefined) adapted.temperature = params.temperature
        if (params.max_tokens !== undefined) adapted.max_tokens = params.max_tokens
        if (params.stream !== undefined) adapted.stream = params.stream
        return adapted
      },
      image: (params) => {
        const adapted = {
          model: params.model,
          prompt: params.prompt
        }
        if (params.size) adapted.size = params.size
        if (params.n) adapted.n = params.n
        if (params.quality) adapted.quality = params.quality
        if (params.style) adapted.style = params.style
        if (params.image) adapted.image = params.image
        return adapted
      },
      video: (params) => {
        const model = params.model || ''

        if (model.includes('seedance')) {
          const content = []
          let textPrompt = params.prompt || ''

          if (params.resolution) textPrompt += ` --resolution ${params.resolution}`
          if (params.size) textPrompt += ` --ratio ${params.size}`
          if (params.seconds) textPrompt += ` --dur ${params.seconds}`
          textPrompt += ' --fps 24'
          textPrompt += ` --wm ${params.wm !== false ? 'true' : 'false'}`
          if (params.seed !== undefined) textPrompt += ` --seed ${params.seed}`
          textPrompt += ` --cf ${params.cf === true ? 'true' : 'false'}`

          content.push({
            type: 'text',
            text: textPrompt
          })

          if (params.first_frame_image) {
            content.push({
              type: 'image_url',
              image_url: {
                url: params.first_frame_image
              }
            })
          }

          return {
            model,
            content,
            generate_audio: params.generateAudio !== false
          }
        }

        if (model.includes('kling')) {
          const ratioMap = {
            '16:9': '16:9',
            '9:16': '9:16',
            '1:1': '1:1',
            '4:3': '4:3',
            '3:4': '3:4'
          }

          const adapted = {
            model_name: model,
            mode: 'std',
            prompt: params.prompt || '',
            aspect_ratio: ratioMap[params.size] || '16:9',
            duration: params.seconds || 5,
            negative_prompt: '',
            cfg_scale: 0.5
          }

          if (params.first_frame_image) adapted.image = params.first_frame_image
          return adapted
        }

        const adapted = {
          model: params.model,
          prompt: params.prompt || ''
        }
        if (params.first_frame_image) adapted.first_frame_image = params.first_frame_image
        if (params.last_frame_image) adapted.last_frame_image = params.last_frame_image
        if (params.size) adapted.size = params.size
        if (params.seconds) adapted.seconds = params.seconds
        return adapted
      }
    },
    responseAdapter: {
      chat: (response) => {
        if (response.choices && response.choices.length > 0) {
          return response.choices[0].message?.content || ''
        }
        return ''
      },
      image: (response) => {
        const data = response.data || response
        return (Array.isArray(data) ? data : [data]).map((item) => ({
          url: toDisplayableImageUrl(item),
          revisedPrompt: item.revised_prompt || ''
        }))
      },
      video: (response) => ({
        url: response.data?.url || response.url || response.data?.[0]?.url || '',
        ...response
      })
    }
  },
  openai: createOpenAICompatibleProvider('OpenAI', 'https://api.openai.com'),
  dataeyes: createOpenAICompatibleProvider('DataEyes', 'https://cloud.dataeyes.ai'),
  default: 'dataeyes'
}

export const getProviderList = () =>
  Object.entries(PROVIDERS)
    .filter(([key]) => key !== 'default')
    .map(([key, value]) => ({
      key,
      label: value.label
    }))

export const getDefaultProvider = () => PROVIDERS.default || 'dataeyes'

export const getDefaultBaseUrl = (providerKey) => {
  const config = getProviderConfig(providerKey)
  return config.defaultBaseUrl || ''
}

export const getProviderConfig = (providerKey) =>
  PROVIDERS[providerKey] || PROVIDERS[PROVIDERS.default]

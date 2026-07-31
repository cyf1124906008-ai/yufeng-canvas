import { unref } from 'vue'

const CAPABILITY_GROUPS = {
  chat: new Set([
    'chat',
    'generate_text',
    'text_generation',
    'analyze_image',
    'analyze_video'
  ]),
  image: new Set([
    'image',
    'generate_image',
    'text_to_image',
    'image_to_image',
    'edit_image',
    'upscale'
  ]),
  video: new Set([
    'video',
    'generate_video',
    'text_to_video',
    'image_to_video'
  ])
}

const STORE_FIELDS = {
  chat: {
    selected: 'selectedChatModel',
    available: 'availableChatModels',
    apiKey: 'currentChatApiKey'
  },
  image: {
    selected: 'selectedImageModel',
    available: 'availableImageModels',
    apiKey: 'currentImageApiKey'
  },
  video: {
    selected: 'selectedVideoModel',
    available: 'availableVideoModels',
    apiKey: 'currentVideoApiKey'
  }
}

function read(value) {
  return unref(value)
}

function normalizeCapability(capability = '') {
  return String(capability).trim().toLowerCase().replaceAll('-', '_')
}

function resolveCapabilityGroup(capability) {
  const normalized = normalizeCapability(capability)
  const group = Object.entries(CAPABILITY_GROUPS)
    .find(([, capabilities]) => capabilities.has(normalized))?.[0]

  if (!group) {
    throw new Error(`不支持的模型能力: ${capability || '(empty)'}`)
  }

  return { normalized, group }
}

function modelKey(model) {
  return typeof model === 'string' ? model : model?.key || model?.id || ''
}

/**
 * Capability-only model router.
 *
 * The Agent never chooses a provider/model name. The router maps an intent to
 * chat/image/video, prefers the model already selected by the user, then falls
 * back to the first model currently available for the active provider.
 */
export class ModelRouter {
  constructor(modelStore) {
    if (!modelStore) throw new Error('ModelRouter 需要 modelStore')
    this.modelStore = modelStore
  }

  route(capability) {
    const { normalized, group } = resolveCapabilityGroup(capability)
    const fields = STORE_FIELDS[group]
    const availableModels = read(this.modelStore[fields.available]) || []
    const selectedKey = modelKey(read(this.modelStore[fields.selected]))
    const selected = availableModels.find((model) => modelKey(model) === selectedKey)
    const profile = selected || availableModels[0]

    if (!profile || !modelKey(profile)) {
      throw new Error(`当前 Provider 没有可用的${group === 'chat' ? '文本' : group === 'image' ? '图片' : '视频'}模型`)
    }

    const provider = read(this.modelStore.currentProvider) || ''
    const directApiKey = read(this.modelStore[fields.apiKey])
    const apiKey = directApiKey || this.modelStore.getApiKeyByProvider?.(provider, group) || ''

    if (!String(apiKey).trim()) {
      throw new Error(`请先为当前 Provider 配置${group === 'chat' ? '文本' : group === 'image' ? '图片' : '视频'} API Key`)
    }

    return {
      capability: normalized,
      type: group,
      model: modelKey(profile),
      profile,
      provider
    }
  }

  select(capability) {
    return this.route(capability)
  }

  selectModel(capability) {
    return this.route(capability)
  }

  getModel(capability) {
    return this.route(capability).model
  }
}

export function createModelRouter(modelStore) {
  return new ModelRouter(modelStore)
}

export { normalizeCapability, resolveCapabilityGroup }

export default ModelRouter

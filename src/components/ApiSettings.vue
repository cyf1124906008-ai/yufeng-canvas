<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    class="api-settings-modal"
    title="API 设置"
    style="width: min(720px, calc(100vw - 32px));"
  >
    <n-tabs type="line" animated>
      <n-tab-pane name="api" tab="API 设置">
        <n-form :model="formData" label-placement="left" label-width="96">
          <n-form-item v-if="showProviderSelect" label="渠道" path="provider">
            <n-select
              v-model:value="formData.provider"
              :options="providerOptions"
              placeholder="选择 API 渠道"
            />
          </n-form-item>

          <n-form-item v-else label="渠道">
            <n-input :value="currentProviderLabel" readonly />
          </n-form-item>

          <n-form-item v-if="showBaseUrlInput" label="Base URL" path="baseUrl">
            <n-input
              v-model:value="formData.baseUrl"
              placeholder="https://cloud.dataeyes.ai"
            />
          </n-form-item>

          <n-form-item v-else label="服务地址">
            <n-input :value="resolvedBaseUrl" readonly />
          </n-form-item>

          <n-divider title-placement="left" class="!my-3">
            <span class="text-xs text-[var(--text-secondary)]">能力覆盖 Base URL</span>
          </n-divider>

          <n-alert type="info" class="mb-4">
            留空时会自动回退到默认 Base URL。你可以让对话、生图、视频分别走不同供应商地址。
          </n-alert>

          <n-form-item label="对话 Base URL" path="chatBaseUrl">
            <n-input
              v-model:value="formData.chatBaseUrl"
              placeholder="可选，用于语言模型 / AI 润色"
            />
          </n-form-item>

          <n-form-item label="生图 Base URL" path="imageBaseUrl">
            <n-input
              v-model:value="formData.imageBaseUrl"
              placeholder="可选，用于文生图 / 图生图"
            />
          </n-form-item>

          <n-form-item label="视频 Base URL" path="videoBaseUrl">
            <n-input
              v-model:value="formData.videoBaseUrl"
              placeholder="可选，用于文生视频 / 图生视频"
            />
          </n-form-item>

          <n-form-item label="默认 Key" path="apiKey">
            <n-input
              v-model:value="formData.apiKey"
              type="password"
              show-password-on="click"
              placeholder="统一给对话 / 生图 / 视频共用"
            />
          </n-form-item>

          <n-divider title-placement="left" class="!my-3">
            <span class="text-xs text-[var(--text-secondary)]">能力覆盖 Key</span>
          </n-divider>

          <n-alert type="info" class="mb-4">
            留空时会自动回退到默认 Key。这样既可以只配一把 Key，也可以给对话、生图、视频分别配置不同的 Key。
          </n-alert>

          <n-form-item label="对话 Key" path="chatApiKey">
            <n-input
              v-model:value="formData.chatApiKey"
              type="password"
              show-password-on="click"
              placeholder="可选，用于对话 / AI 润色"
            />
          </n-form-item>

          <n-form-item label="生图 Key" path="imageApiKey">
            <n-input
              v-model:value="formData.imageApiKey"
              type="password"
              show-password-on="click"
              placeholder="可选，用于文生图 / 图生图"
            />
          </n-form-item>

          <n-form-item label="视频 Key" path="videoApiKey">
            <n-input
              v-model:value="formData.videoApiKey"
              type="password"
              show-password-on="click"
              placeholder="可选，用于文生视频 / 图生视频"
            />
          </n-form-item>

          <n-divider title-placement="left" class="!my-3">
            <span class="text-xs text-[var(--text-secondary)]">接口路径</span>
          </n-divider>

          <div class="endpoint-list">
            <div class="endpoint-item">
              <span class="endpoint-label">对话</span>
              <n-tag size="small" type="info" class="endpoint-tag">{{ currentEndpoints.chat }}</n-tag>
            </div>
            <div class="endpoint-item">
              <span class="endpoint-label">生图</span>
              <n-tag size="small" type="success" class="endpoint-tag">{{ currentEndpoints.image }}</n-tag>
            </div>
            <div class="endpoint-item">
              <span class="endpoint-label">视频生成</span>
              <n-tag size="small" type="warning" class="endpoint-tag">{{ currentEndpoints.video }}</n-tag>
            </div>
            <div class="endpoint-item">
              <span class="endpoint-label">视频查询</span>
              <n-tag size="small" type="warning" class="endpoint-tag">{{ currentEndpoints.videoQuery }}</n-tag>
            </div>
          </div>

          <n-alert v-if="isProductPresetMode" type="info" class="mb-4">
            当前版本已经预置服务地址，最终用户只需要填写自己的 Key 即可。
          </n-alert>

          <n-alert v-if="!isConfigured" type="warning" title="尚未配置" class="mb-4">
            <div class="flex flex-col gap-2">
              <p>请至少填写一个可用的 API Key。</p>
              <a
                :href="apiKeyHelpUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="text-[var(--accent-color)] hover:underline text-sm"
              >
                点击获取 API Key
              </a>
            </div>
          </n-alert>

          <n-alert v-else type="success" title="已配置" class="mb-4">
            Key 已保存，可以开始使用。
          </n-alert>
          <n-divider title-placement="left" class="!my-3">
            <span class="text-xs text-[var(--text-secondary)]">数据迁移 / 备份</span>
          </n-divider>

          <div class="data-backup-card">
            <div>
              <strong>数据备份与恢复</strong>
              <p>
                备份包含：项目列表、画布数据、聊天记录、工作流、Drama 数据、本地资产索引、生成图片/视频关联信息。
              </p>
              <p class="data-backup-warning">
                此备份包含项目索引；大体积图片/视频素材建议同时备份素材目录。数据包会包含 API Key，请只保存在自己的电脑或可信位置。
              </p>
            </div>
            <div class="data-backup-actions">
              <n-button secondary :loading="dataExporting" @click="handleExportData">
                导出备份
              </n-button>
              <n-button type="primary" secondary :loading="dataImporting" @click="handleImportData">
                导入备份
              </n-button>
              <n-button v-if="isDesktop" secondary @click="openAssetsFolder">
                打开本地素材目录
              </n-button>
            </div>
          </div>
        </n-form>
      </n-tab-pane>

      <n-tab-pane name="models" tab="模型配置">
        <div class="model-config-section">
          <div class="model-discovery-card">
            <div>
              <strong>自动获取模型</strong>
              <p>从当前 Base URL 的 <code>/v1/models</code> 拉取模型，并自动归类到对话 / 图片 / 视频。</p>
            </div>
            <div class="model-discovery-actions">
              <n-button
                type="primary"
                secondary
                :loading="modelSyncLoading"
                @click="handleSyncModels"
              >
                获取并自动配置
              </n-button>
              <n-button
                secondary
                :loading="dataEyesImportLoading"
                @click="handleImportDataEyesModels"
              >
                导入 DataEyes 实测模型
              </n-button>
            </div>
          </div>

          <n-alert v-if="modelSyncSummary" type="success" class="model-sync-alert">
            {{ modelSyncSummary }}
          </n-alert>

          <div class="model-group">
            <div class="model-group-header">
              <span class="model-group-title">对话模型</span>
              <n-tag size="tiny" type="info">{{ allChatModels.length }} 个</n-tag>
            </div>
            <div class="model-input-row">
              <n-input
                v-model:value="newChatModel"
                placeholder="输入文本模型名，以 DataEyes 后台显示为准"
                size="small"
                @keyup.enter="handleAddChatModel"
              />
              <n-button size="small" type="primary" :disabled="!newChatModel" @click="handleAddChatModel">
                添加
              </n-button>
            </div>
            <div class="model-tags">
              <n-tag
                v-for="model in allChatModels"
                :key="model.key"
                size="small"
                :closable="model.isCustom"
                :type="model.isCustom ? 'info' : 'default'"
                @close="handleRemoveChatModel(model.key)"
              >
                {{ model.label }}
              </n-tag>
            </div>
          </div>

          <div class="model-group">
            <div class="model-group-header">
              <span class="model-group-title">图片模型</span>
              <n-tag size="tiny" type="success">{{ allImageModels.length }} 个</n-tag>
            </div>
            <div class="model-input-row">
              <n-input
                v-model:value="newImageModel"
                placeholder="输入图片模型名，以 DataEyes 后台显示为准"
                size="small"
                @keyup.enter="handleAddImageModel"
              />
              <n-select
                v-model:value="newImageProtocol"
                :options="imageProtocolOptions"
                size="small"
                class="protocol-select"
              />
              <n-button size="small" type="primary" :disabled="!newImageModel" @click="handleAddImageModel">
                添加
              </n-button>
            </div>
            <div class="model-list">
              <div
                v-for="model in allImageModels"
                :key="model.key"
                class="model-row"
              >
                <n-tag
                  size="small"
                  :closable="model.isCustom"
                  :type="model.isCustom ? 'success' : 'default'"
                  @close="handleRemoveImageModel(model.key)"
                >
                  {{ model.label }}
                </n-tag>
                <n-select
                  v-if="model.isCustom"
                  :value="model.protocol || 'auto'"
                  :options="imageProtocolOptions"
                  size="tiny"
                  class="protocol-select small"
                  @update:value="(value) => modelStore.updateCustomImageModelProtocol(model.key, value)"
                />
                <n-tag v-else size="tiny" type="default">内置</n-tag>
              </div>
            </div>
          </div>

          <div class="model-group">
            <div class="model-group-header">
              <span class="model-group-title">视频模型</span>
              <n-tag size="tiny" type="warning">{{ allVideoModels.length }} 个</n-tag>
            </div>
            <div class="model-input-row">
              <n-input
                v-model:value="newVideoModel"
                placeholder="输入视频模型名，以 DataEyes 后台显示为准"
                size="small"
                @keyup.enter="handleAddVideoModel"
              />
              <n-button size="small" type="primary" :disabled="!newVideoModel" @click="handleAddVideoModel">
                添加
              </n-button>
            </div>
            <div class="model-tags">
              <n-tag
                v-for="model in allVideoModels"
                :key="model.key"
                size="small"
                :closable="model.isCustom"
                :type="model.isCustom ? 'warning' : 'default'"
                @close="handleRemoveVideoModel(model.key)"
              >
                {{ model.label }}
              </n-tag>
            </div>
          </div>
        </div>
      </n-tab-pane>

      <n-tab-pane name="comfy" tab="Comfy 引擎">
        <ComfyEnginePanel />
      </n-tab-pane>
    </n-tabs>

    <template #footer>
      <div class="flex flex-wrap justify-between items-center gap-3">
        <a
          :href="apiKeyHelpUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors"
        >
          没有 API Key？点这里申请
        </a>
        <div class="flex gap-2">
          <n-button tertiary @click="handleClear">清除当前配置</n-button>
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" @click="handleSave">保存</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NDivider,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NTabPane,
  NTabs,
  NTag
} from 'naive-ui'
import { getApiKeyHelpUrl, DISTRIBUTION_CONFIG } from '../config/distribution'
import { getProviderConfig } from '../config/providers'
import { useModelStore } from '../stores/pinia'
import { backupUserDataNow, exportUserDataToFile, importUserDataFromFile } from '../utils/appDataBackup'
import { getCapabilityLabel, getModelCapabilityConflict } from '../utils/modelCapability'
import { normalizeBaseUrl } from '../utils/request'
import ComfyEnginePanel from './settings/ComfyEnginePanel.vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:show', 'saved'])

const modelStore = useModelStore()
const showModal = ref(props.show)

const formData = reactive({
  provider: '',
  apiKey: '',
  chatApiKey: '',
  imageApiKey: '',
  videoApiKey: '',
  baseUrl: '',
  chatBaseUrl: '',
  imageBaseUrl: '',
  videoBaseUrl: ''
})

const newChatModel = ref('')
const newImageModel = ref('')
const newImageProtocol = ref('auto')
const newVideoModel = ref('')
const modelSyncLoading = ref(false)
const modelSyncSummary = ref('')
const dataEyesImportLoading = ref(false)
const dataExporting = ref(false)
const dataImporting = ref(false)

const DATAEYES_VERIFIED_MODELS = {
  chat: [
    'gpt-oss-120b',
    'qwen3-next-80b-a3b-instruct',
    'kimi-k2',
    'kimi-k2.5',
    'kimi-k2-thinking',
    'MiniMax-M2.5',
    'qwen3-coder-480b-a35b-instruct',
    'grok-3',
    'grok-3-mini',
    'grok-4-1-fast-non-reasoning',
    'grok-4-1-fast-reasoning',
    'deepseek-r1-250528',
    'deepseek-v3.1',
    'deepseek-v3-250324',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'ByteDance-Seed-1.6',
    'ByteDance-Seed-1.6-flash',
    'doubao-1-5-pro-32k-250115',
    'doubao-seed-1.6-250615',
    'doubao-seed-1-6-vision-250815',
    'doubao-seed-2-0-pro-260215',
    'qwen2.5-vl-72b-instruct',
    'gpt-4o',
    'gpt-5',
    'gpt-5.1',
    'gpt-4.1-mini',
    'gpt-5.4-mini'
  ],
  image: [
    { key: 'grok-imagine-image', protocol: 'image' },
    { key: 'grok-imagine-image-pro', protocol: 'image' },
    { key: 'ByteDance-Seedream-4.0', protocol: 'image' },
    { key: 'doubao-seedream-4-0-250828', protocol: 'image' },
    { key: 'gpt-image-1.5', protocol: 'image' },
    { key: 'gpt-image-1-mini', protocol: 'image' },
    { key: 'gpt-image-1', protocol: 'image' },
    { key: 'gpt-image-2', protocol: 'image' },
    { key: 'gpt-image-2-sp', protocol: 'image' },
    { key: 'imagen-4.0-generate-001', protocol: 'image' },
    { key: 'qwen-image-plus', protocol: 'image' },
    { key: 'qwen-image-max', protocol: 'image' },
    { key: 'gemini-3.1-flash-image-preview', protocol: 'chat' },
    { key: 'gemini-3.1-flash-image-preview-4k', protocol: 'chat' },
    { key: 'gemini-3-pro-image-preview', protocol: 'chat' }
  ],
  video: [
    'veo-3.1',
    'ByteDance-Seedance-1.0-pro-fast',
    'ByteDance-Seedance-1.5-pro',
    'doubao-seedance-1-5-pro-251215',
    'doubao-seedance-2-0-fast-260128',
    'doubao-seedance-2-0-260128'
  ]
}

const apiKeyHelpUrl = getApiKeyHelpUrl()
const isConfigured = computed(() => modelStore.hasAnyApiKey)

const providerOptions = computed(() =>
  modelStore.providerList.map((provider) => ({
    label: provider.label,
    value: provider.key
  }))
)

const showProviderSelect = computed(() =>
  !DISTRIBUTION_CONFIG.api.hideProviderSelect && providerOptions.value.length > 1
)

const showBaseUrlInput = computed(() => !DISTRIBUTION_CONFIG.api.hideBaseUrlInput)
const isProductPresetMode = computed(() => !showProviderSelect.value && !showBaseUrlInput.value)

const resolveBaseUrl = (provider, capability = 'default') =>
  modelStore.getBaseUrlByProvider(provider, capability) || getProviderConfig(provider).defaultBaseUrl || ''

const resolvedBaseUrl = computed(() => resolveBaseUrl(formData.provider))

const currentProviderLabel = computed(() => {
  const matched = providerOptions.value.find((provider) => provider.value === formData.provider)
  return matched?.label || formData.provider
})

const currentEndpoints = computed(() => {
  const config = getProviderConfig(formData.provider)
  return config.endpoints || {
    chat: '/chat/completions',
    image: '/v1/images/generations',
    video: '/v1/videos',
    videoQuery: '/v1/videos/{taskId}'
  }
})

const allChatModels = computed(() => modelStore.allChatModels)
const allImageModels = computed(() => modelStore.allImageModels)
const allVideoModels = computed(() => modelStore.allVideoModels)

const imageProtocolOptions = [
  { label: '自动识别', value: 'auto' },
  { label: '图片接口', value: 'image' },
  { label: 'Chat 图片接口', value: 'chat' }
]

const syncForm = () => {
  const lockedProvider = DISTRIBUTION_CONFIG.api.lockProvider
    ? (DISTRIBUTION_CONFIG.api.defaultProvider || modelStore.currentProvider)
    : modelStore.currentProvider

  formData.provider = lockedProvider
  formData.apiKey = modelStore.getApiKeyByProvider(lockedProvider, 'default')
  formData.chatApiKey = modelStore.getApiKeyByProvider(lockedProvider, 'chat') === formData.apiKey
    ? ''
    : modelStore.apiKeysByProvider[lockedProvider]?.chat || ''
  formData.imageApiKey = modelStore.getApiKeyByProvider(lockedProvider, 'image') === formData.apiKey
    ? ''
    : modelStore.apiKeysByProvider[lockedProvider]?.image || ''
  formData.videoApiKey = modelStore.getApiKeyByProvider(lockedProvider, 'video') === formData.apiKey
    ? ''
    : modelStore.apiKeysByProvider[lockedProvider]?.video || ''
  formData.baseUrl = resolveBaseUrl(lockedProvider)
  formData.chatBaseUrl = modelStore.baseUrlsByProvider[lockedProvider]?.chat || ''
  formData.imageBaseUrl = modelStore.baseUrlsByProvider[lockedProvider]?.image || ''
  formData.videoBaseUrl = modelStore.baseUrlsByProvider[lockedProvider]?.video || ''
}

watch(
  () => props.show,
  (value) => {
    showModal.value = value
    if (value) {
      syncForm()
    }
  }
)

watch(
  () => formData.provider,
  (provider) => {
    formData.apiKey = modelStore.getApiKeyByProvider(provider, 'default')
    formData.chatApiKey = modelStore.apiKeysByProvider[provider]?.chat || ''
    formData.imageApiKey = modelStore.apiKeysByProvider[provider]?.image || ''
    formData.videoApiKey = modelStore.apiKeysByProvider[provider]?.video || ''
    formData.baseUrl = resolveBaseUrl(provider)
    formData.chatBaseUrl = modelStore.baseUrlsByProvider[provider]?.chat || ''
    formData.imageBaseUrl = modelStore.baseUrlsByProvider[provider]?.image || ''
    formData.videoBaseUrl = modelStore.baseUrlsByProvider[provider]?.video || ''
  }
)

watch(showModal, (value) => {
  emit('update:show', value)
})

const handleAddChatModel = () => {
  const modelName = newChatModel.value.trim()
  if (!modelName) return
  if (!ensureModelCapability(modelName, 'chat')) return
  modelStore.addCustomChatModel(modelName)
  newChatModel.value = ''
}

const handleAddImageModel = () => {
  const modelName = newImageModel.value.trim()
  if (!modelName) return
  if (!ensureModelCapability(modelName, 'image')) return
  modelStore.addCustomImageModel(modelName, '', { protocol: newImageProtocol.value })
  newImageModel.value = ''
  newImageProtocol.value = 'auto'
}

const handleAddVideoModel = () => {
  const modelName = newVideoModel.value.trim()
  if (!modelName) return
  if (!ensureModelCapability(modelName, 'video')) return
  modelStore.addCustomVideoModel(modelName)
  newVideoModel.value = ''
}

const ensureModelCapability = (modelName, expectedCapability) => {
  const conflict = getModelCapabilityConflict(modelName, expectedCapability)
  if (!conflict) return true

  window.$message?.warning(
    `${modelName} 看起来是${getCapabilityLabel(conflict)}模型，请添加到${getCapabilityLabel(expectedCapability)}模型列表时填写对应的模型名。`
  )
  return false
}

const handleRemoveChatModel = (modelKey) => {
  modelStore.removeCustomChatModel(modelKey)
}

const handleRemoveImageModel = (modelKey) => {
  modelStore.removeCustomImageModel(modelKey)
}

const handleRemoveVideoModel = (modelKey) => {
  modelStore.removeCustomVideoModel(modelKey)
}

const persistFormConfig = () => {
  const provider = DISTRIBUTION_CONFIG.api.lockProvider
    ? (DISTRIBUTION_CONFIG.api.defaultProvider || formData.provider)
    : formData.provider

  modelStore.setProvider(provider)
  modelStore.setApiKeyByProvider(provider, formData.apiKey, 'default')
  modelStore.setApiKeyByProvider(provider, formData.chatApiKey, 'chat')
  modelStore.setApiKeyByProvider(provider, formData.imageApiKey, 'image')
  modelStore.setApiKeyByProvider(provider, formData.videoApiKey, 'video')
  modelStore.setBaseUrlByProvider(provider, showBaseUrlInput.value ? formData.baseUrl : resolvedBaseUrl.value)
  modelStore.setBaseUrlByProvider(provider, formData.chatBaseUrl, 'chat')
  modelStore.setBaseUrlByProvider(provider, formData.imageBaseUrl, 'image')
  modelStore.setBaseUrlByProvider(provider, formData.videoBaseUrl, 'video')

  return provider
}

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '')

const normalizeModelPayload = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.models)) return payload.models
  if (Array.isArray(payload?.data?.models)) return payload.data.models
  return []
}

const handleSyncModels = async () => {
  const provider = persistFormConfig()
  const apiKey = formData.apiKey || formData.chatApiKey || formData.imageApiKey || formData.videoApiKey
  const rawUrl = formData.baseUrl || resolvedBaseUrl.value
  const baseUrl = normalizeBaseUrl(rawUrl) || modelStore.getBaseUrlByProvider?.(provider) || ''

  if (!baseUrl) {
    window.$message?.warning('请先填写 Base URL')
    return
  }

  if (!apiKey) {
    window.$message?.warning('请先填写 API Key')
    return
  }

  modelSyncLoading.value = true
  modelSyncSummary.value = ''

  const modelPaths = ['/v1/models', '/models', '/api/v1/models']

  try {
    let payload = null
    let lastError = null

    for (const path of modelPaths) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        })
        const text = await response.text()

        if (!response.ok) {
          lastError = text ? JSON.parse(text) : {}
          continue
        }

        payload = text ? JSON.parse(text) : {}
        break
      } catch {
        continue
      }
    }

    if (!payload) {
      const message = lastError?.error?.message || lastError?.message || `获取模型失败：尝试了 ${modelPaths.length} 个路径均未成功`
      throw new Error(message)
    }

    const models = normalizeModelPayload(payload)
    const stats = modelStore.syncModelsFromProvider(provider, models)
    modelSyncSummary.value = `已获取 ${models.length} 个模型，新增/更新：对话 ${stats.chat} 个，图片 ${stats.image} 个，视频 ${stats.video} 个，跳过 ${stats.skipped} 个。`
    window.$message?.success('模型已自动配置')
  } catch (error) {
    const message = error?.message || '获取模型失败'
    modelSyncSummary.value = ''
    window.$message?.error(message)
  } finally {
    modelSyncLoading.value = false
  }
}

const handleImportDataEyesModels = async () => {
  dataEyesImportLoading.value = true
  modelSyncSummary.value = ''

  try {
    formData.provider = 'dataeyes'
    formData.baseUrl = 'https://cloud.dataeyes.ai'
    const provider = persistFormConfig()

    let chatCount = 0
    let imageCount = 0
    let videoCount = 0

    DATAEYES_VERIFIED_MODELS.chat.forEach((modelKey) => {
      if (modelStore.addCustomChatModelByProvider(modelKey, provider)) {
        chatCount += 1
      }
    })

    DATAEYES_VERIFIED_MODELS.image.forEach((model) => {
      if (modelStore.addCustomImageModelByProvider(model.key, provider, model.key, { protocol: model.protocol })) {
        imageCount += 1
      }
      modelStore.updateCustomImageModelProtocol(model.key, model.protocol)
    })

    DATAEYES_VERIFIED_MODELS.video.forEach((modelKey) => {
      if (modelStore.addCustomVideoModelByProvider(modelKey, provider)) {
        videoCount += 1
      }
    })

    modelSyncSummary.value = `已导入 DataEyes 实测模型：对话 ${chatCount} 个，图片 ${imageCount} 个，视频 ${videoCount} 个。已存在的模型会保留并跳过。`
    window.$message?.success('DataEyes 实测模型已导入')
    void backupUserDataNow()
  } catch (error) {
    window.$message?.error(error?.message || '导入 DataEyes 模型失败')
  } finally {
    dataEyesImportLoading.value = false
  }
}

const handleExportData = async () => {
  dataExporting.value = true

  try {
    persistFormConfig()
    const result = await exportUserDataToFile()
    if (result?.canceled) return
    window.$message?.success('已导出创作文件、历史记录和 API 配置')
  } catch (error) {
    window.$message?.error(error?.message || '导出失败')
  } finally {
    dataExporting.value = false
  }
}

const handleImportData = async () => {
  const confirmed = window.confirm(
    '导入会用数据包里的项目、历史、模型和 API 配置覆盖当前本机配置。确定继续吗？'
  )
  if (!confirmed) return

  dataImporting.value = true

  try {
    const result = await importUserDataFromFile({ overwrite: true })
    if (result?.canceled) return
    window.$message?.success('导入完成，正在重新载入数据')
    window.setTimeout(() => window.location.reload(), 500)
  } catch (error) {
    window.$message?.error(error?.message || '导入失败')
  } finally {
    dataImporting.value = false
  }
}

const handleSave = () => {
  persistFormConfig()
  void backupUserDataNow()

  showModal.value = false
  emit('saved')
}

const handleClear = () => {
  modelStore.clearApiConfigByProvider(formData.provider)
  syncForm()
  void backupUserDataNow()
}

const isDesktop = computed(() => !!window.desktopApp?.comfy)

const openAssetsFolder = async () => {
  if (window.desktopApp?.comfy?.openFolder) {
    await window.desktopApp.comfy.openFolder('root')
  } else if (window.desktopApp?.getUserDataPath) {
    const path = await window.desktopApp.getUserDataPath()
    window.$message?.info(`素材目录：${path}\\yufeng-canvas\\assets`)
  }
}
</script>

<style scoped>
:deep(.api-settings-modal.n-card) {
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 30px;
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.16), transparent 34%),
    radial-gradient(circle at 92% 8%, rgba(14, 165, 233, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(241, 245, 249, 0.78));
  box-shadow: 0 38px 120px rgba(15, 23, 42, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(28px) saturate(1.28);
}

:global(.dark) :deep(.api-settings-modal.n-card) {
  border-color: rgba(203, 255, 239, 0.14);
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.12), transparent 34%),
    radial-gradient(circle at 92% 8%, rgba(14, 165, 233, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.92), rgba(7, 34, 36, 0.82));
  box-shadow: 0 38px 120px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

:deep(.n-tabs-tab.n-tabs-tab--active) {
  font-weight: 900;
}

:deep(.n-input),
:deep(.n-base-selection) {
  border-radius: 16px;
}

.endpoint-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.44);
  border-radius: 18px;
  backdrop-filter: blur(16px);
}

:global(.dark) .endpoint-list {
  background: rgba(15, 23, 42, 0.44);
}

.endpoint-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.endpoint-label {
  font-size: 13px;
  color: var(--text-secondary, #666);
  min-width: 70px;
}

.endpoint-tag {
  font-family: monospace;
  font-size: 12px;
}

.data-backup-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
  padding: 14px;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 20px;
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.14), transparent 38%),
    linear-gradient(135deg, rgba(240, 253, 250, 0.72), rgba(255, 255, 255, 0.44));
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

:global(.dark) .data-backup-card {
  border-color: rgba(94, 234, 212, 0.18);
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.1), transparent 38%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.7), rgba(6, 78, 59, 0.2));
}

.data-backup-card strong {
  display: block;
  margin-bottom: 5px;
  font-size: 14px;
}

.data-backup-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.data-backup-warning {
  margin-top: 6px !important;
  color: #b45309 !important;
}

:global(.dark) .data-backup-warning {
  color: #facc15 !important;
}

.data-backup-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.model-config-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.model-discovery-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(20, 184, 166, 0.24);
  border-radius: 20px;
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(240, 253, 250, 0.74), rgba(255, 255, 255, 0.42));
}

:global(.dark) .model-discovery-card {
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.12), transparent 36%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.68), rgba(6, 78, 59, 0.22));
}

.model-discovery-card strong {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

.model-discovery-card p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.model-discovery-card code {
  color: var(--accent-color);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.model-discovery-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  flex-shrink: 0;
}

.model-sync-alert {
  margin-top: -8px;
}

.model-group {
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 20px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.32)),
    radial-gradient(circle at 16% 0%, rgba(34, 255, 181, 0.1), transparent 36%);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
}

:global(.dark) .model-group {
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.58), rgba(6, 78, 59, 0.18)),
    radial-gradient(circle at 16% 0%, rgba(34, 255, 181, 0.08), transparent 36%);
}

.model-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.model-group-title {
  font-size: 14px;
  font-weight: 600;
}

.model-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.protocol-select {
  width: 128px;
  flex-shrink: 0;
}

.protocol-select.small {
  width: 118px;
}

@media (max-width: 720px) {
  .data-backup-card {
    flex-direction: column;
  }

  .data-backup-actions {
    width: 100%;
  }

  .model-discovery-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>

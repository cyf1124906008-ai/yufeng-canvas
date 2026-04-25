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
        </n-form>
      </n-tab-pane>

      <n-tab-pane name="models" tab="模型配置">
        <div class="model-config-section">
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
import { getCapabilityLabel, getModelCapabilityConflict } from '../utils/modelCapability'

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
  baseUrl: ''
})

const newChatModel = ref('')
const newImageModel = ref('')
const newImageProtocol = ref('auto')
const newVideoModel = ref('')

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

const resolveBaseUrl = (provider) =>
  modelStore.baseUrlsByProvider[provider] || getProviderConfig(provider).defaultBaseUrl || ''

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

const handleSave = () => {
  const provider = DISTRIBUTION_CONFIG.api.lockProvider
    ? (DISTRIBUTION_CONFIG.api.defaultProvider || formData.provider)
    : formData.provider

  modelStore.setProvider(provider)
  modelStore.setApiKeyByProvider(provider, formData.apiKey, 'default')
  modelStore.setApiKeyByProvider(provider, formData.chatApiKey, 'chat')
  modelStore.setApiKeyByProvider(provider, formData.imageApiKey, 'image')
  modelStore.setApiKeyByProvider(provider, formData.videoApiKey, 'video')
  modelStore.setBaseUrlByProvider(provider, showBaseUrlInput.value ? formData.baseUrl : resolvedBaseUrl.value)

  showModal.value = false
  emit('saved')
}

const handleClear = () => {
  modelStore.clearApiConfigByProvider(formData.provider)
  syncForm()
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

.model-config-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
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
</style>

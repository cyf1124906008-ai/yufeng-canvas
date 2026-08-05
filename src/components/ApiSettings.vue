<template>
  <n-modal
    v-model:show="showModal"
    preset="card"
    class="api-settings-modal"
    :bordered="false"
    :closable="false"
    :mask-closable="false"
    style="width: min(1180px, calc(100vw - 28px));"
  >
    <div class="settings-shell">
      <header class="settings-header">
        <div class="settings-heading">
          <span class="product-mark" aria-hidden="true">Y</span>
          <div>
            <p>YUFENG AGENT</p>
            <h2>Providers &amp; Models</h2>
            <span>连接模型服务，并为 Agent 配置可用能力。</span>
          </div>
        </div>
        <div class="header-actions">
          <span class="connection-pill" :class="`is-${connectionState.tone}`">
            <i></i>{{ connectionState.label }}
          </span>
          <button type="button" class="close-button" aria-label="取消并关闭设置" @click="handleCancel">×</button>
        </div>
      </header>

      <div class="settings-grid">
        <aside class="provider-rail" aria-label="Provider 列表">
          <div class="rail-heading">
            <div>
              <span>Providers</span>
              <small>{{ visibleProviders.length }} 个渠道</small>
            </div>
          </div>

          <div class="provider-list">
            <button
              v-for="provider in visibleProviders"
              :key="provider.value"
              type="button"
              class="provider-item"
              :class="{ 'is-active': provider.value === formData.provider }"
              :aria-current="provider.value === formData.provider ? 'true' : undefined"
              :disabled="DISTRIBUTION_CONFIG.api.lockProvider || providerSwitchLocked"
              @click="selectProvider(provider.value)"
            >
              <span class="provider-avatar">{{ providerInitial(provider.label) }}</span>
              <span class="provider-copy">
                <strong>{{ provider.label }}</strong>
                <small>{{ providerHost(provider.value) }}</small>
              </span>
              <span class="provider-state" :class="`is-${providerStatus(provider.value).tone}`" :title="providerStatus(provider.value).label"></span>
            </button>
          </div>

          <div class="provider-help">
            <span>API credentials</span>
            <p>Key 仅保存在当前设备。分享备份文件前，请确认接收方可信。</p>
            <a :href="apiKeyHelpUrl" target="_blank" rel="noopener noreferrer">申请 / 查看 API Key ↗</a>
          </div>
        </aside>

        <main class="settings-main">
          <section class="settings-panel connection-panel">
            <div class="panel-heading">
              <div>
                <p>CONNECTION</p>
                <h3>{{ currentProviderLabel }}</h3>
                <span>默认连接会被对话、图片和视频能力继承。</span>
              </div>
              <n-button
                size="small"
                :loading="connectionTesting"
                :disabled="providerSwitchLocked"
                :type="connectionTestResult?.ok ? 'success' : connectionTestResult && !connectionTestResult.ok ? 'error' : 'default'"
                @click="handleTestConnection"
              >
                {{ connectionTesting ? '测试中…' : '测试连接' }}
              </n-button>
            </div>

            <n-form :model="formData" label-placement="top" class="connection-form">
              <div class="connection-primary-grid">
                <n-form-item label="Base URL" path="baseUrl">
                  <div class="field-stack">
                    <n-input
                      v-if="showBaseUrlInput"
                      v-model:value="formData.baseUrl"
                      placeholder="https://cloud.dataeyes.ai"
                      autocomplete="url"
                    />
                    <n-input v-else :value="resolvedBaseUrl" readonly />
                    <small v-if="formData.baseUrl && baseUrlPreview.normalized" class="field-note">
                      {{ baseUrlPreview.label || '自定义服务' }} · 保存时自动规范化
                    </small>
                  </div>
                </n-form-item>

                <n-form-item label="Default API Key" path="apiKey">
                  <div class="field-stack">
                    <n-input
                      v-model:value="formData.apiKey"
                      type="password"
                      show-password-on="click"
                      placeholder="输入此 Provider 的默认 Key"
                      autocomplete="off"
                    />
                    <small class="field-note">默认隐藏；能力专用 Key 留空时继承此项。</small>
                  </div>
                </n-form-item>
              </div>
            </n-form>

            <n-alert v-if="isProductPresetMode" type="info" class="compact-alert">
              服务地址已由发行版本预置，只需填写你的 API Key。
            </n-alert>

            <details class="advanced-section">
              <summary>
                <span><strong>Capability overrides</strong><small>对话 / 图片 / 视频独立地址与 Key</small></span>
                <span class="summary-count">{{ overrideCount }} 项覆盖</span>
              </summary>
              <div class="capability-overrides">
                <article v-for="capability in capabilityRows" :key="capability.id" class="capability-card">
                  <header>
                    <span class="capability-icon" :class="`is-${capability.id}`">{{ capability.short }}</span>
                    <div><strong>{{ capability.label }}</strong><small>{{ capability.description }}</small></div>
                    <n-tag size="tiny" :type="capability.overridden ? 'info' : 'default'">
                      {{ capability.overridden ? '独立配置' : '继承默认' }}
                    </n-tag>
                  </header>
                  <n-form :model="formData" label-placement="top">
                    <n-form-item label="Base URL" :path="capability.baseField">
                      <n-input v-model:value="formData[capability.baseField]" :placeholder="`留空，继承 ${shortUrl(formData.baseUrl || resolvedBaseUrl)}`" />
                    </n-form-item>
                    <n-form-item label="API Key" :path="capability.keyField">
                      <n-input
                        v-model:value="formData[capability.keyField]"
                        type="password"
                        show-password-on="click"
                        placeholder="留空，继承 Default Key"
                        autocomplete="off"
                      />
                    </n-form-item>
                  </n-form>
                </article>
              </div>
            </details>

            <details class="advanced-section endpoint-section">
              <summary>
                <span><strong>Endpoint routes</strong><small>当前 Provider 的只读接口映射</small></span>
                <span class="summary-count">{{ endpointRows.length }} 条</span>
              </summary>
              <div class="endpoint-grid">
                <div v-for="endpoint in endpointRows" :key="endpoint.label">
                  <span>{{ endpoint.label }}</span><code>{{ endpoint.value }}</code>
                </div>
              </div>
            </details>
          </section>

          <section class="settings-panel catalog-panel">
            <div class="panel-heading catalog-heading">
              <div>
                <p>MODEL CATALOG</p>
                <h3>可用模型</h3>
                <span>从服务同步，或手动添加后台提供的准确模型名。</span>
              </div>
              <div class="catalog-actions">
                <n-button size="small" secondary :loading="modelSyncLoading" :disabled="providerSwitchLocked" @click="handleSyncModels">同步模型</n-button>
                <n-button size="small" secondary :loading="dataEyesImportLoading" :disabled="providerSwitchLocked" @click="handleImportDataEyesModels">导入 DataEyes 实测目录</n-button>
              </div>
            </div>

            <n-alert v-if="modelSyncSummary" type="success" class="compact-alert model-sync-alert">
              {{ modelSyncSummary }}
            </n-alert>

            <div class="catalog-tabs" role="tablist" aria-label="模型能力">
              <button
                v-for="tab in catalogTabs"
                :key="tab.id"
                type="button"
                role="tab"
                :aria-selected="activeCatalog === tab.id ? 'true' : 'false'"
                :class="{ 'is-active': activeCatalog === tab.id }"
                @click="activeCatalog = tab.id"
              >
                <span>{{ tab.label }}</span><strong>{{ tab.count }}</strong>
              </button>
            </div>

            <div class="catalog-add-row">
              <n-input
                v-if="activeCatalog === 'chat'"
                v-model:value="newChatModel"
                placeholder="例如 gpt-5.4-mini"
                @keyup.enter="handleAddChatModel"
              />
              <n-input
                v-else-if="activeCatalog === 'image'"
                v-model:value="newImageModel"
                placeholder="例如 gpt-image-2"
                @keyup.enter="handleAddImageModel"
              />
              <n-input
                v-else
                v-model:value="newVideoModel"
                placeholder="例如 veo-3.1"
                @keyup.enter="handleAddVideoModel"
              />
              <n-select
                v-if="activeCatalog === 'image'"
                v-model:value="newImageProtocol"
                :options="imageProtocolOptions"
                class="protocol-select"
              />
              <n-button type="primary" :disabled="!activeNewModel" @click="handleAddActiveModel">添加模型</n-button>
            </div>

            <div v-if="activeCatalogModels.length" class="catalog-list">
              <article v-for="model in activeCatalogModels" :key="model.key" class="catalog-row">
                <span class="model-icon" :class="`is-${activeCatalog}`">{{ modelInitial(model.label) }}</span>
                <div class="model-copy">
                  <strong>{{ model.label }}</strong>
                  <code>{{ model.key }}</code>
                </div>
                <n-select
                  v-if="activeCatalog === 'image' && model.isCustom"
                  :value="model.protocol || 'auto'"
                  :options="imageProtocolOptions"
                  size="small"
                  class="protocol-select compact"
                  @update:value="(value) => handleUpdateImageProtocol(model.key, value)"
                />
                <n-tag v-else size="tiny" :type="model.isCustom ? 'info' : 'default'">
                  {{ model.isCustom ? '自定义' : '内置' }}
                </n-tag>
                <button
                  type="button"
                  class="select-model"
                  :class="{ 'is-selected': isActiveModel(model.key) }"
                  :aria-pressed="isActiveModel(model.key)"
                  :title="isActiveModel(model.key) ? '当前使用中' : '切换为当前模型'"
                  @click="handleSelectActiveModel(model.key)"
                >
                  {{ isActiveModel(model.key) ? '当前' : '使用' }}
                </button>
                <button
                  v-if="model.isCustom"
                  type="button"
                  class="remove-model"
                  :aria-label="`移除 ${model.label}`"
                  title="移除模型"
                  @click="handleRemoveActiveModel(model.key)"
                >×</button>
              </article>
            </div>
            <div v-else class="catalog-empty">
              <span>＋</span>
              <strong>此能力还没有模型</strong>
              <p>点击“同步模型”，或在上方输入服务商提供的模型名。</p>
            </div>
          </section>

          <details v-if="showLocalComfyAdvanced" class="settings-panel lab-panel">
            <summary><span><strong>Local ComfyUI Lab</strong><small>实验性本地生成引擎</small></span></summary>
            <ComfyEnginePanel />
          </details>
        </main>

        <aside class="status-rail" aria-label="连接状态摘要">
          <section class="status-card overview-card">
            <p>STATUS</p>
            <div class="status-title">
              <span class="large-status-dot" :class="`is-${connectionState.tone}`"></span>
              <div><strong>{{ connectionState.label }}</strong><small>{{ currentProviderLabel }}</small></div>
            </div>
            <dl>
              <div><dt>Base URL</dt><dd :title="formData.baseUrl || resolvedBaseUrl">{{ shortUrl(formData.baseUrl || resolvedBaseUrl) }}</dd></div>
              <div><dt>Credentials</dt><dd>{{ credentialCount }} / 4</dd></div>
              <div><dt>Models</dt><dd>{{ totalModelCount }}</dd></div>
            </dl>
          </section>

          <section v-if="connectionTestResult" class="status-card test-result" :class="connectionTestResult.ok ? 'is-success' : 'is-error'">
            <header><span>{{ connectionTestResult.ok ? '✓' : '!' }}</span><strong>{{ connectionTestResult.ok ? 'Connection verified' : 'Connection failed' }}</strong></header>
            <p v-if="connectionTestResult.ok">已发现 {{ connectionTestResult.modelCount || connectionTestResult.models?.length || 0 }} 个模型，可继续同步目录。</p>
            <p v-else>{{ connectionTestResult.chineseError || connectionTestResult.error || '服务未返回可用响应。' }}</p>
          </section>

          <section class="status-card coverage-card">
            <div class="status-section-heading"><strong>Capability coverage</strong><span>{{ configuredCapabilityCount }}/3</span></div>
            <div class="coverage-list">
              <div v-for="capability in capabilityRows" :key="capability.id">
                <span class="capability-icon" :class="`is-${capability.id}`">{{ capability.short }}</span>
                <div><strong>{{ capability.label }}</strong><small>{{ capability.hasCredential ? shortUrl(capability.effectiveBaseUrl) : '缺少 Key' }}</small></div>
                <i :class="capability.hasCredential ? 'is-ready' : 'is-missing'"></i>
              </div>
            </div>
          </section>

          <details class="status-card data-tools">
            <summary><span><strong>Data &amp; backup</strong><small>迁移本机配置与任务数据</small></span></summary>
            <div class="backup-copy">
              <p>备份包含项目、Agent 任务记录、工作流、Drama 数据、本地资产索引、模型与 API 配置。</p>
              <p class="backup-warning">数据包包含 API Key。大体积图片和视频请同时备份素材目录。</p>
            </div>
            <div class="backup-actions">
              <n-button size="small" secondary :loading="dataExporting" @click="handleExportData">导出备份</n-button>
              <n-button size="small" secondary :loading="dataImporting" @click="handleImportData">导入备份</n-button>
              <n-button v-if="isDesktop" size="small" secondary @click="openAssetsFolder">打开素材目录</n-button>
            </div>
          </details>

          <n-alert v-if="!isConfigured" type="warning" class="compact-alert">
            当前 Provider 尚未配置可用 Key。
          </n-alert>
        </aside>
      </div>

      <footer class="settings-footer">
        <div class="footer-context">
          <span>{{ currentProviderLabel }}</span>
          <small>取消会撤销本次编辑；同步或导入目录成功后会更新保存基线。</small>
        </div>
        <div class="footer-actions">
          <n-button tertiary type="error" :disabled="providerSwitchLocked" @click="handleClear">清除当前配置</n-button>
          <n-button @click="handleCancel">取消</n-button>
          <n-button type="primary" :disabled="providerSwitchLocked" @click="handleSave">保存设置</n-button>
        </div>
      </footer>
    </div>
  </n-modal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NForm,
  NFormItem,
  NInput,
  NModal,
  NSelect,
  NTag
} from 'naive-ui'
import { getApiKeyHelpUrl, DISTRIBUTION_CONFIG } from '../config/distribution'
import { getProviderConfig } from '../config/providers'
import { resolveProviderConnectionPair, useModelStore } from '../stores/pinia'
import { backupUserDataNow, exportUserDataToFile, importUserDataFromFile } from '../utils/appDataBackup'
import { getCapabilityLabel, getModelCapabilityConflict } from '../utils/modelCapability'
import { normalizeProviderEndpoint, testProviderConnection } from '../utils/providerEndpoint'
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
const activeCatalog = ref('chat')

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
const connectionTesting = ref(false)
const connectionTestResult = ref(null)
const providerDrafts = new Map()
let settingsSnapshot = null
let applyingProviderDraft = false
let connectionRevision = 0
let requestSequence = 0
const providerRequestTokens = { connection: 0, sync: 0, dataeyes: 0 }

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

const CAPABILITIES = [
  {
    id: 'chat',
    label: 'Chat',
    short: 'T',
    description: '规划、对话与视觉分析',
    baseField: 'chatBaseUrl',
    keyField: 'chatApiKey'
  },
  {
    id: 'image',
    label: 'Image',
    short: 'I',
    description: '文生图、图生图与编辑',
    baseField: 'imageBaseUrl',
    keyField: 'imageApiKey'
  },
  {
    id: 'video',
    label: 'Video',
    short: 'V',
    description: '文生视频与图生视频',
    baseField: 'videoBaseUrl',
    keyField: 'videoApiKey'
  }
]

const apiKeyHelpUrl = getApiKeyHelpUrl()

const providerOptions = computed(() =>
  modelStore.providerList.map((provider) => ({
    label: provider.label,
    value: provider.key
  }))
)

const showProviderSelect = computed(() =>
  !DISTRIBUTION_CONFIG.api.hideProviderSelect && providerOptions.value.length > 1
)

const visibleProviders = computed(() => {
  if (showProviderSelect.value) return providerOptions.value
  return providerOptions.value.filter(provider => provider.value === formData.provider).slice(0, 1)
})

const showBaseUrlInput = computed(() => !DISTRIBUTION_CONFIG.api.hideBaseUrlInput)
const isProductPresetMode = computed(() => !showProviderSelect.value && !showBaseUrlInput.value)
const showLocalComfyAdvanced = computed(() => {
  if (typeof window === 'undefined') return false
  return window.localStorage?.getItem('YUFENG_ENABLE_LOCAL_COMFY') === '1'
})

const resolveBaseUrl = (provider, capability = 'default') =>
  modelStore.getBaseUrlByProvider(provider, capability) || getProviderConfig(provider).defaultBaseUrl || ''

const resolvedBaseUrl = computed(() => resolveBaseUrl(formData.provider))

const currentProviderLabel = computed(() => {
  const matched = providerOptions.value.find(provider => provider.value === formData.provider)
  return matched?.label || formData.provider || 'Provider'
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

const endpointRows = computed(() => [
  { label: 'Chat', value: currentEndpoints.value.chat },
  { label: 'Image', value: currentEndpoints.value.image },
  { label: 'Video create', value: currentEndpoints.value.video },
  { label: 'Video status', value: currentEndpoints.value.videoQuery }
].filter(item => item.value))

const providerModels = computed(() => modelStore.getModelsByProvider(formData.provider || modelStore.currentProvider))
const allChatModels = computed(() => providerModels.value.chat || [])
const allImageModels = computed(() => providerModels.value.image || [])
const allVideoModels = computed(() => providerModels.value.video || [])

const catalogTabs = computed(() => [
  { id: 'chat', label: 'Chat', count: allChatModels.value.length },
  { id: 'image', label: 'Image', count: allImageModels.value.length },
  { id: 'video', label: 'Video', count: allVideoModels.value.length }
])

const activeCatalogModels = computed(() => ({
  chat: allChatModels.value,
  image: allImageModels.value,
  video: allVideoModels.value
})[activeCatalog.value] || [])

const activeNewModel = computed(() => ({
  chat: newChatModel.value,
  image: newImageModel.value,
  video: newVideoModel.value
})[activeCatalog.value]?.trim())

const totalModelCount = computed(() => allChatModels.value.length + allImageModels.value.length + allVideoModels.value.length)

const baseUrlPreview = computed(() => {
  if (!formData.baseUrl) return { normalized: false, label: '', warnings: [] }
  return normalizeProviderEndpoint(formData.baseUrl)
})

const capabilityRows = computed(() => CAPABILITIES.map(capability => ({
  ...capability,
  overridden: Boolean(formData[capability.baseField] || formData[capability.keyField]),
  hasCredential: Boolean(formData[capability.keyField] || formData.apiKey),
  effectiveBaseUrl: formData[capability.baseField] || formData.baseUrl || resolvedBaseUrl.value
})))

const overrideCount = computed(() => capabilityRows.value.filter(capability => capability.overridden).length)
const credentialCount = computed(() => [formData.apiKey, formData.chatApiKey, formData.imageApiKey, formData.videoApiKey].filter(Boolean).length)
const configuredCapabilityCount = computed(() => capabilityRows.value.filter(capability => capability.hasCredential).length)
const isConfigured = computed(() => configuredCapabilityCount.value > 0)

const connectionState = computed(() => {
  if (connectionTesting.value) return { tone: 'testing', label: 'Testing' }
  if (connectionTestResult.value?.ok) return { tone: 'ready', label: 'Connected' }
  if (connectionTestResult.value && !connectionTestResult.value.ok) return { tone: 'error', label: 'Connection error' }
  if (isConfigured.value) return { tone: 'configured', label: 'Configured' }
  return { tone: 'missing', label: 'Not configured' }
})

const providerSwitchLocked = computed(() =>
  connectionTesting.value || modelSyncLoading.value || dataEyesImportLoading.value ||
  dataExporting.value || dataImporting.value
)

const imageProtocolOptions = [
  { label: '自动识别', value: 'auto' },
  { label: '图片接口', value: 'image' },
  { label: 'Chat 图片接口', value: 'chat' }
]

const shortUrl = value => {
  const text = String(value || '').trim()
  if (!text) return '未设置'
  try {
    const url = new URL(text)
    return `${url.host}${url.pathname === '/' ? '' : url.pathname}`
  } catch {
    return text.length > 34 ? `${text.slice(0, 31)}…` : text
  }
}

const providerInitial = label => String(label || '?').trim().slice(0, 2).toUpperCase()
const modelInitial = label => String(label || '?').trim().slice(0, 1).toUpperCase()
const providerHost = provider => shortUrl(resolveBaseUrl(provider))

const providerStatus = provider => {
  if (provider === formData.provider && connectionTestResult.value?.ok) return { tone: 'ready', label: '连接已验证' }
  if (provider === formData.provider && connectionTestResult.value && !connectionTestResult.value.ok) return { tone: 'error', label: '连接失败' }
  if (provider === formData.provider && isConfigured.value) return { tone: 'configured', label: '已配置' }
  const configured = ['default', 'chat', 'image', 'video'].some(capability => modelStore.getApiKeyByProvider(provider, capability))
  return configured ? { tone: 'configured', label: '已配置' } : { tone: 'missing', label: '未配置' }
}

const loadProviderForm = provider => {
  const defaultKey = modelStore.getApiKeyByProvider(provider, 'default')
  formData.apiKey = defaultKey
  formData.chatApiKey = modelStore.apiKeysByProvider[provider]?.chat || ''
  formData.imageApiKey = modelStore.apiKeysByProvider[provider]?.image || ''
  formData.videoApiKey = modelStore.apiKeysByProvider[provider]?.video || ''
  formData.baseUrl = resolveBaseUrl(provider)
  formData.chatBaseUrl = modelStore.baseUrlsByProvider[provider]?.chat || ''
  formData.imageBaseUrl = modelStore.baseUrlsByProvider[provider]?.image || ''
  formData.videoBaseUrl = modelStore.baseUrlsByProvider[provider]?.video || ''
}

const captureProviderDraft = (provider = formData.provider) => {
  if (!provider) return
  providerDrafts.set(provider, {
    apiKey: formData.apiKey,
    chatApiKey: formData.chatApiKey,
    imageApiKey: formData.imageApiKey,
    videoApiKey: formData.videoApiKey,
    baseUrl: formData.baseUrl,
    chatBaseUrl: formData.chatBaseUrl,
    imageBaseUrl: formData.imageBaseUrl,
    videoBaseUrl: formData.videoBaseUrl,
    newChatModel: newChatModel.value,
    newImageModel: newImageModel.value,
    newImageProtocol: newImageProtocol.value,
    newVideoModel: newVideoModel.value,
    activeCatalog: activeCatalog.value
  })
}

const applyProviderDraft = (provider, draft = providerDrafts.get(provider)) => {
  applyingProviderDraft = true
  try {
    formData.provider = provider
    if (draft) {
      Object.assign(formData, {
        apiKey: draft.apiKey || '',
        chatApiKey: draft.chatApiKey || '',
        imageApiKey: draft.imageApiKey || '',
        videoApiKey: draft.videoApiKey || '',
        baseUrl: draft.baseUrl || '',
        chatBaseUrl: draft.chatBaseUrl || '',
        imageBaseUrl: draft.imageBaseUrl || '',
        videoBaseUrl: draft.videoBaseUrl || ''
      })
      newChatModel.value = draft.newChatModel || ''
      newImageModel.value = draft.newImageModel || ''
      newImageProtocol.value = draft.newImageProtocol || 'auto'
      newVideoModel.value = draft.newVideoModel || ''
      activeCatalog.value = ['chat', 'image', 'video'].includes(draft.activeCatalog) ? draft.activeCatalog : 'chat'
    } else {
      loadProviderForm(provider)
      newChatModel.value = ''
      newImageModel.value = ''
      newImageProtocol.value = 'auto'
      newVideoModel.value = ''
      activeCatalog.value = 'chat'
      captureProviderDraft(provider)
    }
  } finally {
    applyingProviderDraft = false
  }
}

const setProviderRequestLoading = (kind, value) => {
  if (kind === 'connection') connectionTesting.value = value
  if (kind === 'sync') modelSyncLoading.value = value
  if (kind === 'dataeyes') dataEyesImportLoading.value = value
}

const invalidateProviderRequest = kind => {
  providerRequestTokens[kind] = ++requestSequence
  setProviderRequestLoading(kind, false)
}

const invalidateProviderRequests = () => {
  Object.keys(providerRequestTokens).forEach(invalidateProviderRequest)
}

const beginProviderRequest = kind => {
  invalidateProviderRequests()
  const request = {
    kind,
    token: ++requestSequence,
    provider: formData.provider,
    revision: connectionRevision
  }
  providerRequestTokens[kind] = request.token
  setProviderRequestLoading(kind, true)
  return request
}

const isCurrentProviderRequest = request =>
  showModal.value && providerRequestTokens[request.kind] === request.token &&
  formData.provider === request.provider && connectionRevision === request.revision

const finishProviderRequest = request => {
  if (providerRequestTokens[request.kind] === request.token) setProviderRequestLoading(request.kind, false)
}

const selectProvider = provider => {
  if (DISTRIBUTION_CONFIG.api.lockProvider || providerSwitchLocked.value || provider === formData.provider) return
  captureProviderDraft()
  invalidateProviderRequests()
  connectionTestResult.value = null
  modelSyncSummary.value = ''
  applyProviderDraft(provider)
}

const syncForm = () => {
  const lockedProvider = DISTRIBUTION_CONFIG.api.lockProvider
    ? (DISTRIBUTION_CONFIG.api.defaultProvider || modelStore.currentProvider)
    : modelStore.currentProvider
  applyProviderDraft(lockedProvider, null)
}

const commitSettingsBaseline = () => {
  captureProviderDraft()
  settingsSnapshot = modelStore.createApiSettingsSnapshot()
}

const rollbackSettingsTransaction = () => {
  invalidateProviderRequests()
  const snapshot = settingsSnapshot
  settingsSnapshot = null
  providerDrafts.clear()
  if (snapshot) modelStore.restoreApiSettingsSnapshot(snapshot)
}

const beginSettingsTransaction = () => {
  invalidateProviderRequests()
  providerDrafts.clear()
  settingsSnapshot = modelStore.createApiSettingsSnapshot()
  connectionTestResult.value = null
  modelSyncSummary.value = ''
  syncForm()
}

const handleCancel = () => {
  rollbackSettingsTransaction()
  showModal.value = false
}

const connectionProfiles = () => {
  const defaultBaseUrl = formData.baseUrl || resolvedBaseUrl.value
  return {
    default: { baseUrl: defaultBaseUrl, apiKey: formData.apiKey },
    chat: {
      baseUrl: formData.chatBaseUrl || defaultBaseUrl,
      apiKey: formData.chatApiKey || formData.apiKey
    },
    image: {
      baseUrl: formData.imageBaseUrl || defaultBaseUrl,
      apiKey: formData.imageApiKey || formData.apiKey
    },
    video: {
      baseUrl: formData.videoBaseUrl || defaultBaseUrl,
      apiKey: formData.videoApiKey || formData.apiKey
    }
  }
}

const connectionPairError = profiles => {
  const entries = Object.values(profiles)
  const hasKey = entries.some(profile => String(profile.apiKey || '').trim())
  const hasBaseUrl = entries.some(profile => normalizeProviderEndpoint(profile.baseUrl).baseUrl)
  if (!hasBaseUrl) return '请先填写 Base URL'
  if (!hasKey) return '请先填写 API Key'
  return '请为同一能力配置完整的 Base URL 与 API Key'
}

watch(
  () => props.show,
  value => {
    if (value) {
      showModal.value = true
      beginSettingsTransaction()
      return
    }
    if (settingsSnapshot) rollbackSettingsTransaction()
    showModal.value = false
  },
  { immediate: true }
)

watch(
  () => [
    formData.baseUrl,
    formData.chatBaseUrl,
    formData.imageBaseUrl,
    formData.videoBaseUrl,
    formData.apiKey,
    formData.chatApiKey,
    formData.imageApiKey,
    formData.videoApiKey
  ],
  (next, previous) => {
    if (applyingProviderDraft || !previous || !next.some((value, index) => value !== previous[index])) return
    connectionRevision += 1
    connectionTestResult.value = null
    invalidateProviderRequest('connection')
    invalidateProviderRequest('sync')
  },
  { flush: 'sync' }
)

watch(showModal, (value, previous) => {
  if (!value && previous && settingsSnapshot) rollbackSettingsTransaction()
  emit('update:show', value)
})

const handleTestConnection = async () => {
  if (providerSwitchLocked.value) return
  const profiles = connectionProfiles()
  const pair = resolveProviderConnectionPair(profiles)
  if (!pair) {
    connectionTestResult.value = { ok: false, chineseError: connectionPairError(profiles) }
    return
  }

  const request = beginProviderRequest('connection')
  connectionTestResult.value = null
  try {
    const result = await testProviderConnection({
      baseUrl: pair.baseUrl,
      apiKey: pair.apiKey,
      provider: request.provider
    })
    if (isCurrentProviderRequest(request)) connectionTestResult.value = result
  } catch (error) {
    if (isCurrentProviderRequest(request)) {
      connectionTestResult.value = { ok: false, chineseError: error?.message || '连接测试失败' }
    }
  } finally {
    finishProviderRequest(request)
  }
}

const ensureModelCapability = (modelName, expectedCapability) => {
  const conflict = getModelCapabilityConflict(modelName, expectedCapability)
  if (!conflict) return true
  window.$message?.warning(
    `${modelName} 看起来是${getCapabilityLabel(conflict)}模型，请添加到${getCapabilityLabel(expectedCapability)}模型列表时填写对应的模型名。`
  )
  return false
}

const handleAddChatModel = () => {
  const modelName = newChatModel.value.trim()
  if (!modelName || !ensureModelCapability(modelName, 'chat')) return
  const added = modelStore.addCustomChatModelByProvider(modelName, formData.provider)
  if (!added) window.$message?.info('该模型已存在')
  newChatModel.value = ''
}

const handleAddImageModel = () => {
  const modelName = newImageModel.value.trim()
  if (!modelName || !ensureModelCapability(modelName, 'image')) return
  const added = modelStore.addCustomImageModelByProvider(modelName, formData.provider, '', { protocol: newImageProtocol.value })
  if (!added) window.$message?.info('该模型已存在')
  newImageModel.value = ''
  newImageProtocol.value = 'auto'
}

const handleAddVideoModel = () => {
  const modelName = newVideoModel.value.trim()
  if (!modelName || !ensureModelCapability(modelName, 'video')) return
  const added = modelStore.addCustomVideoModelByProvider(modelName, formData.provider)
  if (!added) window.$message?.info('该模型已存在')
  newVideoModel.value = ''
}

const handleAddActiveModel = () => ({
  chat: handleAddChatModel,
  image: handleAddImageModel,
  video: handleAddVideoModel
})[activeCatalog.value]?.()

const handleRemoveActiveModel = modelKey => ({
  chat: modelStore.removeCustomChatModelByProvider,
  image: modelStore.removeCustomImageModelByProvider,
  video: modelStore.removeCustomVideoModelByProvider
})[activeCatalog.value]?.(modelKey, formData.provider)

const handleUpdateImageProtocol = (modelKey, protocol = 'auto') => {
  const normalized = ['auto', 'image', 'chat'].includes(protocol) ? protocol : 'auto'
  const models = modelStore.customImageModelsByProvider[formData.provider] || []
  const model = models.find(item => item.key === modelKey)
  if (model) model.protocol = normalized
}

const isActiveModel = modelKey => {
  const selectedByCatalog = {
    chat: modelStore.selectedChatModel,
    image: modelStore.selectedImageModel,
    video: modelStore.selectedVideoModel
  }
  return selectedByCatalog[activeCatalog.value] === modelKey
}

const handleSelectActiveModel = modelKey => {
  const selectedField = {
    chat: 'selectedChatModel',
    image: 'selectedImageModel',
    video: 'selectedVideoModel'
  }[activeCatalog.value]
  if (!selectedField || !modelKey) return
  if (typeof modelStore.setSelectedModel === 'function') {
    modelStore.setSelectedModel(activeCatalog.value, modelKey, { mode: 'locked' })
  } else {
    modelStore[selectedField] = modelKey
  }
  window.$message?.success(`${getCapabilityLabel(activeCatalog.value)}模型已切换`)
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

  const normalizeAndStoreBaseUrl = (value, capability = 'default') => {
    const normalized = normalizeProviderEndpoint(value).baseUrl || ''
    modelStore.setBaseUrlByProvider(provider, normalized, capability)
    return normalized
  }

  applyingProviderDraft = true
  try {
    formData.baseUrl = normalizeAndStoreBaseUrl(showBaseUrlInput.value ? formData.baseUrl : resolvedBaseUrl.value)
    formData.chatBaseUrl = normalizeAndStoreBaseUrl(formData.chatBaseUrl, 'chat')
    formData.imageBaseUrl = normalizeAndStoreBaseUrl(formData.imageBaseUrl, 'image')
    formData.videoBaseUrl = normalizeAndStoreBaseUrl(formData.videoBaseUrl, 'video')
  } finally {
    applyingProviderDraft = false
  }
  captureProviderDraft(provider)
  return provider
}

const handleSyncModels = async () => {
  if (providerSwitchLocked.value) return
  const profiles = connectionProfiles()
  const pair = resolveProviderConnectionPair(profiles)
  if (!pair) {
    window.$message?.warning(connectionPairError(profiles))
    return
  }

  const request = beginProviderRequest('sync')
  modelSyncSummary.value = ''
  if (pair.warnings.length) window.$message?.info(pair.warnings.join('；'))

  try {
    const result = await testProviderConnection({ baseUrl: pair.baseUrl, apiKey: pair.apiKey, provider: request.provider })
    if (!isCurrentProviderRequest(request)) return
    if (!result.ok) throw new Error(result.chineseError || result.error || '获取模型失败')
    const provider = persistFormConfig()
    const models = result.models || []
    const stats = modelStore.syncModelsFromProvider(provider, models)
    const dedupNote = stats.deduplicated > 0 ? `（去重 ${stats.deduplicated} 个）` : ''
    modelSyncSummary.value = `已获取 ${models.length} 个模型${dedupNote}：对话 ${stats.chat}，图片 ${stats.image}，视频 ${stats.video}，跳过 ${stats.skipped}。`
    connectionTestResult.value = result
    commitSettingsBaseline()
    window.$message?.success('模型目录已同步')
  } catch (error) {
    if (isCurrentProviderRequest(request)) {
      modelSyncSummary.value = ''
      window.$message?.error(error?.message || '获取模型失败')
    }
  } finally {
    finishProviderRequest(request)
  }
}

const handleImportDataEyesModels = async () => {
  if (providerSwitchLocked.value) return
  if (formData.provider !== 'dataeyes') selectProvider('dataeyes')
  formData.baseUrl = 'https://cloud.dataeyes.ai'
  const request = beginProviderRequest('dataeyes')
  modelSyncSummary.value = ''
  try {
    await Promise.resolve()
    if (!isCurrentProviderRequest(request)) return
    const provider = persistFormConfig()
    let chatCount = 0
    let imageCount = 0
    let videoCount = 0

    DATAEYES_VERIFIED_MODELS.chat.forEach(modelKey => {
      if (modelStore.addCustomChatModelByProvider(modelKey, provider)) chatCount += 1
    })
    DATAEYES_VERIFIED_MODELS.image.forEach(model => {
      if (modelStore.addCustomImageModelByProvider(model.key, provider, model.key, { protocol: model.protocol })) imageCount += 1
      const target = (modelStore.customImageModelsByProvider[provider] || []).find(item => item.key === model.key)
      if (target) target.protocol = model.protocol
    })
    DATAEYES_VERIFIED_MODELS.video.forEach(modelKey => {
      if (modelStore.addCustomVideoModelByProvider(modelKey, provider)) videoCount += 1
    })

    activeCatalog.value = 'chat'
    modelSyncSummary.value = `已导入 DataEyes 实测模型：对话 ${chatCount}，图片 ${imageCount}，视频 ${videoCount}。已存在的模型已跳过。`
    commitSettingsBaseline()
    window.$message?.success('DataEyes 实测模型已导入')
    void backupUserDataNow()
  } catch (error) {
    if (isCurrentProviderRequest(request)) window.$message?.error(error?.message || '导入 DataEyes 模型失败')
  } finally {
    finishProviderRequest(request)
  }
}

const handleExportData = async () => {
  dataExporting.value = true
  try {
    const result = await exportUserDataToFile()
    if (result?.canceled) return
    window.$message?.success('已导出任务、素材索引和 API 配置')
  } catch (error) {
    window.$message?.error(error?.message || '导出失败')
  } finally {
    dataExporting.value = false
  }
}

const handleImportData = async () => {
  const confirmed = window.confirm('导入会用数据包里的项目、任务历史、模型和 API 配置覆盖当前本机配置。确定继续吗？')
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
  settingsSnapshot = null
  providerDrafts.clear()
  invalidateProviderRequests()
  void backupUserDataNow()
  showModal.value = false
  emit('saved')
}

const handleClear = () => {
  const confirmed = window.confirm(`确定清除 ${currentProviderLabel.value} 的 API Key 与 Base URL 配置吗？`)
  if (!confirmed) return
  modelStore.clearApiConfigByProvider(formData.provider)
  connectionTestResult.value = null
  modelSyncSummary.value = ''
  providerDrafts.delete(formData.provider)
  applyProviderDraft(formData.provider, null)
}

const isDesktop = computed(() => typeof window !== 'undefined' && !!window.desktopApp?.comfy)

const openAssetsFolder = async () => {
  if (window.desktopApp?.comfy?.openFolder) {
    await window.desktopApp.comfy.openFolder('root')
  } else if (window.desktopApp?.getUserDataPath) {
    const path = await window.desktopApp.getUserDataPath()
    window.$message?.info(`YUFENG Agent 素材根目录：${path}`)
  }
}
</script>

<style scoped>
:global(.api-settings-modal.n-card) {
  overflow: hidden;
  max-height: calc(100vh - 28px);
  border: 1px solid #d8dce3;
  border-radius: 14px;
  background: #f5f6f8;
  box-shadow: 0 28px 90px rgba(15, 23, 42, 0.24);
}

:global(.dark .api-settings-modal.n-card) {
  border-color: #2d3036;
  background: #111215;
  box-shadow: 0 32px 100px rgba(0, 0, 0, 0.58);
}

:global(.api-settings-modal .n-card__content) {
  padding: 0;
}

.settings-shell {
  --panel: #ffffff;
  --panel-subtle: #f7f8fa;
  --line: #e3e6eb;
  --text: #202329;
  --muted: #727781;
  --faint: #969ba5;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: min(820px, calc(100vh - 30px));
  color: var(--text);
  background: #f5f6f8;
  font-size: 14px;
}

:global(.dark) .settings-shell {
  --panel: #191a1e;
  --panel-subtle: #15161a;
  --line: #2b2d32;
  --text: #e8e9ec;
  --muted: #8d919a;
  --faint: #646871;
  background: #111215;
}

.settings-header,
.settings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-color: var(--line);
  background: var(--panel);
}

.settings-header {
  min-height: 76px;
  border-bottom: 1px solid var(--line);
  padding: 12px 18px;
}

.settings-heading,
.header-actions,
.panel-heading,
.settings-heading > div,
.status-title,
.status-section-heading,
.advanced-section summary,
.data-tools summary,
.lab-panel summary {
  display: flex;
  align-items: center;
}

.settings-heading {
  gap: 12px;
}

.product-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 10px;
  color: #fff;
  background: #15171b;
  font-size: 15px;
  font-weight: 800;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
}

:global(.dark) .product-mark {
  color: #15171b;
  background: #f0f1f3;
}

.settings-heading > div {
  align-items: baseline;
  flex-wrap: wrap;
  gap: 3px 9px;
}

.settings-heading p,
.panel-heading p,
.status-card > p:first-child {
  width: 100%;
  margin: 0;
  color: #6a7dff;
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.13em;
}

.settings-heading h2,
.panel-heading h3 {
  margin: 0;
  font-size: 18px;
  line-height: 1.25;
}

.settings-heading span:not(.product-mark),
.panel-heading > div > span {
  color: var(--muted);
  font-size: 12px;
}

.header-actions {
  gap: 10px;
}

.connection-pill {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 6px 10px;
  color: var(--muted);
  background: var(--panel-subtle);
  font-size: 11px;
  font-weight: 650;
}

.connection-pill i,
.provider-state,
.large-status-dot,
.coverage-list i {
  display: block;
  border-radius: 999px;
}

.connection-pill i {
  width: 7px;
  height: 7px;
  background: #a0a4ad;
}

.connection-pill.is-ready i,
.provider-state.is-ready,
.large-status-dot.is-ready,
.coverage-list i.is-ready { background: #2fb67c; }
.connection-pill.is-configured i,
.provider-state.is-configured,
.large-status-dot.is-configured { background: #5d77eb; }
.connection-pill.is-testing i,
.large-status-dot.is-testing { background: #dca340; animation: status-pulse 1s ease-in-out infinite; }
.connection-pill.is-error i,
.provider-state.is-error,
.large-status-dot.is-error { background: #df5a62; }
.connection-pill.is-missing i,
.provider-state.is-missing,
.large-status-dot.is-missing,
.coverage-list i.is-missing { background: #a0a4ad; }

@keyframes status-pulse { 50% { opacity: 0.35; } }

.close-button,
.remove-model {
  display: grid;
  place-items: center;
  border: 0;
  color: var(--muted);
  background: transparent;
  cursor: pointer;
}

.close-button {
  width: 31px;
  height: 31px;
  border-radius: 8px;
  font-size: 20px;
}

.close-button:hover,
.remove-model:hover { color: var(--text); background: var(--panel-subtle); }

.settings-grid {
  display: grid;
  grid-template-columns: 210px minmax(420px, 1fr) 254px;
  min-height: 0;
  overflow: hidden;
}

.provider-rail,
.status-rail {
  min-height: 0;
  overflow-y: auto;
  background: var(--panel-subtle);
  scrollbar-width: thin;
}

.provider-rail {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  padding: 16px 12px;
}

.rail-heading {
  padding: 0 6px 11px;
}

.rail-heading > div,
.provider-copy,
.settings-heading > div,
.status-title > div,
.advanced-section summary > span:first-child,
.data-tools summary > span:first-child,
.lab-panel summary > span:first-child {
  min-width: 0;
}

.rail-heading span,
.rail-heading small,
.provider-copy strong,
.provider-copy small,
.advanced-section summary strong,
.advanced-section summary small,
.data-tools summary strong,
.data-tools summary small,
.lab-panel summary strong,
.lab-panel summary small {
  display: block;
}

.rail-heading span {
  font-size: 13px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.rail-heading small,
.provider-copy small {
  margin-top: 2px;
  overflow: hidden;
  color: var(--faint);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-list {
  display: grid;
  gap: 4px;
}

.provider-item {
  display: grid;
  grid-template-columns: 31px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  width: 100%;
  border: 1px solid transparent;
  border-radius: 9px;
  padding: 8px;
  color: var(--text);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.provider-item:hover { background: var(--panel); }
.provider-item.is-active { border-color: var(--line); background: var(--panel); box-shadow: 0 3px 12px rgba(20, 24, 35, 0.05); }
.provider-item:disabled { cursor: default; opacity: 1; }

.provider-avatar,
.model-icon,
.capability-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 8px;
  font-weight: 750;
}

.provider-avatar {
  width: 31px;
  height: 31px;
  color: #4c61c8;
  background: #e7eafd;
  font-size: 10px;
}

:global(.dark) .provider-avatar { color: #b7c1ff; background: #292e49; }
.provider-copy strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
.provider-state { width: 7px; height: 7px; box-shadow: 0 0 0 3px var(--panel-subtle); }

.provider-help {
  margin-top: auto;
  border-top: 1px solid var(--line);
  padding: 14px 6px 2px;
}

.provider-help span { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.provider-help p { margin: 6px 0 9px; color: var(--muted); font-size: 11px; line-height: 1.5; }
.provider-help a { color: #5970db; font-size: 11px; text-decoration: none; }

.settings-main {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 16px;
  scrollbar-width: thin;
}

.settings-panel,
.status-card {
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--panel);
}

.settings-panel + .settings-panel { margin-top: 14px; }
.connection-panel,
.catalog-panel { padding: 16px; }

.panel-heading {
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 15px;
}

.panel-heading > div:first-child { min-width: 0; }
.panel-heading h3 { margin: 2px 0 3px; }
.connection-form :deep(.n-form-item) { margin-bottom: 0; }
.connection-form :deep(.n-form-item-label),
.capability-card :deep(.n-form-item-label) { color: var(--muted); font-size: 12px; font-weight: 650; }

.connection-primary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field-stack {
  display: grid;
  width: 100%;
  gap: 5px;
}

.field-note {
  display: block;
  color: var(--faint);
  font-size: 11px;
}

.compact-alert { margin-top: 12px; }
.compact-alert :deep(.n-alert-body) { padding: 9px 11px; font-size: 12px; }

.advanced-section,
.data-tools,
.lab-panel {
  border-top: 1px solid var(--line);
}

.advanced-section { margin-top: 15px; }
.advanced-section summary,
.data-tools summary,
.lab-panel summary {
  justify-content: space-between;
  gap: 14px;
  padding: 12px 1px;
  list-style: none;
  cursor: pointer;
}

.advanced-section summary::-webkit-details-marker,
.data-tools summary::-webkit-details-marker,
.lab-panel summary::-webkit-details-marker { display: none; }
.advanced-section summary strong,
.data-tools summary strong,
.lab-panel summary strong { font-size: 13px; }
.advanced-section summary small,
.data-tools summary small,
.lab-panel summary small { margin-top: 2px; color: var(--faint); font-size: 11px; font-weight: 400; }
.summary-count { color: var(--faint); font-size: 11px; }

.capability-overrides {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding-bottom: 4px;
}

.capability-card {
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 9px;
  padding: 10px;
  background: var(--panel-subtle);
}

.capability-card header {
  display: grid;
  grid-template-columns: 27px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  margin-bottom: 9px;
}

.capability-card header > div { min-width: 0; }
.capability-card header strong,
.capability-card header small { display: block; }
.capability-card header strong { font-size: 13px; }
.capability-card header small { overflow: hidden; margin-top: 1px; color: var(--faint); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.capability-card :deep(.n-form-item) { margin-bottom: 8px; }
.capability-card :deep(.n-form-item:last-child) { margin-bottom: 0; }

.capability-icon { width: 29px; height: 29px; font-size: 10px; }
.capability-icon.is-chat, .model-icon.is-chat { color: #5065cf; background: #e9ecff; }
.capability-icon.is-image, .model-icon.is-image { color: #937032; background: #fff1cf; }
.capability-icon.is-video, .model-icon.is-video { color: #8c4daa; background: #f5e5ff; }
:global(.dark) .capability-icon.is-chat, :global(.dark) .model-icon.is-chat { color: #b8c2ff; background: #29304e; }
:global(.dark) .capability-icon.is-image, :global(.dark) .model-icon.is-image { color: #f1cf89; background: #3b3120; }
:global(.dark) .capability-icon.is-video, :global(.dark) .model-icon.is-video { color: #dfb2f2; background: #38263f; }

.endpoint-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  padding-bottom: 3px;
}

.endpoint-grid > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  border-radius: 7px;
  padding: 8px 9px;
  background: var(--panel-subtle);
}

.endpoint-grid span { color: var(--muted); font-size: 11px; }
.endpoint-grid code { overflow: hidden; color: var(--text); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }

.catalog-heading { align-items: center; }
.catalog-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
.model-sync-alert { margin: -4px 0 12px; }

.catalog-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  border-radius: 9px;
  padding: 4px;
  background: var(--panel-subtle);
}

.catalog-tabs button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  border-radius: 7px;
  padding: 7px 8px;
  color: var(--muted);
  background: transparent;
  font-size: 13px;
  cursor: pointer;
}

.catalog-tabs button strong { color: var(--faint); font-size: 11px; }
.catalog-tabs button.is-active { color: var(--text); background: var(--panel); box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08); }

.catalog-add-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  margin: 11px 0;
}

.catalog-add-row > :first-child:last-of-type { grid-column: auto; }
.protocol-select { width: 134px; }
.protocol-select.compact { width: 124px; }

.catalog-list {
  max-height: 248px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 9px;
  scrollbar-width: thin;
}

.catalog-row {
  display: grid;
  grid-template-columns: 29px minmax(0, 1fr) auto auto 26px;
  align-items: center;
  gap: 9px;
  min-height: 47px;
  border-bottom: 1px solid var(--line);
  padding: 7px 9px;
}

.catalog-row:last-child { border-bottom: 0; }
.model-icon { width: 31px; height: 31px; font-size: 11px; }
.model-copy { min-width: 0; }
.model-copy strong,
.model-copy code { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-copy strong { font-size: 13px; }
.model-copy code { margin-top: 2px; color: var(--faint); font-size: 11px; }
.select-model { min-width: 38px; height: 25px; border: 1px solid var(--line); border-radius: 6px; padding: 0 7px; color: var(--muted); background: transparent; font-size: 10px; cursor: pointer; }
.select-model:hover { color: var(--text); border-color: var(--accent); background: var(--panel-subtle); }
.select-model.is-selected { border-color: rgba(34, 197, 94, .34); color: #16834a; background: rgba(34, 197, 94, .08); }
.remove-model { width: 25px; height: 25px; border-radius: 6px; font-size: 16px; }

.catalog-empty {
  display: grid;
  justify-items: center;
  border: 1px dashed var(--line);
  border-radius: 9px;
  padding: 24px 14px;
  color: var(--muted);
  text-align: center;
}

.catalog-empty > span { font-size: 22px; }
.catalog-empty strong { margin-top: 4px; color: var(--text); font-size: 13px; }
.catalog-empty p { margin: 4px 0 0; font-size: 11px; }

.lab-panel { padding: 0 16px 14px; }

.status-rail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 1px solid var(--line);
  padding: 16px 12px;
}

.status-card { padding: 13px; }
.status-title { gap: 10px; margin: 10px 0 13px; }
.large-status-dot { width: 12px; height: 12px; box-shadow: 0 0 0 5px var(--panel-subtle); }
.status-title strong,
.status-title small { display: block; }
.status-title strong { font-size: 14px; }
.status-title small { margin-top: 2px; color: var(--faint); font-size: 11px; }
.overview-card dl { display: grid; gap: 1px; margin: 0; }
.overview-card dl > div { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 8px; border-radius: 6px; padding: 6px 7px; }
.overview-card dl > div:nth-child(odd) { background: var(--panel-subtle); }
.overview-card dt { color: var(--muted); font-size: 11px; }
.overview-card dd { overflow: hidden; margin: 0; font-size: 11px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }

.test-result { border-left: 3px solid; }
.test-result.is-success { border-left-color: #2fb67c; }
.test-result.is-error { border-left-color: #df5a62; }
.test-result header { display: flex; align-items: center; gap: 7px; }
.test-result header span { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: var(--panel-subtle); font-size: 10px; }
.test-result header strong { font-size: 13px; }
.test-result p { margin: 8px 0 0; color: var(--muted); font-size: 11px; line-height: 1.5; word-break: break-word; }

.status-section-heading { justify-content: space-between; margin-bottom: 8px; }
.status-section-heading strong { font-size: 13px; }
.status-section-heading span { color: var(--faint); font-size: 11px; }
.coverage-list { display: grid; gap: 5px; }
.coverage-list > div { display: grid; grid-template-columns: 27px minmax(0, 1fr) auto; align-items: center; gap: 8px; border-radius: 7px; padding: 6px; background: var(--panel-subtle); }
.coverage-list > div > div { min-width: 0; }
.coverage-list strong,
.coverage-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.coverage-list strong { font-size: 12px; }
.coverage-list small { margin-top: 1px; color: var(--faint); font-size: 11px; }
.coverage-list i { width: 7px; height: 7px; }

.data-tools { padding-top: 0; }
.data-tools summary { padding-bottom: 2px; }
.backup-copy p { margin: 9px 0 0; color: var(--muted); font-size: 11px; line-height: 1.55; }
.backup-copy .backup-warning { color: #a56a17; }
:global(.dark) .backup-copy .backup-warning { color: #d9ad62; }
.backup-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; margin-top: 10px; }
.backup-actions > :last-child:nth-child(odd) { grid-column: 1 / -1; }

.settings-footer {
  min-height: 62px;
  border-top: 1px solid var(--line);
  padding: 10px 18px;
}

.footer-context { min-width: 0; }
.footer-context span,
.footer-context small { display: block; }
.footer-context span { font-size: 13px; font-weight: 700; }
.footer-context small { margin-top: 3px; color: var(--faint); font-size: 11px; }
.footer-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }

:deep(.n-input),
:deep(.n-base-selection) { border-radius: 7px; }
:deep(.n-button) { border-radius: 7px; }

@media (max-width: 1020px) {
  .settings-grid { grid-template-columns: 190px minmax(0, 1fr); }
  .status-rail {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    max-height: 240px;
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .data-tools { grid-column: span 2; }
}

@media (max-width: 760px) {
  :global(.api-settings-modal.n-card) { max-height: calc(100vh - 12px); border-radius: 10px; }
  .settings-shell { height: calc(100vh - 14px); }
  .settings-header { min-height: 66px; padding: 10px 12px; }
  .settings-heading span:not(.product-mark) { display: none; }
  .connection-pill { display: none; }
  .settings-grid { display: block; overflow-y: auto; }
  .provider-rail { overflow: visible; border-right: 0; border-bottom: 1px solid var(--line); padding: 10px; }
  .rail-heading, .provider-help { display: none; }
  .provider-list { display: flex; overflow-x: auto; }
  .provider-item { min-width: 170px; }
  .settings-main { overflow: visible; padding: 10px; }
  .connection-primary-grid,
  .capability-overrides,
  .endpoint-grid { grid-template-columns: 1fr; }
  .catalog-heading { align-items: flex-start; flex-direction: column; }
  .catalog-actions { justify-content: flex-start; }
  .status-rail { display: grid; grid-template-columns: 1fr; max-height: none; overflow: visible; padding: 10px; }
  .data-tools { grid-column: auto; }
  .settings-footer { align-items: flex-end; padding: 9px 12px; }
  .footer-context small { display: none; }
}

@media (max-width: 520px) {
  .product-mark { width: 32px; height: 32px; flex-basis: 32px; }
  .settings-heading h2 { font-size: 14px; }
  .catalog-add-row { grid-template-columns: minmax(0, 1fr) auto; }
  .catalog-add-row .protocol-select { grid-column: 1 / -1; width: 100%; }
  .catalog-row { grid-template-columns: 29px minmax(0, 1fr) auto 25px; align-items: start; }
  .catalog-row .model-icon { grid-column: 1; grid-row: 1; }
  .catalog-row .model-copy { grid-column: 2; grid-row: 1; }
  .catalog-row .select-model { grid-column: 3; grid-row: 1; }
  .catalog-row .remove-model { grid-column: 4; grid-row: 1; }
  .catalog-row .protocol-select,
  .catalog-row :deep(.n-tag) { grid-column: 2 / 4; grid-row: 2; width: 100%; justify-self: stretch; }
  .catalog-row :deep(.n-tag) { grid-column: 2 / 5; }
  .settings-footer { align-items: stretch; flex-direction: column; }
  .footer-actions { width: 100%; flex-wrap: wrap; }
  .footer-actions .n-button:first-child { margin-right: auto; }
}
</style>

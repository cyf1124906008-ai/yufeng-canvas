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
          <span class="product-mark" aria-hidden="true"><b>DE</b><i></i></span>
          <div>
            <p>DataEyes Code</p>
            <h2>模型服务</h2>
            <span>管理 Provider 连接、凭据和可用模型。</span>
          </div>
        </div>
        <div class="header-actions">
          <span class="connection-pill" :class="`is-${connectionState.tone}`">
            <i aria-hidden="true"></i><span>{{ connectionState.label }}</span>
          </span>
          <button type="button" class="close-button" aria-label="取消并关闭设置" @click="handleCancel">×</button>
        </div>
      </header>

      <div class="settings-grid">
        <aside class="provider-rail" aria-label="Provider 选择">
          <div class="rail-heading">
            <div>
              <span>服务</span>
              <small>{{ visibleProviders.length }} 个可用渠道</small>
            </div>
          </div>

          <div class="provider-list" role="tablist" aria-label="可用 Provider">
            <button
              v-for="provider in visibleProviders"
              :key="provider.value"
              type="button"
              class="provider-item"
              role="tab"
              :class="{ 'is-active': provider.value === formData.provider }"
              :aria-current="provider.value === formData.provider ? 'true' : undefined"
              :aria-selected="provider.value === formData.provider ? 'true' : 'false'"
              :disabled="DISTRIBUTION_CONFIG.api.lockProvider || providerSwitchLocked"
              @click="selectProvider(provider.value)"
            >
              <span class="provider-avatar" aria-hidden="true"><b>{{ providerInitial(provider.label) }}</b><i></i></span>
              <span class="provider-copy">
                <strong>{{ provider.label }}</strong>
                <small>{{ providerHost(provider.value) }}</small>
              </span>
              <span class="provider-state" :class="`is-${providerStatus(provider.value).tone}`" :title="providerStatus(provider.value).label" :aria-label="providerStatus(provider.value).label"></span>
              <span v-if="provider.value === formData.provider" class="provider-active-mark" aria-hidden="true">✓</span>
            </button>
          </div>

          <div class="provider-help">
            <span>凭据存储</span>
            <p>凭据只保存在当前设备。导出备份前，请确认接收方可信。</p>
            <a :href="apiKeyHelpUrl" target="_blank" rel="noopener noreferrer">获取或查看 API Key ↗</a>
          </div>
        </aside>

        <main class="settings-main">
          <section class="settings-panel connection-panel">
            <div class="panel-heading">
              <div>
                <h3>{{ currentProviderLabel }}</h3>
                <span>默认连接会被对话、图片和视频能力继承；需要时可单独覆盖。</span>
              </div>
              <div class="panel-actions">
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
            </div>

            <n-alert v-if="!isConfigured" type="warning" class="compact-alert connection-warning">
              当前 Provider 尚未配置可用凭据，连接测试和模型同步会被阻止。
            </n-alert>

            <n-form :model="formData" label-placement="top" class="connection-form">
              <div class="connection-primary-grid">
                <n-form-item label="服务地址 / Base URL" path="baseUrl">
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

                <n-form-item label="默认凭据 / API Key" path="apiKey">
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
              当前版本已预置服务地址。填写 API Key 后即可测试连接和同步模型目录。
            </n-alert>

            <details class="advanced-section">
              <summary>
                <span><strong>能力覆盖</strong><small>对话 / 图片 / 视频可使用独立地址与凭据</small></span>
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
                <span><strong>接口路由</strong><small>当前 Provider 的只读能力映射</small></span>
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
                <h3>模型目录</h3>
                <span>同步真实目录，或添加 Provider 已确认的模型名；当前模型会用于后续 Agent 任务。</span>
              </div>
              <div class="catalog-actions">
                <n-button size="small" secondary :loading="modelSyncLoading" :disabled="providerSwitchLocked" @click="handleSyncModels">同步目录</n-button>
                <n-button size="small" secondary :loading="dataEyesImportLoading" :disabled="providerSwitchLocked" @click="handleImportDataEyesModels">导入 DataEyes 目录</n-button>
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
              <n-button type="primary" :disabled="!activeNewModel" @click="handleAddActiveModel">加入目录</n-button>
            </div>

            <div v-if="activeCatalogModels.length" class="catalog-list">
              <article v-for="model in activeCatalogModels" :key="model.key" class="catalog-row" :class="{ 'is-current': isActiveModel(model.key), 'is-custom': model.isCustom }">
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
                  :aria-label="isActiveModel(model.key) ? `${model.label} 当前使用中` : `使用 ${model.label}`"
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
              <span>—</span>
              <strong>当前能力还没有模型</strong>
              <p>先同步 Provider 目录，或在上方加入已确认的模型名。</p>
            </div>
          </section>

          <details v-if="showLocalComfyAdvanced" class="settings-panel lab-panel">
            <summary><span><strong>Local ComfyUI Lab</strong><small>实验性本地生成引擎</small></span></summary>
            <ComfyEnginePanel />
          </details>
        </main>

        <aside class="status-rail" aria-label="连接状态摘要">
          <section class="status-card overview-card">
            <p>连接状态</p>
            <div class="status-title">
              <span class="large-status-dot" :class="`is-${connectionState.tone}`"></span>
              <div><strong>{{ connectionState.label }}</strong><small>{{ currentProviderLabel }} · 当前连接</small></div>
            </div>
            <dl>
              <div><dt>服务地址</dt><dd :title="formData.baseUrl || resolvedBaseUrl">{{ shortUrl(formData.baseUrl || resolvedBaseUrl) }}</dd></div>
              <div><dt>凭据覆盖</dt><dd>{{ credentialCount }} / 4</dd></div>
              <div><dt>模型总数</dt><dd>{{ totalModelCount }}</dd></div>
            </dl>
          </section>

          <section v-if="connectionTestResult" class="status-card test-result" :class="connectionTestResult.ok ? 'is-success' : 'is-error'">
            <header><span>{{ connectionTestResult.ok ? '✓' : '!' }}</span><strong>{{ connectionTestResult.ok ? '连接已验证' : '连接失败' }}</strong></header>
            <p v-if="connectionTestResult.ok">已发现 {{ connectionTestResult.modelCount || connectionTestResult.models?.length || 0 }} 个模型，可以同步到当前 Provider。</p>
            <p v-else>{{ connectionTestResult.chineseError || connectionTestResult.error || '服务未返回可用响应。' }}</p>
          </section>

          <section class="status-card coverage-card">
            <div class="status-section-heading"><strong>能力覆盖</strong><span>{{ configuredCapabilityCount }}/3</span></div>
            <div class="coverage-list">
              <div v-for="capability in capabilityRows" :key="capability.id">
                <span class="capability-icon" :class="`is-${capability.id}`">{{ capability.short }}</span>
                <div><strong>{{ capability.label }}</strong><small>{{ capability.hasCredential ? shortUrl(capability.effectiveBaseUrl) : '缺少 Key' }}</small></div>
                <i :class="capability.hasCredential ? 'is-ready' : 'is-missing'"></i>
              </div>
            </div>
          </section>

          <details class="status-card data-tools">
            <summary><span><strong>数据与备份</strong><small>迁移本机配置与任务数据</small></span></summary>
            <div class="backup-copy">
              <p>备份包含项目、Agent 任务记录、本地素材索引、模型与 API 配置。</p>
              <p class="backup-warning">数据包包含 API Key；大体积图片和视频仍需单独备份素材目录。</p>
            </div>
            <div class="backup-actions">
              <n-button size="small" secondary :loading="dataExporting" @click="handleExportData">导出数据</n-button>
              <n-button size="small" secondary :loading="dataImporting" @click="handleImportData">导入数据</n-button>
              <n-button v-if="isDesktop" size="small" secondary @click="openAssetsFolder">打开素材目录</n-button>
            </div>
          </details>

        </aside>
      </div>

      <footer class="settings-footer">
        <div class="footer-context">
          <span><i></i>{{ currentProviderLabel }}</span>
          <small>编辑只在点击“保存设置”后生效；切换 Provider 不会覆盖其他渠道。</small>
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
  if (connectionTesting.value) return { tone: 'testing', label: '测试中' }
  if (connectionTestResult.value?.ok) return { tone: 'ready', label: '连接正常' }
  if (connectionTestResult.value && !connectionTestResult.value.ok) return { tone: 'error', label: '连接失败' }
  if (isConfigured.value) return { tone: 'configured', label: '已配置' }
  return { tone: 'missing', label: '未配置' }
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
    window.$message?.info(`DataEyes Code 素材根目录：${path}`)
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

:global(html.dark .settings-shell) {
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

:global(html.dark .product-mark) {
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

:global(html.dark .provider-avatar) { color: #b7c1ff; background: #292e49; }
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
:global(html.dark .capability-icon.is-chat), :global(html.dark .model-icon.is-chat) { color: #b8c2ff; background: #29304e; }
:global(html.dark .capability-icon.is-image), :global(html.dark .model-icon.is-image) { color: #f1cf89; background: #3b3120; }
:global(html.dark .capability-icon.is-video), :global(html.dark .model-icon.is-video) { color: #dfb2f2; background: #38263f; }

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
:global(html.dark .backup-copy .backup-warning) { color: #d9ad62; }
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

/* Restrained system surface: neutral hierarchy, one DataEyes accent. */
.settings-shell {
  --canvas: #f5f5f7;
  --panel: #ffffff;
  --panel-subtle: #f0f0f2;
  --panel-raised: #ffffff;
  --line: #d8d8dc;
  --line-strong: #c5c5ca;
  --text: #1d1d1f;
  --muted: #6e6e73;
  --faint: #8e8e93;
  --accent: #147d92;
  --accent-strong: #106a7c;
  --accent-soft: rgba(20, 125, 146, .1);
  --blue: #007aff;
  --warning: #9a6700;
  background: var(--canvas);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI Variable", "Microsoft YaHei UI", sans-serif;
}

:global(html.dark .settings-shell) {
  --canvas: #0e0e10;
  --panel: #1c1c1e;
  --panel-subtle: #151517;
  --panel-raised: #242426;
  --line: #38383a;
  --line-strong: #4a4a4e;
  --text: #f5f5f7;
  --muted: #a1a1a6;
  --faint: #8e8e93;
  --accent: #64d2ff;
  --accent-strong: #8addff;
  --accent-soft: rgba(100, 210, 255, .12);
  --blue: #0a84ff;
  --warning: #ffd60a;
}

:global(.api-settings-modal.n-card) {
  border: 1px solid var(--line) !important;
  border-radius: 14px !important;
  background: var(--canvas) !important;
  box-shadow: 0 24px 72px rgba(0, 0, 0, .18) !important;
}

:global(.dark .api-settings-modal.n-card) {
  border-color: #38383a !important;
  background: #0e0e10 !important;
  box-shadow: 0 28px 82px rgba(0, 0, 0, .48) !important;
}

.settings-header,
.settings-footer {
  background: var(--panel) !important;
  border-color: var(--line) !important;
}

.settings-header {
  min-height: 68px;
  padding: 10px 18px;
}

.settings-heading { gap: 13px; }
.settings-heading > div { display: block; }

.product-mark {
  position: relative;
  width: 36px;
  height: 36px;
  flex-basis: 36px;
  overflow: hidden;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  color: var(--text);
  background: var(--panel-raised);
  box-shadow: 0 1px 2px rgba(0, 0, 0, .05);
}

.product-mark b {
  position: relative;
  z-index: 1;
  font: 800 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: -.08em;
}

.product-mark i {
  position: absolute;
  right: 8px;
  bottom: 7px;
  width: 10px;
  height: 2px;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--accent) 48%, transparent);
}

.settings-heading p,
.panel-heading p,
.status-card > p:first-child {
  color: var(--muted) !important;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0;
}

.settings-heading h2 { margin-top: 3px; color: var(--text); font-size: 19px; font-weight: 600; letter-spacing: -.025em; }
.settings-heading span:not(.product-mark) { color: var(--muted); font-size: 12px; }
.header-actions { gap: 12px; }

.connection-pill {
  border-color: var(--line) !important;
  border-radius: 999px;
  padding: 7px 10px;
  color: var(--muted) !important;
  background: var(--panel-subtle) !important;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

.connection-pill i { width: 6px; height: 6px; }
.connection-pill.is-ready,
.connection-pill.is-configured { color: var(--accent-strong) !important; }
.connection-pill.is-ready i { background: var(--accent) !important; box-shadow: 0 0 0 3px var(--accent-soft); }
.connection-pill.is-configured i { background: var(--blue) !important; }
.connection-pill.is-testing i { background: #d7a446 !important; }
.connection-pill.is-error i { background: #db6670 !important; }
.connection-pill.is-missing i { background: var(--faint) !important; }

.close-button {
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--muted);
  font-size: 18px;
}

.close-button:hover { border-color: var(--line); color: var(--text); background: var(--panel-subtle); }

.settings-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--canvas);
}

.provider-rail {
  grid-row: 1;
  display: block;
  min-height: auto;
  overflow: visible;
  border-right: 0 !important;
  border-bottom: 1px solid var(--line);
  padding: 15px 22px 13px;
  background: var(--panel) !important;
}

.rail-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  padding: 0 0 10px;
}

.rail-heading span { color: var(--text); font-size: 13px; font-weight: 600; line-height: 1.2; letter-spacing: -.01em; }
.rail-heading small { margin-top: 4px; color: var(--muted); font-size: 11px; }
.rail-meta { color: var(--faint) !important; font-size: 10px !important; letter-spacing: .12em !important; }

.provider-list {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 1px 1px 3px;
  scrollbar-width: thin;
}

.provider-item {
  position: relative;
  display: grid;
  grid-template-columns: 32px minmax(130px, 1fr) auto;
  align-items: center;
  flex: 0 0 208px;
  gap: 9px;
  min-height: 56px;
  border: 1px solid var(--line) !important;
  border-radius: 9px;
  padding: 8px 10px;
  color: var(--text) !important;
  background: var(--panel-subtle) !important;
  box-shadow: none !important;
  text-align: left;
  transition: border-color 150ms ease, background-color 150ms ease;
}

.provider-item:hover { border-color: var(--line-strong) !important; background: var(--panel-raised) !important; }
.provider-item.is-active { border-color: var(--line-strong) !important; background: var(--panel-raised) !important; box-shadow: inset 2px 0 0 var(--accent) !important; }
.provider-item:disabled { cursor: default; opacity: .72; }
.provider-item.is-active:disabled { opacity: 1; }

.provider-avatar {
  position: relative;
  width: 32px;
  height: 32px;
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  color: var(--accent-strong);
  background: var(--panel-raised);
  font: 800 11px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.provider-avatar i {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
}

.provider-copy strong { color: var(--text); font-size: 12px; }
.provider-copy small { color: var(--muted); font-size: 11px; }
.provider-state { width: 7px; height: 7px; box-shadow: 0 0 0 3px var(--panel-subtle); }
.provider-item.is-active .provider-state { box-shadow: 0 0 0 3px var(--accent-soft); }

.provider-active-mark {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 10px;
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border-radius: 50%;
  pointer-events: none;
  color: #fff;
  background: var(--accent);
  font-size: 11px;
  font-weight: 700;
}

.provider-help {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  margin-top: 11px;
  border-top: 1px solid var(--line);
  padding: 10px 1px 0;
}

.provider-help span { color: var(--text); font-size: 11px; font-weight: 600; line-height: 1.2; }
.provider-help p { margin: 0; color: var(--muted); font-size: 11px; line-height: 1.45; }
.provider-help a { color: var(--accent-strong); font-size: 11px; text-decoration: none; }
.provider-help a:hover { text-decoration: underline; }

.status-rail {
  grid-row: 2;
  display: grid;
  grid-template-columns: minmax(230px, 1fr) minmax(250px, 1.1fr) minmax(290px, 1.35fr);
  align-items: stretch;
  gap: 10px;
  min-height: auto;
  overflow: visible;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  border-left: 0 !important;
  padding: 12px 22px;
  background: var(--panel-subtle) !important;
}

.status-card {
  min-width: 0;
  border: 1px solid var(--line) !important;
  border-radius: 10px;
  padding: 11px 12px;
  background: var(--panel) !important;
  box-shadow: none !important;
}

.status-title { gap: 10px; margin: 9px 0 10px; }
.large-status-dot { width: 10px; height: 10px; box-shadow: 0 0 0 4px var(--accent-soft); }
.status-title strong { color: var(--text); font-size: 13px; }
.status-title small { color: var(--muted); font-size: 11px; }
.overview-card dl > div { padding: 5px 6px; background: transparent !important; }
.overview-card dl > div + div { border-top: 1px solid var(--line); }
.overview-card dt { color: var(--muted); font-size: 11px; }
.overview-card dd { color: var(--text); font: 600 11px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.test-result { border-left: 2px solid var(--accent) !important; }
.test-result.is-error { border-left-color: #db6670 !important; }
.test-result header strong { color: var(--text); font-size: 12px; }
.test-result p { margin-top: 7px; color: var(--muted); font-size: 11px; }
.status-section-heading { margin-bottom: 7px; }
.status-section-heading strong { color: var(--text); font-size: 12px; }
.status-section-heading span { color: var(--accent-strong); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.coverage-list { gap: 4px; }
.coverage-list > div { padding: 5px 6px; background: var(--panel-subtle); }
.coverage-list strong { color: var(--text); font-size: 11px; }
.coverage-list small { color: var(--muted); font-size: 11px; }
.data-tools { grid-column: 1 / -1; padding: 0 13px; }
.data-tools summary { padding: 9px 0 6px; }
.backup-copy p { color: var(--muted); font-size: 11px; }
.backup-copy .backup-warning { color: var(--warning); }
.backup-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; margin: 9px 0 11px; }
.status-rail > .compact-alert { grid-column: 1 / -1; margin: 0; }

.settings-main {
  grid-row: 3;
  min-width: 0;
  min-height: auto;
  overflow: visible;
  padding: 18px 22px 22px;
  background: var(--canvas);
}

.settings-panel {
  border: 1px solid var(--line) !important;
  border-radius: 14px;
  background: var(--panel) !important;
  box-shadow: 0 1px 2px rgba(0, 0, 0, .035), 0 8px 22px rgba(0, 0, 0, .025) !important;
}

.connection-panel,
.catalog-panel { padding: 20px; }
.settings-panel + .settings-panel { margin-top: 12px; }
.panel-heading { margin-bottom: 16px; }
.panel-heading h3 { margin: 0; color: var(--text); font-size: 18px; font-weight: 600; letter-spacing: -.02em; }
.panel-heading > div > span { display: block; margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.5; }
.panel-actions { display: flex; align-items: center; gap: 10px; }
.panel-meta { color: var(--faint); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .1em; }

.connection-form :deep(.n-form-item-label),
.capability-card :deep(.n-form-item-label) { color: var(--muted) !important; font-size: 11px; font-weight: 700; }
.field-note { color: var(--faint); font-size: 11px; }
.compact-alert { border-radius: 9px !important; }
.compact-alert :deep(.n-alert-body) { padding: 9px 11px; color: var(--text); font-size: 11px; }
.connection-warning { margin: -3px 0 14px; }

.advanced-section,
.data-tools,
.lab-panel { border-top-color: var(--line); }
.advanced-section summary,
.data-tools summary,
.lab-panel summary { position: relative; padding: 13px 22px 13px 1px; color: var(--text); }
.advanced-section summary::after,
.data-tools summary::after,
.lab-panel summary::after {
  content: '+';
  position: absolute;
  right: 3px;
  color: var(--muted);
  font: 400 16px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  transition: transform 160ms ease, color 160ms ease;
}
.advanced-section[open] summary::after,
.data-tools[open] summary::after,
.lab-panel[open] summary::after { color: var(--accent); transform: rotate(45deg); }
.advanced-section summary strong,
.data-tools summary strong,
.lab-panel summary strong { color: var(--text); font-size: 12px; }
.advanced-section summary small,
.data-tools summary small,
.lab-panel summary small { color: var(--muted); font-size: 11px; }
.summary-count { color: var(--accent-strong); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.capability-overrides { gap: 10px; }
.capability-card { border-color: var(--line); border-radius: 10px; background: var(--panel-subtle); }
.capability-card header { margin-bottom: 10px; }
.capability-card header strong { color: var(--text); font-size: 12px; }
.capability-card header small { color: var(--muted); font-size: 11px; }
.capability-icon { border: 1px solid transparent; }
.endpoint-grid > div { border: 1px solid var(--line); background: var(--panel-subtle); }
.endpoint-grid span { color: var(--muted); }
.endpoint-grid code { color: var(--text); font: 600 10px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.catalog-heading { align-items: flex-start; }
.catalog-actions { gap: 8px; }
.catalog-tabs { gap: 0; border-bottom: 1px solid var(--line); border-radius: 0; padding: 0; background: transparent; }
.catalog-tabs button {
  position: relative;
  justify-content: space-between;
  border-radius: 0;
  padding: 10px 12px;
  color: var(--muted);
  font-size: 12px;
  transition: color 160ms ease, background-color 160ms ease;
}
.catalog-tabs button::after { content: ''; position: absolute; right: 12px; bottom: -1px; left: 12px; height: 2px; background: transparent; transform: scaleX(.2); transition: background-color 160ms ease, transform 160ms ease; }
.catalog-tabs button:hover { color: var(--text); background: var(--panel-subtle); }
.catalog-tabs button.is-active { color: var(--text); background: transparent; box-shadow: none; }
.catalog-tabs button.is-active::after { background: var(--accent); transform: scaleX(1); }
.catalog-tabs button strong { color: var(--faint); font: 700 10px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.catalog-tabs button.is-active strong { color: var(--accent-strong); }

.catalog-add-row { grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; margin: 13px 0; }
.catalog-add-row > .protocol-select,
.catalog-add-row > .n-button { grid-column: auto; }
.protocol-select { width: 138px; }
.catalog-list { border-color: var(--line); border-radius: 10px; background: var(--panel-subtle); }
.catalog-row { min-height: 58px; border-bottom-color: var(--line); transition: background-color 160ms ease, border-color 160ms ease, transform 160ms ease; }
.catalog-row:hover { background: var(--panel-raised); }
.catalog-row.is-current { border-color: color-mix(in srgb, var(--accent) 62%, var(--line)); background: var(--accent-soft); box-shadow: inset 3px 0 0 var(--accent); }
.model-icon { border: 1px solid var(--line); }
.model-copy strong { color: var(--text); font-size: 12px; }
.model-copy code { color: var(--muted); font: 500 10px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.select-model { display: inline-flex; align-items: center; justify-content: center; min-width: 54px; width: max-content; height: 28px; white-space: nowrap; border-color: var(--line-strong); border-radius: 7px; color: var(--muted); font-size: 11px; font-weight: 600; line-height: 1; transition: color 150ms ease, background-color 150ms ease, border-color 150ms ease; }
.select-model:hover { border-color: var(--accent); color: var(--accent-strong); background: var(--accent-soft); }
.select-model.is-selected { border-color: var(--accent) !important; color: var(--accent-strong) !important; background: var(--accent-soft) !important; box-shadow: none; }
.remove-model { width: 27px; height: 27px; border: 1px solid transparent; border-radius: 7px; }
.remove-model:hover { border-color: #db6670; color: #db6670; background: rgba(219, 102, 112, .08); }
.catalog-empty { border-color: var(--line-strong); border-radius: 10px; padding: 26px 14px; background: var(--panel-subtle); }
.catalog-empty > span { color: var(--accent); font: 400 25px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.catalog-empty strong { color: var(--text); font-size: 12px; }
.catalog-empty p { color: var(--muted); font-size: 11px; }

.settings-footer { min-height: 60px; padding: 9px 18px; }
.footer-context span { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12px; }
.footer-context span i { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.footer-context small { color: var(--muted); font-size: 11px; }
.footer-actions { gap: 8px; }

.settings-shell :deep(.n-input),
.settings-shell :deep(.n-base-selection) {
  border-radius: 9px;
  --n-border: var(--line) !important;
  --n-border-hover: var(--line-strong) !important;
  --n-border-focus: var(--accent) !important;
  --n-color: var(--panel-raised) !important;
  --n-color-focus: var(--panel-raised) !important;
  --n-text-color: var(--text) !important;
  --n-placeholder-color: var(--faint) !important;
  --n-caret-color: var(--accent) !important;
}
.settings-shell :deep(.n-input:focus-within),
.settings-shell :deep(.n-base-selection:focus-within) { box-shadow: 0 0 0 3px var(--accent-soft); }
.settings-shell :deep(.n-button) { border-radius: 8px; }

.provider-item:focus-visible,
.catalog-tabs button:focus-visible,
.select-model:focus-visible,
.remove-model:focus-visible,
.close-button:focus-visible,
.advanced-section summary:focus-visible,
.data-tools summary:focus-visible,
.lab-panel summary:focus-visible,
.provider-help a:focus-visible {
  outline: 2px solid var(--accent) !important;
  outline-offset: 2px;
}

@media (max-width: 1020px) {
  .status-rail { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .data-tools { grid-column: 1 / -1; }
}

@media (max-width: 760px) {
  .settings-header { min-height: 72px; padding: 12px 14px; }
  .settings-heading h2 { font-size: 17px; }
  .settings-grid { display: grid; grid-template-rows: auto auto minmax(0, 1fr); overflow-y: auto; }
  .provider-rail { padding: 13px 14px 11px; }
  .provider-item { flex-basis: 188px; }
  .provider-help { grid-template-columns: 1fr auto; }
  .provider-help p { display: none; }
  .status-rail { grid-template-columns: 1fr; padding: 10px 14px; }
  .status-rail > .compact-alert { grid-column: auto; }
  .settings-main { padding: 14px; }
  .connection-panel, .catalog-panel { padding: 16px; }
  .panel-heading, .catalog-heading { align-items: flex-start; flex-direction: column; }
  .panel-actions, .catalog-actions { width: 100%; justify-content: space-between; }
  .catalog-actions { justify-content: flex-start; }
  .catalog-add-row { grid-template-columns: minmax(0, 1fr) auto; }
  .catalog-add-row > .protocol-select { grid-column: 1 / -1; width: 100%; }
  .catalog-add-row > .n-button { grid-column: 2; }
}

@media (max-width: 520px) {
  .product-mark { width: 36px; height: 36px; flex-basis: 36px; border-radius: 10px; }
  .settings-heading h2 { font-size: 15px; }
  .header-actions .connection-pill { display: none; }
  .rail-heading { align-items: flex-start; flex-direction: column; gap: 5px; }
  .rail-meta { display: none; }
  .provider-help { grid-template-columns: 1fr; }
  .provider-help a { justify-self: start; }
  .settings-footer { align-items: stretch; flex-direction: column; gap: 10px; }
  .footer-actions { width: 100%; }
  .footer-actions :deep(.n-button) { flex: 1 1 auto; }
  .footer-actions :deep(.n-button:first-child) { flex: 0 0 auto; margin-right: auto; }
  .catalog-add-row { grid-template-columns: minmax(0, 1fr); }
  .catalog-add-row > .n-button { grid-column: 1 / -1; width: 100%; }
  .catalog-add-row > .protocol-select { grid-column: 1 / -1; }
  .catalog-row { grid-template-columns: 29px minmax(0, 1fr) auto 25px; align-items: start; }
  .catalog-row .model-icon { grid-column: 1; grid-row: 1; }
  .catalog-row .model-copy { grid-column: 2; grid-row: 1; }
  .catalog-row .select-model { grid-column: 3; grid-row: 1; }
  .catalog-row .remove-model { grid-column: 4; grid-row: 1; }
  .catalog-row .protocol-select,
  .catalog-row :deep(.n-tag) { grid-column: 2 / 5; grid-row: 2; width: 100%; justify-self: stretch; }
}

@media (prefers-reduced-motion: reduce) {
  .settings-shell *,
  .settings-shell *::before,
  .settings-shell *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
  }
}

/* Desktop: two calm rails. Status becomes a compact summary above content. */
@media (min-width: 1021px) {
  .settings-grid {
    grid-template-columns: 204px minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
  }

  .provider-rail {
    grid-column: 1;
    grid-row: 1 / 3;
    display: flex;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--line) !important;
    border-bottom: 0;
    padding: 18px 12px;
    background: var(--panel-subtle) !important;
  }

  .rail-heading {
    display: block;
    padding: 0 6px 11px;
  }

  .rail-meta { display: none; }

  .provider-list {
    display: grid;
    overflow: visible;
    padding: 0;
  }

  .provider-item {
    flex: initial;
    width: 100%;
    min-height: 54px;
    grid-template-columns: 31px minmax(0, 1fr) 7px;
  }

  .provider-help {
    display: block;
    grid-template-columns: none;
  }

  .provider-help p { margin: 8px 0; }

  .settings-main {
    grid-column: 2;
    grid-row: 2;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px 22px;
  }

  .status-rail {
    grid-column: 2;
    grid-row: 1;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    min-height: auto;
    max-height: 220px;
    overflow-y: auto;
    border-top: 0;
    border-right: 0;
    border-bottom: 1px solid var(--line);
    border-left: 0 !important;
    padding: 12px 20px;
    background: var(--canvas) !important;
  }

  .status-card { min-height: auto; }
  .data-tools { grid-column: auto; }
  .status-rail > .compact-alert { grid-column: 1 / -1; }
}
</style>

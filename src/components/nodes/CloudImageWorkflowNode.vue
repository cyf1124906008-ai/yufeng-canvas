<template>
  <div class="cloud-workflow-node" :class="{ selected: isSelected }" @mouseenter="showToolbar = true" @mouseleave="showToolbar = false">
    <div class="node-card">
      <!-- Handles -->
      <span class="node-port-label node-port-label-in">Prompt / 参考图</span>
      <Handle type="target" :position="Position.Left" id="left" class="!bg-emerald-400" />

      <!-- Header -->
      <div class="flex items-center justify-between gap-2 px-1">
        <div class="flex items-center gap-1.5 min-w-0">
          <span class="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500/20 text-[9px] font-bold text-emerald-300">P</span>
          <input v-if="isEditingLabel" ref="labelInputRef" v-model="editingLabelValue" class="node-label-input" @blur="finishEditLabel" @keydown.enter="finishEditLabel" />
          <b v-else class="truncate text-xs cursor-pointer" @dblclick="startEditLabel">{{ data.label || '云端专业工作流' }}</b>
        </div>
        <div v-if="showToolbar" class="flex shrink-0 items-center gap-1">
          <button class="node-action text-red-400" @click="handleDelete"><n-icon :size="12"><TrashOutline /></n-icon></button>
        </div>
      </div>

      <!-- Model selector -->
      <div class="mt-1.5">
        <div class="flex items-center gap-1">
          <select v-model="localModel" class="w-full p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded">
            <option value="">选择图片模型</option>
            <option v-for="m in imageModelOptions" :key="m.key" :value="m.key">{{ m.label }}</option>
          </select>
          <button v-if="!isConfigured" class="shrink-0 text-[10px] text-amber-400 whitespace-nowrap" @click="openApiSettings">配置</button>
        </div>
        <p v-if="modelCapabilityConflict" class="text-[10px] text-amber-400 mt-0.5">{{ capabilityConflictMessage }}</p>
      </div>

      <!-- Prompt -->
      <div class="mt-1.5">
        <span class="text-[10px] text-[var(--text-secondary)]">Prompt（画面需求）</span>
        <textarea v-model="localPrompt" rows="2" class="w-full mt-0.5 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded resize-none" placeholder="描述你想生成的画面..." />
        <p v-if="connectedPromptCount > 0" class="text-[10px] text-cyan-400 mt-0.5">已连接 {{ connectedPromptCount }} 个文本节点</p>
        <p v-if="connectedRefImageCount > 0" class="text-[10px] text-cyan-400 mt-0.5">已连接 {{ connectedRefImageCount }} 张参考图</p>
      </div>

      <!-- Negative Prompt -->
      <div class="mt-1.5">
        <span class="text-[10px] text-[var(--text-secondary)]">Negative Prompt（不想要的内容）</span>
        <input v-model="localNegPrompt" class="w-full mt-0.5 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded" placeholder="如：低清晰度、畸形、文字水印" />
      </div>

      <!-- Size & Seed row -->
      <div class="mt-1.5 grid grid-cols-2 gap-1">
        <div>
          <span class="text-[10px] text-[var(--text-secondary)]">尺寸</span>
          <select v-model="localSize" class="w-full mt-0.5 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded">
            <option v-for="s in imageSizeOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>
        <div>
          <span class="text-[10px] text-[var(--text-secondary)]">Seed（随机种子）</span>
          <input v-model="localSeed" type="text" class="w-full mt-0.5 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded" placeholder="随机" />
        </div>
      </div>

      <!-- Professional params toggle -->
      <button class="pro-toggle" type="button" @click="showProParams = !showProParams">
        <span class="inline-flex items-center gap-1">
          <n-icon :size="11"><component :is="showProParams ? ChevronDownOutline : ChevronForwardOutline" /></n-icon>
          专业参数（ComfyUI 风格）
        </span>
        <span class="pro-toggle-hint">小白可保持默认</span>
      </button>

      <div v-if="showProParams" class="pro-panel nodrag nopan">
        <div class="pro-param-row">
          <div class="pro-param-copy">
            <span class="pro-param-label">Steps（生成步数）</span>
            <span class="pro-param-hint">越高越慢，细节越丰富</span>
          </div>
          <input
            v-model="localStepsInput"
            type="text"
            inputmode="numeric"
            class="pro-param-input nodrag nopan"
            @wheel.prevent
            @blur="commitProNumber('steps')"
            @keydown.enter.prevent="commitProNumber('steps')"
          />
        </div>

        <div class="pro-param-row">
          <div class="pro-param-copy">
            <span class="pro-param-label">CFG Scale（提示词服从度）</span>
            <span class="pro-param-hint">越高越贴近提示词</span>
          </div>
          <input
            v-model="localCfgInput"
            type="text"
            inputmode="decimal"
            class="pro-param-input nodrag nopan"
            @wheel.prevent
            @blur="commitProNumber('cfg')"
            @keydown.enter.prevent="commitProNumber('cfg')"
          />
        </div>

        <div class="pro-param-row">
          <div class="pro-param-copy">
            <span class="pro-param-label">Sampler（采样方式）</span>
            <span class="pro-param-hint">影响画面风格和稳定性</span>
          </div>
          <select v-model="localSampler" class="pro-param-input nodrag nopan">
            <option v-for="s in SAMPLER_OPTIONS" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="pro-param-row">
          <div class="pro-param-copy">
            <span class="pro-param-label">Scheduler（采样调度）</span>
            <span class="pro-param-hint">影响细节收敛</span>
          </div>
          <select v-model="localScheduler" class="pro-param-input nodrag nopan">
            <option v-for="s in SCHEDULER_OPTIONS" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="pro-param-row">
          <div class="pro-param-copy">
            <span class="pro-param-label">Denoise（重绘强度）</span>
            <span class="pro-param-hint">图生图时降低可保留原图细节</span>
          </div>
          <input
            v-model="localDenoiseInput"
            type="text"
            inputmode="decimal"
            class="pro-param-input nodrag nopan"
            @wheel.prevent
            @blur="commitProNumber('denoise')"
            @keydown.enter.prevent="commitProNumber('denoise')"
          />
        </div>

        <div class="pro-param-notice">
          LoRA / ControlNet / 局部重绘 / 高清放大：当前会按云端模型能力自动适配；不支持的参数会安全忽略，不影响基础生成。
        </div>
      </div>

      <!-- Status -->
      <div v-if="data.error" class="mt-1.5 text-[10px] text-red-400 px-1 break-all">{{ data.error }}</div>

      <!-- Generate button -->
      <button
        type="button"
        class="mt-2 w-full py-1.5 text-xs rounded font-medium transition-colors"
        :class="data.status === 'running' ? 'bg-yellow-600/20 text-yellow-400 cursor-wait' : 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'"
        :disabled="data.status === 'running'"
        @click="handleGenerate"
      >
        {{ data.status === 'running' ? `生成中 ${elapsedText}` : '云端生成' }}
      </button>

      <!-- Output handle -->
      <NodeHandleMenu :nodeId="id" nodeType="cloudImageWorkflow" output-label="图片结果" :visible="showHandleMenu" :operations="operations" @select="handleSelect" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import { NIcon } from 'naive-ui'
import { TrashOutline, ChevronDownOutline, ChevronForwardOutline, VideocamOutline } from '@vicons/ionicons5'
import NodeHandleMenu from './NodeHandleMenu.vue'
import { updateNode, addNode, addEdge, nodes, edges, removeNode, currentProjectId } from '../../stores/canvas'
import { projects, updateProject } from '../../stores/projects'
import { useModelStore } from '../../stores/pinia'
import { useImageGeneration } from '../../hooks/useApi'
import { registerTask, updateTask, getTaskByNodeId, removeTask } from '../../stores/tasks'
import { ipcGetPendingResult } from '../../integrations/imageGeneration/client'
import { saveAsset } from '../../integrations/comfy/api'
import { getCapabilityLabel, getModelCapabilityConflict } from '../../utils/modelCapability'

const SAMPLER_OPTIONS = ['euler', 'euler_a', 'dpmpp_2m', 'dpmpp_2m_sde', 'dpmpp_3m_sde', 'ddim', 'uni_pc']
const SCHEDULER_OPTIONS = ['normal', 'karras', 'exponential']

const props = defineProps({ id: String, data: Object })
const { updateNodeInternals } = useVueFlow()
const modelStore = useModelStore()
const { generate } = useImageGeneration()

const showToolbar = ref(false)
const showProParams = ref(false)
const showHandleMenu = ref(false)
const isEditingLabel = ref(false)
const editingLabelValue = ref('')
const labelInputRef = ref(null)
const elapsedText = ref('')
let elapsedTimer = null
let recoveryTimer = null

const localPrompt = ref(props.data.prompt ?? '')
const localNegPrompt = ref(props.data.negativePrompt ?? '')
const localModel = ref(props.data.model ?? '')
const localSize = ref(props.data.size ?? '1024x1024')
const localSeed = ref(props.data.seed ?? '')
const localSteps = ref(props.data.steps ?? 20)
const localCfg = ref(props.data.cfg ?? 7)
const localSampler = ref(props.data.sampler ?? 'euler')
const localScheduler = ref(props.data.scheduler ?? 'normal')
const localDenoise = ref(props.data.denoise ?? 1.0)
const localStepsInput = ref(String(localSteps.value))
const localCfgInput = ref(String(localCfg.value))
const localDenoiseInput = ref(String(localDenoise.value))
const createdImageNodeId = ref(null)

const imageModelOptions = computed(() => modelStore.imageModelOptions)
const isConfigured = computed(() => !!modelStore.currentImageApiKey)
const isSelected = computed(() => false)
const imageSizeOptions = ['1024x1024', '1024x1792', '1792x1024', '512x512', '768x1344', '1344x768', '1920x1080', '1080x1920', '1440x2560', '2560x1440', '2048x2048']

const modelCapabilityConflict = computed(() => {
  if (!localModel.value) return null
  return getModelCapabilityConflict(localModel.value, 'image')
})

const capabilityConflictMessage = computed(() => {
  if (!modelCapabilityConflict.value) return ''
  return `当前选择的是${getCapabilityLabel(modelCapabilityConflict.value)}模型，请选择图片模型`
})

const connectedPromptCount = computed(() => {
  const incoming = edges.value.filter(e => e.target === props.id)
  return incoming.filter(e => {
    const src = nodes.value.find(n => n.id === e.source)
    return src && (src.type === 'text' || src.type === 'llmConfig')
  }).length
})

const connectedRefImageCount = computed(() => {
  const incoming = edges.value.filter(e => e.target === props.id)
  return incoming.filter(e => {
    const src = nodes.value.find(n => n.id === e.source)
    return src && src.type === 'image'
  }).length
})

const emitUpdate = (key, value) => {
  updateNode(props.id, { [key]: value, updatedAt: Date.now() })
}

function clampProNumber(raw, { min, max, step = 1, fallback, integer = false }) {
  const parsed = Number(String(raw).trim())
  if (!Number.isFinite(parsed)) return fallback
  const clamped = Math.min(max, Math.max(min, parsed))
  if (integer) return Math.round(clamped)
  const stepped = Math.round(clamped / step) * step
  return Number(stepped.toFixed(3))
}

function commitProNumber(key) {
  if (key === 'steps') {
    const next = clampProNumber(localStepsInput.value, { min: 1, max: 150, fallback: localSteps.value, integer: true })
    localSteps.value = next
    localStepsInput.value = String(next)
    emitUpdate('steps', next)
    return
  }
  if (key === 'cfg') {
    const next = clampProNumber(localCfgInput.value, { min: 1, max: 30, step: 0.5, fallback: localCfg.value })
    localCfg.value = next
    localCfgInput.value = String(next)
    emitUpdate('cfg', next)
    return
  }
  if (key === 'denoise') {
    const next = clampProNumber(localDenoiseInput.value, { min: 0, max: 1, step: 0.05, fallback: localDenoise.value })
    localDenoise.value = next
    localDenoiseInput.value = String(next)
    emitUpdate('denoise', next)
  }
}

// --- Drama shot status writeback ---
function writebackDramaShot(patch) {
  const shotId = props.data?.dramaShotId
  const role = props.data?.dramaRole
  if (!shotId || role !== 'firstFrame') return
  const projectId = currentProjectId.value
  if (!projectId) return
  const project = projects.value.find(p => p.id === projectId)
  if (!project?.drama?.shots) return
  const shot = project.drama.shots.find(s => s.id === shotId)
  if (!shot) return
  Object.assign(shot, patch, { updatedAt: Date.now() })
  // Sync DramaShotNode visual status
  if (shot.nodeIds?.text) {
    updateNode(shot.nodeIds.text, {
      firstFrameStatus: patch.firstFrameStatus || shot.firstFrameStatus,
      firstFrameNodeId: shot.firstFrameNodeId || patch.firstFrameNodeId,
      status: patch.status || shot.status
    })
  }
  updateProject(project.id, { drama: { ...project.drama } })
}

watch(localPrompt, v => emitUpdate('prompt', v))
watch(localNegPrompt, v => emitUpdate('negativePrompt', v))
watch(localModel, v => emitUpdate('model', v))
watch(localSize, v => emitUpdate('size', v))
watch(localSeed, v => emitUpdate('seed', v))
watch(localSampler, v => emitUpdate('sampler', v))
watch(localScheduler, v => emitUpdate('scheduler', v))

const operations = [
  { type: 'image', label: '输出到图片节点' },
  { type: 'videoConfig', label: '生视频', icon: VideocamOutline }
]

const handleSelect = (item) => {
  const currentNode = nodes.value.find(n => n.id === props.id)
  const nodeX = currentNode?.position?.x || 0
  const nodeY = currentNode?.position?.y || 0

  if (item.type === 'image') {
    const imageNodeId = addNode('image', { x: nodeX + 400, y: nodeY }, { label: '图片结果', url: '' })
    addEdge({ source: props.id, target: imageNodeId, sourceHandle: 'right', targetHandle: 'left' })
    setTimeout(() => updateNodeInternals(imageNodeId), 50)
  } else if (item.type === 'videoConfig') {
    const videoConfigId = addNode('videoConfig', { x: nodeX + 400, y: nodeY }, { label: '图生视频', prompt: '自然镜头运动', ratio: '16:9', duration: 5 })
    addEdge({ source: props.id, target: videoConfigId, sourceHandle: 'right', targetHandle: 'left', type: 'imageRole', data: { imageRole: 'first_frame_image' } })
    setTimeout(() => updateNodeInternals(videoConfigId), 50)
    window.$message?.success('已创建图生视频节点')
  }
}

function startEditLabel() {
  editingLabelValue.value = props.data.label || ''
  isEditingLabel.value = true
  setTimeout(() => labelInputRef.value?.focus(), 20)
}

function finishEditLabel() {
  isEditingLabel.value = false
  if (editingLabelValue.value.trim()) emitUpdate('label', editingLabelValue.value.trim())
}

function handleDelete() {
  if (elapsedTimer) clearInterval(elapsedTimer)
  if (recoveryTimer) clearInterval(recoveryTimer)
  removeNode(props.id)
}

function openApiSettings() {
  updateNode(props.id, { _openApiSettings: true, updatedAt: Date.now() })
  window.dispatchEvent(new CustomEvent('yufeng:open-api-settings'))
}

function startElapsed() {
  const start = Date.now()
  elapsedTimer = setInterval(() => {
    const sec = Math.floor((Date.now() - start) / 1000)
    elapsedText.value = sec > 60 ? `${Math.floor(sec / 60)}m${sec % 60}s` : `${sec}s`
  }, 1000)
}

function stopElapsed() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  elapsedText.value = ''
}

function getEffectivePrompt() {
  const incoming = edges.value.filter(e => e.target === props.id)
  const prompts = []
  for (const edge of incoming) {
    const src = nodes.value.find(n => n.id === edge.source)
    if (!src) continue
    if (src.type === 'text') {
      const order = edge.data?.promptOrder || prompts.length + 1
      prompts.push({ order, content: src.data?.content || '' })
    } else if (src.type === 'llmConfig') {
      const order = edge.data?.promptOrder || prompts.length + 1
      prompts.push({ order, content: src.data?.systemPrompt || src.data?.outputFormat || '' })
    }
  }
  prompts.sort((a, b) => a.order - b.order)
  const connectedText = prompts.map(p => p.content).filter(Boolean).join('\n')
  return connectedText || localPrompt.value
}

function getRefImages() {
  const incoming = edges.value.filter(e => e.target === props.id)
  const images = []
  for (const edge of incoming) {
    const src = nodes.value.find(n => n.id === edge.source)
    if (src?.type === 'image') {
      const img = src.data?.base64 || src.data?.url
      if (img) images.push(img)
    }
  }
  return images
}

function extractImageUrl(rawData) {
  const visit = (value) => {
    if (!value) return null
    if (typeof value === 'string') {
      const mdMatch = value.match(/!\[[^\]]*]\(([^)]+)\)/)
      if (mdMatch) return mdMatch[1]
      const htmlMatch = value.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (htmlMatch) return htmlMatch[1]
      const dataMatch = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/)
      if (dataMatch) return dataMatch[0]
      return null
    }
    if (Array.isArray(value)) {
      for (const item of value) { const r = visit(item); if (r) return r }
      return null
    }
    if (typeof value === 'object') {
      if (value.image_url?.url) return value.image_url.url
      if (value.url) return value.url
      if (value.b64_json) return `data:image/png;base64,${value.b64_json}`
      if (value.text) { const r = visit(value.text); if (r) return r }
      if (value.content) { const r = visit(value.content); if (r) return r }
      if (value.data) { const r = visit(value.data); if (r) return r }
      if (value.choices) { const r = visit(value.choices); if (r) return r }
      if (value.message) { const r = visit(value.message); if (r) return r }
    }
    return null
  }
  return visit(rawData)
}

async function applyRecoveredResult(outputId, rawData) {
  const imageUrl = extractImageUrl(rawData)
  if (!imageUrl || !outputId) return

  const imageData = { loading: false, error: '', label: '图片结果', updatedAt: Date.now(), finishedAt: Date.now() }

  if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
    try {
      const projectId = currentProjectId.value || 'canvas-default'
      const resp = await fetch(imageUrl)
      const blob = await resp.blob()
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      const asset = await saveAsset(dataUrl, projectId)
      if (asset?.assetPath) { imageData.assetPath = asset.assetPath; imageData.url = dataUrl }
      else { imageData.url = imageUrl }
    } catch {
      console.warn(`[CloudImageWorkflow] CORS 下载失败，保留远程 URL: ${imageUrl.slice(0, 80)}...`)
      imageData.url = imageUrl
    }
  } else {
    imageData.url = imageUrl
    if (imageUrl?.startsWith('data:')) {
      try {
        const asset = await saveAsset(imageUrl, currentProjectId.value || 'canvas-default')
        if (asset?.assetPath) imageData.assetPath = asset.assetPath
      } catch { /* keep data URL */ }
    }
  }

  updateNode(outputId, imageData)
  emitUpdate('executed', true)
  emitUpdate('status', 'success')
  emitUpdate('error', '')
  writebackDramaShot({
    firstFrameStatus: 'completed',
    status: 'firstFrameReady',
    firstFrameNodeId: props.id,
    firstFrameOutputNodeId: outputId,
    firstFrameAssetPath: imageData.assetPath || '',
    firstFrameUrl: imageData.url || ''
  })
}

async function handleGenerate() {
  if (props.data.status === 'running') return

  if (!isConfigured.value) {
    window.$message?.warning('请先在设置中配置图片模型 API Key 和 Base URL')
    openApiSettings()
    return
  }

  if (!localModel.value) {
    window.$message?.warning('请先选择图片模型')
    return
  }

  if (modelCapabilityConflict.value) {
    window.$message?.warning(`当前选择的是${getCapabilityLabel(modelCapabilityConflict.value)}模型，请选择图片模型`)
    return
  }

  const prompt = getEffectivePrompt()
  const refImages = getRefImages()

  if (!prompt && refImages.length === 0) {
    window.$message?.warning('请输入 Prompt 或连接文本/图片节点')
    return
  }

  emitUpdate('status', 'running')
  emitUpdate('error', '')
  startElapsed()
  writebackDramaShot({ firstFrameStatus: 'generating' })

  let imageNodeId = createdImageNodeId.value
  const existingOutput = edges.value.find(e => e.source === props.id && nodes.value.find(n => n.id === e.target && n.type === 'image'))
  if (existingOutput) {
    imageNodeId = existingOutput.target
    updateNode(imageNodeId, { loading: true, url: '', error: '', startedAt: Date.now() })
  }

  if (!imageNodeId) {
    const currentNode = nodes.value.find(n => n.id === props.id)
    const nodeX = currentNode?.position?.x || 0
    const nodeY = currentNode?.position?.y || 0
    imageNodeId = addNode('image', { x: nodeX + 400, y: nodeY }, { url: '', loading: true, error: '', startedAt: Date.now(), label: '图片结果' })
    addEdge({ source: props.id, target: imageNodeId, sourceHandle: 'right', targetHandle: 'left' })
    setTimeout(() => updateNodeInternals(imageNodeId), 50)
  }

  createdImageNodeId.value = imageNodeId
  updateNode(props.id, { outputNodeId: imageNodeId, updatedAt: Date.now() })

  try {
    // Build params including professional parameters
    const params = {
      model: localModel.value,
      prompt,
      size: localSize.value,
      n: 1,
      steps: Number(localSteps.value) || 20,
      cfg_scale: Number(localCfg.value) || 7,
      sampler: localSampler.value || 'euler',
      scheduler: localScheduler.value || 'normal',
      denoising_strength: Number(localDenoise.value) ?? 1.0
    }
    if (localSeed.value && String(localSeed.value).trim()) params.seed = String(localSeed.value).trim()
    if (localNegPrompt.value && String(localNegPrompt.value).trim()) params.negative_prompt = String(localNegPrompt.value).trim()
    if (refImages.length > 0) params.image = refImages

    const ipcTaskId = `cloudimg_${props.id}_${Date.now()}`
    const bgTaskId = registerTask({
      type: 'image', nodeId: props.id, projectId: currentProjectId.value || '',
      taskId: ipcTaskId, outputNodeId: imageNodeId
    })
    params._taskId = ipcTaskId

    let result
    try {
      result = await generate(params)
    } catch (genErr) {
      if (genErr._frontendTimeout) {
        // Do NOT mark task as failed — keep running so refresh can recover
        updateNode(imageNodeId, { loading: false, error: '等待超时，后台仍在生成中，刷新页面可恢复结果', updatedAt: Date.now() })
        writebackDramaShot({ firstFrameStatus: 'generating' })
        window.$message?.warning('前端等待超时，供应商请求仍在后台继续，刷新后可恢复结果')
        stopElapsed()
        emitUpdate('status', 'idle')
        return
      }
      if (bgTaskId) { updateTask(bgTaskId, { status: 'failed', error: genErr.message }); removeTask(bgTaskId) }
      throw genErr
    }

    if (result && result.length > 0) {
      const imageUrl = result[0].url
      const imageData = { loading: false, error: '', label: '图片结果', model: localModel.value, prompt, finishedAt: Date.now(), updatedAt: Date.now() }

      if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
        try {
          const projectId = currentProjectId.value || 'canvas-default'
          const resp = await fetch(imageUrl)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const blob = await resp.blob()
          const dataUrl = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(blob) })
          const asset = await saveAsset(dataUrl, projectId)
          if (asset?.assetPath) { imageData.assetPath = asset.assetPath; imageData.url = dataUrl }
          else { imageData.url = imageUrl }
        } catch (saveErr) {
          console.warn(`[CloudImageWorkflow] 资产保存失败，保留远程 URL: ${saveErr.message}`)
          imageData.url = imageUrl
        }
      } else {
        imageData.url = imageUrl
        if (imageUrl?.startsWith('data:')) {
          try {
            const asset = await saveAsset(imageUrl, currentProjectId.value || 'canvas-default')
            if (asset?.assetPath) imageData.assetPath = asset.assetPath
          } catch { /* keep data URL */ }
        }
      }

      updateNode(imageNodeId, imageData)
      emitUpdate('executed', true)
      emitUpdate('status', 'success')
      if (bgTaskId) { updateTask(bgTaskId, { status: 'completed' }); removeTask(bgTaskId) }
      writebackDramaShot({
        firstFrameStatus: 'completed',
        status: 'firstFrameReady',
        firstFrameNodeId: props.id,
        firstFrameOutputNodeId: imageNodeId,
        firstFrameAssetPath: imageData.assetPath || '',
        firstFrameUrl: imageData.url || ''
      })
    }
  } catch (err) {
    updateNode(imageNodeId, { loading: false, error: err.message || '生成失败', finishedAt: Date.now(), updatedAt: Date.now() })
    emitUpdate('error', err.message || '图片生成失败')
    emitUpdate('status', 'error')
    writebackDramaShot({ firstFrameStatus: 'failed', firstFrameError: err.message || '图片生成失败' })
    window.$message?.error(err.message || '图片生成失败')
  }

  stopElapsed()
}

function handleRunCommand(event) {
  if (event?.detail?.nodeId === props.id) handleGenerate()
}

onMounted(async () => {
  window.addEventListener('yufeng:run-cloud-image-workflow', handleRunCommand)

  // Auto-select first available model if none set
  const availableModels = modelStore.availableImageModels
  if (!localModel.value || !availableModels.some(m => m.key === localModel.value)) {
    localModel.value = availableModels[0]?.key || ''
    if (localModel.value) updateNode(props.id, { model: localModel.value })
  }

  // Recover running image task after page refresh
  const runningTask = getTaskByNodeId(props.id).value
  if (runningTask?.status === 'running' && runningTask.taskId) {
    const outputId = runningTask.outputNodeId || props.data?.outputNodeId

    if (outputId) {
      updateNode(outputId, { loading: true, error: '', updatedAt: Date.now() })
    }

    emitUpdate('status', 'running')
    startElapsed()

    let attempts = 0
    const maxAttempts = 600 // 600 * 3s = 30 min
    recoveryTimer = setInterval(async () => {
      attempts++
      try {
        const pendingResult = await ipcGetPendingResult(runningTask.taskId)
        if (pendingResult?.ok && pendingResult.data) {
          clearInterval(recoveryTimer)
          recoveryTimer = null
          stopElapsed()
          updateTask(runningTask.id, { status: 'completed' })
          removeTask(runningTask.id)
          await applyRecoveredResult(outputId, pendingResult.data)
          window.$message?.success('后台云端工作流任务已完成，结果已恢复到画布')
        } else if (attempts >= maxAttempts) {
          clearInterval(recoveryTimer)
          recoveryTimer = null
          stopElapsed()
          updateTask(runningTask.id, { status: 'failed', error: '恢复超时，主进程未返回结果' })
          removeTask(runningTask.id)
          if (outputId) {
            updateNode(outputId, { loading: false, error: '后台生成结果恢复超时', updatedAt: Date.now() })
          }
          emitUpdate('status', 'error')
          emitUpdate('error', '后台生成结果恢复超时')
          writebackDramaShot({ firstFrameStatus: 'failed', firstFrameError: '后台生成结果恢复超时' })
        }
      } catch {
        clearInterval(recoveryTimer)
        recoveryTimer = null
        stopElapsed()
        updateTask(runningTask.id, { status: 'failed', error: '恢复时 IPC 通信失败' })
        removeTask(runningTask.id)
        if (outputId) {
          updateNode(outputId, { loading: false, error: '恢复结果时发生错误', updatedAt: Date.now() })
        }
        emitUpdate('status', 'error')
        emitUpdate('error', '恢复结果时 IPC 通信失败')
        writebackDramaShot({ firstFrameStatus: 'failed', firstFrameError: '恢复结果时 IPC 通信失败' })
      }
    }, 3000)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('yufeng:run-cloud-image-workflow', handleRunCommand)
  stopElapsed()
  if (recoveryTimer) { clearInterval(recoveryTimer); recoveryTimer = null }
})
</script>

<style scoped>
.cloud-workflow-node {
  position: relative;
  min-width: 240px;
  max-width: 280px;
  padding-right: 54px;
  padding-top: 20px;
  overflow: visible;
}
.node-card {
  position: relative;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  position: relative;
}
.node-label-input {
  width: 100%;
  font-size: 12px;
  font-weight: bold;
  background: var(--bg-tertiary);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  padding: 1px 4px;
  color: var(--text-primary);
  outline: none;
}
.node-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.node-action:hover {
  background: var(--bg-tertiary);
}

.pro-toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  border: 0;
  border-radius: 8px;
  padding: 4px 6px;
  color: var(--accent-color);
  background: rgba(20, 184, 166, 0.06);
  font-size: 10px;
  font-weight: 700;
  cursor: pointer;
}

.pro-toggle:hover {
  background: rgba(20, 184, 166, 0.1);
}

.pro-toggle-hint {
  color: var(--text-tertiary, var(--text-secondary));
  font-weight: 600;
}

.pro-panel {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  border: 1px solid rgba(20, 184, 166, 0.16);
  border-radius: 12px;
  padding: 8px;
  background:
    linear-gradient(180deg, rgba(20, 184, 166, 0.07), rgba(20, 184, 166, 0.025)),
    var(--bg-tertiary);
}

.pro-param-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 82px;
  align-items: center;
  gap: 8px;
}

.pro-param-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pro-param-label {
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 800;
  line-height: 1.2;
}

.pro-param-hint {
  color: var(--text-tertiary, var(--text-secondary));
  font-size: 9px;
  line-height: 1.25;
}

.pro-param-input {
  width: 100%;
  min-height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 4px 7px;
  color: var(--text-primary);
  background: var(--bg-secondary);
  font-size: 12px;
  outline: none;
}

.pro-param-input:focus {
  border-color: rgba(20, 184, 166, 0.72);
  box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.12);
}

.pro-param-notice {
  border: 1px dashed rgba(20, 184, 166, 0.22);
  border-radius: 10px;
  padding: 7px;
  color: var(--text-tertiary, var(--text-secondary));
  background: rgba(20, 184, 166, 0.045);
  font-size: 10px;
  line-height: 1.45;
}
</style>

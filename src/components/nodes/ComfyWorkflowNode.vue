<template>
  <div class="comfy-workflow-node-wrapper">
    <div
      class="comfy-workflow-node bg-[var(--bg-secondary)] rounded-xl border min-w-[280px] transition-all duration-200"
      :class="data.selected ? 'border-1 border-blue-500 shadow-lg shadow-blue-500/20' : 'border border-[var(--border-color)]'"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-[var(--border-color)]">
        <span class="text-sm font-medium text-[var(--text-secondary)]">{{ data.label }}</span>
        <div class="flex items-center gap-1" @pointerdown.stop @mousedown.stop @click.stop>
          <button type="button" @click="handleDelete" class="p-1 hover:bg-[var(--bg-tertiary)] rounded" title="删除">
            <n-icon :size="14"><TrashOutline /></n-icon>
          </button>
        </div>
      </div>

      <!-- Controls -->
      <div class="nodrag nopan p-3 space-y-2" @pointerdown.capture.stop @mousedown.capture.stop @click.stop>
        <!-- Prompt -->
        <div v-if="hasBinding('prompt')">
          <span class="text-xs text-[var(--text-secondary)]">Prompt</span>
          <textarea
            v-model="localPrompt"
            class="w-full mt-1 p-2 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded resize-y"
            rows="3"
            @change="emitUpdate('prompt', localPrompt)"
          />
        </div>

        <!-- Negative Prompt -->
        <div v-if="hasBinding('negativePrompt')">
          <span class="text-xs text-[var(--text-secondary)]">Negative Prompt</span>
          <textarea
            v-model="localNegPrompt"
            class="w-full mt-1 p-2 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded resize-y"
            rows="2"
            @change="emitUpdate('negativePrompt', localNegPrompt)"
          />
        </div>

        <!-- Params grid -->
        <div class="grid grid-cols-2 gap-2">
          <div v-if="hasBinding('width')">
            <span class="text-xs text-[var(--text-secondary)]">宽</span>
            <input
              v-model.number="localWidth"
              type="number"
              class="w-full mt-1 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded"
              @change="emitUpdate('width', localWidth)"
            />
          </div>
          <div v-if="hasBinding('height')">
            <span class="text-xs text-[var(--text-secondary)]">高</span>
            <input
              v-model.number="localHeight"
              type="number"
              class="w-full mt-1 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded"
              @change="emitUpdate('height', localHeight)"
            />
          </div>
          <div v-if="hasBinding('seed')">
            <span class="text-xs text-[var(--text-secondary)]">Seed</span>
            <input
              v-model.number="localSeed"
              type="number"
              class="w-full mt-1 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded"
              @change="emitUpdate('seed', localSeed)"
            />
          </div>
          <div v-if="hasBinding('steps')">
            <span class="text-xs text-[var(--text-secondary)]">Steps</span>
            <input
              v-model.number="localSteps"
              type="number"
              class="w-full mt-1 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded"
              @change="emitUpdate('steps', localSteps)"
            />
          </div>
          <div v-if="hasBinding('cfg')">
            <span class="text-xs text-[var(--text-secondary)]">CFG</span>
            <input
              v-model.number="localCfg"
              type="number"
              step="0.5"
              class="w-full mt-1 p-1 text-xs bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-color)] rounded"
              @change="emitUpdate('cfg', localCfg)"
            />
          </div>
        </div>

        <!-- Status -->
        <div v-if="statusText" class="text-xs px-1" :class="statusClass">{{ statusText }}</div>

        <!-- Error -->
        <div v-if="data.error" class="text-xs text-red-400 px-1">{{ data.error }}</div>

        <!-- Run button -->
        <button
          type="button"
          class="w-full py-1.5 text-xs rounded font-medium transition-colors"
          :class="data.status === 'running' ? 'bg-yellow-600/20 text-yellow-400 cursor-wait' : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'"
          :disabled="data.status === 'running'"
          @click="handleRun"
        >
          {{ data.status === 'running' ? `运行中 ${elapsedText}` : '运行' }}
        </button>
      </div>

      <!-- Handles -->
      <Handle type="target" :position="Position.Left" id="left" class="!bg-[var(--accent-color)]" />
      <Handle type="source" :position="Position.Right" id="right" class="!bg-[var(--accent-color)]" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NIcon } from 'naive-ui'
import { TrashOutline } from '@vicons/ionicons5'
import { useVueFlow } from '@vue-flow/core'
import { addNode, addEdge, updateNode, removeNode, currentProjectId } from '@/stores/canvas'
import {
  comfyQueuePrompt, comfyGetHistory, comfyFetchImageAsDataUrl,
  extractOutputImages, saveAsset
} from '@/integrations/comfy/api'

const props = defineProps({ id: String, data: Object })
const { findNode } = useVueFlow()

const localPrompt = ref(props.data.prompt ?? '')
const localNegPrompt = ref(props.data.negativePrompt ?? '')
const localWidth = ref(props.data.width ?? 512)
const localHeight = ref(props.data.height ?? 512)
const localSeed = ref(props.data.seed ?? -1)
const localSteps = ref(props.data.steps ?? 20)
const localCfg = ref(props.data.cfg ?? 7)

let pollTimer = null
let startTime = null
const elapsed = ref(0)
let elapsedTimer = null

function hasBinding(key) {
  return props.data.bindings?.[key] != null
}

const statusText = computed(() => {
  if (props.data.status === 'running') return '正在运行...'
  if (props.data.status === 'success') return '完成'
  return ''
})

const statusClass = computed(() => {
  if (props.data.status === 'running') return 'text-yellow-400'
  if (props.data.status === 'success') return 'text-green-400'
  return ''
})

const elapsedText = computed(() => {
  if (!elapsed.value) return ''
  const s = Math.floor(elapsed.value / 1000)
  return `${s}s`
})

function emitUpdate(key, value) {
  updateNode(props.id, { [key]: value, updatedAt: Date.now() })
}

function handleDelete() {
  if (pollTimer) clearInterval(pollTimer)
  if (elapsedTimer) clearInterval(elapsedTimer)
  removeNode(props.id)
}

function getBaseUrl() {
  return props.data.baseUrl || 'http://127.0.0.1:8188'
}

async function handleRun() {
  if (props.data.status === 'running') return

  if (!window.desktopApp?.comfyRuntime) {
    emitUpdate('error', '请先在设置 > Comfy 引擎测试连接')
    emitUpdate('status', 'error')
    return
  }

  if (!props.data.apiWorkflow || typeof props.data.apiWorkflow !== 'object') {
    emitUpdate('error', '请选择 Comfy API workflow JSON')
    emitUpdate('status', 'error')
    return
  }

  const workflow = JSON.parse(JSON.stringify(props.data.apiWorkflow))
  const bindings = props.data.bindings || {}
  const overrides = {
    prompt: localPrompt.value,
    negativePrompt: localNegPrompt.value,
    width: localWidth.value,
    height: localHeight.value,
    seed: localSeed.value,
    steps: localSteps.value,
    cfg: localCfg.value
  }
  for (const [key, binding] of Object.entries(bindings)) {
    if (workflow[binding.nodeId]?.inputs && overrides[key] != null) {
      workflow[binding.nodeId].inputs[binding.input] = overrides[key]
    }
  }

  emitUpdate('status', 'running')
  emitUpdate('error', '')
  emitUpdate('outputNodeIds', [])
  startTime = Date.now()
  elapsed.value = 0
  elapsedTimer = setInterval(() => { elapsed.value = Date.now() - startTime }, 1000)

  try {
    const promptId = await comfyQueuePrompt(getBaseUrl(), workflow)
    emitUpdate('lastPromptId', promptId)
    pollForResult(promptId)
  } catch (e) {
    clearInterval(elapsedTimer)
    emitUpdate('error', e.message)
    emitUpdate('status', 'error')
  }
}

function pollForResult(promptId) {
  const deadline = Date.now() + 180000
  pollTimer = setInterval(async () => {
    if (Date.now() > deadline) {
      clearInterval(pollTimer)
      clearInterval(elapsedTimer)
      emitUpdate('error', 'Comfy 任务超时，请检查原版 ComfyUI 是否报错')
      emitUpdate('status', 'error')
      return
    }
    try {
      const history = await comfyGetHistory(getBaseUrl(), promptId)
      if (!history) return
      const images = extractOutputImages(history)
      if (images.length === 0) {
        if (history.status?.status_str === 'error') {
          clearInterval(pollTimer)
          clearInterval(elapsedTimer)
          const msg = history.status.messages?.map(m => m[1]?.message || m[1]?.exception_message || String(m[1])).join('; ') || 'Comfy 执行出错'
          emitUpdate('error', msg)
          emitUpdate('status', 'error')
          return
        }
        // Task completed successfully but no images — stop polling immediately
        if (history.status?.completed || history.status?.status_str === 'success') {
          clearInterval(pollTimer)
          clearInterval(elapsedTimer)
          emitUpdate('error', '任务完成，但没有找到图片输出。请检查 SaveImage / PreviewImage 节点。')
          emitUpdate('status', 'error')
          return
        }
        return
      }

      clearInterval(pollTimer)
      clearInterval(elapsedTimer)

      const node = findNode(props.id)
      const posX = node?.position?.x ?? 100
      const posY = node?.position?.y ?? 100
      const projectId = currentProjectId.value || 'canvas-default'
      const outputNodeIds = []

      for (let i = 0; i < images.length; i++) {
        const dataUrl = await comfyFetchImageAsDataUrl(getBaseUrl(), images[i])

        // Save to local asset
        const asset = await saveAsset(dataUrl, projectId)
        const imageData = {
          label: `Comfy 生成结果 ${images.length > 1 ? i + 1 : ''}`.trim(),
          source: 'comfy',
          prompt: localPrompt.value,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        if (asset?.assetPath) {
          imageData.assetPath = asset.assetPath
          imageData.url = dataUrl
        } else {
          imageData.url = dataUrl
        }

        const yOffset = i * 280
        const imageNodeId = addNode('image', { x: posX + 400, y: posY + yOffset }, imageData)
        outputNodeIds.push(imageNodeId)

        addEdge({
          source: props.id,
          target: imageNodeId,
          sourceHandle: 'right',
          targetHandle: 'left'
        })
      }

      emitUpdate('status', 'success')
      emitUpdate('outputNodeIds', outputNodeIds)
      emitUpdate('lastRunAt', Date.now())
      emitUpdate('error', '')
    } catch (e) {
      clearInterval(pollTimer)
      clearInterval(elapsedTimer)
      emitUpdate('error', e.message)
      emitUpdate('status', 'error')
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  if (elapsedTimer) clearInterval(elapsedTimer)
})
</script>

<style scoped>
.comfy-workflow-node textarea,
.comfy-workflow-node input {
  outline: none;
}
.comfy-workflow-node textarea:focus,
.comfy-workflow-node input:focus {
  border-color: var(--accent-color, #3b82f6);
}
</style>

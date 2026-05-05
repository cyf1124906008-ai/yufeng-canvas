<template>
  <Transition name="modal-fade">
    <div v-if="visible" class="fixed inset-0 z-[9999] flex items-center justify-center" @click.self="visible = false">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div class="relative bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl shadow-2xl w-[560px] max-h-[80vh] overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <h3 class="text-base font-medium text-[var(--text-primary)]">九宫格拆图</h3>
          <button class="p-1 hover:bg-[var(--bg-tertiary)] rounded" @click="visible = false">
            <n-icon :size="18"><CloseOutline /></n-icon>
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
          <!-- Source image -->
          <div v-if="sourceUrl" class="relative">
            <img :src="sourceUrl" class="w-full rounded-lg border border-[var(--border-color)]" alt="源图" />
            <div class="absolute inset-0 pointer-events-none rounded-lg"
              :style="gridOverlayStyle"
            ></div>
          </div>
          <div v-else class="text-center py-8 text-sm text-[var(--text-secondary)]">
            请先选中一张图片节点
          </div>

          <!-- Grid selector -->
          <div class="flex items-center gap-3">
            <span class="text-xs text-[var(--text-secondary)]">网格</span>
            <button
              v-for="opt in gridOptions"
              :key="opt.value"
              class="px-3 py-1 text-xs rounded border transition-colors"
              :class="selectedGrid === opt.value ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent-color)]'"
              @click="selectedGrid = opt.value"
            >{{ opt.label }}</button>
          </div>

          <!-- Results -->
          <div v-if="splitResults.length" class="space-y-2">
            <div class="text-xs text-[var(--text-secondary)] mb-2">拆分结果（{{ splitResults.length }} 张）</div>
            <div class="grid gap-2" :style="resultGridStyle">
              <div
                v-for="(item, i) in splitResults"
                :key="i"
                class="relative group rounded border border-[var(--border-color)] overflow-hidden"
              >
                <img :src="item.dataUrl" class="w-full aspect-square object-cover" />
                <div class="absolute bottom-0 inset-x-0 bg-black/50 text-[10px] text-white text-center py-0.5">{{ item.label }}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-5 py-4 border-t border-[var(--border-color)]">
          <button
            class="px-4 py-1.5 text-xs rounded border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            @click="visible = false"
          >取消</button>
          <button
            class="px-4 py-1.5 text-xs rounded bg-[var(--accent-color)] text-white hover:opacity-90 disabled:opacity-50"
            :disabled="!sourceUrl || splitting"
            @click="handleSplit"
          >{{ splitting ? '拆分中...' : '拆分' }}</button>
          <button
            v-if="splitResults.length"
            class="px-4 py-1.5 text-xs rounded bg-emerald-600 text-white hover:opacity-90"
            @click="handleAddToCanvas"
          >添加到画布</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed } from 'vue'
import { NIcon } from 'naive-ui'
import { CloseOutline } from '@vicons/ionicons5'
import { splitImage } from '@/utils/imageSplitter'
import { addNode, addEdge, nodes, currentProjectId } from '@/stores/canvas'
import { saveAsset } from '@/integrations/comfy/api'

const props = defineProps({
  show: Boolean,
  imageUrl: { type: String, default: '' },
  sourceNodeId: { type: String, default: '' }
})

const emit = defineEmits(['update:show'])

const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const sourceUrl = computed(() => props.imageUrl)
const selectedGrid = ref('3x3')
const splitResults = ref([])
const splitting = ref(false)

const gridOptions = [
  { value: '2x2', label: '2×2' },
  { value: '3x3', label: '3×3' },
  { value: '4x4', label: '4×4' },
  { value: '1x3', label: '横三格' },
  { value: '3x1', label: '竖三格' }
]

const gridN = computed(() => {
  const [r, c] = selectedGrid.value.split('x').map(Number)
  return Math.max(r, c)
})

const gridOverlayStyle = computed(() => {
  const [rows, cols] = selectedGrid.value.split('x').map(Number)
  const colPercent = 100 / cols
  const rowPercent = 100 / rows
  const colLines = []
  for (let i = 1; i < cols; i++) {
    const pos = colPercent * i
    colLines.push(`transparent ${pos - 0.5}%, rgba(59,130,246,0.5) ${pos - 0.5}%, rgba(59,130,246,0.5) ${pos + 0.5}%, transparent ${pos + 0.5}%`)
  }
  const rowLines = []
  for (let i = 1; i < rows; i++) {
    const pos = rowPercent * i
    rowLines.push(`transparent ${pos - 0.5}%, rgba(59,130,246,0.5) ${pos - 0.5}%, rgba(59,130,246,0.5) ${pos + 0.5}%, transparent ${pos + 0.5}%`)
  }
  const colGrad = colLines.length ? `linear-gradient(to right, ${colLines.join(',')})` : 'none'
  const rowGrad = rowLines.length ? `linear-gradient(to bottom, ${rowLines.join(',')})` : 'none'
  return {
    background: `${colGrad}, ${rowGrad}`,
    backgroundSize: '100% 100%'
  }
})

const resultGridStyle = computed(() => {
  const [, cols] = selectedGrid.value.split('x').map(Number)
  return { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
})

async function handleSplit() {
  if (!sourceUrl.value) return
  splitting.value = true
  splitResults.value = []
  try {
    splitResults.value = await splitImage(sourceUrl.value, selectedGrid.value)
  } catch (err) {
    window.$message?.error(err.message || '拆分失败')
  } finally {
    splitting.value = false
  }
}

async function handleAddToCanvas() {
  if (!splitResults.value.length) return

  const sourceNode = props.sourceNodeId
    ? nodes.value.find(n => n.id === props.sourceNodeId)
    : null
  const baseX = (sourceNode?.position?.x ?? 100) + 400
  const baseY = sourceNode?.position?.y ?? 100
  const [rows, cols] = selectedGrid.value.split('x').map(Number)
  const spacing = 280

  for (const item of splitResults.value) {
    const offsetX = item.col * spacing
    const offsetY = item.row * spacing

    // Save each split result as a local asset
    const imageData = {
      label: `拆图 ${item.label}`,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }

    try {
      const projectId = currentProjectId.value || 'canvas-default'
      const asset = await saveAsset(item.dataUrl, projectId)
      if (asset?.assetPath) {
        imageData.assetPath = asset.assetPath
        imageData.url = item.dataUrl
      } else {
        imageData.url = item.dataUrl
      }
    } catch {
      imageData.url = item.dataUrl
    }

    const imageNodeId = addNode('image', { x: baseX + offsetX, y: baseY + offsetY }, imageData)

    if (props.sourceNodeId) {
      addEdge({
        source: props.sourceNodeId,
        target: imageNodeId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
    }
  }

  window.$message?.success(`已添加 ${splitResults.value.length} 张图片到画布`)
  visible.value = false
}
</script>

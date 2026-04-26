<template>
  <!-- Workflow panel | 工作流浮动面板 -->
  <Transition name="panel-slide">
    <div v-if="visible" class="workflow-panel" data-tour="workflow-panel-open" v-click-outside="handleClickOutside">
      <div class="panel-atmosphere" aria-hidden="true"></div>
      <!-- Header | 头部 -->
      <div class="panel-header">
        <div>
          <div class="panel-tabs">
            <span
              class="tab-item"
              :class="{ active: activeTab === 'public' }"
              @click="activeTab = 'public'"
            >公共工作流</span>
            <span
              class="tab-item"
              :class="{ active: activeTab === 'my' }"
              @click="activeTab = 'my'"
            >我的工作流</span>
          </div>
          <p class="panel-subtitle">选择一个配置好的模板，直接放到画布继续创作。</p>
        </div>
        <div class="panel-actions">
          <input
            ref="importInputRef"
            type="file"
            accept="application/json,.json"
            class="hidden-input"
            @change="handleImportFile"
          />
          <button class="panel-action-btn" @click.stop="triggerImport">导入工作流</button>
          <button class="panel-action-btn" @click.stop="exportCurrentWorkflow">导出当前画布</button>
          <button class="expand-btn" @click="visible = false">
            <n-icon :size="16"><CloseOutline /></n-icon>
          </button>
        </div>
      </div>
      
      <!-- Content | 内容 -->
      <div
        class="panel-content"
        :class="{ 'is-dragging-file': isDraggingWorkflowFile }"
        @dragenter.prevent="isDraggingWorkflowFile = true"
        @dragover.prevent="isDraggingWorkflowFile = true"
        @dragleave.prevent="handleDragLeave"
        @drop.prevent="handleWorkflowDrop"
      >
        <div v-if="isDraggingWorkflowFile" class="import-drop-overlay">
          <div class="drop-orb">JSON</div>
          <h3>松开即可导入工作流</h3>
          <p>支持从 YUFENG Canvas 导出的 .json 工作流文件。</p>
        </div>
        <!-- Public workflows | 公共工作流 -->
        <div v-if="activeTab === 'public'" class="public-workflows">
          <div class="category-row">
            <button
              v-for="category in categories"
              :key="category.key"
              class="category-chip"
              :class="{ active: selectedCategory === category.key }"
              @click="selectedCategory = category.key"
            >
              {{ category.label }}
              <span>{{ category.count }}</span>
            </button>
          </div>

          <div class="workflow-grid">
            <button
              v-for="workflow in filteredWorkflows"
              :key="workflow.id"
              class="workflow-card"
              @click="handleAddWorkflow(workflow)"
            >
              <div class="card-cover">
                <img v-if="workflow.cover" :src="workflow.cover" :alt="workflow.name" class="cover-img" />
                <n-icon v-else :size="36" class="cover-icon">
                  <component :is="getIcon(workflow.icon)" />
                </n-icon>
                <span class="card-badge">{{ getCategoryLabel(workflow.category) }}</span>
              </div>
              <div class="card-body">
                <div class="card-title">{{ workflow.name }}</div>
                <p class="card-desc">{{ workflow.description }}</p>
                <div class="card-meta">
                  <span>{{ getNodeCount(workflow) }} 个节点</span>
                  <span>一键添加</span>
                </div>
              </div>
            </button>
          </div>

          <div class="template-note">
            <n-icon :size="16"><ChatbubbleOutline /></n-icon>
            模板会带上推荐提示词和节点连接。添加后只需要换成自己的素材、模型和 API Key。
          </div>
        </div>

        <div v-else class="my-workflows">
          <div class="empty-state">
            <n-icon :size="36" class="text-gray-500">
              <FolderOpenOutline />
            </n-icon>
            <p class="text-gray-500 text-sm mt-2">暂无自定义工作流</p>
            <p class="empty-hint">后续可以把当前画布保存成个人模板，这里会作为你的私有工作流库。</p>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
/**
 * Workflow Panel Component | 工作流面板组件
 * 显示工作流模板列表，支持一键添加到画布
 */
import { computed, ref } from 'vue'
import { NIcon } from 'naive-ui'
import { 
  CloseOutline,
  GridOutline, 
  ImageOutline, 
  VideocamOutline,
  FolderOpenOutline,
  BookOutline,
  PersonOutline,
  CartOutline,
  ChatbubbleOutline
} from '@vicons/ionicons5'
import { WORKFLOW_TEMPLATES } from '../config/workflows'
import { nodes, edges } from '../stores/canvas'

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['update:show', 'add-workflow'])

// Active tab | 当前标签
const activeTab = ref('public')
const selectedCategory = ref('all')
const importInputRef = ref(null)
const isDraggingWorkflowFile = ref(false)

// Visible state | 显示状态
const visible = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

// Public workflows | 公共工作流
const publicWorkflows = computed(() => WORKFLOW_TEMPLATES)

const categoryMap = {
  all: '全部',
  storyboard: '分镜',
  ecommerce: '电商',
  drama: '短剧',
  video: '视频',
  brand: '品牌',
  ui: 'UI',
  creative: '创意'
}

const categories = computed(() => {
  const all = publicWorkflows.value
  const keys = ['all', ...new Set(all.map((workflow) => workflow.category))]
  return keys.map((key) => ({
    key,
    label: categoryMap[key] || key,
    count: key === 'all' ? all.length : all.filter((workflow) => workflow.category === key).length
  }))
})

const filteredWorkflows = computed(() => {
  if (selectedCategory.value === 'all') return publicWorkflows.value
  return publicWorkflows.value.filter((workflow) => workflow.category === selectedCategory.value)
})

const getCategoryLabel = (category) => categoryMap[category] || '模板'

const getNodeCount = (workflow) => {
  try {
    return workflow.createNodes({ x: 0, y: 0 })?.nodes?.length || 0
  } catch {
    return 0
  }
}

// Icon mapping | 图标映射
const iconMap = {
  GridOutline,
  ImageOutline,
  VideocamOutline,
  BookOutline,
  PersonOutline,
  ShoppingOutline: CartOutline,
  ChatbubbleOutline
}

const getIcon = (iconName) => {
  return iconMap[iconName] || GridOutline
}

// Handle add workflow | 处理添加工作流
const handleAddWorkflow = (workflow) => {
  // 直接添加工作流，节点内容由用户自己填写
  emit('add-workflow', { workflow, options: {} })
  visible.value = false
}

const createDownload = (filename, content) => {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

const exportCurrentWorkflow = () => {
  if (!nodes.value.length) {
    window.$message?.warning('当前画布还没有节点，先创建一个工作流再导出')
    return
  }

  const payload = {
    schema: 'yufeng-canvas-workflow@1',
    name: `YUFENG Workflow ${new Date().toLocaleString()}`,
    exportedAt: new Date().toISOString(),
    nodes: nodes.value,
    edges: edges.value
  }

  createDownload(`yufeng-workflow-${Date.now()}.json`, JSON.stringify(payload, null, 2))
  window.$message?.success('已导出当前画布工作流')
}

const triggerImport = () => {
  importInputRef.value?.click()
}

const importWorkflowFile = async (file) => {
  if (!file) return

  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const workflow = createImportedTemplate(payload, file.name)
    emit('add-workflow', { workflow, options: {} })
    visible.value = false
    window.$message?.success('工作流已导入画布')
  } catch (err) {
    window.$message?.error(err.message || '工作流导入失败，请确认是 YUFENG Canvas JSON 文件')
  }
}

const normalizeImportedWorkflow = (payload) => {
  const source = payload?.workflow || payload?.canvas || payload
  const importedNodes = Array.isArray(source?.nodes) ? source.nodes : []
  const importedEdges = Array.isArray(source?.edges) ? source.edges : []

  if (!importedNodes.length) {
    throw new Error('工作流文件里没有可导入的节点')
  }

  return {
    name: source.name || payload?.name || '导入工作流',
    description: source.description || payload?.description || '从本地 JSON 文件导入的工作流',
    nodes: importedNodes,
    edges: importedEdges
  }
}

const createImportedTemplate = (payload, fileName) => {
  const workflow = normalizeImportedWorkflow(payload)

  return {
    id: `imported_${Date.now()}`,
    name: workflow.name || fileName.replace(/\.json$/i, ''),
    description: workflow.description,
    category: 'custom',
    createNodes(startPosition = { x: 180, y: 160 }) {
      const minX = Math.min(...workflow.nodes.map((node) => node.position?.x || 0))
      const minY = Math.min(...workflow.nodes.map((node) => node.position?.y || 0))
      const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const idMap = new Map()

      const importedNodes = workflow.nodes.map((node, index) => {
        const newId = `import_${suffix}_${index}`
        idMap.set(node.id, newId)
        return {
          ...node,
          id: newId,
          selected: false,
          position: {
            x: startPosition.x + ((node.position?.x || 0) - minX),
            y: startPosition.y + ((node.position?.y || 0) - minY)
          },
          data: {
            ...(node.data || {}),
            selected: false,
            loading: false,
            autoExecute: false
          }
        }
      })

      const importedEdges = workflow.edges
        .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
        .map((edge, index) => ({
          ...edge,
          id: `import_edge_${suffix}_${index}`,
          source: idMap.get(edge.source),
          target: idMap.get(edge.target)
        }))

      return {
        nodes: importedNodes,
        edges: importedEdges
      }
    }
  }
}

const handleImportFile = async (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return

  importWorkflowFile(file)
}

const handleWorkflowDrop = (event) => {
  isDraggingWorkflowFile.value = false
  const file = Array.from(event.dataTransfer?.files || [])
    .find((item) => item.name?.toLowerCase().endsWith('.json'))

  if (!file) {
    window.$message?.warning('请拖入 .json 工作流文件')
    return
  }

  importWorkflowFile(file)
}

const handleDragLeave = (event) => {
  if (!event.currentTarget?.contains(event.relatedTarget)) {
    isDraggingWorkflowFile.value = false
  }
}

// Handle click outside | 点击外部关闭
const handleClickOutside = () => {
  visible.value = false
}

// Custom directive | 自定义指令
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) {
        binding.value()
      }
    }
    setTimeout(() => {
      document.addEventListener('click', el._clickOutside)
    }, 0)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  }
}
</script>

<style scoped>
/* Panel container | 面板容器 */
.workflow-panel {
  position: fixed;
  left: 50%;
  top: 54%;
  width: min(980px, calc(100vw - 96px));
  max-height: min(82vh, 780px);
  background:
    radial-gradient(circle at 12% 0%, rgba(85, 245, 182, 0.22), transparent 30%),
    radial-gradient(circle at 92% 16%, rgba(24, 183, 255, 0.2), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.86), rgba(241, 245, 249, 0.68));
  backdrop-filter: blur(32px) saturate(1.35);
  border-radius: 34px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  box-shadow: 0 36px 120px rgba(15, 23, 42, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.74);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transform: translate(-50%, -50%);
}

:global(.dark) .workflow-panel {
  background:
    radial-gradient(circle at 12% 0%, rgba(85, 245, 182, 0.16), transparent 30%),
    radial-gradient(circle at 92% 16%, rgba(24, 183, 255, 0.16), transparent 34%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.9), rgba(7, 34, 36, 0.76));
  border-color: rgba(203, 255, 239, 0.16);
  box-shadow: 0 36px 120px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.panel-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.panel-atmosphere::before,
.panel-atmosphere::after {
  content: "";
  position: absolute;
  border-radius: 999px;
  filter: blur(20px);
}

.panel-atmosphere::before {
  width: 280px;
  height: 280px;
  left: -90px;
  top: -110px;
  background: rgba(16, 185, 129, 0.2);
}

.panel-atmosphere::after {
  width: 340px;
  height: 340px;
  right: -120px;
  bottom: -130px;
  background: rgba(14, 165, 233, 0.16);
}

/* Header | 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  position: relative;
  z-index: 1;
  padding: 24px 28px 18px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}

.panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.hidden-input {
  display: none;
}

.panel-action-btn {
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 14px;
  padding: 9px 12px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.64), 0 10px 26px rgba(15, 23, 42, 0.08);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.panel-action-btn:hover {
  transform: translateY(-1px);
  border-color: rgba(34, 197, 94, 0.42);
  background: rgba(255, 255, 255, 0.72);
}

:global(.dark) .panel-action-btn {
  color: rgba(236, 253, 245, 0.92);
  background: rgba(15, 23, 42, 0.46);
  border-color: rgba(148, 163, 184, 0.18);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 32px rgba(0, 0, 0, 0.24);
}

.panel-tabs {
  display: flex;
  gap: 24px;
}

.tab-item {
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s, transform 0.2s;
  padding-bottom: 6px;
  position: relative;
}

.tab-item:hover {
  color: var(--text-primary);
}

.tab-item.active {
  color: var(--text-primary);
  font-weight: 900;
}

.tab-item.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -2px;
  height: 3px;
  border-radius: 999px;
  background: linear-gradient(90deg, #55f5b6, #22d3ee);
  box-shadow: 0 0 18px rgba(34, 211, 238, 0.34);
}

.panel-subtitle {
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-secondary);
}

.expand-btn {
  width: 38px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(148, 163, 184, 0.16);
  border: none;
  border-radius: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.expand-btn:hover {
  background: var(--border-color);
  color: var(--text-primary);
}

/* Content | 内容区 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  position: relative;
  z-index: 1;
  padding: 22px 28px 28px;
}

.panel-content.is-dragging-file {
  outline: 1px solid rgba(85, 245, 182, 0.68);
  outline-offset: -14px;
}

.import-drop-overlay {
  position: absolute;
  inset: 14px;
  z-index: 5;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  border: 1px solid rgba(85, 245, 182, 0.74);
  border-radius: 28px;
  background:
    radial-gradient(circle at 50% 24%, rgba(85, 245, 182, 0.22), transparent 36%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.84), rgba(236, 253, 245, 0.76));
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.58), 0 28px 80px rgba(4, 120, 87, 0.2);
  backdrop-filter: blur(22px) saturate(1.35);
  text-align: center;
}

:global(.dark) .import-drop-overlay {
  background:
    radial-gradient(circle at 50% 24%, rgba(85, 245, 182, 0.16), transparent 36%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(6, 78, 59, 0.72));
}

.drop-orb {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  border-radius: 24px;
  color: #052e2b;
  background: linear-gradient(135deg, #dffef7, #55f5b6 52%, #38bdf8);
  box-shadow: 0 22px 56px rgba(17, 216, 197, 0.3);
  font-size: 13px;
  font-weight: 950;
  letter-spacing: 0.1em;
}

.import-drop-overlay h3 {
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 950;
}

.import-drop-overlay p {
  color: var(--text-secondary);
  font-size: 13px;
}

.public-workflows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.category-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.category-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 13px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.54);
  font-size: 12px;
  font-weight: 800;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  backdrop-filter: blur(16px);
  transition: all 0.2s ease;
}

:global(.dark) .category-chip {
  background: rgba(15, 23, 42, 0.42);
}

.category-chip span {
  min-width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-size: 11px;
}

.category-chip:hover,
.category-chip.active {
  color: #06231f;
  border-color: rgba(85, 245, 182, 0.75);
  background: linear-gradient(135deg, #55F5B6, #B9F8E1);
}

/* Workflow grid | 工作流网格 */
.workflow-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

/* Workflow card | 工作流卡片 */
.workflow-card {
  position: relative;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.42);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.46));
  border-radius: 26px;
  overflow: hidden;
  cursor: pointer;
  box-shadow: 0 20px 48px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(18px);
  transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease;
}

.workflow-card:hover {
  transform: translateY(-8px) scale(1.015);
  border-color: rgba(85, 245, 182, 0.72);
  box-shadow: 0 34px 80px rgba(2, 20, 18, 0.18);
}

.workflow-card::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0;
  background: linear-gradient(120deg, transparent 0 38%, rgba(255, 255, 255, 0.36) 48%, transparent 58%);
  transform: translateX(-55%);
  transition: opacity 0.2s ease, transform 0.55s ease;
}

.workflow-card:hover::after {
  opacity: 1;
  transform: translateX(60%);
}

:global(.dark) .workflow-card {
  background: rgba(15, 23, 42, 0.58);
}

.card-cover {
  aspect-ratio: 1.38;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 0%, rgba(85, 245, 182, 0.16), transparent 30%),
    var(--bg-tertiary);
  overflow: hidden;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.45s ease, filter 0.45s ease;
}

.workflow-card:hover .cover-img {
  transform: scale(1.07);
  filter: saturate(1.08) contrast(1.04);
}

.cover-icon {
  color: var(--text-secondary);
}

.card-badge {
  position: absolute;
  left: 10px;
  top: 10px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(5, 19, 27, 0.76);
  color: #EFFFF8;
  font-size: 11px;
  backdrop-filter: blur(8px);
}

.card-body {
  position: relative;
  z-index: 1;
  padding: 14px 15px 16px;
}

.card-title {
  font-size: 15px;
  font-weight: 900;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-desc {
  margin-top: 5px;
  min-height: 36px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-meta {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.card-meta span:last-child {
  color: var(--accent-color);
  font-weight: 700;
}

.template-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border: 1px solid rgba(85, 245, 182, 0.36);
  border-radius: 18px;
  background: linear-gradient(135deg, rgba(85, 245, 182, 0.12), rgba(14, 165, 233, 0.08));
  color: var(--text-secondary);
  font-size: 12px;
}

/* Empty state | 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
  color: var(--text-secondary);
}

.empty-hint {
  max-width: 360px;
  margin-top: 8px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 820px) {
  .workflow-panel {
    left: 50%;
    top: 84px;
    width: calc(100vw - 32px);
    transform: translateX(-50%);
  }

  .workflow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Transition | 过渡动画 */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease, filter 0.25s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  filter: blur(12px);
  transform: translate(-50%, -46%) scale(0.96);
}

/* Scrollbar | 滚动条 */
.panel-content::-webkit-scrollbar {
  width: 6px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: var(--text-secondary);
}
</style>

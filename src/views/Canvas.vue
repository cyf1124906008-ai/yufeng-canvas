<template>
  <!-- Canvas page | 画布页面 -->
  <div class="canvas-shell h-screen w-screen flex flex-col bg-[var(--bg-primary)]">
    <!-- Header | 顶部导航 -->
    <AppHeader class="canvas-header">
      <template #left>
        <button 
          @click="goBack"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
        >
          <n-icon :size="20"><ChevronBackOutline /></n-icon>
        </button>
        <n-dropdown :options="projectOptions" @select="handleProjectAction">
          <button class="flex items-center gap-1 hover:bg-[var(--bg-tertiary)] px-2 py-1 rounded-lg transition-colors">
            <span class="font-medium">{{ projectName }}</span>
            <n-icon :size="16"><ChevronDownOutline /></n-icon>
          </button>
        </n-dropdown>
      </template>
      <template #right>
        <button 
          @click="showRuntimeLogs = !showRuntimeLogs"
          class="relative p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          :class="{ 'text-[var(--accent-color)]': runtimeLogs.length > 0 }"
          title="运行日志"
        >
          <n-icon :size="20"><ChatbubbleOutline /></n-icon>
          <span v-if="runtimeErrorCount" class="log-error-dot">{{ runtimeErrorCount }}</span>
        </button>
        <button 
          @click="showDownloadModal = true"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          :class="{ 'text-[var(--accent-color)]': hasDownloadableAssets }"
          title="批量下载素材"
        >
          <n-icon :size="20"><DownloadOutline /></n-icon>
        </button>
        <button 
          @click="showApiSettings = true"
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
          :class="{ 'text-[var(--accent-color)]': hasAnyApiConfigured }"
          title="API 设置"
        >
          <n-icon :size="20"><SettingsOutline /></n-icon>
        </button>
      </template>
    </AppHeader>

    <!-- Main canvas area | 主画布区域 -->
    <div class="flex-1 relative overflow-hidden">
      <div class="canvas-ambient one"></div>
      <div class="canvas-ambient two"></div>
      <!-- Vue Flow canvas | Vue Flow 画布 -->
      <VueFlow
        :key="flowKey"
        v-model:nodes="nodes"
        v-model:edges="edges"
        v-model:viewport="viewport"
        :node-types="nodeTypes"
        :edge-types="edgeTypes"
        :default-viewport="canvasViewport"
        :min-zoom="0.1"
        :max-zoom="2"
        :snap-to-grid="true"
        :snap-grid="[20, 20]"
        @connect="onConnect"
        @node-click="onNodeClick"
        @pane-click="onPaneClick"
        @viewport-change="handleViewportChange"
        @edges-change="onEdgesChange"
        class="canvas-flow"
      >
        <Background v-if="showGrid" :gap="20" :size="1" />
        <MiniMap 
          v-if="!isMobile"
          position="bottom-right"
          :pannable="true"
          :zoomable="true"
          class="canvas-minimap"
          node-color="#14b8a6"
          node-stroke-color="#0f766e"
          mask-color="rgba(15, 118, 110, 0.14)"
        />
      </VueFlow>

      <!-- Left toolbar | 左侧工具栏 -->
      <aside class="canvas-toolbar absolute left-4 top-1/2 -translate-y-1/2 flex flex-col gap-1 p-2 z-10">
        <button 
          @click="showNodeMenu = !showNodeMenu"
          class="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--accent-color)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          title="添加节点"
        >
          <n-icon :size="20"><AddOutline /></n-icon>
        </button>
        <button 
          @click="showWorkflowPanel = true"
          class="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-[var(--bg-tertiary)] transition-colors"
          title="工作流模板"
        >
          <n-icon :size="20"><AppsOutline /></n-icon>
        </button>
        <div class="w-full h-px bg-[var(--border-color)] my-1"></div>
        <button 
          v-for="tool in tools" 
          :key="tool.id"
          @click="tool.action"
          :disabled="tool.disabled && tool.disabled()"
          class="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          :title="tool.name"
        >
          <n-icon :size="20"><component :is="tool.icon" /></n-icon>
        </button>
      </aside>

      <!-- Node menu popup | 节点菜单弹窗 -->
      <div 
        v-if="showNodeMenu"
        class="node-menu-pop absolute left-20 top-1/2 -translate-y-1/2 p-2 z-20"
      >
        <button 
          v-for="nodeType in nodeTypeOptions" 
          :key="nodeType.type"
          @click="addNewNode(nodeType.type)"
          class="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors text-left"
        >
          <n-icon :size="20" :color="nodeType.color"><component :is="nodeType.icon" /></n-icon>
          <span class="text-sm">{{ nodeType.name }}</span>
        </button>
      </div>

      <!-- Bottom controls | 底部控制 -->
      <div class="zoom-dock absolute bottom-4 left-4 flex items-center gap-2 p-1">
        <!-- <button 
          @click="showGrid = !showGrid" 
          :class="showGrid ? 'bg-[var(--accent-color)] text-white' : 'hover:bg-[var(--bg-tertiary)]'"
          class="p-2 rounded transition-colors"
          title="切换网格"
        >
          <n-icon :size="16"><GridOutline /></n-icon>
        </button> -->
        <button 
          @click="fitView({ padding: 0.2 })" 
          class="p-2 hover:bg-[var(--bg-tertiary)] rounded transition-colors"
          title="适应视图"
        >
          <n-icon :size="16"><LocateOutline /></n-icon>
        </button>
        <div class="flex items-center gap-1 px-2">
          <button @click="zoomOut" class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
            <n-icon :size="14"><RemoveOutline /></n-icon>
          </button>
          <span class="text-xs min-w-[40px] text-center">{{ Math.round(viewport.zoom * 100) }}%</span>
          <button @click="zoomIn" class="p-1 hover:bg-[var(--bg-tertiary)] rounded transition-colors">
            <n-icon :size="14"><AddOutline /></n-icon>
          </button>
        </div>
      </div>

      <aside v-if="showRuntimeLogs" class="runtime-log-panel absolute right-4 top-4 z-30">
        <div class="runtime-log-head">
          <div>
            <p class="runtime-log-kicker">RUN LOG</p>
            <h3>运行日志</h3>
          </div>
          <div class="flex items-center gap-2">
            <button class="runtime-log-clear" @click="clearRuntimeLogs">清空</button>
            <button class="runtime-log-close" @click="showRuntimeLogs = false">×</button>
          </div>
        </div>
        <div v-if="runtimeLogs.length === 0" class="runtime-log-empty">
          暂无日志。开始生成后，请求、任务 ID、轮询和错误会显示在这里。
        </div>
        <div v-else class="runtime-log-list">
          <article
            v-for="log in runtimeLogs"
            :key="log.id"
            class="runtime-log-item"
            :class="`is-${log.level}`"
          >
            <div class="runtime-log-line">
              <span class="runtime-log-level">{{ log.level }}</span>
              <time>{{ formatLogTime(log.timestamp) }}</time>
            </div>
            <p>{{ log.message }}</p>
            <pre v-if="log.meta && Object.keys(log.meta).length">{{ JSON.stringify(log.meta, null, 2) }}</pre>
          </article>
        </div>
      </aside>

      <!-- Bottom input panel (floating) | 底部输入面板（悬浮） -->
      <div class="composer-dock absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4 z-20">
        <!-- Processing indicator | 处理中指示器 -->
        <div 
          v-if="isProcessing" 
          class="processing-card mb-3 p-3 animate-pulse"
        >
          <div class="flex items-center gap-2 text-sm text-[var(--accent-color)] mb-2">
            <n-spin :size="14" />
            <span>正在生成提示词...</span>
          </div>
          <div v-if="currentResponse" class="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
            {{ currentResponse }}
          </div>
        </div>

        <div class="composer-card p-3">
          <textarea
            v-model="chatInput"
            :placeholder="inputPlaceholder"
            :disabled="isProcessing"
            class="w-full bg-transparent resize-none outline-none text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] min-h-[40px] max-h-[120px] disabled:opacity-50"
            rows="1"
            @keydown.enter.exact="handleEnterKey"
            @keydown.enter.ctrl="sendMessage"
          />
          <div class="flex items-center justify-between mt-2">
            <div class="flex items-center gap-2">
              <button 
                @click="handlePolish"
                :disabled="isProcessing || !chatInput.trim()"
                class="px-3 py-1.5 text-xs rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="AI 润色提示词"
              >
                ✨ AI 润色
              </button>
            </div>
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <n-switch v-model:value="autoExecute" size="small" />
                自动执行
              </label>
              <button 
                @click="sendMessage"
                :disabled="isProcessing"
                class="w-8 h-8 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-hover)] flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <n-spin v-if="isProcessing" :size="16" />
                <n-icon v-else :size="20" color="white"><SendOutline /></n-icon>
              </button>
            </div>
          </div>
        </div>
        
        <!-- Quick suggestions | 快捷建议 -->
        <div class="canvas-suggestions flex flex-wrap items-center justify-center gap-2 mt-2">
          <span class="text-xs text-[var(--text-secondary)]">推荐：</span>
          <button 
            v-for="tag in suggestions" 
            :key="tag"
            @click="chatInput = tag"
            class="px-2 py-0.5 text-xs rounded-full bg-[var(--bg-secondary)]/80 border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors"
          >
            {{ tag }}
          </button>
          <button class="p-1 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors" @click="refreshSuggestions" title="换一批">
            <n-icon :size="14"><RefreshOutline /></n-icon>
          </button>
        </div>
      </div>
    </div>

    <!-- API Settings Modal | API 设置弹窗 -->
    <ApiSettings v-model:show="showApiSettings" />

    <!-- Rename Modal | 重命名弹窗 -->
    <n-modal v-model:show="showRenameModal" preset="dialog" title="重命名项目">
      <n-input v-model:value="renameValue" placeholder="请输入项目名称" />
      <template #action>
        <n-button @click="showRenameModal = false">取消</n-button>
        <n-button type="primary" @click="confirmRename">确定</n-button>
      </template>
    </n-modal>

    <!-- Delete Confirm Modal | 删除确认弹窗 -->
    <n-modal v-model:show="showDeleteModal" preset="dialog" title="删除项目" type="warning">
      <p>确定要删除项目「{{ projectName }}」吗？此操作不可恢复。</p>
      <template #action>
        <n-button @click="showDeleteModal = false">取消</n-button>
        <n-button type="error" @click="confirmDelete">删除</n-button>
      </template>
    </n-modal>

    <!-- Download Modal | 下载弹窗 -->
    <DownloadModal v-model:show="showDownloadModal" />

    <!-- Workflow Panel | 工作流面板 -->
    <WorkflowPanel v-model:show="showWorkflowPanel" @add-workflow="handleAddWorkflow" />
  </div>
</template>

<script setup>
/**
 * Canvas view component | 画布视图组件
 * Main infinite canvas with Vue Flow integration
 */
import { ref, computed, onMounted, onUnmounted, watch, nextTick, markRaw } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { Background } from '@vue-flow/background'
import { MiniMap } from '@vue-flow/minimap'
import { NIcon, NSwitch, NDropdown, NMessageProvider, NSpin, NModal, NInput, NButton } from 'naive-ui'
import { 
  ChevronBackOutline,
  ChevronDownOutline,
  SettingsOutline,
  AddOutline,
  ImageOutline,
  SendOutline,
  RefreshOutline,
  TextOutline,
  VideocamOutline,
  ColorPaletteOutline,
  BookmarkOutline,
  ArrowUndoOutline,
  ArrowRedoOutline,
  GridOutline,
  LocateOutline,
  RemoveOutline,
  DownloadOutline,
  AppsOutline,
  ChatbubbleOutline
} from '@vicons/ionicons5'
import { nodes, edges, runtimeLogs, clearRuntimeLogs, addNode, addNodes, addEdge, addEdges, updateNode, initSampleData, loadProject, saveProject, clearCanvas, canvasViewport, updateViewport, undo, redo, canUndo, canRedo, manualSaveHistory, startBatchOperation, endBatchOperation } from '../stores/canvas'
import { loadAllModels } from '../stores/models'
import { useChat, useWorkflowOrchestrator } from '../hooks'
import { useModelStore } from '../stores/pinia'
import { projects, initProjectsStore, updateProject, renameProject, currentProject } from '../stores/projects'

// API Settings component | API 设置组件
import ApiSettings from '../components/ApiSettings.vue'
import DownloadModal from '../components/DownloadModal.vue'
import WorkflowPanel from '../components/WorkflowPanel.vue'
import AppHeader from '../components/AppHeader.vue'
import { CANVAS_PROMPT_SUGGESTIONS } from '../config/promptLibrary'

// API Config state | API 配置状态
const modelStore = useModelStore()
const hasAnyApiConfigured = computed(() => modelStore.hasAnyApiKey)
const isChatConfigured = computed(() => !!modelStore.currentChatApiKey)

// Initialize models on page load | 页面加载时初始化模型
onMounted(() => {
  loadAllModels()
})

// Chat templates | 问答模板
const CHAT_TEMPLATES = {
  imagePrompt: {
    name: '生图提示词',
    systemPrompt: '你是一个专业的AI绘画提示词专家。将用户输入的内容美化成高质量的生图提示词，包含风格、光线、构图、细节等要素。必须保持用户原始语言：如果用户用中文输入，就用中文输出；如果用户用英文输入，就用英文输出。不要把中文翻译成英文，除非用户明确要求翻译。直接返回润色后的提示词，不要解释。',
  },
  videoPrompt: {
    name: '视频提示词',
    systemPrompt: '你是一个专业的AI视频提示词专家。将用户输入的内容美化成高质量的视频生成提示词，包含运动、场景、镜头等要素。必须保持用户原始语言：如果用户用中文输入，就用中文输出；如果用户用英文输入，就用英文输出。不要把中文翻译成英文，除非用户明确要求翻译。直接返回润色后的提示词，不要解释。',
  }
}

// Current template | 当前模板
const currentTemplate = ref('imagePrompt')

// Chat hook with image prompt template | 问答 hook
const { 
  loading: chatLoading, 
  status: chatStatus, 
  currentResponse, 
  send: sendChat 
} = useChat({
  systemPrompt: CHAT_TEMPLATES.imagePrompt.systemPrompt
})

// Workflow orchestrator hook | 工作流编排 hook
const {
  isAnalyzing: workflowAnalyzing,
  isExecuting: workflowExecuting,
  currentStep: workflowStep,
  totalSteps: workflowTotalSteps,
  executionLog: workflowLog,
  analyzeIntent,
  executeWorkflow,
  createTextToImageWorkflow,
  createMultiAngleStoryboard,
  WORKFLOW_TYPES
} = useWorkflowOrchestrator()

// Custom node components | 自定义节点组件
import TextNode from '../components/nodes/TextNode.vue'
import ImageConfigNode from '../components/nodes/ImageConfigNode.vue'
import VideoNode from '../components/nodes/VideoNode.vue'
import ImageNode from '../components/nodes/ImageNode.vue'
import VideoConfigNode from '../components/nodes/VideoConfigNode.vue'
import LLMConfigNode from '../components/nodes/LLMConfigNode.vue'
import ImageRoleEdge from '../components/edges/ImageRoleEdge.vue'
import PromptOrderEdge from '../components/edges/PromptOrderEdge.vue'
import ImageOrderEdge from '../components/edges/ImageOrderEdge.vue'

const router = useRouter()
const route = useRoute()

// Vue Flow instance | Vue Flow 实例
const { viewport, zoomIn, zoomOut, fitView, updateNodeInternals } = useVueFlow()

// Register custom node types | 注册自定义节点类型
const nodeTypes = {
  text: markRaw(TextNode),
  imageConfig: markRaw(ImageConfigNode),
  video: markRaw(VideoNode),
  image: markRaw(ImageNode),
  videoConfig: markRaw(VideoConfigNode),
  llmConfig: markRaw(LLMConfigNode)
}

// Register custom edge types | 注册自定义边类型
const edgeTypes = {
  imageRole: markRaw(ImageRoleEdge),
  promptOrder: markRaw(PromptOrderEdge),
  imageOrder: markRaw(ImageOrderEdge)
}

// UI state | UI状态
const showNodeMenu = ref(false)
const chatInput = ref('')
const autoExecute = ref(false)
const isMobile = ref(false)
const showGrid = ref(true)
const showApiSettings = ref(false)
const isProcessing = ref(false)

// Flow key for forcing re-render on project switch | 项目切换时强制重新渲染的 key
const flowKey = ref(Date.now())

// Modal state | 弹窗状态
const showRenameModal = ref(false)
const showDeleteModal = ref(false)
const showDownloadModal = ref(false)
const showWorkflowPanel = ref(false)
const showRuntimeLogs = ref(false)
const renameValue = ref('')

// Check if has downloadable assets | 检查是否有可下载素材
const hasDownloadableAssets = computed(() => {
  return nodes.value.some(n => 
    (n.type === 'image' || n.type === 'video') && n.data?.url
  )
})

const runtimeErrorCount = computed(() => runtimeLogs.value.filter((log) => log.level === 'error').length)

const formatLogTime = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}


// Project info | 项目信息
const projectName = computed(() => {
  const project = projects.value.find(p => p.id === route.params.id)
  return project?.name || '未命名项目'
})

// Project dropdown options | 项目下拉选项
const projectOptions = [
  { label: '重命名', key: 'rename' },
  { label: '复制', key: 'duplicate' },
  { label: '删除', key: 'delete' }
]

// Toolbar tools | 工具栏工具
const tools = [
  { id: 'text', name: '文本', icon: TextOutline, action: () => addNewNode('text') },
  { id: 'image', name: '图片', icon: ImageOutline, action: () => addNewNode('image') },
  { id: 'imageConfig', name: '文生图', icon: ColorPaletteOutline, action: () => addNewNode('imageConfig') },
  { id: 'videoConfig', name: '视频生成', icon: VideocamOutline, action: () => addNewNode('videoConfig') },
  { id: 'undo', name: '撤销', icon: ArrowUndoOutline, action: () => undo(), disabled: () => !canUndo() },
  { id: 'redo', name: '重做', icon: ArrowRedoOutline, action: () => redo(), disabled: () => !canRedo() }
]

// Node type options for menu | 节点类型菜单选项
const nodeTypeOptions = [
  { type: 'text', name: '文本节点', icon: TextOutline, color: '#3b82f6' },
  { type: 'llmConfig', name: 'LLM文本生成', icon: ChatbubbleOutline, color: '#a855f7' },
  { type: 'imageConfig', name: '文生图配置', icon: ColorPaletteOutline, color: '#22c55e' },
  { type: 'videoConfig', name: '视频生成配置', icon: VideocamOutline, color: '#f59e0b' },
  { type: 'image', name: '图片节点', icon: ImageOutline, color: '#8b5cf6' },
  { type: 'video', name: '视频节点', icon: VideocamOutline, color: '#ef4444' }
]

// Input placeholder | 输入占位符
const inputPlaceholder = '你可以试着说"帮我生成一个二次元的卡通角色"'

// Quick suggestions | 快捷建议
const legacySuggestions = CANVAS_PROMPT_SUGGESTIONS.slice(0, 4)

// Add new node | 添加新节点
const suggestionPool = CANVAS_PROMPT_SUGGESTIONS

const suggestions = ref([])

const refreshSuggestions = () => {
  suggestions.value = [...suggestionPool].sort(() => Math.random() - 0.5).slice(0, 5)
}

const addNewNode = async (type) => {
  // Calculate viewport center position | 计算视口中心位置
  const viewportCenterX = -viewport.value.x / viewport.value.zoom + (window.innerWidth / 2) / viewport.value.zoom
  const viewportCenterY = -viewport.value.y / viewport.value.zoom + (window.innerHeight / 2) / viewport.value.zoom
  
  // Add node at viewport center | 在视口中心添加节点
  const nodeId = addNode(type, { x: viewportCenterX - 100, y: viewportCenterY - 100 })
  
  // Set highest z-index | 设置最高层级
  const maxZIndex = Math.max(0, ...nodes.value.map(n => n.zIndex || 0))
  updateNode(nodeId, { zIndex: maxZIndex + 1 })
  
  // Force Vue Flow to recalculate node dimensions | 强制 Vue Flow 重新计算节点尺寸
  setTimeout(() => {
    updateNodeInternals(nodeId)
  }, 50)
  
  showNodeMenu.value = false
}

// Handle add workflow from panel | 处理从面板添加工作流
const handleAddWorkflow = ({ workflow, options }) => {
  // Calculate viewport center position | 计算视口中心位置
  const viewportCenterX = -viewport.value.x / viewport.value.zoom + (window.innerWidth / 2) / viewport.value.zoom
  const viewportCenterY = -viewport.value.y / viewport.value.zoom + (window.innerHeight / 2) / viewport.value.zoom

  // Create nodes from workflow template | 从工作流模板创建节点
  const startPosition = { x: viewportCenterX - 300, y: viewportCenterY - 200 }
  const { nodes: newNodes, edges: newEdges } = workflow.createNodes(startPosition, options)

  // Start batch operation manually | 手动开始批量操作
  startBatchOperation()

  // Add nodes to canvas in batch | 批量将节点添加到画布
  const nodeSpecs = newNodes.map(node => ({
    type: node.type,
    position: node.position,
    data: node.data
  }))
  const nodeIds = addNodes(nodeSpecs, false)

  // Map old node IDs to new IDs | 映射旧节点ID到新ID
  const idMap = {}
  newNodes.forEach((node, index) => {
    idMap[node.id] = nodeIds[index]
  })

  // Add edges to canvas in batch | 批量将边添加到画布
  const edgeSpecs = newEdges.map(edge => ({
    source: idMap[edge.source] || edge.source,
    target: idMap[edge.target] || edge.target,
    sourceHandle: edge.sourceHandle || 'right',
    targetHandle: edge.targetHandle || 'left',
    type: edge.type,
    data: edge.data
  }))

  // Add edges (autoBatch=false to use manual batch) | 添加边（autoBatch=false 以使用手动批量）
  addEdges(edgeSpecs, false)

  // End batch operation and save to history | 结束批量操作并保存到历史
  endBatchOperation()

  // Delay node internals update | 延迟节点内部更新
  setTimeout(() => {
    // Update node internals | 更新节点内部
    nodeIds.forEach(nodeId => {
      updateNodeInternals(nodeId)
    })
  }, 100)

  window.$message?.success(`已添加工作流: ${workflow.name}`)
}

// Handle connection | 处理连接
const onConnect = (params) => {
  // Check connection types | 检查连接类型
  const sourceNode = nodes.value.find(n => n.id === params.source)
  const targetNode = nodes.value.find(n => n.id === params.target)
  
  if (sourceNode?.type === 'image' && targetNode?.type === 'videoConfig') {
    // Use imageRole edge type | 使用图片角色边类型
    addEdge({
      ...params,
      type: 'imageRole',
      data: { imageRole: 'first_frame_image' } // Default to first frame | 默认首帧
    })
  } else if (sourceNode?.type === 'text' && targetNode?.type === 'imageConfig') {
    // Use promptOrder edge type | 使用提示词顺序边类型
    // Calculate next order number | 计算下一个顺序号
    const existingTextEdges = edges.value.filter(e => 
      e.target === params.target && e.type === 'promptOrder'
    )
    const nextOrder = existingTextEdges.length + 1
    
    addEdge({
      ...params,
      type: 'promptOrder',
      data: { promptOrder: nextOrder }
    })
  } else if (sourceNode?.type === 'image' && targetNode?.type === 'imageConfig') {
    // Use imageOrder edge type | 使用图片顺序边类型
    // Calculate next order number | 计算下一个顺序号
    const existingImageEdges = edges.value.filter(e =>
      e.target === params.target && e.type === 'imageOrder'
    )

    // Get @ mentioned image count from connected TextNodes | 获取已连接 TextNode 中 @ 提及的图片数量
    let mentionedImageCount = 0
    const connectedTextEdges = edges.value.filter(e => e.target === params.target)
    for (const edge of connectedTextEdges) {
      const sourceNode = nodes.value.find(n => n.id === edge.source)
      if (sourceNode?.type === 'text') {
        const content = sourceNode.data?.content || ''
        // Count @ mentions of image nodes | 统计图片节点的 @ 提及
        const mentionRegex = /@\[([^\]|]+)(?:\|([^\]]+))?\]/g
        let match
        while ((match = mentionRegex.exec(content)) !== null) {
          const mentionedNode = nodes.value.find(n => n.id === match[1])
          if (mentionedNode?.type === 'image') {
            mentionedImageCount++
          }
        }
      }
    }

    // Next order = existing edges + mentioned image count + 1 | 下一个序号 = 现有边数 + @提及图片数 + 1
    const nextOrder = existingImageEdges.length + mentionedImageCount + 1

    addEdge({
      ...params,
      type: 'imageOrder',
      data: { imageOrder: nextOrder }
    })
  } else if (sourceNode?.type === 'llmConfig' && targetNode?.type === 'imageConfig') {
    // LLM output as prompt for image generation | LLM 输出作为图片生成提示词
    const existingTextEdges = edges.value.filter(e =>
      e.target === params.target && e.type === 'promptOrder'
    )
    const nextOrder = existingTextEdges.length + 1

    addEdge({
      ...params,
      type: 'promptOrder',
      data: { promptOrder: nextOrder }
    })
  } else if (sourceNode?.type === 'llmConfig' && targetNode?.type === 'videoConfig') {
    // LLM output as prompt for video generation | LLM 输出作为视频生成提示词
    addEdge({
      ...params,
      type: 'promptOrder',
      data: { promptOrder: 1 }
    })
  } else {
    addEdge(params)
  }
}
const onNodeClick = (event) => {
  // nodes.value.forEach(node => {
  //   updateNode(node.id, { selected: false })
  // })
  
  // // Select clicked node | 选中的节点
  // const clickedNode = nodes.value.find(n => n.id === event.node.id)
  // if (clickedNode) {
  //   updateNode(event.node.id, { selected: true })
  // }
}

// Handle viewport change | 处理视口变化
const handleViewportChange = (newViewport) => {
  updateViewport(newViewport)
}

// Handle edges change | 处理边变化
const onEdgesChange = (changes) => {
  // Check if any edge is being removed | 检查是否有边被删除
  const hasRemoval = changes.some(change => change.type === 'remove')
  
  if (hasRemoval) {
    // Trigger history save after edge removal | 边删除后触发历史保存
    nextTick(() => {
      manualSaveHistory()
    })
  }
}

// Handle pane click | 处理画布点击
const onPaneClick = () => {
  showNodeMenu.value = false
  // Clear all selections | 清除所有选中
  // nodes.value = nodes.value.map(node => ({
  //   ...node,
  //   selected: false
  // }))
}

// Handle project action | 处理项目操作
const handleProjectAction = (key) => {
  switch (key) {
    case 'rename':
      renameValue.value = projectName.value
      showRenameModal.value = true
      break
    case 'duplicate':
      // TODO: Implement duplicate
      window.$message?.info('复制功能开发中')
      break
    case 'delete':
      showDeleteModal.value = true
      break
  }
}

// Confirm rename | 确认重命名
const confirmRename = () => {
  const projectId = route.params.id
  if (renameValue.value.trim()) {
    renameProject(projectId, renameValue.value.trim())
    window.$message?.success('已重命名')
  }
  showRenameModal.value = false
}

// Confirm delete | 确认删除
const confirmDelete = () => {
  const projectId = route.params.id
  // deleteProject(projectId) // TODO: import deleteProject
  showDeleteModal.value = false
  window.$message?.success('项目已删除')
  router.push('/')
}

// Handle Enter key | 处理回车键
const handleEnterKey = (e) => {
  e.preventDefault()
  sendMessage()
}

// Handle AI polish | 处理 AI 润色
const handlePolish = async () => {
  const input = chatInput.value.trim()
  if (!input) return
  
  // Check API configuration | 检查 API 配置
  if (!isChatConfigured.value) {
    window.$message?.warning('请先配置 API Key')
    showApiSettings.value = true
    return
  }

  if (!modelStore.selectedChatModel) {
    window.$message?.warning('请先在 API 设置的模型配置里添加文本模型')
    showApiSettings.value = true
    return
  }

  isProcessing.value = true
  const originalInput = chatInput.value

  try {
    // Call chat API to polish the prompt | 调用 AI 润色提示词
    const result = await sendChat(input, true, {
      model: modelStore.selectedChatModel,
      systemPrompt: CHAT_TEMPLATES[currentTemplate.value]?.systemPrompt || CHAT_TEMPLATES.imagePrompt.systemPrompt
    })
    
    if (result) {
      chatInput.value = result
      window.$message?.success('提示词已润色')
    }
  } catch (err) {
    chatInput.value = originalInput
    window.$message?.error(err.message || '润色失败')
  } finally {
    isProcessing.value = false
  }
}

// Send message | 发送消息
const sendMessage = async () => {
  const input = chatInput.value.trim()
  if (!input) return

  // Check API configuration | 检查 API 配置
  if (!isChatConfigured.value) {
    window.$message?.warning('请先配置 API Key')
    showApiSettings.value = true
    return
  }

  isProcessing.value = true
  const content = chatInput.value
  chatInput.value = ''

  try {
    // Calculate position to avoid overlap | 计算位置避免重叠
    let maxY = 0
    if (nodes.value.length > 0) {
      maxY = Math.max(...nodes.value.map(n => n.position.y))
    }
    const baseX = 100
    const baseY = maxY + 200

    if (autoExecute.value) {
      // Auto-execute mode: analyze intent and execute workflow | 自动执行模式：分析意图并执行工作流
      window.$message?.info('正在分析工作流...')
      
      try {
        // Analyze user intent | 分析用户意图
        const result = await analyzeIntent(content)
        
        // Ensure we have valid workflow params | 确保有效的工作流参数
        const workflowParams = {
          workflow_type: result?.workflow_type || WORKFLOW_TYPES.TEXT_TO_IMAGE,
          image_prompt: result?.image_prompt || content,
          video_prompt: result?.video_prompt || content,
          character: result?.character,
          shots: result?.shots
        }
        
        window.$message?.info(`执行工作流: ${result?.description || '文生图'}`)
        
        // Execute the workflow | 执行工作流
        await executeWorkflow(workflowParams, { x: baseX, y: baseY })
        
        window.$message?.success('工作流已启动')
      } catch (err) {
        console.error('Workflow error:', err)
        // Fallback to simple text-to-image | 回退到文生图
        window.$message?.warning('使用默认文生图工作流')
        await createTextToImageWorkflow(content, { x: baseX, y: baseY })
      }
    } else {
      // Manual mode: just create nodes | 手动模式：仅创建节点
      const textNodeId = addNode('text', { x: baseX, y: baseY }, { 
        content: content, 
        label: '提示词' 
      })
      
      const imageConfigNodeId = addNode('imageConfig', { x: baseX + 400, y: baseY }, {
        label: '文生图'
      })
      
      addEdge({
        source: textNodeId,
        target: imageConfigNodeId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
    }
  } catch (err) {
    window.$message?.error(err.message || '创建失败')
  } finally {
    isProcessing.value = false
  }
}

// Go back to home | 返回首页
const goBack = () => {
  router.push('/')
}

// Check if mobile | 检测是否移动端
const checkMobile = () => {
  isMobile.value = window.innerWidth < 768
}

// Load project by ID | 根据ID加载项目
const loadProjectById = (projectId) => {
  // Update flow key to force VueFlow re-render | 更新 key 强制 VueFlow 重新渲染
  flowKey.value = Date.now()
  
  if (projectId && projectId !== 'new') {
    loadProject(projectId)
  } else {
    // New project - clear canvas | 新项目 - 清空画布
    clearCanvas()
  }
}

// Watch for route changes | 监听路由变化
watch(
  () => route.params.id,
  (newId, oldId) => {
    if (newId && newId !== oldId) {
      // Save current project before switching | 切换前保存当前项目
      if (oldId) {
        saveProject()
      }
      // Load new project | 加载新项目
      loadProjectById(newId)
    }
  }
)

// Initialize | 初始化
onMounted(() => {
  checkMobile()
  refreshSuggestions()
  window.addEventListener('resize', checkMobile)
  
  // Initialize projects store | 初始化项目存储
  initProjectsStore()
  
  // Load project data | 加载项目数据
  loadProjectById(route.params.id)
  
  // Check for initial prompt from home page | 检查来自首页的初始提示词
  const initialPrompt = sessionStorage.getItem('ai-canvas-initial-prompt')
  if (initialPrompt) {
    sessionStorage.removeItem('ai-canvas-initial-prompt')
    chatInput.value = initialPrompt
    // Auto-send the message | 自动发送消息
    nextTick(() => {
      sendMessage()
    })
  }
})

// Cleanup on unmount | 卸载时清理
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile)
  // Save project before leaving | 离开前保存项目
  saveProject()
})
</script>

<style>
/* Import Vue Flow styles | 引入 Vue Flow 样式 */
@import '@vue-flow/core/dist/style.css';
@import '@vue-flow/core/dist/theme-default.css';
@import '@vue-flow/minimap/dist/style.css';

.canvas-flow {
  width: 100%;
  height: 100%;
  background:
    radial-gradient(circle at 18% 16%, rgba(45, 212, 191, 0.18), transparent 28%),
    radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.14), transparent 30%),
    radial-gradient(circle at 72% 82%, rgba(132, 204, 22, 0.1), transparent 26%),
    linear-gradient(rgba(15, 23, 42, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.055) 1px, transparent 1px),
    linear-gradient(rgba(20, 184, 166, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(20, 184, 166, 0.055) 1px, transparent 1px),
    linear-gradient(135deg, rgba(247, 252, 255, 0.96), rgba(238, 250, 246, 0.9) 52%, rgba(248, 250, 252, 0.96));
  background-size: auto, auto, auto, 80px 80px, 80px 80px, 20px 20px, 20px 20px, auto;
  background-position: center, center, center, -1px -1px, -1px -1px, -1px -1px, -1px -1px, center;
}

.dark .canvas-flow {
  background:
    radial-gradient(circle at 18% 16%, rgba(45, 212, 191, 0.16), transparent 28%),
    radial-gradient(circle at 78% 18%, rgba(56, 189, 248, 0.14), transparent 30%),
    radial-gradient(circle at 72% 82%, rgba(34, 197, 94, 0.1), transparent 26%),
    linear-gradient(rgba(148, 163, 184, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.1) 1px, transparent 1px),
    linear-gradient(rgba(45, 212, 191, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(45, 212, 191, 0.06) 1px, transparent 1px),
    linear-gradient(135deg, #07111f 0%, #0b1d1d 52%, #101827 100%);
  background-size: auto, auto, auto, 80px 80px, 80px 80px, 20px 20px, 20px 20px, auto;
  background-position: center, center, center, -1px -1px, -1px -1px, -1px -1px, -1px -1px, center;
}

.canvas-flow::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  opacity: 0.6;
  background-image:
    radial-gradient(circle, rgba(15, 118, 110, 0.22) 0 0.8px, transparent 1.2px),
    radial-gradient(circle, rgba(14, 165, 233, 0.18) 0 0.8px, transparent 1.2px);
  background-size: 34px 34px, 58px 58px;
  mask-image: radial-gradient(ellipse at 54% 45%, #000 0 58%, transparent 88%);
}

.dark .canvas-flow::before {
  opacity: 0.72;
  background-image:
    radial-gradient(circle, rgba(94, 234, 212, 0.34) 0 0.8px, transparent 1.2px),
    radial-gradient(circle, rgba(125, 211, 252, 0.2) 0 0.8px, transparent 1.2px);
}

.canvas-shell {
  position: relative;
  isolation: isolate;
  background:
    radial-gradient(circle at 50% 0%, rgba(255, 255, 255, 0.08), transparent 16%),
    radial-gradient(circle at 18% 12%, rgba(0, 163, 255, 0.16), transparent 32%),
    radial-gradient(circle at 84% 6%, rgba(34, 197, 94, 0.14), transparent 26%),
    linear-gradient(135deg, #f7fbff 0%, #eef7f5 52%, #f8fafc 100%);
}

.dark .canvas-shell {
  background:
    radial-gradient(circle at 50% 0%, rgba(230, 255, 247, 0.07), transparent 16%),
    radial-gradient(circle at 18% 12%, rgba(0, 163, 255, 0.18), transparent 32%),
    radial-gradient(circle at 84% 6%, rgba(34, 197, 94, 0.14), transparent 26%),
    linear-gradient(135deg, #07111f 0%, #0b1d1d 52%, #101827 100%);
}

.canvas-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.24;
  background-image:
    radial-gradient(circle, rgba(255, 255, 255, 0.42) 0 1px, transparent 1.4px),
    radial-gradient(circle, rgba(45, 212, 191, 0.36) 0 1px, transparent 1.4px);
  background-size: 96px 96px, 156px 156px;
  mask-image: radial-gradient(ellipse at 56% 42%, #000 0 45%, transparent 76%);
  z-index: 0;
}

.vue-flow__minimap.canvas-minimap {
  right: 16px;
  bottom: 26px;
  width: 210px;
  height: 140px;
  overflow: hidden;
  border: 1px solid rgba(14, 116, 144, 0.22);
  border-radius: 24px;
  background:
    radial-gradient(circle at 12% 0%, rgba(20, 184, 166, 0.2), transparent 38%),
    radial-gradient(circle at 86% 18%, rgba(56, 189, 248, 0.18), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(236, 253, 245, 0.58));
  box-shadow:
    0 24px 70px rgba(15, 23, 42, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.78);
  backdrop-filter: blur(22px) saturate(1.3);
}

.dark .vue-flow__minimap.canvas-minimap {
  border-color: rgba(94, 234, 212, 0.18);
  background:
    radial-gradient(circle at 12% 0%, rgba(45, 212, 191, 0.18), transparent 38%),
    radial-gradient(circle at 86% 18%, rgba(56, 189, 248, 0.14), transparent 34%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.78), rgba(6, 78, 59, 0.36));
  box-shadow:
    0 24px 74px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.vue-flow__minimap.canvas-minimap svg {
  border-radius: 22px;
}

.vue-flow__minimap.canvas-minimap .vue-flow__minimap-mask {
  fill: rgba(15, 118, 110, 0.14);
  stroke: rgba(13, 148, 136, 0.62);
  stroke-width: 2;
}

.dark .vue-flow__minimap.canvas-minimap .vue-flow__minimap-mask {
  fill: rgba(94, 234, 212, 0.1);
  stroke: rgba(94, 234, 212, 0.54);
}

.vue-flow__minimap.canvas-minimap .vue-flow__minimap-node {
  fill: rgba(20, 184, 166, 0.8);
  stroke: rgba(15, 118, 110, 0.9);
  stroke-width: 1.5;
  rx: 8;
  ry: 8;
}

.canvas-header {
  z-index: 30;
  width: min(1440px, calc(100vw - 24px));
  margin: 12px auto 0;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.42));
  box-shadow: 0 22px 70px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(28px) saturate(1.35);
}

.dark .canvas-header {
  border-color: rgba(203, 255, 239, 0.12);
  background: linear-gradient(135deg, rgba(8, 16, 28, 0.74), rgba(8, 36, 36, 0.48));
  box-shadow: 0 22px 74px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.canvas-ambient {
  position: absolute;
  pointer-events: none;
  border-radius: 999px;
  filter: blur(26px);
  opacity: 0.72;
  z-index: 0;
}

.canvas-ambient.one {
  width: 260px;
  height: 260px;
  left: 9%;
  top: 12%;
  background: rgba(0, 163, 255, 0.15);
}

.canvas-ambient.two {
  width: 320px;
  height: 320px;
  right: 7%;
  bottom: 7%;
  background: rgba(34, 197, 94, 0.12);
}

.canvas-toolbar,
.node-menu-pop,
.zoom-dock,
.composer-card,
.processing-card {
  border: 1px solid rgba(255, 255, 255, 0.42);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.76), rgba(255, 255, 255, 0.42)),
    radial-gradient(circle at 16% 0%, rgba(34, 255, 181, 0.1), transparent 34%);
  box-shadow: 0 24px 68px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(26px) saturate(1.3);
}

.dark .canvas-toolbar,
.dark .node-menu-pop,
.dark .zoom-dock,
.dark .composer-card,
.dark .processing-card {
  border-color: rgba(203, 255, 239, 0.12);
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.76), rgba(6, 78, 59, 0.22)),
    radial-gradient(circle at 16% 0%, rgba(34, 255, 181, 0.08), transparent 34%);
}

.canvas-toolbar {
  border-radius: 24px;
  overflow: hidden;
}

.canvas-toolbar button,
.zoom-dock button,
.node-menu-pop button {
  transition: transform 0.18s ease, background 0.18s ease, color 0.18s ease, box-shadow 0.18s ease;
}

.canvas-toolbar button:hover,
.zoom-dock button:hover,
.node-menu-pop button:hover {
  transform: translateY(-1px);
  box-shadow: 0 12px 28px rgba(34, 197, 94, 0.12);
}

.node-menu-pop,
.zoom-dock {
  border-radius: 18px;
}

.composer-card,
.processing-card {
  border-radius: 28px;
}

.composer-card {
  position: relative;
  overflow: hidden;
}

.composer-card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 88% 18%, rgba(34, 255, 181, 0.16), transparent 26%);
}

.canvas-suggestions button {
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(255, 255, 255, 0.66);
  backdrop-filter: blur(14px);
}

.dark .canvas-suggestions button {
  background: rgba(15, 23, 42, 0.64);
}

.log-error-dot {
  position: absolute;
  right: 2px;
  top: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.runtime-log-panel {
  width: min(390px, calc(100vw - 32px));
  max-height: calc(100vh - 140px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.42);
  border-radius: 30px;
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.12), transparent 34%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(241, 245, 249, 0.74));
  box-shadow: 0 34px 110px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(28px) saturate(1.32);
}

.dark .runtime-log-panel {
  border-color: rgba(203, 255, 239, 0.13);
  background:
    radial-gradient(circle at 12% 0%, rgba(34, 255, 181, 0.1), transparent 34%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.9), rgba(7, 34, 36, 0.78));
}

.runtime-log-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.22);
}

.runtime-log-kicker {
  color: var(--accent-color);
  font-size: 11px;
  letter-spacing: 0.18em;
  font-weight: 800;
}

.runtime-log-head h3 {
  font-size: 18px;
  font-weight: 800;
}

.runtime-log-clear,
.runtime-log-close {
  height: 30px;
  border-radius: 999px;
  padding: 0 10px;
  background: rgba(148, 163, 184, 0.14);
  font-size: 12px;
}

.runtime-log-close {
  width: 30px;
  padding: 0;
  font-size: 20px;
  line-height: 1;
}

.runtime-log-empty {
  padding: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.runtime-log-list {
  overflow-y: auto;
  padding: 12px;
}

.runtime-log-item {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-left: 3px solid rgba(148, 163, 184, 0.7);
  border-radius: 18px;
  padding: 10px 12px;
  background: rgba(248, 250, 252, 0.6);
  margin-bottom: 10px;
}

.dark .runtime-log-item {
  background: rgba(2, 6, 23, 0.38);
}

.runtime-log-item.is-success {
  border-left-color: #22c55e;
}

.runtime-log-item.is-error {
  border-left-color: #ef4444;
}

.runtime-log-item.is-info {
  border-left-color: #38bdf8;
}

.runtime-log-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}

.runtime-log-level {
  text-transform: uppercase;
  font-weight: 800;
}

.runtime-log-item p {
  font-size: 13px;
  line-height: 1.5;
}

.runtime-log-item pre {
  margin-top: 8px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-secondary);
  font-size: 11px;
}
</style>

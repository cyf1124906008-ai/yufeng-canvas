<template>
  <!-- Workflow panel | 工作流浮动面板 -->
  <Transition name="panel-slide">
    <div v-if="visible" class="workflow-panel" v-click-outside="handleClickOutside">
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
        <button class="expand-btn" @click="visible = false">
          <n-icon :size="16"><CloseOutline /></n-icon>
        </button>
      </div>
      
      <!-- Content | 内容 -->
      <div class="panel-content">
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

const props = defineProps({
  show: Boolean
})

const emit = defineEmits(['update:show', 'add-workflow'])

// Active tab | 当前标签
const activeTab = ref('public')
const selectedCategory = ref('all')

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
  left: 72px;
  top: 100px;
  width: min(900px, calc(100vw - 120px));
  max-height: min(78vh, 760px);
  background:
    radial-gradient(circle at 12% 0%, rgba(85, 245, 182, 0.12), transparent 30%),
    radial-gradient(circle at 88% 10%, rgba(24, 183, 255, 0.12), transparent 32%),
    var(--bg-secondary);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:global(.dark) .workflow-panel {
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* Header | 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid var(--border-color);
}

.panel-tabs {
  display: flex;
  gap: 24px;
}

.tab-item {
  font-size: 15px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s;
  padding-bottom: 4px;
}

.tab-item:hover {
  color: var(--text-primary);
}

.tab-item.active {
  color: var(--text-primary);
  font-weight: 700;
}

.panel-subtitle {
  margin-top: 7px;
  font-size: 12px;
  color: var(--text-secondary);
}

.expand-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 6px;
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
  padding: 18px;
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
  padding: 7px 11px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.42);
  font-size: 12px;
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
  gap: 14px;
}

/* Workflow card | 工作流卡片 */
.workflow-card {
  text-align: left;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.62);
  border-radius: 18px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s;
}

.workflow-card:hover {
  transform: translateY(-4px);
  border-color: rgba(85, 245, 182, 0.72);
  box-shadow: 0 18px 42px rgba(2, 20, 18, 0.12);
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
  background: var(--bg-tertiary);
  overflow: hidden;
}

.cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  background: rgba(5, 19, 27, 0.72);
  color: #EFFFF8;
  font-size: 11px;
  backdrop-filter: blur(8px);
}

.card-body {
  padding: 12px 13px 13px;
}

.card-title {
  font-size: 14px;
  font-weight: 700;
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
  border: 1px solid rgba(85, 245, 182, 0.28);
  border-radius: 14px;
  background: rgba(85, 245, 182, 0.08);
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
    left: 16px;
    top: 84px;
    width: calc(100vw - 32px);
  }

  .workflow-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

/* Transition | 过渡动画 */
.panel-slide-enter-active,
.panel-slide-leave-active {
  transition: all 0.25s ease;
}

.panel-slide-enter-from,
.panel-slide-leave-to {
  opacity: 0;
  transform: translateX(-12px);
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

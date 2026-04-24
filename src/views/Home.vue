<template>
  <div class="home-shell min-h-screen h-screen overflow-y-auto text-[var(--text-primary)]">
    <AppHeader class="home-header">
      <template #left>
        <div class="brand-lockup">
          <img src="../assets/logo.png" alt="YUFENG Canvas" class="brand-logo" />
          <div>
            <p class="brand-name">YUFENG Canvas</p>
            <p class="brand-subtitle">AI visual workflow studio</p>
          </div>
        </div>
      </template>
      <template #right>
        <button
          @click="showApiSettings = true"
          class="header-pill"
          :class="{ 'is-ready': isApiConfigured }"
          title="API 设置"
        >
          <n-icon :size="18"><SettingsOutline /></n-icon>
          <span>{{ isApiConfigured ? '已连接' : '配置 API' }}</span>
        </button>
      </template>
    </AppHeader>

    <main class="home-main">
      <section class="hero-grid">
        <div class="hero-copy">
          <div class="eyebrow">YUFENG CREATIVE CANVAS</div>
          <h1>把灵感拆成节点，让图片和视频按流程长出来。</h1>
          <p class="hero-desc">
            一个给创作者用的本地 AI 视觉工作台。填入自己的 Key 和模型名后，就能把图片、视频和提示词编排成可复用的创作流程。
          </p>

          <div class="hero-actions">
            <button class="primary-action" @click="handleCreateWithInput">
              <n-icon :size="20"><SendOutline /></n-icon>
              开始创作
            </button>
            <button class="secondary-action" @click="showApiSettings = true">
              <n-icon :size="18"><SettingsOutline /></n-icon>
              配置模型
            </button>
          </div>

          <div class="feature-strip">
            <button
              v-for="item in featureCards"
              :key="item.title"
              class="feature-mini"
              @click="createFromTemplate(item.prompt)"
            >
              <n-icon :size="18"><component :is="item.icon" /></n-icon>
              <span>{{ item.title }}</span>
            </button>
          </div>
        </div>

        <div class="prompt-panel">
          <div class="prompt-panel-glow"></div>
          <div class="mode-card">
            <div class="mode-tabs">
              <button :class="{ active: activeMode === 'chat' }" @click="activeMode = 'chat'">
                <n-icon :size="16"><ChatbubbleOutline /></n-icon>
                直接对话
              </button>
              <button :class="{ active: activeMode === 'create' }" @click="activeMode = 'create'">
                <n-icon :size="16"><ColorPaletteOutline /></n-icon>
                创作画布
              </button>
            </div>

            <div v-if="activeMode === 'chat'" class="chat-home">
              <div class="chat-thread">
                <div v-if="chatMessages.length === 0" class="chat-empty">
                  <div class="chat-orb">
                    <n-icon :size="28"><SparklesOutline /></n-icon>
                  </div>
                  <h3>问点什么，或让模型帮你拆创意。</h3>
                  <p>这里会直接调用你配置的文本模型；需要画图或视频时，再一键进入节点画布。</p>
                </div>
                <div
                  v-for="message in chatMessages"
                  :key="message.id"
                  class="chat-message"
                  :class="message.role"
                >
                  {{ message.content }}
                </div>
                <div v-if="chatLoading && currentResponse" class="chat-message assistant">
                  {{ currentResponse }}
                </div>
                <div v-else-if="chatLoading" class="chat-message assistant thinking">
                  <n-spin :size="14" />
                  正在思考...
                </div>
              </div>

              <div class="chat-composer">
                <textarea
                  v-model="chatText"
                  placeholder="直接和模型对话，例如：帮我把这个产品想法拆成 3 个视觉方向..."
                  :disabled="chatLoading"
                  @keydown.enter.exact.prevent="sendHomeChat"
                />
                <button class="send-button" :disabled="chatLoading || !chatText.trim()" @click="sendHomeChat">
                  <n-spin v-if="chatLoading" :size="16" />
                  <n-icon v-else :size="20"><SendOutline /></n-icon>
                </button>
              </div>

              <div class="suggestion-cloud">
                <span>试试：</span>
                <button v-for="tag in chatSuggestions" :key="tag" @click="chatText = tag">
                  {{ tag }}
                </button>
              </div>
            </div>

            <div v-else class="create-home">
              <div class="prompt-card-head">
                <span>输入一个想法</span>
                <span class="shortcut">Ctrl + Enter</span>
              </div>
              <textarea
                v-model="inputText"
                placeholder="例如：生成一组赛博东方茶馆的主视觉，包含人物、环境和短视频镜头..."
                @keydown.enter.ctrl="handleCreateWithInput"
              />
              <div class="prompt-footer">
                <button class="ghost-chip" @click="randomFill">
                  <n-icon :size="15"><RefreshOutline /></n-icon>
                  随机灵感
                </button>
                <button class="send-button" @click="handleCreateWithInput">
                  <n-icon :size="20"><SendOutline /></n-icon>
                </button>
              </div>

              <div class="suggestion-cloud">
                <span>推荐：</span>
                <button
                  v-for="tag in visibleSuggestions"
                  :key="tag"
                  @click="inputText = tag"
                >
                  {{ tag }}
                </button>
                <button class="refresh-chip" @click="refreshSuggestions" title="换一批">
                  <n-icon :size="15"><RefreshOutline /></n-icon>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="showcase-section">
        <div class="section-title">
          <div>
            <p class="eyebrow">READY TO BUILD</p>
            <h2>常用创作场景</h2>
          </div>
          <button class="new-project-button" @click="createNewProject">
            <n-icon :size="16"><AddOutline /></n-icon>
            新建空白项目
          </button>
        </div>

        <div class="showcase-grid">
          <button
            v-for="card in showcaseCards"
            :key="card.title"
            class="showcase-card"
            @click="createFromTemplate(card.prompt)"
          >
            <img :src="card.image" :alt="card.title" />
            <div class="showcase-overlay">
              <span>{{ card.badge }}</span>
              <h3>{{ card.title }}</h3>
              <p>{{ card.desc }}</p>
            </div>
          </button>
        </div>
      </section>

      <section ref="projectsSection" class="projects-section">
        <div class="section-title">
          <div>
            <p class="eyebrow">LOCAL WORKSPACE</p>
            <h2>我的项目</h2>
          </div>
        </div>

        <div v-if="projects.length === 0" class="empty-state">
          <n-icon :size="52"><FolderOutline /></n-icon>
          <h3>还没有项目</h3>
          <p>从一个提示词开始，YUFENG 会帮你创建可编辑的节点画布。</p>
          <button class="primary-action small" @click="createNewProject">创建第一个项目</button>
        </div>

        <div v-else class="project-grid">
          <div v-for="project in projects" :key="project.id" class="project-card group">
            <div class="project-thumb" @click="openProject(project)">
              <template v-if="project.thumbnail">
                <video
                  v-if="isVideoUrl(project.thumbnail)"
                  :ref="el => setVideoRef(project.id, el)"
                  :src="project.thumbnail"
                  muted
                  loop
                  playsinline
                />
                <img v-else :src="project.thumbnail" :alt="project.name" />
              </template>
              <div v-else class="project-placeholder">
                <n-icon :size="34"><DocumentOutline /></n-icon>
              </div>
            </div>
            <div class="project-meta">
              <button class="project-open" @click="openProject(project)">
                <span>{{ project.name }}</span>
                <small>{{ formatDate(project.updatedAt) }}</small>
              </button>
              <n-dropdown :options="getProjectActions(project)" @select="(key) => handleProjectAction(key, project)" placement="bottom-end">
                <button class="project-menu" @click.stop>
                  <n-icon :size="16"><EllipsisHorizontalOutline /></n-icon>
                </button>
              </n-dropdown>
            </div>
          </div>
        </div>
      </section>
    </main>

    <aside class="side-rail hidden md:flex">
      <button @click="createNewProject" title="新建项目">
        <n-icon :size="20"><DocumentOutline /></n-icon>
      </button>
      <button @click="scrollToProjects" title="我的项目">
        <n-icon :size="20"><FolderOutline /></n-icon>
      </button>
    </aside>

    <ApiSettings v-model:show="showApiSettings" @saved="refreshApiConfig" />

    <n-modal v-model:show="showRenameModal" preset="dialog" title="重命名项目">
      <n-input v-model:value="renameValue" placeholder="请输入项目名称" />
      <template #action>
        <n-button @click="showRenameModal = false">取消</n-button>
        <n-button type="primary" @click="confirmRename">确定</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { computed, h, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NDropdown, NIcon, NInput, NModal, NSpin, useDialog } from 'naive-ui'
import {
  AddOutline,
  ColorPaletteOutline,
  CopyOutline,
  DocumentOutline,
  EllipsisHorizontalOutline,
  FolderOutline,
  ImageOutline,
  RefreshOutline,
  SendOutline,
  SettingsOutline,
  SparklesOutline,
  ChatbubbleOutline,
  TrashOutline,
  VideocamOutline,
  CreateOutline
} from '@vicons/ionicons5'
import {
  projects,
  initProjectsStore,
  createProject,
  deleteProject,
  duplicateProject,
  renameProject
} from '../stores/projects'
import { useModelStore } from '../stores/pinia'
import { useChat } from '../hooks'
import ApiSettings from '../components/ApiSettings.vue'
import AppHeader from '../components/AppHeader.vue'
import showcaseBrand from '../assets/showcase-brand.png'
import showcaseStoryboard from '../assets/showcase-storyboard.png'
import showcaseVideo from '../assets/showcase-video.png'

const router = useRouter()
const dialog = useDialog()
const modelStore = useModelStore()

const showApiSettings = ref(false)
const activeMode = ref('chat')
const inputText = ref('')
const chatText = ref('')
const chatMessages = ref([])
const showRenameModal = ref(false)
const renameValue = ref('')
const renameTargetId = ref(null)
const projectsSection = ref(null)
const videoRefs = new Map()

const isApiConfigured = computed(() => modelStore.hasAnyApiKey)
const isChatConfigured = computed(() => !!modelStore.currentChatApiKey && !!modelStore.selectedChatModel)

const {
  loading: chatLoading,
  currentResponse,
  send: sendChat
} = useChat({
  systemPrompt: '你是 YUFENG Canvas 的创意助手。回答要直接、有帮助；如果用户在做视觉创作，可以主动给出可执行的提示词、镜头、构图、比例和下一步建议。'
})

const suggestionPool = [
  '赛博东方茶馆，雨夜霓虹，电影感主视觉',
  '三只不同性格的小猫，儿童绘本分镜',
  '夏日田野环绕漫步，清新广告短片',
  '未来感运动鞋发布海报，金属材质和蓝色光效',
  '古风少女在竹林练剑，飘带与逆光',
  '一组美食摄影：日式街角拉面店，暖色灯光',
  '低多边形游戏场景，漂浮岛屿和瀑布',
  '生成多角度分镜：机器人管家整理书房',
  '国潮包装设计，玉兰花、山水纹样、纸质肌理',
  '首尾帧视频：宇航员走进发光森林',
  '图生视频：让照片里的海浪缓慢涌动',
  '电商主图：透明耳机，水晶质感，高级灰背景',
  '短视频镜头：咖啡杯热气升起，晨光穿过窗帘',
  '像素风城市夜景，雨滴反射霓虹灯牌',
  '电影海报：孤独骑士站在沙漠巨门前'
]

const visibleSuggestions = ref([])

const chatSuggestions = [
  '帮我把一个新茶饮品牌拆成 3 个视觉方向',
  '把这个提示词优化成更适合生图的版本',
  '给我一个 6 镜头短视频分镜',
  '帮我分析图片模型和视频模型应该怎么选'
]

const featureCards = [
  {
    title: '文生图',
    icon: ImageOutline,
    prompt: '文生图：生成一张未来城市雨夜海报，霓虹灯、电影感构图、16:9 比例'
  },
  {
    title: '图生图',
    icon: ColorPaletteOutline,
    prompt: '图生图：基于参考图片重绘成高级商业海报风格，保持主体一致，增强光影和质感'
  },
  {
    title: '视频生成',
    icon: VideocamOutline,
    prompt: '视频生成：生成一个 5 秒短片，镜头缓慢推进，雨夜城市里一只发光小狐狸穿过巷子'
  },
  {
    title: '节点工作流',
    icon: DocumentOutline,
    prompt: '节点工作流：创建一个从提示词到图片再到视频的完整流程，包含文生图、图生视频和比例设置'
  }
]

const showcaseCards = [
  {
    title: '品牌主视觉',
    badge: 'Text to Image',
    desc: '把一句创意拆成提示词、比例和图片生成节点。',
    prompt: '为一个未来科技品牌生成主视觉，蓝黑色调，金属质感，适合发布会海报',
    image: showcaseBrand
  },
  {
    title: '分镜故事板',
    badge: 'Storyboard',
    desc: '一键生成多段文本，再串联图片节点形成分镜。',
    prompt: '生成一个 6 镜头短片分镜：雨夜城市里，一只发光小狐狸带主角穿过巷子',
    image: showcaseStoryboard
  },
  {
    title: '图生视频',
    badge: 'Image to Video',
    desc: '连接图片到视频节点，支持首帧、尾帧和比例设置。',
    prompt: '把图片做成 5 秒视频：镜头轻微推进，光线流动，画面保持高级质感',
    image: showcaseVideo
  }
]

const refreshSuggestions = () => {
  const shuffled = [...suggestionPool].sort(() => Math.random() - 0.5)
  visibleSuggestions.value = shuffled.slice(0, 5)
}

const randomFill = () => {
  inputText.value = suggestionPool[Math.floor(Math.random() * suggestionPool.length)]
}

const refreshApiConfig = () => {}

const setVideoRef = (projectId, el) => {
  if (el) {
    videoRefs.set(projectId, el)
  } else {
    videoRefs.delete(projectId)
  }
}

const formatDate = (date) => {
  if (!date) return ''
  const diff = Date.now() - new Date(date).getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`
  const d = new Date(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

const getProjectActions = () => [
  { label: '重命名', key: 'rename', icon: () => h(NIcon, null, { default: () => h(CreateOutline) }) },
  { label: '复制', key: 'duplicate', icon: () => h(NIcon, null, { default: () => h(CopyOutline) }) },
  { type: 'divider' },
  { label: '删除', key: 'delete', icon: () => h(NIcon, null, { default: () => h(TrashOutline) }) }
]

const handleProjectAction = (key, project) => {
  if (key === 'rename') {
    renameTargetId.value = project.id
    renameValue.value = project.name
    showRenameModal.value = true
    return
  }

  if (key === 'duplicate') {
    const newId = duplicateProject(project.id)
    if (newId) window.$message?.success('项目已复制')
    return
  }

  if (key === 'delete') {
    dialog.warning({
      title: '删除项目',
      content: `确定要删除「${project.name}」吗？此操作不可恢复。`,
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: () => {
        deleteProject(project.id)
        window.$message?.success('项目已删除')
      }
    })
  }
}

const confirmRename = () => {
  if (renameTargetId.value && renameValue.value.trim()) {
    renameProject(renameTargetId.value, renameValue.value.trim())
    window.$message?.success('已重命名')
  }
  showRenameModal.value = false
  renameTargetId.value = null
  renameValue.value = ''
}

const ensureConfigured = () => {
  if (isApiConfigured.value) return true
  showApiSettings.value = true
  window.$message?.warning('请先配置 DataEyes API Key 和模型名')
  return false
}

const createNewProject = () => {
  if (!ensureConfigured()) return
  const id = createProject('未命名项目')
  router.push(`/canvas/${id}`)
}

const sendHomeChat = async () => {
  const content = chatText.value.trim()
  if (!content || chatLoading.value) return

  if (!isChatConfigured.value) {
    showApiSettings.value = true
    window.$message?.warning('请先配置文本模型和可用的 API Key')
    return
  }

  const userMessage = {
    id: `user_${Date.now()}`,
    role: 'user',
    content
  }
  chatMessages.value.push(userMessage)
  chatText.value = ''

  try {
    const reply = await sendChat(content, true, {
      model: modelStore.selectedChatModel
    })
    if (reply) {
      chatMessages.value.push({
        id: `assistant_${Date.now()}`,
        role: 'assistant',
        content: reply
      })
    }
  } catch (err) {
    chatMessages.value.push({
      id: `error_${Date.now()}`,
      role: 'assistant',
      content: err.message || '对话失败，请检查模型名、API Key 或网络。'
    })
  }
}

const createFromTemplate = (prompt) => {
  inputText.value = prompt
  handleCreateWithInput()
}

const handleCreateWithInput = () => {
  if (!ensureConfigured()) return
  const prompt = inputText.value.trim()
  const id = createProject(prompt ? prompt.slice(0, 24) : '未命名项目')
  sessionStorage.setItem('ai-canvas-initial-prompt', prompt)
  inputText.value = ''
  router.push(`/canvas/${id}`)
}

const openProject = (project) => {
  if (!ensureConfigured()) return
  router.push(`/canvas/${project.id}`)
}

const isVideoUrl = (url) => {
  if (!url || typeof url !== 'string') return false
  return ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'].some((ext) => url.toLowerCase().includes(ext))
}

const scrollToProjects = () => {
  projectsSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  initProjectsStore()
  refreshSuggestions()
})
</script>

<style scoped>
.home-shell {
  background:
    radial-gradient(circle at 12% 12%, rgba(0, 207, 255, 0.18), transparent 34%),
    radial-gradient(circle at 82% 8%, rgba(34, 197, 94, 0.16), transparent 28%),
    linear-gradient(135deg, #f7fbff 0%, #eef7f5 48%, #f8fafc 100%);
}

.dark .home-shell {
  background:
    radial-gradient(circle at 15% 10%, rgba(0, 207, 255, 0.18), transparent 34%),
    radial-gradient(circle at 85% 12%, rgba(34, 197, 94, 0.14), transparent 30%),
    linear-gradient(135deg, #07111f 0%, #0b1d1d 48%, #101827 100%);
}

.home-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-color: rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(22px);
}

.dark .home-header {
  background: rgba(8, 14, 26, 0.72);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(0, 143, 255, 0.28);
}

.brand-name {
  font-weight: 800;
  letter-spacing: 0.04em;
}

.brand-subtitle {
  margin-top: -2px;
  font-size: 11px;
  color: var(--text-secondary);
}

.header-pill,
.secondary-action,
.ghost-chip,
.new-project-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  background: rgba(255, 255, 255, 0.68);
  border-radius: 999px;
  padding: 9px 14px;
  transition: all 0.2s ease;
}

.dark .header-pill,
.dark .secondary-action,
.dark .ghost-chip,
.dark .new-project-button {
  background: rgba(15, 23, 42, 0.66);
}

.header-pill:hover,
.secondary-action:hover,
.ghost-chip:hover,
.new-project-button:hover {
  border-color: var(--accent-color);
  transform: translateY(-1px);
}

.header-pill.is-ready {
  color: #0f9f5f;
  border-color: rgba(34, 197, 94, 0.35);
}

.home-main {
  width: min(1180px, calc(100vw - 40px));
  margin: 0 auto;
  padding: 54px 0 80px;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 520px);
  gap: 42px;
  align-items: center;
}

.eyebrow {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: #0f9f5f;
}

.hero-copy h1 {
  max-width: 650px;
  font-size: clamp(40px, 6vw, 76px);
  line-height: 0.96;
  letter-spacing: -0.06em;
  font-weight: 900;
}

.hero-desc {
  max-width: 620px;
  margin-top: 22px;
  color: var(--text-secondary);
  font-size: 16px;
  line-height: 1.9;
}

.hero-actions,
.feature-strip,
.prompt-footer,
.suggestion-cloud,
.section-title,
.project-meta {
  display: flex;
  align-items: center;
}

.hero-actions {
  gap: 14px;
  margin-top: 28px;
}

.primary-action,
.send-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  border-radius: 999px;
  background: linear-gradient(135deg, #16a34a, #00a3ff);
  color: white;
  font-weight: 800;
  box-shadow: 0 18px 40px rgba(22, 163, 74, 0.24);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.primary-action {
  padding: 13px 20px;
}

.primary-action.small {
  padding: 10px 16px;
  font-size: 14px;
}

.send-button {
  width: 44px;
  height: 44px;
}

.primary-action:hover,
.send-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 24px 46px rgba(0, 163, 255, 0.28);
}

.feature-strip {
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 30px;
}

.feature-mini {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(148, 163, 184, 0.24);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease, background 0.2s ease;
}

.feature-mini:hover {
  transform: translateY(-2px);
  border-color: rgba(0, 163, 255, 0.5);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.82);
}

.dark .feature-mini {
  background: rgba(15, 23, 42, 0.58);
}

.prompt-panel {
  position: relative;
}

.prompt-panel-glow {
  position: absolute;
  inset: -28px;
  background: conic-gradient(from 120deg, rgba(0, 163, 255, 0.16), rgba(34, 197, 94, 0.18), rgba(2, 6, 23, 0), rgba(0, 163, 255, 0.16));
  filter: blur(18px);
  opacity: 0.8;
}

.mode-card {
  position: relative;
  padding: 18px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.78);
  border: 1px solid rgba(148, 163, 184, 0.32);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(24px);
}

.dark .mode-card {
  background: rgba(15, 23, 42, 0.76);
}

.mode-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 14px;
  padding: 5px;
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.05);
}

.dark .mode-tabs {
  background: rgba(255, 255, 255, 0.06);
}

.mode-tabs button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 14px;
  padding: 10px 12px;
  color: var(--text-secondary);
  font-weight: 800;
  transition: all 0.2s ease;
}

.mode-tabs button.active {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.09);
}

.dark .mode-tabs button.active {
  background: rgba(15, 23, 42, 0.95);
}

.chat-home,
.create-home {
  position: relative;
}

.chat-thread {
  min-height: 310px;
  max-height: 380px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 2px 12px;
}

.chat-empty {
  display: grid;
  place-items: center;
  min-height: 250px;
  text-align: center;
  color: var(--text-secondary);
}

.chat-empty h3 {
  margin-top: 14px;
  color: var(--text-primary);
  font-size: 22px;
  font-weight: 900;
}

.chat-empty p {
  max-width: 360px;
  margin-top: 8px;
  line-height: 1.7;
}

.chat-orb {
  display: grid;
  width: 62px;
  height: 62px;
  place-items: center;
  border-radius: 22px;
  background: radial-gradient(circle at 30% 20%, #ffffff, #8be7ff 38%, #16a34a 100%);
  color: #07111f;
  box-shadow: 0 20px 46px rgba(0, 163, 255, 0.26);
}

.chat-message {
  width: fit-content;
  max-width: 86%;
  border-radius: 18px;
  padding: 11px 13px;
  white-space: pre-wrap;
  line-height: 1.65;
  font-size: 14px;
}

.chat-message.user {
  align-self: flex-end;
  color: #fff;
  background: linear-gradient(135deg, #16a34a, #00a3ff);
}

.chat-message.assistant {
  align-self: flex-start;
  background: rgba(15, 23, 42, 0.06);
}

.dark .chat-message.assistant {
  background: rgba(255, 255, 255, 0.08);
}

.chat-message.thinking {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
}

.chat-composer {
  display: grid;
  grid-template-columns: 1fr 44px;
  align-items: end;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 22px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.56);
}

.dark .chat-composer {
  background: rgba(2, 6, 23, 0.28);
}

.prompt-card-head {
  display: flex;
  justify-content: space-between;
  color: var(--text-secondary);
  font-size: 13px;
}

.shortcut {
  border-radius: 999px;
  padding: 4px 9px;
  background: rgba(15, 23, 42, 0.06);
}

.create-home > textarea,
.chat-composer textarea {
  width: 100%;
  resize: none;
  outline: none;
  border: 0;
  background: transparent;
  color: var(--text-primary);
}

.create-home > textarea {
  min-height: 168px;
  margin-top: 12px;
  font-size: 16px;
  line-height: 1.7;
}

.chat-composer textarea {
  min-height: 46px;
  max-height: 140px;
  font-size: 14px;
  line-height: 1.6;
}

.prompt-footer {
  justify-content: space-between;
}

.suggestion-cloud {
  position: relative;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 18px;
  color: var(--text-secondary);
}

.suggestion-cloud button {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 999px;
  padding: 7px 11px;
  background: rgba(255, 255, 255, 0.68);
  font-size: 13px;
}

.dark .suggestion-cloud button {
  background: rgba(15, 23, 42, 0.68);
}

.refresh-chip {
  display: inline-flex;
  align-items: center;
}

.showcase-section,
.projects-section {
  margin-top: 72px;
}

.section-title {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.section-title h2 {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.showcase-card {
  position: relative;
  height: 230px;
  overflow: hidden;
  border-radius: 28px;
  text-align: left;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
}

.showcase-card img,
.project-thumb img,
.project-thumb video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.showcase-card img {
  transition: transform 0.45s ease;
}

.showcase-card:hover img {
  transform: scale(1.07);
}

.showcase-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 22px;
  color: white;
  background: linear-gradient(180deg, rgba(2, 6, 23, 0.08), rgba(2, 6, 23, 0.78));
}

.showcase-overlay span {
  width: fit-content;
  margin-bottom: 8px;
  border-radius: 999px;
  padding: 4px 9px;
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
}

.showcase-overlay h3 {
  font-size: 22px;
  font-weight: 900;
}

.showcase-overlay p {
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.76);
  font-size: 13px;
}

.empty-state {
  display: grid;
  place-items: center;
  gap: 10px;
  padding: 56px 20px;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.54);
  color: var(--text-secondary);
}

.dark .empty-state {
  background: rgba(15, 23, 42, 0.48);
}

.empty-state h3 {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 800;
}

.project-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.project-card {
  padding: 10px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.25);
}

.dark .project-card {
  background: rgba(15, 23, 42, 0.5);
}

.project-thumb {
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(148, 163, 184, 0.12);
  cursor: pointer;
}

.project-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--text-secondary);
}

.project-meta {
  justify-content: space-between;
  gap: 8px;
  padding: 10px 2px 0;
}

.project-open {
  min-width: 0;
  text-align: left;
}

.project-open span,
.project-open small {
  display: block;
}

.project-open span {
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-open small {
  color: var(--text-secondary);
}

.project-menu,
.side-rail button {
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: var(--text-secondary);
  transition: all 0.2s ease;
}

.project-menu {
  width: 34px;
  height: 34px;
}

.project-menu:hover,
.side-rail button:hover {
  background: rgba(34, 197, 94, 0.12);
  color: var(--accent-color);
}

.side-rail {
  position: fixed;
  left: 24px;
  top: 50%;
  z-index: 15;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(18px);
}

.dark .side-rail {
  background: rgba(15, 23, 42, 0.68);
}

.side-rail button {
  width: 42px;
  height: 42px;
}

@media (max-width: 960px) {
  .hero-grid,
  .showcase-grid,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .home-main {
    width: min(100% - 24px, 720px);
    padding-top: 32px;
  }

  .hero-copy h1 {
    font-size: 44px;
  }
}
</style>

<template>
  <div
    class="home-shell min-h-screen h-screen overflow-y-auto text-[var(--text-primary)]"
    :style="stageStyle"
    @pointermove="handlePointerMove"
    @pointerleave="resetPointerField"
  >
    <div class="liquid-stage" aria-hidden="true">
      <canvas ref="particleCanvas" class="particle-field"></canvas>
      <div class="liquid-orb orb-a"></div>
      <div class="liquid-orb orb-b"></div>
      <div class="liquid-orb orb-c"></div>
      <div class="y-signal">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="mesh-grid"></div>
    </div>

    <AppHeader class="home-header">
      <template #left>
        <button class="brand-lockup" title="回到首页顶部" @click="scrollToTop">
          <img src="../assets/logo.png" alt="YUFENG Canvas" class="brand-logo" />
          <div>
            <p class="brand-name">YUFENG Canvas</p>
            <p class="brand-subtitle">AI visual workflow studio</p>
          </div>
        </button>
      </template>
      <template #right>
        <button
          @click="startHomeTour"
          class="header-pill"
          title="重新查看使用指引"
        >
          <n-icon :size="18"><HelpCircleOutline /></n-icon>
          <span>使用指引</span>
        </button>
        <button
          @click="showApiSettings = true"
          class="header-pill"
          :class="{ 'is-ready': isApiConfigured }"
          title="API 设置"
          data-tour="api-settings"
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
          <transition name="hero-copy" mode="out-in">
            <div :key="currentHero.id" class="hero-line">
              <h1>{{ currentHero.title }}</h1>
              <p class="hero-desc">{{ currentHero.desc }}</p>
            </div>
          </transition>

          <div class="hero-actions">
            <button class="primary-action" data-tour="start-create" @click="handleCreateWithInput">
              <n-icon :size="20"><SendOutline /></n-icon>
              开始创作
            </button>
            <button class="secondary-action" @click="showApiSettings = true">
              <n-icon :size="18"><SettingsOutline /></n-icon>
              配置模型
            </button>
            <button class="secondary-action" @click="scrollToInspiration">
              <n-icon :size="18"><SparklesOutline /></n-icon>
              看案例
            </button>
          </div>

          <div class="feature-strip" data-tour="quick-actions">
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

          <div class="hero-metrics" aria-label="YUFENG Canvas 能力概览">
            <div>
              <strong>Text</strong>
              <span>对话润色 / 提示词拆解</span>
            </div>
            <div>
              <strong>Image</strong>
              <span>文生图 / 图生图 / 多比例</span>
            </div>
            <div>
              <strong>Video</strong>
              <span>文生视频 / 首尾帧 / 任务日志</span>
            </div>
          </div>
        </div>

        <div class="prompt-panel" data-tour="home-chat">
          <div class="prompt-panel-glow"></div>
          <div class="hero-prism" aria-hidden="true">
            <div class="prism-core">Y</div>
            <span class="prism-chip chip-one">workflow</span>
            <span class="prism-chip chip-two">prompt</span>
            <span class="prism-chip chip-three">render</span>
          </div>
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

              <div v-if="chatAttachments.length" class="chat-attachments">
                <span
                  v-for="attachment in chatAttachments"
                  :key="attachment.id"
                  class="attachment-chip"
                >
                  <n-icon :size="14">
                    <ImageOutline v-if="attachment.kind === 'image'" />
                    <DocumentOutline v-else />
                  </n-icon>
                  {{ attachment.name }}
                  <button @click="removeChatAttachment(attachment.id)">×</button>
                </span>
              </div>

              <div class="chat-composer" data-tour="chat-composer">
                <input
                  ref="chatFileInputRef"
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.json,.csv"
                  class="hidden-file-input"
                  @change="handleChatFiles"
                />
                <button
                  class="attach-button"
                  :disabled="chatLoading"
                  title="上传图片或文本资料"
                  @click="chatFileInputRef?.click()"
                >
                  <n-icon :size="19"><ImageOutline /></n-icon>
                </button>
                <button
                  class="attach-button"
                  :class="{ active: chatReadingUrls }"
                  :disabled="chatLoading || chatReadingUrls || !extractUrls(chatText).length"
                  title="读取输入框里的网页链接"
                  @click="readLinksIntoChat"
                >
                  <n-spin v-if="chatReadingUrls" :size="15" />
                  <n-icon v-else :size="18"><SearchOutline /></n-icon>
                </button>
                <textarea
                  v-model="chatText"
                  placeholder="直接和模型对话；粘贴网页链接后，可点放大镜读取页面内容..."
                  :disabled="chatLoading || chatReadingUrls"
                  @keydown.enter.exact.prevent="sendHomeChat"
                />
                <button class="send-button" :disabled="chatLoading || chatReadingUrls || (!chatText.trim() && !chatAttachments.length)" @click="sendHomeChat">
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
        <div class="section-title" data-tour="showcase">
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
            v-for="(card, index) in showcaseCards"
            :key="card.title"
            class="showcase-card"
            :class="`showcase-card-${index + 1}`"
            @click="createFromTemplate(card.prompt)"
          >
            <img :src="card.image" :alt="card.title" />
            <div class="showcase-overlay">
              <span>{{ card.badge }}</span>
              <h3>{{ card.title }}</h3>
              <p>{{ card.desc }}</p>
              <b>打开工作流</b>
            </div>
          </button>
        </div>
      </section>

      <section ref="inspirationSection" class="inspiration-section">
        <div class="section-title" data-tour="prompt-library">
          <div>
            <p class="eyebrow">GPT IMAGE 2 PROMPT LIBRARY</p>
            <h2>灵感案例库</h2>
            <p class="section-desc">
              精选并改编自开源提示词案例，点击卡片就能把提示词带入画布继续创作。
            </p>
          </div>
          <button class="source-link" @click="openPromptSource">
            查看来源
          </button>
        </div>

        <div class="inspiration-grid">
          <button
            v-for="item in inspirationCases"
            :key="item.title"
            class="inspiration-card"
            @click="createFromTemplate(item.prompt)"
          >
            <div class="inspiration-image">
              <img :src="item.image" :alt="item.title" />
            </div>
            <div class="inspiration-body">
              <span>{{ item.category }}</span>
              <h3>{{ item.title }}</h3>
              <p>{{ item.prompt }}</p>
            </div>
          </button>
        </div>
      </section>

      <section ref="projectsSection" class="projects-section">
        <div class="section-title" data-tour="projects">
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

      <footer class="brand-footer" aria-label="YUFENG Canvas">
        <div class="brand-footer-glow"></div>
        <p>YUFENG Canvas</p>
        <span>Visual AI workflow studio</span>
      </footer>
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

    <n-modal
      v-model:show="showOnboarding"
      preset="card"
      class="onboarding-modal"
      :bordered="false"
      :mask-closable="false"
    >
      <div class="onboarding-shell">
        <div class="onboarding-head">
          <div class="onboarding-orb">Y</div>
          <div>
            <p class="onboarding-kicker">FIRST RUN SETUP</p>
            <h2>先跑通，再创作。</h2>
            <p class="onboarding-desc">这不是说明书，是一次可执行初始化。按顺序完成配置、测试对话、进入画布，哪里没通就会直接指向下一步。</p>
          </div>
        </div>

        <div class="onboarding-progress">
          <div>
            <span>{{ onboardingReadyCount }}/{{ onboardingChecks.length }}</span>
            <b>初始化完成度</b>
          </div>
          <div class="onboarding-progress-track">
            <i :style="{ width: `${onboardingProgress}%` }"></i>
          </div>
        </div>

        <div class="onboarding-console">
          <article
            v-for="item in onboardingChecks"
            :key="item.key"
            class="onboarding-check"
            :class="{ 'is-ready': item.ready, 'is-primary': item.primary }"
          >
            <div class="check-index">{{ item.index }}</div>
            <div class="check-body">
              <div class="check-title">
                <h3>{{ item.title }}</h3>
                <span>{{ item.ready ? '已就绪' : '待完成' }}</span>
              </div>
              <p>{{ item.desc }}</p>
              <small>{{ item.detail }}</small>
            </div>
            <button @click="handleOnboardingAction(item.key)">
              {{ item.action }}
            </button>
          </article>
        </div>

        <div class="onboarding-footer">
          <p>建议第一次不要跳过：先用文本模型测试一句话，再进入画布生成，排查会快很多。</p>
          <div class="onboarding-actions">
            <button class="secondary-action" @click="dismissOnboarding">稍后再说</button>
            <button class="secondary-action" @click="startHomeTour">开始界面导览</button>
            <button class="primary-action" @click="completeOnboarding">完成并进入</button>
          </div>
        </div>
      </div>
    </n-modal>

    <GuidedTour
      v-model:show="showHomeTour"
      :steps="homeTourSteps"
      :storage-key="homeTourStorageKey"
      @finish="completeHomeTour"
      @skip="completeHomeTour"
    />

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
import { computed, h, onMounted, onUnmounted, ref } from 'vue'
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
  SearchOutline,
  SendOutline,
  SettingsOutline,
  SparklesOutline,
  ChatbubbleOutline,
  HelpCircleOutline,
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
import GuidedTour from '../components/GuidedTour.vue'
import showcaseBrand from '../assets/showcase-brand.png'
import showcaseStoryboard from '../assets/showcase-storyboard.png'
import showcaseVideo from '../assets/showcase-video.png'
import {
  CANVAS_PROMPT_SUGGESTIONS,
  HOME_CHAT_SUGGESTIONS,
  INSPIRATION_CASES,
  PROMPT_LIBRARY_SOURCE
} from '../config/promptLibrary'

const router = useRouter()
const dialog = useDialog()
const modelStore = useModelStore()

const showApiSettings = ref(false)
const showOnboarding = ref(false)
const showHomeTour = ref(false)
const activeMode = ref('chat')
const inputText = ref('')
const chatText = ref('')
const chatMessages = ref([])
const chatAttachments = ref([])
const chatFileInputRef = ref(null)
const chatReadingUrls = ref(false)
const showRenameModal = ref(false)
const renameValue = ref('')
const renameTargetId = ref(null)
const projectsSection = ref(null)
const inspirationSection = ref(null)
const videoRefs = new Map()
let heroTimer = null

const isApiConfigured = computed(() => modelStore.hasAnyApiKey)
const isChatConfigured = computed(() => !!modelStore.currentChatApiKey && !!modelStore.selectedChatModel)
const isImageConfigured = computed(() => !!modelStore.currentImageApiKey && !!modelStore.selectedImageModel)
const isVideoConfigured = computed(() => !!modelStore.currentVideoApiKey && !!modelStore.selectedVideoModel)

const {
  loading: chatLoading,
  currentResponse,
  send: sendChat
} = useChat({
  systemPrompt: '你是 YUFENG Canvas 的创意助手。回答要直接、有帮助；如果用户在做视觉创作，可以主动给出可执行的提示词、镜头、构图、比例和下一步建议。'
})

const suggestionPool = CANVAS_PROMPT_SUGGESTIONS
const visibleSuggestions = ref([])
const chatSuggestions = HOME_CHAT_SUGGESTIONS
const inspirationCases = INSPIRATION_CASES
const heroIndex = ref(0)
const pointer = ref({ x: 0.5, y: 0.5 })
const particleCanvas = ref(null)
const particleMouse = { x: -9999, y: -9999, active: false }
let particles = []
let particleFrame = null
let particleCleanup = null
let particleStartedAt = 0
const onboardingStorageKey = 'yufeng-canvas-onboarding-v2'
const homeTourStorageKey = 'yufeng-canvas-home-tour-v1'

const stageStyle = computed(() => {
  const x = pointer.value.x
  const y = pointer.value.y
  const dx = (x - 0.5) * 2
  const dy = (y - 0.5) * 2

  return {
    '--mx': `${(x * 100).toFixed(2)}%`,
    '--my': `${(y * 100).toFixed(2)}%`,
    '--parallax-x': `${(dx * 26).toFixed(2)}px`,
    '--parallax-y': `${(dy * 22).toFixed(2)}px`,
    '--tilt-x': '0deg',
    '--tilt-y': '0deg'
  }
})

const handlePointerMove = (event) => {
  if (window.getSelection?.()?.type === 'Range') return

  const rect = event.currentTarget.getBoundingClientRect()
  const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  pointer.value = {
    x,
    y
  }
  particleMouse.x = x * window.innerWidth
  particleMouse.y = y * window.innerHeight
  particleMouse.active = true
}

const resetPointerField = () => {
  pointer.value = { x: 0.5, y: 0.5 }
  particleMouse.active = false
  particleMouse.x = -9999
  particleMouse.y = -9999
}

const initParticleField = () => {
  const canvas = particleCanvas.value
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const createParticles = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)

    const density = Math.min(3800, Math.max(1500, Math.floor((width * height) / 520)))
    particles = Array.from({ length: density }, () => {
      const x = Math.random() * width
      const y = Math.random() * height
      return {
        x,
        y,
        px: x,
        py: y,
        bx: x,
        by: y,
        vx: 0,
        vy: 0,
        size: Math.random() * 0.72 + 0.34,
        alpha: Math.random() * 0.5 + 0.42,
        hue: Math.random(),
        phase: Math.random() * Math.PI * 2,
        drift: Math.random() * 18 + 8,
        speed: Math.random() * 0.45 + 0.28
      }
    })
  }

  const draw = (now = performance.now()) => {
    const width = window.innerWidth
    const height = window.innerHeight
    ctx.clearRect(0, 0, width, height)
    const t = (now - particleStartedAt) / 1000
    const isDark = document.documentElement.classList.contains('dark')
      || document.body.classList.contains('dark')

    for (const dot of particles) {
      dot.px = dot.x
      dot.py = dot.y

      const flowX = dot.bx
        + Math.sin(t * dot.speed + dot.phase + dot.by * 0.004) * dot.drift
        + Math.cos(t * 0.22 + dot.phase * 0.6) * 6
      const flowY = dot.by
        + Math.cos(t * dot.speed * 0.8 + dot.phase + dot.bx * 0.003) * dot.drift
        + Math.sin(t * 0.18 + dot.phase * 0.7) * 5

      dot.vx += Math.sin(dot.y * 0.01 + t * 0.85 + dot.phase) * 0.018
      dot.vy += Math.cos(dot.x * 0.01 + t * 0.72 + dot.phase) * 0.018

      if (particleMouse.active) {
        const dx = dot.x - particleMouse.x
        const dy = dot.y - particleMouse.y
        const distSq = dx * dx + dy * dy
        const radius = 180
        if (distSq < radius * radius) {
          const dist = Math.max(Math.sqrt(distSq), 1)
          const force = (1 - dist / radius) ** 2
          dot.vx += (dx / dist) * force * 4.8
          dot.vy += (dy / dist) * force * 4.8
        }
      }

      dot.vx += (flowX - dot.x) * 0.008
      dot.vy += (flowY - dot.y) * 0.008
      dot.vx *= 0.91
      dot.vy *= 0.91
      dot.x += dot.vx
      dot.y += dot.vy

      const glow = particleMouse.active
        ? Math.max(0, 1 - Math.hypot(dot.x - particleMouse.x, dot.y - particleMouse.y) / 230)
        : 0
      const alpha = Math.min(0.98, dot.alpha + glow * 0.56)

      if (Math.abs(dot.x - dot.px) + Math.abs(dot.y - dot.py) > 0.12) {
        ctx.beginPath()
        ctx.strokeStyle = isDark
          ? dot.hue > 0.72
            ? `rgba(96, 255, 211, ${alpha * 0.2})`
            : dot.hue > 0.42
              ? `rgba(126, 205, 255, ${alpha * 0.17})`
              : `rgba(255, 255, 255, ${alpha * 0.13})`
          : dot.hue > 0.66
            ? `rgba(0, 168, 153, ${alpha * 0.3})`
            : dot.hue > 0.34
              ? `rgba(0, 132, 255, ${alpha * 0.26})`
              : `rgba(32, 75, 132, ${alpha * 0.18})`
        ctx.lineWidth = 0.6 + glow * 0.45
        ctx.moveTo(dot.px, dot.py)
        ctx.lineTo(dot.x, dot.y)
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.fillStyle = isDark
        ? dot.hue > 0.72
          ? `rgba(96, 255, 211, ${alpha})`
          : dot.hue > 0.42
            ? `rgba(126, 205, 255, ${alpha})`
            : `rgba(255, 255, 255, ${alpha})`
        : dot.hue > 0.66
          ? `rgba(0, 168, 153, ${alpha * 0.86})`
          : dot.hue > 0.34
            ? `rgba(0, 132, 255, ${alpha * 0.78})`
            : `rgba(32, 75, 132, ${alpha * 0.62})`
      ctx.arc(dot.x, dot.y, dot.size + glow * 0.65, 0, Math.PI * 2)
      ctx.fill()
    }

    particleFrame = window.requestAnimationFrame(draw)
  }

  createParticles()
  particleStartedAt = performance.now()
  draw()
  window.addEventListener('resize', createParticles)
  particleCleanup = () => {
    window.removeEventListener('resize', createParticles)
    if (particleFrame) {
      window.cancelAnimationFrame(particleFrame)
      particleFrame = null
    }
  }
}

const heroSlides = [
  {
    id: 'flow',
    title: '让灵感自己长成作品。',
    desc: '一个给创作者用的本地 AI 视觉工作台。填入自己的 Key 和模型名后，就能把图片、视频和提示词编排成可复用的创作流程。'
  },
  {
    id: 'model',
    title: '图片、视频、模型，像积木一样编排。',
    desc: '文本、图片、视频模型可以分别配置，提示词、参考图、首尾帧和结果节点也能继续复用，不再散落在不同网页里。'
  },
  {
    id: 'case',
    title: '从案例出发，一键生成工作流。',
    desc: '公共工作流和灵感案例库已经准备好，点击模板就能进入画布，再替换成你的产品、角色、场景或短视频创意。'
  },
  {
    id: 'debug',
    title: '每次生成，都有日志可追踪。',
    desc: '运行日志会记录请求地址、模型、任务 ID、轮询状态和原始响应，方便判断是模型能力、参数还是供应商返回的问题。'
  }
]

const currentHero = computed(() => heroSlides[heroIndex.value])

const localApiLabel = computed(() => {
  const origin = 'http://127.0.0.1:43112'
  return window.desktopApp?.getLocalApiStatus ? `${origin}/mcp` : '桌面版启动后自动开放'
})

const onboardingChecks = computed(() => [
  {
    key: 'api',
    index: '01',
    title: '配置 Key / Base URL',
    desc: '先把自己的 API Key 和服务地址保存进去，图片、视频、对话可以共用，也可以分开填。',
    detail: isApiConfigured.value ? `当前渠道：${modelStore.currentProvider}` : '还没有检测到可用 Key',
    action: isApiConfigured.value ? '检查配置' : '立即配置',
    ready: isApiConfigured.value,
    primary: !isApiConfigured.value
  },
  {
    key: 'chat',
    index: '02',
    title: '测试文本模型',
    desc: '用首页对话发一条很短的请求，确认 AI 润色和 Chat 能正常调用。',
    detail: isChatConfigured.value ? `文本模型：${modelStore.selectedChatModel}` : '需要配置文本模型名和可用 Key',
    action: isChatConfigured.value ? '发送测试' : '去配置文本模型',
    ready: isChatConfigured.value,
    primary: isApiConfigured.value && !isChatConfigured.value
  },
  {
    key: 'image',
    index: '03',
    title: '准备图片工作流',
    desc: '检查图片模型后，一键创建一个文生图示例画布，进入后可直接点生成。',
    detail: isImageConfigured.value ? `图片模型：${modelStore.selectedImageModel}` : '需要添加图片模型名，比如供应商后台显示的模型',
    action: isImageConfigured.value ? '创建图片示例' : '去配置图片模型',
    ready: isImageConfigured.value,
    primary: isChatConfigured.value && !isImageConfigured.value
  },
  {
    key: 'video',
    index: '04',
    title: '准备视频工作流',
    desc: '视频模型通常是异步任务，建议配置后用短时长先测，失败时看右上角运行日志。',
    detail: isVideoConfigured.value ? `视频模型：${modelStore.selectedVideoModel}` : '可稍后配置视频模型，不影响先用图片功能',
    action: isVideoConfigured.value ? '创建视频示例' : '配置视频模型',
    ready: isVideoConfigured.value,
    primary: false
  },
  {
    key: 'mcp',
    index: '05',
    title: '本地 API / MCP',
    desc: '桌面端会启动本地接口，后面给 MCP、多 Agent、自动化工作流使用。',
    detail: localApiLabel.value,
    action: '复制 MCP 入口',
    ready: true,
    primary: false
  }
])

const onboardingReadyCount = computed(() => onboardingChecks.value.filter((item) => item.ready).length)
const onboardingProgress = computed(() => Math.round((onboardingReadyCount.value / onboardingChecks.value.length) * 100))

const homeTourSteps = [
  {
    target: '[data-tour="api-settings"]',
    title: '第一步：配置 API 和模型',
    body: '点击这里打开 API 设置。先填写 Base URL 和 API Key，再分别在“文本模型 / 图片模型 / 视频模型”里添加供应商后台显示的模型名，最后保存。',
    hint: '模型名要一字不差。比如后台叫 gpt-image-2-sp，软件里也必须填 gpt-image-2-sp。'
  },
  {
    target: '[data-tour="home-chat"]',
    title: '首页：先和文本模型聊清楚',
    body: '这里会直接调用你配置的文本模型。可以让它帮你拆创意、写提示词、整理分镜、判断一个需求应该走文生图还是图生视频。',
    hint: '这里不会直接扣图片/视频费用，只有发送给文本模型时才会产生文本模型请求。',
    side: 'left'
  },
  {
    target: '[data-tour="chat-composer"]',
    title: '输入框、附件和发送',
    body: '在这里输入问题，也可以上传图片、txt、md、json、csv 等参考资料。右侧发送按钮会把内容交给当前文本模型。',
    hint: '如果文本模型没有配置，点击发送会提示你回到 API 设置。'
  },
  {
    target: '[data-tour="start-create"]',
    title: '开始创作：进入节点画布',
    body: '点这里会创建一个本地项目，并把你的创意带到无限画布。画布里可以继续添加文生图、图生图、文生视频、图生视频和结果节点。',
    hint: '如果你只是想先试一张图，可以先在左侧输入一句需求，再点开始创作。',
    side: 'right'
  },
  {
    target: '[data-tour="quick-actions"]',
    title: '快捷入口：不用从零搭',
    body: '文生图、图生图、视频生成、节点工作流会直接创建对应方向的项目。适合第一次使用时快速验证模型是否能跑通。',
    side: 'top'
  },
  {
    target: '[data-tour="showcase"]',
    title: '常用场景案例',
    body: '这些卡片是可点击的案例入口，适合品牌主视觉、分镜故事、图生视频等常见需求。点击后会自动创建项目并把提示词带进画布。',
    side: 'top'
  },
  {
    target: '[data-tour="prompt-library"]',
    title: '提示词案例库',
    body: '这里沉淀了从开源案例整理来的提示词。用户可以直接点选，再把里面的产品、人物、镜头、比例、风格改成自己的需求。',
    side: 'top'
  },
  {
    target: '[data-tour="projects"]',
    title: '本地项目都在这里',
    body: '生成过的项目会保存在本机，之后可以继续打开、复制、重命名或删除。它不是云端空间，隐私和草稿都留在本地。',
    side: 'top'
  }
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
  if (!localStorage.getItem('yufeng-canvas-canvas-tour-v1')) {
    sessionStorage.setItem('yufeng-canvas-start-canvas-tour', '1')
  }
  router.push(`/canvas/${id}`)
}

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

const handleChatFiles = async (event) => {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return

  const nextAttachments = []

  for (const file of files.slice(0, 6)) {
    if (file.size > 8 * 1024 * 1024) {
      window.$message?.warning(`${file.name} 超过 8MB，已跳过`)
      continue
    }

    try {
      if (file.type.startsWith('image/')) {
        nextAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          kind: 'image',
          name: file.name,
          url: await readFileAsDataUrl(file)
        })
      } else {
        nextAttachments.push({
          id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          kind: 'text',
          name: file.name,
          text: await file.text()
        })
      }
    } catch (err) {
      window.$message?.error(`${file.name} 读取失败：${err.message || '未知错误'}`)
    }
  }

  chatAttachments.value = [...chatAttachments.value, ...nextAttachments].slice(0, 8)
}

const removeChatAttachment = (id) => {
  chatAttachments.value = chatAttachments.value.filter((item) => item.id !== id)
}

const extractUrls = (value = '') => {
  const matches = String(value).match(/https?:\/\/[^\s，。！？、)）\]}>"']+/gi) || []
  return [...new Set(matches.map((url) => url.replace(/[.,;:!?，。；：！？]+$/, '')))].slice(0, 3)
}

const fetchReadableLinks = async (content, { silent = false } = {}) => {
  const urls = extractUrls(content).filter((url) =>
    !chatAttachments.value.some((item) => item.kind === 'text' && item.sourceUrl === url)
  )

  if (!urls.length || !window.desktopApp?.fetchUrlText) return []

  const readablePages = []
  for (const url of urls) {
    try {
      const page = await window.desktopApp.fetchUrlText(url)
      if (page?.text) {
        readablePages.push(page)
      }
    } catch (err) {
      if (!silent) {
        window.$message?.warning(`${url} 读取失败：${err.message || '未知错误'}`)
      }
    }
  }

  return readablePages
}

const readLinksIntoChat = async () => {
  const content = chatText.value.trim()
  if (!content || chatReadingUrls.value) return

  chatReadingUrls.value = true
  try {
    const pages = await fetchReadableLinks(content)
    if (!pages.length) {
      window.$message?.info('没有读取到新的网页内容')
      return
    }

    const attachments = pages.map((page) => ({
      id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      kind: 'text',
      name: page.title ? `网页：${page.title}` : `网页：${page.url}`,
      text: `[网页资料]\n来源：${page.url}\n标题：${page.title || '无标题'}\n\n${page.text}`,
      sourceUrl: page.url
    }))

    chatAttachments.value = [...chatAttachments.value, ...attachments].slice(0, 8)
    window.$message?.success(`已读取 ${attachments.length} 个链接`)
  } finally {
    chatReadingUrls.value = false
  }
}

const buildChatPayload = (content, webContexts = []) => {
  const textAttachments = chatAttachments.value.filter((item) => item.kind === 'text')
  const imageAttachments = chatAttachments.value.filter((item) => item.kind === 'image')

  const attachmentText = textAttachments.map((item, index) => {
    const clipped = String(item.text || '').slice(0, 12000)
    return `\n\n[附件 ${index + 1}: ${item.name}]\n${clipped}`
  }).join('')

  const webText = webContexts.map((page, index) => {
    const clipped = String(page.text || '').slice(0, 16000)
    return `\n\n[网页资料 ${index + 1}]\n来源：${page.url}\n标题：${page.title || '无标题'}\n${clipped}`
  }).join('')

  return {
    content: content || '请分析我上传的素材，并给出创作建议。',
    modelContent: `${content || '请分析我上传的素材，并给出创作建议。'}${webText}${attachmentText}`,
    imageAttachments
  }
}

const sendHomeChat = async () => {
  const content = chatText.value.trim()
  if ((!content && !chatAttachments.value.length) || chatLoading.value) return

  if (!isChatConfigured.value) {
    showApiSettings.value = true
    window.$message?.warning('请先配置文本模型和可用的 API Key')
    return
  }

  chatReadingUrls.value = true
  const webContexts = await fetchReadableLinks(content, { silent: true })
  chatReadingUrls.value = false

  const payload = buildChatPayload(content, webContexts)
  const attachmentNames = chatAttachments.value.map((item) => item.name)
  const webNames = webContexts.map((item) => item.title || item.url)

  const userMessage = {
    id: `user_${Date.now()}`,
    role: 'user',
    content: attachmentNames.length
      ? `${payload.content}\n\n附件：${attachmentNames.join('、')}${webNames.length ? `\n网页：${webNames.join('、')}` : ''}`
      : webNames.length
        ? `${payload.content}\n\n网页：${webNames.join('、')}`
      : payload.content
  }
  chatMessages.value.push(userMessage)
  chatText.value = ''
  chatAttachments.value = []

  try {
    const reply = await sendChat(payload.modelContent, true, {
      model: modelStore.selectedChatModel,
      images: payload.imageAttachments
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

const openPromptSource = () => {
  if (window.desktopApp?.openExternal) {
    window.desktopApp.openExternal(PROMPT_LIBRARY_SOURCE.url)
    return
  }
  window.open(PROMPT_LIBRARY_SOURCE.url, '_blank', 'noopener,noreferrer')
}

const completeOnboarding = () => {
  showOnboarding.value = false
  localStorage.setItem(onboardingStorageKey, 'done')
}

const dismissOnboarding = () => {
  showOnboarding.value = false
}

const startHomeTour = () => {
  showOnboarding.value = false
  localStorage.setItem(onboardingStorageKey, 'done')
  activeMode.value = 'chat'
  document.querySelector('.home-shell')?.scrollTo({ top: 0, behavior: 'smooth' })
  window.setTimeout(() => {
    showHomeTour.value = true
  }, 360)
}

const completeHomeTour = () => {
  localStorage.setItem(homeTourStorageKey, 'done')
}

const runOnboardingChatTest = async () => {
  if (!isChatConfigured.value) {
    showApiSettings.value = true
    window.$message?.warning('先配置文本模型和 Key，再做连通测试')
    return
  }

  showOnboarding.value = false
  activeMode.value = 'chat'
  chatText.value = '请用一句话回复：YUFENG Canvas 文本模型连接成功。'
  await sendHomeChat()
}

const copyMcpEndpoint = async () => {
  const endpoint = 'http://127.0.0.1:43112/mcp'
  try {
    await navigator.clipboard?.writeText(endpoint)
    window.$message?.success('已复制 MCP 入口')
  } catch {
    window.$message?.info(endpoint)
  }
}

const handleOnboardingAction = async (key) => {
  if (key === 'api' || (key === 'chat' && !isChatConfigured.value) || (key === 'image' && !isImageConfigured.value) || (key === 'video' && !isVideoConfigured.value)) {
    showApiSettings.value = true
    return
  }

  if (key === 'chat') {
    await runOnboardingChatTest()
    return
  }

  if (key === 'image') {
    completeOnboarding()
    createFromTemplate('文生图：生成一张未来城市雨夜海报，霓虹灯、电影感构图、16:9 比例，画面要有清晰主体和高级色彩')
    return
  }

  if (key === 'video') {
    completeOnboarding()
    createFromTemplate('文生视频：生成一个 5 秒镜头，雨夜城市街道中霓虹灯反射在地面，镜头缓慢推进，电影感，16:9')
    return
  }

  if (key === 'mcp') {
    await copyMcpEndpoint()
  }
}

const handleCreateWithInput = () => {
  if (!ensureConfigured()) return
  const prompt = inputText.value.trim()
  const id = createProject(prompt ? prompt.slice(0, 24) : '未命名项目')
  sessionStorage.setItem('ai-canvas-initial-prompt', prompt)
  if (!localStorage.getItem('yufeng-canvas-canvas-tour-v1')) {
    sessionStorage.setItem('yufeng-canvas-start-canvas-tour', '1')
  }
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

const scrollToInspiration = () => {
  inspirationSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const scrollToTop = () => {
  document.querySelector('.home-shell')?.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  initProjectsStore()
  refreshSuggestions()
  initParticleField()
  if (!localStorage.getItem(onboardingStorageKey)) {
    window.setTimeout(() => {
      showOnboarding.value = true
    }, 700)
  }
  heroTimer = window.setInterval(() => {
    heroIndex.value = (heroIndex.value + 1) % heroSlides.length
  }, 4200)
})

onUnmounted(() => {
  if (heroTimer) {
    window.clearInterval(heroTimer)
  }
  particleCleanup?.()
})
</script>

<style scoped>
.home-shell {
  position: relative;
  isolation: isolate;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 14% 6%, rgba(36, 240, 181, 0.22), transparent 30%),
    radial-gradient(circle at 88% 16%, rgba(0, 161, 255, 0.2), transparent 28%),
    linear-gradient(135deg, #eef8f3 0%, #f9fbff 42%, #eef6ff 100%);
}

.dark .home-shell {
  background:
    radial-gradient(circle at 14% 8%, rgba(43, 255, 195, 0.18), transparent 30%),
    radial-gradient(circle at 86% 14%, rgba(0, 163, 255, 0.18), transparent 28%),
    linear-gradient(135deg, #030a12 0%, #041e1f 42%, #06101d 100%);
}

.liquid-stage {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  overflow: hidden;
}

.liquid-stage::before {
  content: "";
  position: absolute;
  inset: -18%;
  opacity: 0.34;
  background:
    radial-gradient(circle at var(--mx) var(--my), rgba(255, 255, 255, 0.78), transparent 0 8%, transparent 20%),
    radial-gradient(circle at 20% 28%, rgba(32, 255, 184, 0.55), transparent 18%),
    radial-gradient(circle at 68% 18%, rgba(0, 170, 255, 0.48), transparent 16%),
    radial-gradient(circle at 78% 78%, rgba(252, 211, 77, 0.26), transparent 18%);
  filter: blur(42px) saturate(1.3);
  animation: liquid-drift 18s ease-in-out infinite alternate;
  transform: translate3d(calc(var(--parallax-x) * -0.35), calc(var(--parallax-y) * -0.35), 0);
  transition: transform 0.35s ease-out, background-position 0.35s ease-out;
}

.liquid-stage::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.26;
  background-image:
    radial-gradient(circle, rgba(15, 23, 42, 0.26) 0 1px, transparent 1px),
    linear-gradient(115deg, transparent 0 44%, rgba(34, 197, 94, 0.12) 45%, transparent 56%);
  background-size: 22px 22px, 100% 100%;
  mask-image: linear-gradient(to bottom, #000 0%, transparent 88%);
}

.dark .liquid-stage::after {
  opacity: 0.38;
  background-image:
    radial-gradient(circle, rgba(196, 255, 235, 0.22) 0 1px, transparent 1px),
    linear-gradient(115deg, transparent 0 42%, rgba(34, 197, 94, 0.12) 48%, transparent 58%);
}

.particle-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 1;
  mask-image:
    radial-gradient(ellipse at 50% 32%, #000 0 48%, transparent 84%),
    radial-gradient(ellipse at 52% 84%, #000 0 36%, transparent 68%);
  mix-blend-mode: multiply;
}

.dark .particle-field {
  mix-blend-mode: screen;
}

.liquid-orb {
  position: absolute;
  border-radius: 999px;
  filter: blur(22px);
  mix-blend-mode: screen;
  opacity: 0.5;
}

.orb-a {
  width: 420px;
  height: 420px;
  left: -90px;
  top: 120px;
  background: rgba(38, 255, 188, 0.38);
  animation: float-orb-a 13s ease-in-out infinite;
  transform: translate3d(calc(var(--parallax-x) * -0.4), calc(var(--parallax-y) * -0.35), 0);
}

.orb-b {
  width: 540px;
  height: 540px;
  right: -140px;
  top: 80px;
  background: rgba(0, 150, 255, 0.25);
  animation: float-orb-b 16s ease-in-out infinite;
  transform: translate3d(calc(var(--parallax-x) * 0.28), calc(var(--parallax-y) * 0.2), 0);
}

.orb-c {
  width: 360px;
  height: 360px;
  right: 18%;
  bottom: -110px;
  background: rgba(34, 197, 94, 0.24);
  animation: float-orb-c 18s ease-in-out infinite;
  transform: translate3d(calc(var(--parallax-x) * -0.2), calc(var(--parallax-y) * 0.25), 0);
}

.y-signal {
  position: absolute;
  right: max(3vw, 34px);
  top: 112px;
  width: min(42vw, 560px);
  aspect-ratio: 1;
  opacity: 0.46;
  transform: translate3d(calc(var(--parallax-x) * 0.34), calc(var(--parallax-y) * 0.2), 0) rotate(-10deg);
  transition: transform 0.3s ease-out;
}

.y-signal span {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 52%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgba(91, 255, 208, 0.88), rgba(56, 189, 248, 0.65), transparent);
  box-shadow: 0 0 34px rgba(45, 212, 191, 0.65);
  transform-origin: 0 50%;
  animation: signal-pulse 3.6s ease-in-out infinite;
}

.y-signal span:nth-child(1) {
  transform: rotate(90deg) translateX(-2%);
}

.y-signal span:nth-child(2) {
  transform: rotate(214deg) translateX(-2%);
  animation-delay: 0.4s;
}

.y-signal span:nth-child(3) {
  transform: rotate(326deg) translateX(-2%);
  animation-delay: 0.8s;
}

.mesh-grid {
  position: absolute;
  inset: auto 0 0;
  height: 42%;
  opacity: 0.26;
  background:
    linear-gradient(rgba(14, 165, 233, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(20, 184, 166, 0.16) 1px, transparent 1px);
  background-size: 58px 58px;
  transform: perspective(700px) rotateX(62deg) translate3d(calc(var(--parallax-x) * -0.22), 120px, 0);
  transform-origin: bottom;
}

.home-header {
  position: sticky;
  top: 14px;
  width: min(1180px, calc(100vw - 32px));
  margin: 0 auto;
  z-index: 20;
  border: 1px solid rgba(255, 255, 255, 0.54);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.42));
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(28px) saturate(1.45);
}

.dark .home-header {
  border-color: rgba(203, 255, 239, 0.13);
  background: linear-gradient(135deg, rgba(8, 16, 28, 0.72), rgba(8, 36, 36, 0.42));
  box-shadow: 0 24px 74px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 18px;
  padding: 4px 8px 4px 4px;
  text-align: left;
  transition: background 0.2s ease, transform 0.2s ease;
}

.brand-lockup:hover {
  background: rgba(34, 197, 94, 0.08);
  transform: translateY(-1px);
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
  padding: 86px 0 96px;
}

.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 520px);
  gap: 52px;
  align-items: center;
  min-height: calc(100vh - 170px);
}

.eyebrow {
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.3em;
  color: #0fb981;
  text-shadow: 0 0 28px rgba(34, 197, 94, 0.26);
}

.hero-copy h1 {
  max-width: 720px;
  font-size: clamp(42px, 6.2vw, 82px);
  line-height: 0.98;
  letter-spacing: -0.07em;
  font-weight: 900;
  text-wrap: balance;
  color: transparent;
  background:
    linear-gradient(135deg, #082f2b 0%, #0f172a 45%, #0891b2 100%);
  -webkit-background-clip: text;
  background-clip: text;
  filter: drop-shadow(0 18px 34px rgba(15, 23, 42, 0.1));
}

.dark .hero-copy h1 {
  background:
    linear-gradient(135deg, #f8fffc 0%, #c9fff0 38%, #70d6ff 78%, #ffffff 100%);
  -webkit-background-clip: text;
  background-clip: text;
  filter: drop-shadow(0 20px 40px rgba(0, 255, 202, 0.12));
}

.hero-line {
  min-height: 310px;
}

.hero-copy-enter-active,
.hero-copy-leave-active {
  transition: opacity 0.42s ease, transform 0.42s ease, filter 0.42s ease;
}

.hero-copy-enter-from {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(18px);
}

.hero-copy-leave-to {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(-14px);
}

.hero-desc {
  max-width: 620px;
  margin-top: 22px;
  color: color-mix(in srgb, var(--text-secondary) 82%, var(--text-primary));
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
  flex-wrap: wrap;
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
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, #19e58d 0%, #00b8ff 100%);
  color: #052b28;
  font-weight: 800;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.34);
  box-shadow: 0 18px 40px rgba(0, 183, 255, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.42);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.dark .primary-action,
.dark .send-button {
  color: #f8fffd;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.3);
}

.primary-action::after,
.send-button::after {
  content: "";
  position: absolute;
  inset: -60% auto -60% -40%;
  width: 42%;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.42), transparent);
  transform: skewX(-18deg);
  opacity: 0;
  pointer-events: none;
  transition: left 1.25s cubic-bezier(.18, .86, .22, 1);
}

.primary-action:hover::after,
.send-button:hover::after {
  left: 125%;
  opacity: 0.42;
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

.send-button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
  transform: none;
  box-shadow: none;
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
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.42));
  border: 1px solid rgba(255, 255, 255, 0.42);
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(18px);
  transition: transform 0.2s ease, border-color 0.2s ease, color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.feature-mini:hover {
  transform: translateY(-3px);
  border-color: rgba(0, 163, 255, 0.5);
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 44px rgba(0, 163, 255, 0.14);
}

.dark .feature-mini {
  background: rgba(15, 23, 42, 0.58);
}

.prompt-panel {
  position: relative;
  transform-style: preserve-3d;
  transform: none;
}

.prompt-panel-glow {
  position: absolute;
  inset: -50px;
  background: conic-gradient(from 120deg, rgba(0, 214, 255, 0.22), rgba(34, 255, 181, 0.26), rgba(2, 6, 23, 0), rgba(0, 214, 255, 0.22));
  filter: blur(28px);
  opacity: 0.8;
  animation: rotate-glow 11s linear infinite;
}

.hero-prism {
  position: absolute;
  right: -48px;
  top: -64px;
  width: 190px;
  height: 190px;
  z-index: 1;
  pointer-events: none;
}

.prism-core {
  position: absolute;
  inset: 34px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 42px;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.9), transparent 18%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(6, 78, 59, 0.72));
  color: #c8ffee;
  font-size: 58px;
  font-weight: 950;
  letter-spacing: -0.12em;
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.22), 0 0 50px rgba(45, 212, 191, 0.22);
  transform: rotate(-12deg);
  animation: prism-float 5.2s ease-in-out infinite;
}

.prism-chip {
  position: absolute;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.54);
  color: #063328;
  font-size: 11px;
  font-weight: 850;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(18px);
}

.dark .prism-chip {
  background: rgba(8, 20, 34, 0.66);
  color: #dffdf4;
}

.chip-one {
  left: 0;
  top: 22px;
}

.chip-two {
  right: 2px;
  top: 72px;
}

.chip-three {
  left: 30px;
  bottom: 8px;
}

.mode-card {
  position: relative;
  padding: 18px;
  z-index: 2;
  border-radius: 34px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.74), rgba(232, 251, 255, 0.46)),
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.82), transparent 28%);
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 34px 86px rgba(15, 23, 42, 0.14), inset 0 1px 0 rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(20px) saturate(1.28);
  -webkit-backdrop-filter: blur(20px) saturate(1.28);
}

.dark .mode-card {
  background:
    linear-gradient(135deg, rgba(12, 22, 36, 0.86), rgba(10, 45, 43, 0.58)),
    radial-gradient(circle at 20% 0%, rgba(103, 232, 249, 0.14), transparent 32%);
  border-color: rgba(203, 255, 239, 0.14);
}

.hero-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-width: 620px;
  margin-top: 28px;
}

.hero-metrics div {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.22));
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.08);
  backdrop-filter: blur(20px);
}

.dark .hero-metrics div {
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.58), rgba(6, 78, 59, 0.16));
  border-color: rgba(203, 255, 239, 0.12);
}

.hero-metrics strong,
.hero-metrics span {
  display: block;
}

.hero-metrics strong {
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 950;
  letter-spacing: -0.04em;
}

.hero-metrics span {
  margin-top: 5px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
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
  grid-template-columns: 42px 42px 1fr 44px;
  align-items: end;
  gap: 10px;
  border: 1px solid rgba(148, 163, 184, 0.26);
  border-radius: 22px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72), 0 12px 30px rgba(15, 23, 42, 0.08);
}

.hidden-file-input {
  display: none;
}

.attach-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.54);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.66);
  transition: transform 0.18s ease, color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.attach-button:hover:not(:disabled) {
  transform: translateY(-1px);
  color: var(--accent-color);
  border-color: rgba(34, 197, 94, 0.42);
  background: rgba(255, 255, 255, 0.78);
}

.attach-button.active {
  color: var(--accent-color);
  border-color: rgba(34, 197, 94, 0.44);
  background: rgba(220, 252, 231, 0.72);
}

.attach-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dark .attach-button {
  background: rgba(15, 23, 42, 0.48);
  border-color: rgba(148, 163, 184, 0.18);
}

.chat-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attachment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 240px;
  border: 1px solid rgba(34, 197, 94, 0.24);
  border-radius: 999px;
  padding: 7px 9px;
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  font-size: 12px;
  font-weight: 700;
}

.attachment-chip button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 999px;
  color: var(--text-secondary);
  background: rgba(15, 23, 42, 0.08);
  cursor: pointer;
}

.dark .attachment-chip {
  background: rgba(15, 23, 42, 0.52);
  border-color: rgba(74, 222, 128, 0.24);
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
  font-weight: 650;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.suggestion-cloud button:hover {
  transform: translateY(-1px);
  border-color: rgba(34, 197, 94, 0.5);
  background: rgba(255, 255, 255, 0.9);
}

.dark .suggestion-cloud button {
  background: rgba(15, 23, 42, 0.48);
}

.refresh-chip {
  display: inline-flex;
  align-items: center;
}

.showcase-section,
.inspiration-section,
.projects-section {
  position: relative;
  z-index: 2;
  margin-top: 72px;
}

.section-title {
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.brand-footer {
  position: relative;
  display: grid;
  width: 100vw;
  min-height: 270px;
  place-items: center;
  margin: 84px 0 0 calc(50% - 50vw);
  overflow: visible;
  text-align: center;
  perspective: 900px;
}

.brand-footer-glow {
  position: absolute;
  left: 50%;
  top: 50%;
  width: min(84vw, 980px);
  height: 170px;
  border-radius: 999px;
  background:
    radial-gradient(ellipse at 30% 50%, rgba(34, 255, 181, 0.18), transparent 58%),
    radial-gradient(ellipse at 68% 50%, rgba(14, 165, 233, 0.16), transparent 60%);
  filter: blur(20px);
  transform: translate(-50%, -50%);
}

.brand-footer p {
  position: relative;
  margin: 0;
  color: rgba(15, 23, 42, 0.1);
  max-width: 96vw;
  font-size: min(15.2vw, 190px);
  font-weight: 950;
  letter-spacing: -0.082em;
  line-height: 0.82;
  white-space: nowrap;
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.84),
    0 14px 32px rgba(20, 184, 166, 0.16),
    0 42px 90px rgba(15, 23, 42, 0.16);
  transform: rotateX(18deg) translateZ(-8px);
  transform-origin: center bottom;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.18);
}

.brand-footer span {
  position: absolute;
  bottom: 30px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 999px;
  padding: 8px 13px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  backdrop-filter: blur(18px);
}

.dark .brand-footer p {
  color: rgba(230, 255, 247, 0.105);
  text-shadow:
    0 1px 0 rgba(255, 255, 255, 0.06),
    0 16px 40px rgba(45, 212, 191, 0.16),
    0 48px 120px rgba(0, 0, 0, 0.48);
  -webkit-text-stroke: 1px rgba(203, 255, 239, 0.045);
}

.dark .brand-footer span {
  background: rgba(15, 23, 42, 0.58);
}

.section-title h2 {
  font-size: 26px;
  font-weight: 900;
  letter-spacing: -0.04em;
}

.section-desc {
  max-width: 600px;
  margin-top: 8px;
  color: var(--text-secondary);
  line-height: 1.75;
}

.source-link {
  padding: 10px 14px;
  border: 1px solid rgba(148, 163, 184, 0.34);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.62);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 800;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.source-link:hover {
  transform: translateY(-2px);
  border-color: rgba(34, 197, 94, 0.55);
  background: rgba(255, 255, 255, 0.86);
}

.dark .source-link {
  background: rgba(15, 23, 42, 0.58);
}

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 16px;
}

.showcase-card {
  position: relative;
  height: 270px;
  overflow: hidden;
  border-radius: 34px;
  text-align: left;
  border: 1px solid rgba(255, 255, 255, 0.4);
  box-shadow: 0 30px 80px rgba(15, 23, 42, 0.16);
  transform: translateZ(0);
  transition: transform 0.28s ease, box-shadow 0.28s ease, border-color 0.28s ease;
}

.showcase-card-1 {
  grid-column: span 3;
  height: 320px;
}

.showcase-card-2,
.showcase-card-3 {
  grid-column: span 3;
}

.showcase-card-3 {
  grid-column: span 6;
  height: 240px;
}

.showcase-card:hover {
  transform: translateY(-8px) scale(1.012);
  border-color: rgba(34, 255, 181, 0.55);
  box-shadow: 0 42px 110px rgba(4, 120, 87, 0.18);
}

.showcase-card::after {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0;
  background: linear-gradient(115deg, transparent 0 34%, rgba(255, 255, 255, 0.28) 45%, transparent 56%);
  transform: translateX(-50%);
  transition: opacity 0.25s ease, transform 0.55s ease;
}

.showcase-card:hover::after {
  opacity: 1;
  transform: translateX(45%);
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
  background:
    radial-gradient(circle at 22% 18%, rgba(45, 212, 191, 0.2), transparent 34%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.03), rgba(2, 6, 23, 0.86));
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

.showcase-overlay b {
  width: fit-content;
  margin-top: 14px;
  border-radius: 999px;
  padding: 7px 10px;
  background: rgba(255, 255, 255, 0.16);
  color: rgba(255, 255, 255, 0.94);
  font-size: 12px;
  font-weight: 850;
  backdrop-filter: blur(14px);
  transform: translateY(8px);
  opacity: 0;
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.showcase-card:hover .showcase-overlay b {
  transform: translateY(0);
  opacity: 1;
}

.inspiration-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px;
}

.inspiration-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.72), rgba(255, 255, 255, 0.42));
  text-align: left;
  box-shadow: 0 22px 52px rgba(15, 23, 42, 0.1);
  backdrop-filter: blur(16px);
  transition: transform 0.24s ease, border-color 0.24s ease, box-shadow 0.24s ease;
}

.inspiration-card::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0;
  background: radial-gradient(circle at var(--mx) var(--my), rgba(34, 255, 181, 0.16), transparent 34%);
  transition: opacity 0.24s ease;
  pointer-events: none;
}

.inspiration-card:hover {
  transform: translateY(-7px);
  border-color: rgba(34, 197, 94, 0.58);
  box-shadow: 0 34px 78px rgba(4, 120, 87, 0.15);
}

.inspiration-card:hover::before {
  opacity: 1;
}

.dark .inspiration-card {
  background: rgba(15, 23, 42, 0.58);
}

.inspiration-image {
  aspect-ratio: 4 / 3;
  overflow: hidden;
  background: rgba(148, 163, 184, 0.12);
}

.inspiration-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.45s ease;
}

.inspiration-card:hover .inspiration-image img {
  transform: scale(1.06);
}

.inspiration-body {
  padding: 14px;
}

.inspiration-body span {
  display: inline-flex;
  margin-bottom: 9px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(34, 197, 94, 0.12);
  color: #047857;
  font-size: 12px;
  font-weight: 800;
}

.dark .inspiration-body span {
  color: #86efac;
}

.inspiration-body h3 {
  font-size: 16px;
  font-weight: 900;
}

.inspiration-body p {
  display: -webkit-box;
  margin-top: 8px;
  overflow: hidden;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
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
  position: relative;
  padding: 10px;
  border-radius: 28px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.42)),
    radial-gradient(circle at 15% 0%, rgba(34, 255, 181, 0.12), transparent 34%);
  border: 1px solid rgba(255, 255, 255, 0.42);
  box-shadow: 0 22px 58px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(18px);
  transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease;
}

.project-card::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  opacity: 0;
  background: linear-gradient(120deg, transparent 0 34%, rgba(255, 255, 255, 0.28) 45%, transparent 56%);
  transform: translateX(-45%);
  transition: opacity 0.22s ease, transform 0.55s ease;
  pointer-events: none;
}

.project-card:hover {
  transform: translateY(-6px);
  border-color: rgba(34, 255, 181, 0.48);
  box-shadow: 0 32px 82px rgba(4, 120, 87, 0.16);
}

.project-card:hover::before {
  opacity: 1;
  transform: translateX(55%);
}

.dark .project-card {
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.64), rgba(6, 78, 59, 0.22)),
    radial-gradient(circle at 15% 0%, rgba(34, 255, 181, 0.1), transparent 34%);
  border-color: rgba(203, 255, 239, 0.12);
}

.project-thumb {
  aspect-ratio: 16 / 10;
  overflow: hidden;
  border-radius: 22px;
  background:
    radial-gradient(circle at 50% 10%, rgba(125, 211, 252, 0.16), transparent 35%),
    linear-gradient(135deg, rgba(15, 23, 42, 0.06), rgba(15, 23, 42, 0.12));
  cursor: pointer;
}

.project-placeholder {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--text-secondary);
  position: relative;
}

.project-placeholder::before {
  content: "Y";
  position: absolute;
  color: rgba(34, 197, 94, 0.1);
  font-size: 80px;
  font-weight: 950;
  line-height: 1;
  transform: rotate(-12deg);
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

:global(.onboarding-modal.n-card) {
  width: min(920px, calc(100vw - 32px));
  overflow: hidden;
  border-radius: 36px;
  background:
    radial-gradient(circle at 18% 0%, rgba(85, 245, 182, 0.24), transparent 34%),
    radial-gradient(circle at 84% 12%, rgba(56, 189, 248, 0.2), transparent 36%),
    linear-gradient(135deg, rgba(255, 255, 255, 0.9), rgba(236, 253, 245, 0.7));
  box-shadow: 0 38px 120px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(30px) saturate(1.42);
}

:global(.dark .onboarding-modal.n-card) {
  background:
    radial-gradient(circle at 18% 0%, rgba(85, 245, 182, 0.15), transparent 34%),
    radial-gradient(circle at 84% 12%, rgba(56, 189, 248, 0.12), transparent 36%),
    linear-gradient(135deg, rgba(12, 22, 36, 0.94), rgba(7, 34, 36, 0.82));
}

:global(.onboarding-modal .n-card__content) {
  padding: 0;
}

.onboarding-shell {
  padding: 30px;
}

.onboarding-head {
  display: grid;
  grid-template-columns: 78px minmax(0, 1fr);
  gap: 18px;
  align-items: center;
}

.onboarding-orb {
  display: grid;
  place-items: center;
  width: 78px;
  height: 78px;
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 28px;
  color: #062c2a;
  background:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.95), transparent 30%),
    linear-gradient(135deg, #dffef7, #55f5b6 52%, #38bdf8);
  box-shadow: 0 26px 70px rgba(17, 216, 197, 0.34);
  font-size: 36px;
  font-weight: 950;
  letter-spacing: -0.08em;
}

.onboarding-kicker {
  color: var(--accent-color);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.2em;
}

.onboarding-shell h2 {
  margin-top: 6px;
  color: var(--text-primary);
  font-size: clamp(30px, 5vw, 48px);
  line-height: 1;
  font-weight: 950;
  letter-spacing: -0.06em;
}

.onboarding-desc {
  max-width: 540px;
  margin-top: 12px;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.8;
}

.onboarding-progress {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  margin-top: 22px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.46);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.dark .onboarding-progress {
  background: rgba(2, 12, 23, 0.32);
  border-color: rgba(203, 255, 239, 0.12);
}

.onboarding-progress span,
.onboarding-progress b {
  display: block;
}

.onboarding-progress span {
  color: var(--accent-color);
  font-size: 22px;
  font-weight: 950;
}

.onboarding-progress b {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 12px;
}

.onboarding-progress-track {
  height: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.08);
  box-shadow: inset 0 1px 4px rgba(15, 23, 42, 0.16);
}

.dark .onboarding-progress-track {
  background: rgba(255, 255, 255, 0.08);
}

.onboarding-progress-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #55f5b6, #11d8c5 52%, #38bdf8);
  box-shadow: 0 0 22px rgba(85, 245, 182, 0.42);
  transition: width 0.28s ease;
}

.onboarding-console {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.onboarding-check {
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  gap: 14px;
  align-items: center;
  padding: 16px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.52);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74), 0 18px 46px rgba(15, 23, 42, 0.08);
}

.dark .onboarding-check {
  background: rgba(2, 12, 23, 0.36);
  border-color: rgba(203, 255, 239, 0.12);
}

.onboarding-check.is-ready {
  border-color: rgba(34, 197, 94, 0.32);
}

.onboarding-check.is-primary {
  border-color: rgba(85, 245, 182, 0.72);
  box-shadow: 0 22px 70px rgba(17, 216, 197, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.check-index {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 18px;
  color: var(--accent-color);
  background: rgba(34, 197, 94, 0.12);
  font-size: 12px;
  font-weight: 950;
  letter-spacing: 0.14em;
}

.check-title {
  display: flex;
  align-items: center;
  gap: 10px;
}

.check-title h3 {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 900;
}

.check-title span {
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  color: #047857;
  background: rgba(34, 197, 94, 0.12);
  font-size: 11px;
  font-weight: 850;
}

.onboarding-check:not(.is-ready) .check-title span {
  color: #b45309;
  background: rgba(245, 158, 11, 0.14);
}

.check-body p {
  margin-top: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.check-body small {
  display: block;
  margin-top: 6px;
  color: color-mix(in srgb, var(--text-secondary) 76%, var(--accent-color));
  font-size: 12px;
  font-weight: 750;
}

.onboarding-check button {
  min-width: 128px;
  height: 40px;
  padding: 0 16px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 999px;
  color: #052e2b;
  background:
    radial-gradient(circle at 22% 0%, rgba(255, 255, 255, 0.8), transparent 42%),
    linear-gradient(135deg, #dffef7, #55f5b6 52%, #38bdf8);
  box-shadow: 0 16px 36px rgba(17, 216, 197, 0.2);
  font-size: 13px;
  font-weight: 900;
}

.onboarding-footer {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-top: 18px;
  color: var(--text-secondary);
  font-size: 13px;
}

.onboarding-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 0;
  flex-shrink: 0;
}

@media (max-width: 960px) {
  .hero-grid,
  .inspiration-grid,
  .project-grid {
    grid-template-columns: 1fr;
  }

  .showcase-grid {
    grid-template-columns: 1fr;
  }

  .showcase-card-1,
  .showcase-card-2,
  .showcase-card-3 {
    grid-column: auto;
    height: 250px;
  }

  .home-main {
    width: min(100% - 24px, 720px);
    padding-top: 32px;
  }

  .hero-copy h1 {
    font-size: 42px;
    line-height: 1.05;
  }

  .hero-line {
    min-height: 290px;
  }

  .hero-metrics {
    grid-template-columns: 1fr;
  }

  .hero-prism {
    display: none;
  }

  .onboarding-head,
  .onboarding-progress,
  .onboarding-check,
  .onboarding-footer {
    grid-template-columns: 1fr;
  }

  .onboarding-footer {
    align-items: flex-start;
    flex-direction: column;
  }
}

@keyframes liquid-drift {
  0% {
    transform: translate3d(-2%, -1%, 0) rotate(0deg) scale(1);
  }
  100% {
    transform: translate3d(2%, 3%, 0) rotate(10deg) scale(1.08);
  }
}

@keyframes float-orb-a {
  50% {
    transform: translate3d(70px, -38px, 0) scale(1.08);
  }
}

@keyframes float-orb-b {
  50% {
    transform: translate3d(-90px, 44px, 0) scale(0.95);
  }
}

@keyframes float-orb-c {
  50% {
    transform: translate3d(-42px, -50px, 0) scale(1.12);
  }
}

@keyframes signal-pulse {
  0%, 100% {
    opacity: 0.42;
    filter: blur(0);
  }
  50% {
    opacity: 1;
    filter: blur(1px);
  }
}

@keyframes rotate-glow {
  to {
    transform: rotate(360deg);
  }
}

@keyframes prism-float {
  0%, 100% {
    transform: rotate(-12deg) translateY(0);
  }
  50% {
    transform: rotate(-7deg) translateY(-10px);
  }
}
</style>

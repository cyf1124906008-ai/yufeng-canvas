<template>
  <main class="agent-workspace">
    <header class="agent-topbar">
      <router-link to="/" class="agent-brand" aria-label="YUFENG Agent 首页">
        <img src="../assets/logo.png" alt="" />
        <span>
          <strong>YUFENG AGENT</strong>
          <small>Autonomous Creative Harness</small>
        </span>
      </router-link>

      <div class="topbar-actions">
        <span class="runtime-pill">{{ desktopMode ? 'DESKTOP APP' : 'LOCAL PREVIEW' }}</span>
        <span class="provider-pill">{{ modelStore.providerLabel || modelStore.currentProvider }}</span>
        <button type="button" class="ghost-button" @click="showSettings = true">模型与 API</button>
      </div>
    </header>

    <section class="agent-hero">
      <p class="hero-kicker">GOAL IN · WORK OUT</p>
      <h1>告诉我最终要什么，<br />剩下的由 Agent 完成。</h1>
      <p class="hero-copy">
        Agent 自主理解目标、选择模型、执行、观察结果并决定下一步。你不需要创建节点，也不需要手动连接工作流。
      </p>

      <form class="goal-composer" @submit.prevent="startRun">
        <textarea
          v-model="goal"
          rows="4"
          :disabled="agent.isRunning.value"
          placeholder="例如：帮我做一张高端新能源汽车广告海报，黑银配色，科技感，9:16，适合抖音。"
          @keydown.meta.enter.prevent="startRun"
          @keydown.ctrl.enter.prevent="startRun"
        ></textarea>
        <div class="composer-footer">
          <div class="composer-hints">
            <span>Agent 自动路由模型</span>
            <span>执行后自动质检</span>
            <span>⌘ / Ctrl + Enter</span>
          </div>
          <button type="submit" class="run-button" :disabled="!goal.trim() || agent.isRunning.value">
            <span v-if="agent.isRunning.value" class="run-spinner"></span>
            {{ agent.isRunning.value ? 'Agent 执行中' : '开始执行' }}
          </button>
        </div>
      </form>

      <div class="goal-examples" aria-label="目标示例">
        <button v-for="example in examples" :key="example" type="button" @click="goal = example">
          {{ example }}
        </button>
      </div>
    </section>

    <section v-if="showRunPanel" class="run-stage">
      <agent-run-panel
        :snapshot="agent.snapshot.value"
        :artifacts="agent.artifacts.value"
        @stop="agent.cancel()"
        @retry="retryRun"
        @artifact-select="selectArtifact"
      />
    </section>

    <section v-else class="agent-capabilities">
      <article>
        <span>01</span>
        <h2>理解目标</h2>
        <p>把一句自然语言目标拆成当前最值得执行的一步，而不是预先写死整条工作流。</p>
      </article>
      <article>
        <span>02</span>
        <h2>自主调度</h2>
        <p>只声明所需能力，由 Model Router 按质量、速度、成本与可用性选择模型。</p>
      </article>
      <article>
        <span>03</span>
        <h2>观察再行动</h2>
        <p>每次真实执行后观察作品，再决定采用、重做或进入下一项创作任务。</p>
      </article>
    </section>

    <api-settings v-model:show="showSettings" />

    <div v-if="selectedArtifact" class="artifact-lightbox" role="dialog" aria-modal="true" @click.self="selectedArtifact = null">
      <button type="button" aria-label="关闭预览" @click="selectedArtifact = null">×</button>
      <img v-if="selectedArtifact.kind === 'image'" :src="selectedArtifact.url" :alt="selectedArtifact.label" />
      <video v-else-if="selectedArtifact.kind === 'video'" :src="selectedArtifact.url" controls autoplay></video>
    </div>
  </main>
</template>

<script setup>
import { computed, ref } from 'vue'
import ApiSettings from '../components/ApiSettings.vue'
import AgentRunPanel from '../components/agent/AgentRunPanel.vue'
import { useHeadlessCreativeAgent } from '../agent/runtime/useHeadlessCreativeAgent.js'
import { useModelStore } from '../stores/pinia/index.js'

const modelStore = useModelStore()
const agent = useHeadlessCreativeAgent({ modelStore })
const goal = ref('')
const showSettings = ref(false)
const selectedArtifact = ref(null)
const desktopMode = import.meta.env.APP_TARGET === 'desktop'
const examples = [
  '做一张黑银科技感新能源汽车海报，9:16',
  '生成一张高端咖啡品牌主视觉，暖金色电影光影',
  '制作一个 10 秒咖啡广告，先生成首图再转成竖屏视频'
]
const showRunPanel = computed(() => agent.snapshot.value.status !== 'idle' || !!agent.snapshot.value.goal)

const startRun = async () => {
  const input = goal.value.trim()
  if (!input || agent.isRunning.value) return
  try {
    await agent.run(input)
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'AGENT_CANCELLED' || error?.code === 'ABORT_ERR') return
    window.$message?.error(error?.message || 'Agent 执行失败')
  }
}

const retryRun = async () => {
  try {
    await agent.retry()
  } catch (error) {
    if (error?.name === 'AbortError' || error?.code === 'AGENT_CANCELLED' || error?.code === 'ABORT_ERR') return
    window.$message?.error(error?.message || 'Agent 重试失败')
  }
}

const selectArtifact = ({ normalizedArtifact }) => {
  if (normalizedArtifact?.url) selectedArtifact.value = normalizedArtifact
}
</script>

<style scoped>
.agent-workspace {
  min-height: 100vh;
  overflow-x: hidden;
  color: var(--text-primary, #e6fff8);
  background:
    radial-gradient(circle at 15% 0%, rgba(34, 255, 181, 0.12), transparent 31%),
    radial-gradient(circle at 92% 12%, rgba(56, 189, 248, 0.1), transparent 28%),
    linear-gradient(155deg, #031017 0%, #061c22 52%, #07131f 100%);
}

.agent-topbar {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 76px;
  border-bottom: 1px solid rgba(203, 255, 239, 0.1);
  padding: 0 clamp(18px, 4vw, 64px);
  background: rgba(3, 16, 23, 0.78);
  backdrop-filter: blur(22px);
}

.agent-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #ecfff9;
  text-decoration: none;
}

.agent-brand img {
  width: 42px;
  height: 42px;
  border-radius: 13px;
  box-shadow: 0 12px 34px rgba(45, 212, 191, 0.22);
}

.agent-brand span { display: flex; flex-direction: column; }
.agent-brand strong { font-size: 14px; letter-spacing: 0.12em; }
.agent-brand small { margin-top: 2px; color: rgba(214, 255, 244, 0.48); font-size: 10px; }

.topbar-actions { display: flex; align-items: center; gap: 9px; }
.runtime-pill,
.provider-pill {
  border: 1px solid rgba(125, 249, 231, 0.16);
  border-radius: 999px;
  padding: 7px 10px;
  color: rgba(214, 255, 244, 0.68);
  background: rgba(255, 255, 255, 0.04);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.1em;
}

.provider-pill { color: #68f5d6; }
.ghost-button,
.goal-examples button {
  border: 1px solid rgba(125, 249, 231, 0.16);
  color: rgba(230, 255, 248, 0.8);
  background: rgba(255, 255, 255, 0.05);
}

.ghost-button {
  border-radius: 12px;
  padding: 9px 13px;
  font-size: 12px;
  font-weight: 800;
}

.ghost-button:hover,
.goal-examples button:hover { border-color: rgba(95, 246, 210, 0.55); color: #6ff8d8; }

.agent-hero {
  width: min(1040px, calc(100% - 36px));
  margin: 0 auto;
  padding: clamp(68px, 9vw, 120px) 0 44px;
}

.hero-kicker {
  margin: 0 0 18px;
  color: #5ff6d2;
  font-size: 11px;
  font-weight: 950;
  letter-spacing: 0.24em;
}

.agent-hero h1 {
  margin: 0;
  color: #f2fff9;
  font-size: clamp(44px, 7.5vw, 86px);
  font-weight: 950;
  letter-spacing: -0.07em;
  line-height: 0.98;
}

.hero-copy {
  max-width: 720px;
  margin: 24px 0 32px;
  color: rgba(220, 255, 247, 0.56);
  font-size: clamp(14px, 1.7vw, 17px);
  line-height: 1.85;
}

.goal-composer {
  overflow: hidden;
  border: 1px solid rgba(125, 249, 231, 0.22);
  border-radius: 28px;
  background:
    radial-gradient(circle at 8% 0%, rgba(45, 212, 191, 0.1), transparent 36%),
    rgba(4, 23, 29, 0.82);
  box-shadow: 0 34px 100px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.goal-composer textarea {
  width: 100%;
  resize: vertical;
  border: 0;
  outline: 0;
  padding: 25px 27px 18px;
  color: #effff9;
  background: transparent;
  font: inherit;
  font-size: 17px;
  line-height: 1.7;
}

.goal-composer textarea::placeholder { color: rgba(214, 255, 244, 0.28); }
.composer-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid rgba(203, 255, 239, 0.08);
  padding: 14px 16px 14px 26px;
}

.composer-hints { display: flex; flex-wrap: wrap; gap: 12px; }
.composer-hints span { color: rgba(214, 255, 244, 0.35); font-size: 10px; }
.run-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 132px;
  border-radius: 16px;
  padding: 13px 20px;
  color: #02211b;
  background: linear-gradient(135deg, #7df9e7, #2dd4bf);
  box-shadow: 0 16px 38px rgba(45, 212, 191, 0.22);
  font-size: 13px;
  font-weight: 950;
}

.run-button:disabled { cursor: not-allowed; opacity: 0.42; box-shadow: none; }
.run-spinner {
  width: 13px;
  height: 13px;
  border: 2px solid rgba(2, 33, 27, 0.28);
  border-top-color: #02211b;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.goal-examples { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 16px; }
.goal-examples button { border-radius: 999px; padding: 8px 12px; font-size: 11px; }
.run-stage,
.agent-capabilities {
  width: min(1180px, calc(100% - 36px));
  margin: 0 auto;
  padding: 0 0 72px;
}

.run-stage :deep(.agent-run-panel) {
  color: #eafff8;
  background: rgba(4, 23, 29, 0.88);
  --text-primary: #effff9;
  --text-secondary: rgba(214, 255, 244, 0.55);
  --bg-secondary: #061b21;
  --bg-tertiary: #0a2a31;
}

.agent-capabilities { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.agent-capabilities article {
  min-height: 190px;
  border: 1px solid rgba(203, 255, 239, 0.1);
  border-radius: 22px;
  padding: 22px;
  background: rgba(255, 255, 255, 0.035);
}

.agent-capabilities span { color: #5ff6d2; font-size: 10px; font-weight: 950; letter-spacing: 0.16em; }
.agent-capabilities h2 { margin: 34px 0 10px; color: #edfff9; font-size: 18px; }
.agent-capabilities p { margin: 0; color: rgba(214, 255, 244, 0.48); font-size: 12px; line-height: 1.8; }

.artifact-lightbox {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 48px;
  background: rgba(0, 8, 12, 0.86);
  backdrop-filter: blur(20px);
}

.artifact-lightbox img,
.artifact-lightbox video { max-width: 92vw; max-height: 86vh; border-radius: 20px; box-shadow: 0 30px 120px #000; }
.artifact-lightbox > button {
  position: fixed;
  top: 24px;
  right: 28px;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  color: #eafff8;
  background: rgba(255, 255, 255, 0.1);
  font-size: 26px;
}

@keyframes spin { to { transform: rotate(360deg); } }

@media (max-width: 760px) {
  .runtime-pill,
  .provider-pill { display: none; }
  .agent-brand small { display: none; }
  .agent-hero { padding-top: 60px; }
  .composer-footer { align-items: stretch; flex-direction: column; padding-left: 16px; }
  .run-button { width: 100%; }
  .agent-capabilities { grid-template-columns: 1fr; }
  .artifact-lightbox { padding: 20px; }
}
</style>

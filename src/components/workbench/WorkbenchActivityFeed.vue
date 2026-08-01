<template>
  <section class="wb-thread">
    <header class="thread-header">
      <div>
        <button type="button" class="mobile-nav" aria-label="打开导航" @click="emit('open-navigation')">☰</button>
        <span class="session-mark">{{ mode === 'history' ? 'H' : 'A' }}</span>
        <span>
          <strong>{{ sessionTitle }}</strong>
          <small>{{ modeLabel }}</small>
        </span>
      </div>
      <div class="thread-header-actions">
        <span class="run-status" :class="`is-${status.tone}`"><i></i>{{ status.label }}</span>
        <button type="button" aria-label="打开运行检查器" @click="emit('toggle-inspector')">检查器</button>
      </div>
    </header>

    <div ref="scroller" class="thread-scroll">
      <div v-if="loading" class="thread-loading" role="status">
        <span></span>
        正在读取任务…
      </div>

      <div v-else-if="mode === 'draft'" class="thread-empty">
        <div class="empty-orbit"><span>Y</span></div>
        <h1>把任务交给 Agent</h1>
        <p>描述最终目标。Agent 会逐步选择文件、终端、电脑控制或 Creative 工具，并只展示真实发生的动作。</p>
        <div class="suggestion-grid">
          <button v-for="suggestion in suggestions" :key="suggestion" type="button" @click="emit('apply-suggestion', suggestion)">
            <span>↗</span>{{ suggestion }}
          </button>
        </div>
      </div>

      <div v-else class="thread-content">
        <div v-if="mode === 'history'" class="history-banner">
          <div>
            <span>只读历史</span>
            <strong>已保存任务</strong>
            <small>以下内容是历史记录，不会影响当前 Agent。</small>
          </div>
          <button type="button" @click="emit('reuse-goal')">使用此目标新建任务</button>
        </div>

        <article v-if="goal" class="user-message">
          <div class="message-avatar">U</div>
          <div>
            <header><strong>你</strong><time v-if="startedAt">{{ startedAt }}</time></header>
            <p>{{ goal }}</p>
          </div>
        </article>

        <section v-if="plan.length" class="plan-card">
          <header>
            <div><span class="card-icon">≡</span><strong>动态计划</strong></div>
            <small>{{ completedPlanCount }}/{{ plan.length }} 已完成</small>
          </header>
          <ol>
            <li v-for="item in plan" :key="item.id" :class="`is-${item.status}`">
              <span class="plan-state">{{ item.status === 'completed' ? '✓' : item.status === 'running' ? '●' : '○' }}</span>
              <span class="plan-tool">{{ item.icon }}</span>
              <strong>{{ item.label }}</strong>
              <small v-if="item.step">步骤 {{ item.step }}</small>
            </li>
          </ol>
          <p>计划只根据本次真实选择过的动作生成，不预先虚构后续步骤。</p>
        </section>

        <section v-if="activities.length" class="activity-stream" aria-label="Agent 活动">
          <article
            v-for="activity in activities"
            :key="activity.id"
            class="activity-card"
            :class="[`is-${activity.kind}`, `tone-${activity.tone}`]"
          >
            <div class="activity-rail"><span>{{ activity.tool.icon }}</span><i></i></div>
            <div class="activity-body">
              <header>
                <div>
                  <strong>{{ activity.title }}</strong>
                  <span class="activity-status" :class="`is-${activity.tone}`">{{ activity.statusLabel }}</span>
                </div>
                <time v-if="activity.timeLabel">{{ activity.timeLabel }}</time>
              </header>
              <p v-if="activity.message">{{ activity.message }}</p>
              <div v-if="activity.step || activity.attempt || activity.artifactRef" class="activity-meta">
                <span v-if="activity.step">步骤 {{ activity.step }}</span>
                <span v-if="activity.attempt">尝试 {{ activity.attempt }}</span>
                <span v-if="activity.artifactRef">{{ activity.artifactRef }}</span>
              </div>

              <div v-if="activity.kind === 'approval'" class="approval-card">
                <p>{{ activity.message || '这项操作必须得到明确批准后才能继续。' }}</p>
                <pre v-if="activity.input">{{ activity.input }}</pre>
                <div>
                  <button type="button" :disabled="readOnly" @click="emit('approval', { id: activity.approvalId, decision: 'reject', activity: activity.raw })">拒绝</button>
                  <button type="button" class="approve" :disabled="readOnly" @click="emit('approval', { id: activity.approvalId, decision: 'approve', activity: activity.raw })">批准一次</button>
                </div>
              </div>

              <div v-if="activity.kind === 'terminal'" class="terminal-card">
                <div><span></span><span></span><span></span><strong>终端</strong></div>
                <code v-if="activity.command">$ {{ activity.command }}</code>
                <pre v-if="activity.output">{{ activity.output }}</pre>
                <p v-if="!activity.command && !activity.output">没有保留终端输出。</p>
              </div>

              <div v-if="activity.kind === 'computer'" class="computer-card">
                <div class="computer-screen"><span>电脑操作结果</span></div>
                <p>{{ activity.output || '没有保留可视结果。' }}</p>
              </div>
            </div>
          </article>
        </section>

        <section v-else-if="status.status !== 'idle'" class="waiting-card">
          <span></span>
          <div><strong>{{ status.label }}</strong><p>尚未记录详细事件。</p></div>
        </section>

        <section v-if="normalizedArtifacts.length" class="thread-artifacts">
          <header><strong>产物</strong><span>{{ normalizedArtifacts.length }} 个</span></header>
          <div>
            <button
              v-for="artifact in normalizedArtifacts"
              :key="artifact.id"
              type="button"
              :disabled="!artifact.url"
              @click="emit('artifact-select', artifact)"
            >
              <img v-if="artifact.kind === 'image' && artifact.url" :src="artifact.url" :alt="artifact.label" />
              <video v-else-if="artifact.kind === 'video' && artifact.url" :src="artifact.url" muted></video>
              <span v-else class="artifact-placeholder">{{ artifact.kind.toUpperCase() }}</span>
              <strong>{{ artifact.label }}</strong>
              <small>{{ artifact.isFinal ? '最终交付' : artifact.status.label }}</small>
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import {
  buildWorkbenchActivities,
  buildWorkbenchPlan,
  formatWorkbenchTime,
  normalizeWorkbenchArtifacts,
  workbenchStatus
} from './workbenchView.js'

defineOptions({ name: 'WorkbenchActivityFeed' })

const props = defineProps({
  snapshot: { type: Object, default: () => ({}) },
  artifacts: { type: Array, default: () => [] },
  injectedActivities: { type: Array, default: () => [] },
  mode: { type: String, default: 'draft' },
  loading: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
  suggestions: { type: Array, default: () => [] }
})

const emit = defineEmits({
  'open-navigation': () => true,
  'toggle-inspector': () => true,
  'apply-suggestion': value => typeof value === 'string',
  'reuse-goal': () => true,
  'artifact-select': value => !!value && typeof value === 'object',
  approval: value => !!value && typeof value === 'object'
})

const scroller = ref(null)
const goal = computed(() => String(props.snapshot?.goal || '').trim())
const status = computed(() => workbenchStatus(props.snapshot?.status || 'idle'))
const activities = computed(() => buildWorkbenchActivities(props.snapshot, props.injectedActivities))
const plan = computed(() => buildWorkbenchPlan(props.snapshot, activities.value))
const completedPlanCount = computed(() => plan.value.filter(item => item.status === 'completed').length)
const normalizedArtifacts = computed(() => normalizeWorkbenchArtifacts(props.artifacts, props.snapshot))
const startedAt = computed(() => formatWorkbenchTime(props.snapshot?.startedAt))
const sessionTitle = computed(() => goal.value || (props.mode === 'draft' ? '新任务' : 'Agent 任务'))
const modeLabel = computed(() => ({ draft: '本地草稿', live: '实时会话', history: '已保存历史' })[props.mode] || '会话')

watch(() => [activities.value.length, normalizedArtifacts.value.length], async () => {
  await nextTick()
  if (scroller.value && props.mode === 'live') scroller.value.scrollTop = scroller.value.scrollHeight
})
</script>

<style scoped>
.wb-thread { display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; min-height: 0; color: var(--wb-text); background: #151619; }
.thread-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 51px; border-bottom: 1px solid var(--wb-border); padding: 8px 13px; background: rgba(21, 22, 25, 0.96); }
.thread-header > div { display: flex; align-items: center; min-width: 0; gap: 8px; }
.session-mark { display: grid; flex: 0 0 auto; width: 25px; height: 25px; place-items: center; border: 1px solid #34363b; border-radius: 6px; color: #afdcc5; background: #222429; font-size: 9px; font-weight: 850; }
.thread-header > div > span:last-child { min-width: 0; }
.thread-header strong,
.thread-header small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.thread-header strong { max-width: min(48vw, 540px); color: #dfe0e3; font-size: 10px; }
.thread-header small { margin-top: 1px; color: #666970; font-size: 7.5px; }
.thread-header-actions { justify-content: flex-end; }
.thread-header-actions > button { border: 1px solid #34363b; border-radius: 6px; padding: 5px 7px; color: #a2a5ab; font-size: 8px; }
.thread-header-actions > button:hover { color: #fff; background: #26282d; }
.mobile-nav { display: none; color: #9b9ea5; }
.run-status { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #32343a; border-radius: 999px; padding: 4px 7px; color: #9699a1; background: #1d1f23; font-size: 7.5px; }
.run-status i { width: 5px; height: 5px; border-radius: 50%; background: #777a82; }
.run-status.is-running i { background: #75bdf2; animation: status-pulse 1s infinite alternate; }
.run-status.is-success i { background: #72d6a8; }
.run-status.is-error i { background: #ef8383; }
.run-status.is-retry i { background: #b89af3; }
.run-status.is-stopped i { background: #d7a667; }

.thread-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #34363c transparent; }
.thread-content { width: min(800px, calc(100% - 32px)); margin: 0 auto; padding: 26px 0 54px; }
.thread-loading { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 55vh; color: #858890; font-size: 9px; }
.thread-loading span { width: 8px; height: 8px; border: 2px solid #3b3e44; border-top-color: #9ee3c1; border-radius: 50%; animation: spin 700ms linear infinite; }
.thread-empty { display: flex; min-height: 66vh; flex-direction: column; align-items: center; justify-content: center; padding: 42px 20px; text-align: center; }
.empty-orbit { display: grid; width: 48px; height: 48px; place-items: center; border: 1px solid #35373d; border-radius: 14px; background: linear-gradient(145deg, #282a2f, #1c1e22); box-shadow: 0 16px 46px rgba(0, 0, 0, 0.25); transform: rotate(-4deg); }
.empty-orbit span { color: #b7f5d5; font-size: 21px; font-weight: 900; transform: rotate(4deg); }
.thread-empty h1 { margin: 16px 0 0; color: #f1f1f2; font-size: clamp(20px, 3vw, 29px); letter-spacing: -0.035em; }
.thread-empty > p { max-width: 480px; margin: 8px 0 0; color: #82858c; font-size: 10px; line-height: 1.65; }
.suggestion-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; width: min(510px, 100%); margin-top: 22px; }
.suggestion-grid button { display: flex; align-items: flex-start; gap: 8px; border: 1px solid #303238; border-radius: 9px; padding: 10px 11px; color: #afb1b6; background: #1c1e22; font-size: 8.5px; line-height: 1.45; text-align: left; }
.suggestion-grid button:hover { border-color: #45484f; color: #e2e3e5; background: #222429; }
.suggestion-grid span { color: #82d3ae; }

.history-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 22px; border: 1px solid #343c38; border-radius: 9px; padding: 9px 11px; background: #1b221f; }
.history-banner > div { min-width: 0; }
.history-banner span,
.history-banner strong,
.history-banner small { display: block; }
.history-banner span { color: #8ad8b2; font-size: 7px; font-weight: 850; letter-spacing: 0.12em; }
.history-banner strong { margin-top: 1px; color: #d4ded9; font-size: 9px; }
.history-banner small { margin-top: 2px; color: #738079; font-size: 7.5px; }
.history-banner button { flex: 0 0 auto; border: 1px solid #3d5148; border-radius: 7px; padding: 6px 8px; color: #a7dfc4; font-size: 8px; }
.history-banner button:hover { background: #243129; }
.user-message { display: grid; grid-template-columns: 27px minmax(0, 1fr); gap: 10px; margin: 0 0 20px; }
.message-avatar { display: grid; width: 26px; height: 26px; place-items: center; border-radius: 7px; color: #191b1f; background: #d6d9df; font-size: 8px; font-weight: 850; }
.user-message header { display: flex; align-items: center; gap: 8px; min-height: 24px; }
.user-message strong { color: #d7d8dc; font-size: 9px; }
.user-message time { color: #64676e; font-size: 7px; }
.user-message p { margin: 3px 0 0; color: #ececed; font-size: 11px; line-height: 1.7; white-space: pre-wrap; }

.plan-card { margin: 0 0 18px 37px; border: 1px solid #303238; border-radius: 9px; background: #1b1d20; }
.plan-card > header { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid #292b30; padding: 8px 10px; }
.plan-card > header div { display: flex; align-items: center; gap: 7px; }
.plan-card strong { color: #cfd0d4; font-size: 9px; }
.plan-card > header small { color: #6f7279; font-size: 7.5px; }
.card-icon { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 5px; color: #9eddbf; background: #233128; font-size: 10px; }
.plan-card ol { display: grid; gap: 1px; padding: 6px; list-style: none; }
.plan-card li { display: grid; grid-template-columns: 17px 24px minmax(0, 1fr) auto; align-items: center; gap: 5px; border-radius: 6px; padding: 5px 6px; color: #989ba2; }
.plan-card li.is-running { color: #d8dadd; background: #23252a; }
.plan-card li.is-completed { color: #7d9488; }
.plan-state { color: #676a72; font-size: 9px; }
.is-running .plan-state { color: #79c6ec; }
.is-completed .plan-state { color: #70cba0; }
.plan-tool { display: grid; width: 21px; height: 21px; place-items: center; border: 1px solid #34363c; border-radius: 5px; background: #222429; font-size: 6.5px; font-weight: 800; }
.plan-card li strong { font-size: 8.5px; }
.plan-card li small { color: #62656c; font-size: 7px; }
.plan-card > p { margin: 0; border-top: 1px solid #292b30; padding: 6px 10px; color: #5f6269; font-size: 7px; }

.activity-stream { display: grid; gap: 0; margin-left: 37px; }
.activity-card { display: grid; grid-template-columns: 27px minmax(0, 1fr); gap: 8px; min-width: 0; }
.activity-rail { position: relative; display: flex; justify-content: center; }
.activity-rail > span { position: relative; z-index: 1; display: grid; width: 23px; height: 23px; place-items: center; border: 1px solid #37393f; border-radius: 6px; color: #9a9da4; background: #202226; font-size: 6.5px; font-weight: 850; }
.activity-rail i { position: absolute; top: 24px; bottom: 0; width: 1px; background: #2b2d32; }
.activity-card:last-child .activity-rail i { display: none; }
.activity-body { min-width: 0; padding: 2px 0 18px; }
.activity-body > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 9px; min-height: 22px; }
.activity-body > header > div { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; }
.activity-body > header strong { overflow: hidden; color: #c9cbd0; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.activity-body > header time { flex: 0 0 auto; color: #5f6269; font-size: 7px; }
.activity-body > p { margin: 3px 0 0; color: #858890; font-size: 8.5px; line-height: 1.5; }
.activity-status { border-radius: 999px; padding: 2px 5px; color: #8a8d94; background: #25272b; font-size: 6.5px; }
.activity-status.is-running { color: #83c9ed; background: #1d2b33; }
.activity-status.is-success { color: #82d5ad; background: #1e2e27; }
.activity-status.is-error { color: #ee9696; background: #342124; }
.activity-status.is-retry { color: #c2a7f0; background: #2a2336; }
.activity-status.is-approval { color: #e5bd79; background: #342c1e; }
.activity-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.activity-meta span { border: 1px solid #303238; border-radius: 4px; padding: 2px 5px; color: #686b72; background: #1b1c20; font-size: 6.5px; }
.tone-success .activity-rail > span { color: #78cda4; border-color: #31493e; }
.tone-error .activity-rail > span { color: #e48787; border-color: #4a2d31; }
.tone-running .activity-rail > span { color: #7fc1e5; border-color: #2b4655; }

.approval-card { margin-top: 7px; border: 1px solid #4a402d; border-radius: 8px; padding: 9px; background: #262218; }
.approval-card > p { margin: 0; color: #bfb29b; font-size: 8px; line-height: 1.5; }
.approval-card > pre { max-height: 220px; overflow: auto; margin: 7px 0 0; border: 1px solid #3b352a; border-radius: 6px; padding: 7px; color: #d0c5b2; background: #18150f; font: 9px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-word; }
.approval-card > div { display: flex; justify-content: flex-end; gap: 5px; margin-top: 8px; }
.approval-card button { border: 1px solid #4a4438; border-radius: 6px; padding: 5px 8px; color: #a6a098; font-size: 7.5px; }
.approval-card button.approve { border-color: #46624f; color: #b5e4ca; background: #28372e; }
.approval-card button:disabled { cursor: not-allowed; opacity: 0.4; }
.terminal-card { overflow: hidden; margin-top: 7px; border: 1px solid #33363b; border-radius: 8px; background: #0d0e10; }
.terminal-card > div { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid #25272b; padding: 6px 8px; background: #18191c; }
.terminal-card > div span { width: 5px; height: 5px; border-radius: 50%; background: #676a71; }
.terminal-card > div span:first-child { background: #d76f6f; }
.terminal-card > div span:nth-child(2) { background: #d3a75c; }
.terminal-card > div span:nth-child(3) { background: #69b88c; }
.terminal-card > div strong { margin-left: 4px; color: #878a91; font-size: 7px; }
.terminal-card code,
.terminal-card pre,
.terminal-card > p { display: block; margin: 0; padding: 7px 9px; color: #aeb9b3; font: 8px/1.55 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; }
.terminal-card pre { border-top: 1px solid #1d1f22; color: #82878d; }
.computer-card { margin-top: 7px; border: 1px solid #34363c; border-radius: 8px; padding: 7px; background: #1b1d20; }
.computer-screen { display: grid; min-height: 72px; place-items: center; border: 1px solid #2e3035; border-radius: 5px; color: #686b72; background: repeating-linear-gradient(135deg, #17181b 0 9px, #191a1e 9px 18px); font-size: 7px; }
.computer-card > p { margin: 6px 1px 0; color: #75787f; font-size: 7.5px; }
.waiting-card { display: flex; align-items: center; gap: 10px; margin: 12px 0 0 37px; border: 1px solid #303238; border-radius: 8px; padding: 10px; background: #1b1d20; }
.waiting-card > span { width: 9px; height: 9px; border: 2px solid #3d4046; border-top-color: #81cfaa; border-radius: 50%; animation: spin 800ms linear infinite; }
.waiting-card strong { color: #bfc1c6; font-size: 8.5px; }
.waiting-card p { margin: 2px 0 0; color: #696c73; font-size: 7.5px; }

.thread-artifacts { margin: 18px 0 0 37px; border-top: 1px solid #292b30; padding-top: 14px; }
.thread-artifacts > header { display: flex; align-items: center; justify-content: space-between; }
.thread-artifacts > header strong { color: #bfc1c6; font-size: 9px; }
.thread-artifacts > header span { color: #65686f; font-size: 7px; }
.thread-artifacts > div { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 7px; margin-top: 8px; }
.thread-artifacts button { overflow: hidden; min-width: 0; border: 1px solid #303238; border-radius: 8px; color: #aeb0b5; background: #1c1e22; text-align: left; }
.thread-artifacts button:not(:disabled):hover { border-color: #4a4d54; transform: translateY(-1px); }
.thread-artifacts img,
.thread-artifacts video,
.artifact-placeholder { display: grid; width: 100%; aspect-ratio: 16/10; place-items: center; object-fit: cover; color: #65686f; background: #17181b; font-size: 8px; }
.thread-artifacts strong,
.thread-artifacts small { display: block; overflow: hidden; margin: 0 8px; text-overflow: ellipsis; white-space: nowrap; }
.thread-artifacts strong { margin-top: 7px; font-size: 8px; }
.thread-artifacts small { margin-top: 2px; margin-bottom: 7px; color: #686b72; font-size: 7px; }

.thread-header strong,
.user-message strong,
.plan-card strong,
.activity-body > header strong,
.thread-artifacts > header strong { font-size: 11px; }
.thread-header small,
.run-status,
.plan-card > header small,
.plan-card li strong,
.activity-body > p,
.approval-card > p,
.waiting-card strong,
.thread-artifacts strong { font-size: 10px; }
.plan-card li small,
.plan-card > p,
.activity-body > header time,
.activity-status,
.activity-meta span,
.approval-card button,
.terminal-card > div strong,
.computer-screen,
.computer-card > p,
.waiting-card p,
.thread-artifacts > header span,
.thread-artifacts small { font-size: 9px; }
.terminal-card code,
.terminal-card pre,
.terminal-card > p { font-size: 10px; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes status-pulse { to { opacity: 0.4; } }

@media (max-width: 880px) {
  .mobile-nav { display: block; }
  .thread-header strong { max-width: 52vw; }
}

@media (max-width: 620px) {
  .thread-content { width: calc(100% - 20px); padding-top: 15px; }
  .thread-header-actions .run-status { display: none; }
  .suggestion-grid { grid-template-columns: 1fr; }
  .suggestion-grid button:nth-child(n + 4) { display: none; }
  .history-banner { align-items: flex-start; flex-direction: column; }
  .history-banner button { width: 100%; }
  .plan-card,
  .activity-stream,
  .waiting-card,
  .thread-artifacts { margin-left: 0; }
  .user-message { grid-template-columns: 24px minmax(0, 1fr); gap: 7px; }
  .message-avatar { width: 23px; height: 23px; }
}
</style>

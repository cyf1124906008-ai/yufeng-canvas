<template>
  <section class="thread-shell">
    <header class="thread-header">
      <div class="thread-heading">
        <button type="button" class="header-icon mobile-nav" aria-label="打开导航" @click="emit('open-navigation')">
          <workbench-icon name="panel-left" :size="16" />
        </button>
        <span class="thread-symbol">
          <workbench-icon v-if="mode === 'history'" name="history" :size="14" />
          <data-eyes-mark v-else :size="21" />
        </span>
        <div>
          <strong>{{ sessionTitle }}</strong>
          <small>{{ modeLabel }}<span v-if="snapshot.eventCount"> · {{ snapshot.eventCount }} 个事件</span></small>
        </div>
      </div>
      <div class="header-actions">
        <span class="run-status" :class="`is-${status.tone}`"><i></i>{{ status.label }}</span>
        <button type="button" class="header-icon" aria-label="切换上下文面板" title="上下文面板" @click="emit('toggle-inspector')">
          <workbench-icon name="panel-right" :size="16" />
        </button>
      </div>
    </header>

    <div ref="scroller" class="thread-scroll">
      <div v-if="loading" class="loading-state" role="status">
        <span></span><p>正在读取任务…</p>
      </div>

      <div v-else-if="mode === 'draft'" class="welcome-state">
        <div class="welcome-intro" :class="{ 'is-running': status.tone === 'running' }">
          <span class="welcome-mark"><data-eyes-mark :size="24" /></span>
          <div>
            <h1>今天要做什么？</h1>
            <p>描述目标，DataEyes Code 会在当前工作区规划、执行，并留下可随时检查和接管的步骤。</p>
          </div>
        </div>
        <div class="suggestion-list">
          <button v-for="suggestion in suggestions.slice(0, 3)" :key="suggestion" type="button" @click="emit('apply-suggestion', suggestion)">
            <span class="suggestion-copy"><strong>{{ suggestion }}</strong></span>
            <workbench-icon name="chevron-right" :size="13" />
          </button>
        </div>
      </div>

      <div v-else class="thread-content">
        <div v-if="mode === 'history'" class="history-banner">
          <workbench-icon name="history" :size="16" />
          <div><strong>只读历史</strong><small>此任务不会继续执行，也不会重新触发旧审批。</small></div>
          <button type="button" @click="emit('reuse-goal')">复用目标</button>
        </div>

        <article v-if="goal" class="chat-message is-user">
          <span class="message-avatar">你</span>
          <div>
            <header><strong>你</strong><time v-if="startedAt">{{ startedAt }}</time></header>
            <p>{{ goal }}</p>
          </div>
        </article>

        <details v-if="plan.length" class="plan-summary" :open="status.tone === 'running'">
          <summary>
            <span class="summary-icon"><workbench-icon name="list" :size="14" /></span>
            <strong>执行计划</strong>
            <small>{{ completedPlanCount }}/{{ plan.length }}</small>
            <span class="plan-progress"><i :style="{ width: `${planProgress}%` }"></i></span>
            <workbench-icon name="chevron-down" :size="13" class="summary-chevron" />
          </summary>
          <ol>
            <li v-for="item in plan" :key="item.id" :class="`is-${item.status}`">
              <span class="plan-state">
                <workbench-icon v-if="item.status === 'completed'" name="check" :size="12" />
                <i v-else></i>
              </span>
              <strong>{{ item.label }}</strong>
              <small v-if="item.step">步骤 {{ item.step }}</small>
              <span>{{ planStatus(item.status) }}</span>
            </li>
          </ol>
        </details>

        <section v-if="displayActivities.length" class="activity-stream" aria-label="Agent 活动" aria-live="polite">
          <template v-for="activity in displayActivities" :key="activity.id">
            <article v-if="activity.kind === 'message'" class="chat-message" :class="activity.role === 'user' ? 'is-user' : 'is-agent'">
              <span class="message-avatar">
                <template v-if="activity.role === 'user'">你</template>
                <data-eyes-mark v-else :size="19" />
              </span>
              <div>
                <header><strong>{{ activity.role === 'user' ? '你' : 'Agent' }}</strong><span v-if="activity.guidance" class="guidance-chip">执行引导</span><time v-if="activity.timeLabel">{{ activity.timeLabel }}</time></header>
                <p>{{ activity.message }}</p>
              </div>
            </article>

            <article v-else-if="activity.kind === 'approval'" class="approval-card">
              <div class="approval-heading">
                <span><workbench-icon name="shield" :size="17" /></span>
                <div><strong>需要你的批准</strong><small>{{ activity.tool.label }}</small></div>
                <span class="status-pill is-approval">等待批准</span>
              </div>
              <p>{{ activity.message || '这项操作必须得到明确批准后才能继续。' }}</p>
              <pre v-if="activity.input">{{ activity.input }}</pre>
              <div class="approval-actions">
                <button type="button" :disabled="readOnly" @click="emit('approval', { id: activity.approvalId, decision: 'reject', activity: activity.raw })">拒绝</button>
                <button type="button" class="approve" :disabled="readOnly" @click="emit('approval', { id: activity.approvalId, decision: 'approve', activity: activity.raw })">
                  <workbench-icon name="check" :size="13" />批准一次
                </button>
              </div>
            </article>

            <article v-else class="tool-event" :class="[`is-${activity.kind}`, `tone-${activity.tone}`]">
              <div class="tool-rail">
                <span><workbench-icon :name="iconForActivity(activity)" :size="14" /></span>
                <i></i>
              </div>
              <div class="tool-body">
                <header>
                  <div><strong>{{ activity.title }}</strong><span class="status-pill" :class="`is-${activity.tone}`">{{ activity.statusLabel }}</span></div>
                  <time v-if="activity.timeLabel">{{ activity.timeLabel }}</time>
                </header>
                <p v-if="activity.message">{{ activity.message }}</p>
                <div v-if="activity.step || activity.attempt || activity.artifactRef" class="tool-meta">
                  <span v-if="activity.step">步骤 {{ activity.step }}</span>
                  <span v-if="activity.attempt">尝试 {{ activity.attempt }}</span>
                  <span v-if="activity.artifactRef">{{ activity.artifactRef }}</span>
                </div>

                <details v-if="activity.kind === 'terminal' && (activity.command || activity.output)" class="terminal-output" :open="activity.tone === 'error'">
                  <summary><workbench-icon name="terminal" :size="13" /><code>{{ activity.command ? `$ ${activity.command}` : '终端输出' }}</code><workbench-icon name="chevron-down" :size="12" /></summary>
                  <pre v-if="activity.output">{{ activity.output }}</pre>
                </details>

                <div v-if="activity.kind === 'computer' && activity.output" class="computer-output">
                  <workbench-icon name="monitor" :size="13" /><span>{{ activity.output }}</span>
                </div>
              </div>
            </article>
          </template>
        </section>

        <section v-else-if="status.status !== 'idle'" class="waiting-card">
          <span class="loading-ring"></span><div><strong>{{ status.label }}</strong><p>正在等待下一条真实事件。</p></div>
        </section>

        <section v-if="normalizedArtifacts.length" class="artifact-strip">
          <header><strong>任务产物</strong><span>{{ normalizedArtifacts.length }}</span></header>
          <div>
            <button
              v-for="artifact in normalizedArtifacts"
              :key="artifact.id"
              type="button"
              :disabled="!artifact.url"
              @click="emit('artifact-select', artifact)"
            >
              <img v-if="artifact.kind === 'image' && artifact.url" :src="artifact.url" :alt="artifact.label" width="160" height="90" loading="lazy" />
              <video v-else-if="artifact.kind === 'video' && artifact.url" :src="artifact.url" width="160" height="90" muted aria-hidden="true"></video>
              <span v-else><workbench-icon :name="artifact.kind === 'video' ? 'video' : artifact.kind === 'image' ? 'image' : 'file'" :size="18" /></span>
              <div><strong>{{ artifact.label }}</strong><small>{{ artifact.isFinal ? '最终交付' : artifact.status.label }}</small></div>
            </button>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import DataEyesMark from '../brand/DataEyesMark.vue'
import {
  buildWorkbenchActivities,
  buildWorkbenchPlan,
  formatWorkbenchTime,
  normalizeWorkbenchArtifacts,
  workbenchStatus
} from './workbenchView.js'
import WorkbenchIcon from './WorkbenchIcon.vue'

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
const displayActivities = computed(() => {
  const calls = new Map(activities.value.filter(item => item.type === 'tool_call').map(item => [item.id, item]))
  const completedCallIds = new Set(activities.value.filter(item => item.type === 'observation').map(item => item.toolCallId))
  return activities.value
    .filter(item => item.type !== 'tool_call' || !completedCallIds.has(item.id))
    .map(item => {
      if (item.type !== 'observation') return item
      const call = calls.get(item.toolCallId)
      return call ? {
        ...item,
        command: item.command || call.command,
        input: item.input || call.input,
        actionName: item.actionName || call.actionName,
        tool: item.tool?.name ? item.tool : call.tool
      } : item
    })
})
const plan = computed(() => buildWorkbenchPlan(props.snapshot, activities.value))
const completedPlanCount = computed(() => plan.value.filter(item => item.status === 'completed').length)
const planProgress = computed(() => plan.value.length ? Math.round((completedPlanCount.value / plan.value.length) * 100) : 0)
const normalizedArtifacts = computed(() => normalizeWorkbenchArtifacts(props.artifacts, props.snapshot))
const startedAt = computed(() => formatWorkbenchTime(props.snapshot?.startedAt || props.snapshot?.createdAt))
const sessionTitle = computed(() => goal.value || (props.mode === 'draft' ? '新任务' : 'Agent 任务'))
const modeLabel = computed(() => ({ draft: '本地草稿', live: '实时会话', history: '已保存历史' })[props.mode] || '会话')

const iconForActivity = activity => {
  if (activity.kind === 'terminal') return 'terminal'
  if (activity.kind === 'computer') return 'monitor'
  if (activity.kind === 'plan') return 'list'
  if (activity.kind === 'error') return 'alert'
  if (activity.actionName?.includes('image')) return 'image'
  if (activity.actionName?.includes('video')) return 'video'
  if (activity.actionName?.startsWith('workspace.')) return 'file'
  if (activity.actionName?.startsWith('creative.')) return 'sparkles'
  return activity.tone === 'success' ? 'check' : 'activity'
}

const planStatus = value => ({ planned: '待执行', running: '执行中', completed: '已完成', failed: '失败' })[value] || value

watch(() => [displayActivities.value.length, normalizedArtifacts.value.length], async () => {
  await nextTick()
  if (scroller.value && props.mode === 'live') scroller.value.scrollTop = scroller.value.scrollHeight
})
</script>

<style scoped>
.thread-shell { display: grid; grid-template-rows: auto minmax(0,1fr); min-width: 0; min-height: 0; color: var(--wb-text); background: #151719; }
.thread-header { display: flex; min-height: 51px; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--wb-border); padding: 7px 11px; background: rgba(21,23,25,.96); }
.thread-heading,
.header-actions { display: flex; min-width: 0; align-items: center; gap: 8px; }
.thread-symbol { display: grid; width: 26px; height: 26px; flex: 0 0 auto; place-items: center; border: 1px solid #34383a; border-radius: 7px; color: #9edbb9; background: #202326; }
.thread-heading > div { min-width: 0; }
.thread-heading strong,
.thread-heading small { display: block; overflow: hidden; max-width: min(48vw, 580px); text-overflow: ellipsis; white-space: nowrap; }
.thread-heading strong { color: #dfe2e0; font-size: 13px; font-weight: 650; }
.thread-heading small { margin-top: 2px; color: #62686a; font-size: 11px; }
.header-icon { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid transparent; border-radius: 7px; color: #787e7f; }
.header-icon:hover { border-color: #35393b; color: #e0e3e1; background: #222527; }
.mobile-nav { display: none; }
.run-status { display: inline-flex; height: 26px; align-items: center; gap: 6px; border: 1px solid #303436; border-radius: 999px; padding: 0 9px; color: #858b8b; background: #1d2022; font-size: 11px; white-space: nowrap; }
.run-status i { width: 5px; height: 5px; border-radius: 50%; background: #6f7576; }
.run-status.is-running i { background: #71b9e3; animation: pulse 850ms infinite alternate; }
.run-status.is-success i { background: #6ec99b; }
.run-status.is-error i { background: #e17676; }
.run-status.is-approval i { background: #d2a45f; }
.thread-scroll { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: #34383a transparent; }
.thread-content,
.welcome-state { width: min(760px, calc(100% - 34px)); margin: 0 auto; }
.thread-content { padding: 25px 0 58px; }
.welcome-state { padding: clamp(36px, 8vh, 78px) 0 40px; }
.welcome-intro { display: grid; grid-template-columns: 39px minmax(0,1fr); align-items: start; gap: 12px; }
.welcome-mark { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid #34393a; border-radius: 10px; color: #a3e0be; background: linear-gradient(145deg,#25292b,#1d2022); }
.welcome-intro h1 { margin: 1px 0 0; color: #eceeed; font-size: 22px; font-weight: 680; letter-spacing: -.025em; }
.welcome-intro p { max-width: 580px; margin: 6px 0 0; color: #747a7a; font-size: 13px; line-height: 1.6; }
.suggestion-list { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 6px; margin-top: 22px; }
.suggestion-list button { display: grid; grid-template-columns: 26px minmax(0,1fr) auto; min-height: 50px; align-items: center; gap: 8px; border: 1px solid #303436; border-radius: 9px; padding: 8px 10px; color: #a5aaa8; background: #1b1e20; text-align: left; }
.suggestion-list button:hover { border-color: #444a49; color: #dfe2e0; background: #202426; transform: translateY(-1px); }
.suggestion-list button > span { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 6px; color: #7b9d8b; background: #232a27; font-size: 11px; }
.suggestion-list strong { overflow: hidden; font-size: 12.5px; font-weight: 540; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
.suggestion-list svg { color: #555b5c; }
.welcome-capabilities { display: flex; flex-wrap: wrap; gap: 14px; margin: 16px 2px 0 50px; color: #5f6565; font-size: 11px; }
.welcome-capabilities span { display: inline-flex; align-items: center; gap: 4px; }
.loading-state { display: flex; min-height: 60vh; align-items: center; justify-content: center; gap: 8px; color: #707677; font-size: 11px; }
.loading-state span,
.loading-ring { width: 13px; height: 13px; border: 2px solid #363a3c; border-top-color: #8bd5ae; border-radius: 50%; animation: spin 700ms linear infinite; }
.history-banner { display: grid; grid-template-columns: 22px minmax(0,1fr) auto; align-items: center; gap: 8px; margin-bottom: 21px; border: 1px solid #334139; border-radius: 8px; padding: 8px 10px; color: #8ccbaa; background: #19201d; }
.history-banner strong,
.history-banner small { display: block; }
.history-banner strong { color: #bfd8ca; font-size: 12px; }
.history-banner small { margin-top: 2px; color: #68776f; font-size: 11px; }
.history-banner button { border: 1px solid #405249; border-radius: 6px; padding: 6px 9px; color: #a6d9be; font-size: 11px; }
.history-banner button:hover { background: #243129; }
.chat-message { display: grid; grid-template-columns: 27px minmax(0,1fr); gap: 10px; margin-bottom: 18px; }
.message-avatar { display: grid; width: 26px; height: 26px; place-items: center; border: 1px solid #363a3c; border-radius: 7px; color: #9aa09e; background: #222527; font-size: 10px; font-weight: 750; }
.chat-message.is-user .message-avatar { border-color: #d6d9d7; color: #181b1b; background: #d6d9d7; }
.chat-message header { display: flex; min-height: 23px; align-items: center; gap: 8px; }
.chat-message header strong { color: #c9cdcb; font-size: 12px; }
.chat-message time { color: #606667; font-size: 11px; }
.guidance-chip { border: 1px solid #594466; border-radius: 999px; padding: 2px 6px; color: #cba8df; background: #2b2231; font-size: 8.5px; font-weight: 700; }
.chat-message p { margin: 3px 0 0; color: #dfe2e0; font-size: 14px; line-height: 1.72; white-space: pre-wrap; }
.chat-message.is-agent p { color: #c9cdcb; }
.plan-summary { margin: 0 0 18px 37px; overflow: hidden; border: 1px solid #303436; border-radius: 8px; background: #1a1d1f; }
.plan-summary summary { display: grid; grid-template-columns: 24px auto auto minmax(50px,1fr) 18px; min-height: 39px; align-items: center; gap: 7px; padding: 5px 9px; cursor: pointer; list-style: none; }
.plan-summary summary::-webkit-details-marker { display: none; }
.summary-icon { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 6px; color: #91c8aa; background: #222b27; }
.plan-summary summary strong { color: #bec3c0; font-size: 12px; }
.plan-summary summary small { color: #696f6e; font-size: 11px; }
.plan-progress { overflow: hidden; height: 3px; border-radius: 999px; background: #2b2f30; }
.plan-progress i { display: block; height: 100%; border-radius: inherit; background: #78c69c; transition: width 180ms ease; }
.summary-chevron { color: #626869; transition: transform 140ms ease; }
.plan-summary[open] .summary-chevron { transform: rotate(180deg); }
.plan-summary ol { display: grid; gap: 1px; border-top: 1px solid #292d2e; padding: 5px; list-style: none; }
.plan-summary li { display: grid; grid-template-columns: 19px minmax(0,1fr) auto auto; align-items: center; gap: 6px; border-radius: 5px; padding: 5px 6px; color: #858b89; }
.plan-summary li.is-running { color: #c7ccca; background: #222628; }
.plan-summary li.is-completed { color: #71827a; }
.plan-state { display: grid; width: 17px; height: 17px; place-items: center; color: #6ec99a; }
.plan-state i { width: 6px; height: 6px; border: 1px solid #5b6161; border-radius: 50%; }
.is-running .plan-state i { border-color: #73b8dd; background: #73b8dd; box-shadow: 0 0 0 3px rgba(115,184,221,.08); }
.plan-summary li strong { font-size: 12px; font-weight: 560; }
.plan-summary li small,
.plan-summary li > span:last-child { color: #646a6b; font-size: 10.5px; }
.activity-stream { display: grid; margin-left: 37px; }
.tool-event { display: grid; grid-template-columns: 27px minmax(0,1fr); gap: 8px; }
.tool-rail { position: relative; display: flex; justify-content: center; }
.tool-rail > span { position: relative; z-index: 1; display: grid; width: 24px; height: 24px; place-items: center; border: 1px solid #363a3c; border-radius: 7px; color: #8a908f; background: #1f2224; }
.tool-rail > i { position: absolute; top: 25px; bottom: 0; width: 1px; background: #2b2f30; }
.tool-event:last-child .tool-rail > i { display: none; }
.tone-success .tool-rail > span { border-color: #30483c; color: #70c799; }
.tone-error .tool-rail > span { border-color: #493033; color: #dd7e7e; }
.tone-running .tool-rail > span { border-color: #2f4652; color: #72b4d9; }
.tool-body { min-width: 0; padding: 2px 0 18px; }
.tool-body > header { display: flex; min-height: 23px; align-items: flex-start; justify-content: space-between; gap: 8px; }
.tool-body > header > div { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; }
.tool-body > header strong { overflow: hidden; color: #c6cac8; font-size: 12.5px; font-weight: 590; text-overflow: ellipsis; white-space: nowrap; }
.tool-body > header time { color: #5e6465; font-size: 10.5px; }
.tool-body > p { margin: 3px 0 0; color: #777d7c; font-size: 12px; line-height: 1.55; }
.status-pill { border-radius: 999px; padding: 2px 6px; color: #777d7d; background: #25292a; font-size: 10px; }
.status-pill.is-running { color: #78b9da; background: #1b2a32; }
.status-pill.is-success { color: #75c89d; background: #1e2d26; }
.status-pill.is-error { color: #df8585; background: #332124; }
.status-pill.is-approval { color: #d5ac6a; background: #322a1e; }
.tool-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.tool-meta span { border: 1px solid #303435; border-radius: 4px; padding: 2px 5px; color: #626869; font-size: 10px; }
.terminal-output { overflow: hidden; margin-top: 7px; border: 1px solid #303436; border-radius: 7px; background: #0f1112; }
.terminal-output summary { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; min-height: 31px; align-items: center; gap: 5px; padding: 4px 8px; color: #777e7d; cursor: pointer; list-style: none; }
.terminal-output summary::-webkit-details-marker { display: none; }
.terminal-output code { overflow: hidden; color: #aeb5b1; font: 11px ui-monospace,SFMono-Regular,Menlo,monospace; text-overflow: ellipsis; white-space: nowrap; }
.terminal-output pre { overflow: auto; max-height: 260px; margin: 0; border-top: 1px solid #262a2b; padding: 10px; color: #99a29e; font: 11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; white-space: pre-wrap; }
.computer-output { display: flex; gap: 7px; margin-top: 7px; border: 1px solid #303436; border-radius: 7px; padding: 9px; color: #818786; background: #1a1d1f; font-size: 11.5px; line-height: 1.5; }
.approval-card { margin: 2px 0 18px 37px; border: 1px solid #4a402e; border-radius: 9px; padding: 11px; background: #242016; box-shadow: inset 3px 0 #d2a65f; }
.approval-heading { display: grid; grid-template-columns: 31px minmax(0,1fr) auto; align-items: center; gap: 8px; }
.approval-heading > span:first-child { display: grid; width: 30px; height: 30px; place-items: center; border-radius: 7px; color: #ddb875; background: #332c1f; }
.approval-heading strong,
.approval-heading small { display: block; }
.approval-heading strong { color: #dfd5c3; font-size: 13px; }
.approval-heading small { margin-top: 2px; color: #8e8069; font-size: 11px; }
.approval-card > p { margin: 9px 1px 0; color: #b9ad98; font-size: 12px; line-height: 1.55; }
.approval-card > pre { overflow: auto; max-height: 180px; margin: 8px 0 0; border: 1px solid #423a2a; border-radius: 6px; padding: 9px; color: #bfb49f; background: #17150f; font: 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; white-space: pre-wrap; }
.approval-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
.approval-actions button { display: inline-flex; height: 31px; align-items: center; gap: 5px; border: 1px solid #4b4438; border-radius: 6px; padding: 0 10px; color: #a7a097; font-size: 11px; }
.approval-actions button:hover { color: #e0d8cc; background: #2d281e; }
.approval-actions button.approve { border-color: #48604f; color: #b5dfc7; background: #29362e; }
.approval-actions button:disabled { cursor: not-allowed; opacity: .4; }
.waiting-card { display: flex; align-items: center; gap: 9px; margin: 8px 0 0 37px; border: 1px solid #303436; border-radius: 8px; padding: 9px; background: #1a1d1f; }
.waiting-card strong { color: #b9bdbb; font-size: 12px; }
.waiting-card p { margin: 2px 0 0; color: #626869; font-size: 11px; }
.artifact-strip { margin: 18px 0 0 37px; border-top: 1px solid #2a2e2f; padding-top: 13px; }
.artifact-strip > header { display: flex; align-items: center; gap: 6px; }
.artifact-strip > header strong { color: #aeb3b1; font-size: 12px; }
.artifact-strip > header span { display: grid; min-width: 17px; height: 17px; place-items: center; border-radius: 999px; color: #707676; background: #262a2b; font-size: 10px; }
.artifact-strip > div { display: grid; grid-template-columns: repeat(auto-fill,minmax(175px,1fr)); gap: 6px; margin-top: 8px; }
.artifact-strip button { display: grid; grid-template-columns: 48px minmax(0,1fr); align-items: center; gap: 8px; overflow: hidden; border: 1px solid #303436; border-radius: 8px; color: #aeb3b1; background: #1b1e20; text-align: left; }
.artifact-strip button:not(:disabled):hover { border-color: #454a4b; transform: translateY(-1px); }
.artifact-strip img,
.artifact-strip video,
.artifact-strip button > span { display: grid; width: 48px; height: 43px; place-items: center; object-fit: cover; color: #6d7473; background: #222527; }
.artifact-strip button > div { min-width: 0; padding-right: 7px; }
.artifact-strip button strong,
.artifact-strip button small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifact-strip button strong { font-size: 12px; }
.artifact-strip button small { margin-top: 2px; color: #686e6f; font-size: 10.5px; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { to { opacity: .35; } }

/* DataEyes Code — the thread opens like a quiet operations console. */
.thread-shell {
  background:
    radial-gradient(circle at 72% 11%, rgba(94, 231, 196, .055), transparent 24%),
    #f1f3f5;
}

.thread-header {
  min-height: 61px;
  border-bottom-color: rgba(20, 30, 36, .09);
  padding: 9px 17px;
  background: rgba(247, 249, 250, .88);
  backdrop-filter: blur(16px);
}

.thread-symbol {
  width: 34px;
  height: 34px;
  border-color: rgba(37, 66, 69, .14);
  border-radius: 10px;
  color: #218b7b;
  background: linear-gradient(145deg, #e4f8f2, #dbe9ed);
}

.thread-heading strong { color: #1c292d; font-size: 13px; letter-spacing: -.01em; }
.thread-heading small { color: #77858a; }
.header-icon { color: #6c7a80; }
.header-icon:hover { border-color: rgba(28, 89, 83, .16); color: #1c6158; background: rgba(94, 231, 196, .1); }

.run-status {
  height: 28px;
  border-color: rgba(38, 68, 70, .13);
  color: #66767a;
  background: rgba(255, 255, 255, .7);
  box-shadow: 0 2px 8px rgba(31, 48, 53, .035);
}

.run-status.is-running { border-color: rgba(47, 157, 135, .22); color: #21796c; background: rgba(222, 250, 241, .8); }
.run-status.is-success { border-color: rgba(62, 147, 105, .2); color: #317957; background: rgba(230, 248, 238, .8); }

.thread-content,
.welcome-state { width: min(920px, calc(100% - 52px)); }

.welcome-state { padding: clamp(44px, 8vh, 86px) 0 44px; }

.welcome-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(250px, .92fr);
  align-items: stretch;
  gap: clamp(20px, 4vw, 54px);
}

.welcome-intro {
  display: block;
  align-self: center;
  padding: 4px 0 7px;
}

.welcome-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #6e8f8b;
  font: 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .15em;
}

.welcome-eyebrow i,
.welcome-visual figcaption i {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #45c8ae;
  box-shadow: 0 0 0 3px rgba(69, 200, 174, .12), 0 0 12px rgba(69, 200, 174, .32);
}

.welcome-intro h1 {
  margin: 18px 0 0;
  color: #162328;
  font-size: clamp(30px, 4vw, 48px);
  font-weight: 760;
  letter-spacing: -.06em;
  line-height: 1.06;
  text-wrap: balance;
}

.welcome-intro h1 em {
  color: #268b7e;
  font-style: normal;
}

.welcome-intro p {
  max-width: 470px;
  margin: 18px 0 0;
  color: #718086;
  font-size: 13px;
  line-height: 1.75;
}

.welcome-visual {
  position: relative;
  min-height: 218px;
  overflow: hidden;
  border: 1px solid rgba(103, 156, 153, .2);
  border-radius: 18px;
  margin: 0;
  background: #0b0e14;
  box-shadow: 0 24px 55px rgba(28, 46, 53, .14), inset 0 1px rgba(255, 255, 255, .1);
}

.welcome-visual::after {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, .04);
  border-radius: inherit;
  content: '';
  pointer-events: none;
}

.welcome-visual img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 218px;
  object-fit: cover;
  object-position: 64% center;
  opacity: .9;
  transition: transform 700ms cubic-bezier(.2, .8, .2, 1), opacity 220ms ease;
}

.welcome-visual:hover img { opacity: 1; transform: scale(1.025); }

.welcome-visual figcaption {
  position: absolute;
  right: 13px;
  bottom: 12px;
  left: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: rgba(230, 244, 241, .75);
  font: 9px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .09em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, .6);
}

.welcome-visual figcaption span { display: inline-flex; align-items: center; gap: 7px; }
.welcome-visual figcaption strong { color: rgba(215, 235, 231, .58); font-size: 9px; font-weight: 500; letter-spacing: .02em; }

.suggestion-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  margin-top: 27px;
}

.suggestion-list button {
  grid-template-columns: 35px minmax(0, 1fr) 15px;
  min-height: 65px;
  gap: 11px;
  border-color: rgba(35, 58, 63, .13);
  border-radius: 12px;
  padding: 10px 12px;
  color: #33454a;
  background: rgba(255, 255, 255, .65);
  box-shadow: 0 5px 16px rgba(32, 52, 58, .035);
}

.suggestion-list button:hover {
  border-color: rgba(42, 153, 133, .35);
  color: #183d3b;
  background: rgba(246, 255, 252, .96);
  box-shadow: 0 11px 24px rgba(38, 112, 102, .11);
  transform: translateY(-2px);
}

.suggestion-icon {
  display: grid;
  width: 35px;
  height: 35px;
  place-items: center;
  border: 1px solid rgba(41, 141, 124, .16);
  border-radius: 10px;
  color: #278a7c;
  background: linear-gradient(145deg, rgba(94, 231, 196, .16), rgba(217, 242, 239, .62));
}

.suggestion-copy { display: block; min-width: 0; text-align: left; }
.suggestion-copy small { display: block; color: #7e9b96; font: 8px/1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; letter-spacing: .13em; }
.suggestion-copy strong { display: block; overflow: hidden; margin-top: 6px; color: #35484d; font-size: 12.5px; font-weight: 620; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.suggestion-list button > .wb-icon { color: #94a6a9; }

.welcome-capabilities {
  gap: 18px;
  margin: 18px 2px 0;
  color: #7b898e;
  font-size: 10.5px;
}

.welcome-capabilities span { gap: 6px; }
.welcome-capabilities .wb-icon { color: #4b9e91; }

.message-avatar {
  border-color: rgba(47, 115, 106, .18);
  color: #2b8c7d;
  background: linear-gradient(145deg, #e1f7f0, #dbe9ed);
}

.chat-message.is-user .message-avatar { border-color: #163b39; color: #dff8f0; background: #1a5f55; }

.thread-shell :is(button, summary):focus-visible {
  outline: 2px solid rgba(42, 153, 133, .78);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .welcome-visual img,
  .suggestion-list button { transition-duration: 0s; }
}

@media (max-width: 860px) {
  .mobile-nav { display: grid; }
  .thread-heading strong { max-width: 48vw; }
}

@media (max-width: 620px) {
  .welcome-hero { grid-template-columns: 1fr; }
  .welcome-visual { min-height: 170px; }
  .welcome-visual img { min-height: 170px; }
  .thread-content,
  .welcome-state { width: calc(100% - 20px); }
  .welcome-state { padding-top: 28px; }
  .suggestion-list { grid-template-columns: 1fr; }
  .suggestion-list button:nth-child(n+4) { display: none; }
  .welcome-capabilities { margin-left: 0; }
  .run-status { display: none; }
  .history-banner { grid-template-columns: 20px minmax(0,1fr); }
  .history-banner button { grid-column: 1 / -1; }
  .plan-summary,
  .activity-stream,
  .approval-card,
  .waiting-card,
  .artifact-strip { margin-left: 0; }
  .chat-message { gap: 7px; }
}

/* Keep the first-run surface inside the visible feed above the command dock.
 * The feed remains scrollable for small windows, but the default 720px view
 * should expose the complete welcome composition without card overlap. */
.welcome-state {
  padding-top: clamp(28px, 5vh, 52px);
  padding-bottom: 30px;
}

.welcome-hero {
  grid-template-columns: minmax(0, 1.08fr) minmax(232px, .92fr);
  gap: clamp(18px, 3vw, 38px);
}

.welcome-intro h1 {
  font-size: clamp(28px, 3.25vw, 42px);
}

.welcome-intro p {
  margin-top: 14px;
  font-size: 12.5px;
}

.welcome-visual,
.welcome-visual img { min-height: 188px; }

.suggestion-list {
  margin-top: 18px;
  gap: 8px;
}

.suggestion-list button { min-height: 58px; }

.welcome-capabilities { margin-top: 12px; }

@media (max-width: 620px) {
  .welcome-state { padding-top: 24px; }
  .welcome-visual,
  .welcome-visual img { min-height: 170px; }
}
</style>

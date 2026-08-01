<template>
  <section class="agent-run-panel" :class="`is-${statusTone}`" aria-live="polite">
    <header class="run-header">
      <div class="run-heading">
        <p class="run-kicker">AGENT RUN</p>
        <h2>{{ goal || '未提供用户目标' }}</h2>
        <div class="run-meta">
          <span class="status-pill" :class="`is-${statusTone}`">{{ statusLabel }}</span>
          <span v-if="runId" class="run-id" :title="runId">{{ runId }}</span>
          <span v-if="currentStepLabel">当前：{{ currentStepLabel }}</span>
        </div>
      </div>

      <div class="run-actions">
        <button v-if="canStop" type="button" class="danger" @click="requestStop">
          停止任务
        </button>
        <button v-if="canRetry" type="button" class="primary" @click="requestRetry">
          重新执行
        </button>
      </div>
    </header>

    <div class="run-summary-grid">
      <div>
        <span>已执行步骤</span>
        <strong>{{ completedStepCount }} / {{ displayStepCount }}</strong>
      </div>
      <div>
        <span>候选作品</span>
        <strong>{{ normalizedArtifacts.length }}</strong>
      </div>
      <div>
        <span>重试事件</span>
        <strong>{{ retryEventCount }}</strong>
      </div>
      <div>
        <span>停止事件</span>
        <strong>{{ stopEventCount }}</strong>
      </div>
    </div>

    <div class="run-layout">
      <section class="panel-section timeline-section">
        <div class="section-heading">
          <div>
            <p>TRACE</p>
            <h3>步骤轨迹</h3>
          </div>
          <span>{{ normalizedTimeline.length }} 条事件</span>
        </div>

        <ol v-if="normalizedTimeline.length" class="timeline-list">
          <li
            v-for="event in normalizedTimeline"
            :key="event.id"
            :class="[`is-${event.tone}`, { 'is-current': event.isCurrent }]"
          >
            <span class="timeline-dot"></span>
            <div class="timeline-event">
              <div class="timeline-event-head">
                <div>
                  <span v-if="event.step" class="event-step">STEP {{ event.step }}</span>
                  <strong>{{ event.title }}</strong>
                </div>
                <time v-if="event.timeLabel">{{ event.timeLabel }}</time>
              </div>
              <p v-if="event.message">{{ event.message }}</p>
              <div class="event-tags">
                <span :class="`is-${event.tone}`">{{ event.statusLabel }}</span>
                <span v-if="event.attempt">尝试 #{{ event.attempt }}</span>
                <span v-if="event.artifactRef" :title="event.artifactRef">作品 {{ event.artifactRef }}</span>
              </div>
            </div>
          </li>
        </ol>

        <div v-else class="empty-state">
          <strong>尚无运行轨迹</strong>
          <span>Agent 开始执行后，规划、工具调用、重试与停止事件会显示在这里。</span>
        </div>
      </section>

      <div class="run-results-column">
        <section class="panel-section artifacts-section">
          <div class="section-heading">
            <div>
              <p>ARTIFACTS</p>
              <h3>候选作品</h3>
            </div>
            <span>{{ normalizedArtifacts.length }} 个候选</span>
          </div>

          <div v-if="normalizedArtifacts.length" class="artifact-grid">
            <article
              v-for="artifact in normalizedArtifacts"
              :key="artifact.id"
              class="artifact-card"
              :class="{ 'is-final': artifact.isFinal, 'is-error': artifact.tone === 'error' }"
              tabindex="0"
              @click="selectArtifact(artifact)"
              @keydown.enter.prevent="selectArtifact(artifact)"
              @keydown.space.prevent="selectArtifact(artifact)"
            >
              <div class="artifact-preview">
                <img v-if="artifact.kind === 'image' && artifact.url" :src="artifact.url" :alt="artifact.label" />
                <video v-else-if="artifact.kind === 'video' && artifact.url" :src="artifact.url" controls @click.stop></video>
                <div v-else class="artifact-placeholder">
                  <span>{{ artifact.kind === 'video' ? 'VIDEO' : artifact.kind === 'image' ? 'IMAGE' : 'OUTPUT' }}</span>
                  <small>{{ artifact.url ? '媒体引用已隐藏' : '暂无可预览媒体' }}</small>
                </div>
                <span v-if="artifact.isFinal" class="final-badge">最终交付</span>
                <span v-else-if="artifact.attempt" class="attempt-badge">尝试 #{{ artifact.attempt }}</span>
              </div>
              <div class="artifact-copy">
                <div>
                  <strong>{{ artifact.label }}</strong>
                  <span :class="`is-${artifact.tone}`">{{ artifact.statusLabel }}</span>
                </div>
                <p v-if="artifact.summary">{{ artifact.summary }}</p>
                <div class="artifact-meta">
                  <span v-if="artifact.score !== ''">质量分 {{ artifact.score }}</span>
                  <span v-if="artifact.decision">{{ artifact.decision }}</span>
                  <span v-if="artifact.reference" :title="artifact.reference">{{ artifact.reference }}</span>
                </div>
              </div>
            </article>
          </div>

          <div v-else class="empty-state compact">
            <strong>还没有候选作品</strong>
            <span>生成、编辑或重试产生的作品会按尝试次数保留。</span>
          </div>
        </section>

        <section class="panel-section delivery-section" :class="{ 'has-delivery': !!finalArtifact }">
          <div class="section-heading">
            <div>
              <p>DELIVERY</p>
              <h3>最终交付</h3>
            </div>
            <span>{{ finalArtifact ? '已选定' : '待交付' }}</span>
          </div>

          <div v-if="finalArtifact" class="delivery-card">
            <div class="delivery-preview">
              <img v-if="finalArtifact.kind === 'image' && finalArtifact.url" :src="finalArtifact.url" :alt="finalArtifact.label" />
              <video v-else-if="finalArtifact.kind === 'video' && finalArtifact.url" :src="finalArtifact.url" controls></video>
              <div v-else class="artifact-placeholder">
                <span>{{ finalArtifact.kind === 'video' ? 'VIDEO' : finalArtifact.kind === 'image' ? 'IMAGE' : 'OUTPUT' }}</span>
                <small>最终作品引用已保留</small>
              </div>
            </div>
            <div>
              <strong>{{ finalArtifact.label }}</strong>
              <p v-if="deliverySummary">{{ deliverySummary }}</p>
              <p v-else-if="finalArtifact.summary">{{ finalArtifact.summary }}</p>
              <div class="artifact-meta">
                <span v-if="finalArtifact.score !== ''">质量分 {{ finalArtifact.score }}</span>
                <span v-if="finalArtifact.reference">{{ finalArtifact.reference }}</span>
              </div>
            </div>
          </div>

          <div v-else class="empty-state compact">
            <strong>{{ isTerminal ? '本次运行没有可交付作品' : 'Agent 正在准备最终作品' }}</strong>
            <span>{{ isTerminal ? terminalHint : '只有被采用或明确标记为最终结果的作品会显示在这里。' }}</span>
          </div>
        </section>

        <section v-if="normalizedErrors.length" class="panel-section error-section">
          <div class="section-heading">
            <div>
              <p>ERRORS</p>
              <h3>错误</h3>
            </div>
            <span>{{ normalizedErrors.length }} 条</span>
          </div>
          <ul>
            <li v-for="error in normalizedErrors" :key="error.id">
              <div>
                <strong>{{ error.code || '运行错误' }}</strong>
                <time v-if="error.timeLabel">{{ error.timeLabel }}</time>
              </div>
              <p>{{ error.message }}</p>
              <span v-if="error.action">发生于 {{ error.action }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'

defineOptions({ name: 'AgentRunPanel' })

const props = defineProps({
  snapshot: {
    type: Object,
    default: () => ({})
  },
  timeline: {
    type: Array,
    default: () => []
  },
  artifacts: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits({
  stop: (payload) => Boolean(payload && typeof payload === 'object'),
  retry: (payload) => Boolean(payload && typeof payload === 'object'),
  'artifact-select': (payload) => Boolean(payload && typeof payload === 'object')
})

const STATUS_META = {
  idle: { label: '等待开始', tone: 'idle' },
  queued: { label: '已排队', tone: 'running' },
  planning: { label: '正在规划', tone: 'running' },
  running: { label: '正在执行', tone: 'running' },
  waiting: { label: '等待结果', tone: 'running' },
  retrying: { label: '正在重试', tone: 'retry' },
  accepted: { label: '已采用', tone: 'success' },
  selected: { label: '已选定', tone: 'success' },
  completed: { label: '已完成', tone: 'success' },
  complete: { label: '已完成', tone: 'success' },
  succeeded: { label: '已完成', tone: 'success' },
  success: { label: '已完成', tone: 'success' },
  failed: { label: '执行失败', tone: 'error' },
  error: { label: '执行失败', tone: 'error' },
  cancelled: { label: '已停止', tone: 'stopped' },
  canceled: { label: '已停止', tone: 'stopped' },
  stopped: { label: '已停止', tone: 'stopped' },
  aborted: { label: '已停止', tone: 'stopped' },
  paused: { label: '已暂停', tone: 'stopped' }
}

const MEDIA_REFERENCE_PATTERN = /^(?:data:|blob:|file:|https?:\/\/)/i
const HIDDEN_MEDIA_PATTERN = /^\[(?:media|asset|url)[^\]]*\]$/i

const text = (value) => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const timestamp = (value) => {
  const numeric = typeof value === 'number' ? value : Date.parse(value)
  return Number.isFinite(numeric) ? numeric : 0
}

const formatTime = (value) => {
  const numeric = timestamp(value)
  if (!numeric) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(numeric))
}

const statusMeta = (status) => STATUS_META[String(status || '').toLowerCase()] || {
  label: text(status) || '未知状态',
  tone: 'idle'
}

const runId = computed(() => text(props.snapshot?.id || props.snapshot?.runId || props.snapshot?.taskId))
const goal = computed(() => text(
  props.snapshot?.goal || props.snapshot?.userGoal || props.snapshot?.objective || props.snapshot?.request
))
const rawStatus = computed(() => String(props.snapshot?.status || 'idle').toLowerCase())
const statusLabel = computed(() => statusMeta(rawStatus.value).label)
const statusTone = computed(() => statusMeta(rawStatus.value).tone)

const eventKind = (event) => {
  const value = `${event?.type || ''} ${event?.event || ''} ${event?.status || ''} ${event?.name || ''} ${event?.action?.name || event?.action || ''}`.toLowerCase()
  if (/cancel|stop|abort|paused?/.test(value)) return 'stopped'
  if (/retry|regenerat|rerun|restart/.test(value) || Number(event?.attempt || event?.revision || event?.input?.revision) > 1) return 'retry'
  if (/fail|error|reject|blocked/.test(value)) return 'error'
  if (/complete|success|finish|deliver|accept/.test(value)) return 'success'
  if (/start|running|planning|tool_started|action/.test(value)) return 'running'
  return 'idle'
}

const fallbackTimeline = computed(() => {
  if (Array.isArray(props.snapshot?.timeline)) return props.snapshot.timeline
  if (Array.isArray(props.snapshot?.events)) return props.snapshot.events
  if (Array.isArray(props.snapshot?.steps)) return props.snapshot.steps
  if (Array.isArray(props.snapshot?.actions)) return props.snapshot.actions
  return []
})

const normalizedTimeline = computed(() => {
  const source = props.timeline.length ? props.timeline : fallbackTimeline.value
  return source.map((raw, index) => {
    const action = typeof raw?.action === 'string' ? raw.action : raw?.action?.name
    const type = text(raw?.type || raw?.event || raw?.status || action || raw?.name)
    const detectedTone = eventKind(raw)
    const isLastActiveAction = index === source.length - 1 && ['running', 'planning', 'waiting', 'retrying'].includes(rawStatus.value)
    const tone = detectedTone === 'idle' && (raw?.name || action)
      ? (isLastActiveAction ? 'running' : 'success')
      : detectedTone
    const status = raw?.status || tone
    const message = text(raw?.message || raw?.description || raw?.reason || raw?.error?.message || raw?.error)
    const title = text(raw?.title || raw?.label || raw?.name || action || type) || `步骤 ${index + 1}`
    const step = Number(raw?.step || raw?.stepNumber || raw?.index)
    const time = raw?.timestamp || raw?.createdAt || raw?.time
    const isCurrent = raw?.current === true || raw?.isCurrent === true || (
      tone === 'running' && index === source.length - 1 && ['running', 'planning', 'waiting', 'retrying'].includes(rawStatus.value)
    )

    return {
      id: text(raw?.id) || `${timestamp(time) || 'event'}-${index}`,
      raw,
      title,
      message,
      tone,
      statusLabel: statusMeta(status).tone === 'idle' && tone !== 'idle'
        ? statusMeta(tone).label
        : statusMeta(status).label,
      step: Number.isFinite(step) && step >= 0 ? step : index + 1,
      attempt: Number(raw?.attempt || raw?.revision) || 0,
      artifactRef: text(raw?.artifactRef || raw?.artifact?.id || raw?.outputRef),
      timeLabel: formatTime(time),
      isCurrent
    }
  })
})

const currentStepLabel = computed(() => {
  const current = [...normalizedTimeline.value].reverse().find((event) => event.isCurrent)
    || normalizedTimeline.value.at(-1)
  return current?.title || text(props.snapshot?.currentStep?.title || props.snapshot?.currentStep)
})

const artifactUrl = (artifact, value) => {
  const candidate = text(
    artifact?.url || artifact?.previewUrl || artifact?.thumbnailUrl || artifact?.downloadUrl ||
    value?.url || value?.previewUrl || value?.thumbnailUrl
  )
  if (!candidate || HIDDEN_MEDIA_PATTERN.test(candidate)) return ''
  return MEDIA_REFERENCE_PATTERN.test(candidate) ? candidate : ''
}

const artifactKind = (artifact, value, url) => {
  const explicit = String(artifact?.type || artifact?.kind || artifact?.mediaType || value?.type || '').toLowerCase()
  if (explicit.includes('video')) return 'video'
  if (explicit.includes('image')) return 'image'
  if (/\.(?:mp4|webm|mov)(?:\?|$)/i.test(url)) return 'video'
  if (/\.(?:png|jpe?g|webp|gif|avif)(?:\?|$)/i.test(url)) return 'image'
  return 'output'
}

const normalizeArtifact = (raw, index) => {
  const value = raw?.value && typeof raw.value === 'object' ? raw.value : {}
  const reference = text(
    raw?.artifactRef || raw?.reference || raw?.ref || raw?.id ||
    value?.artifactRef || value?.outputNodeId || value?.id
  ) || `artifact:${index + 1}`
  const url = artifactUrl(raw, value)
  const status = raw?.status || value?.status || (raw?.error || value?.error ? 'error' : 'completed')
  const scoreValue = raw?.overallScore ?? raw?.score ?? value?.overallScore ?? value?.score
  const numericScore = Number(scoreValue)
  const decision = text(raw?.decision || value?.decision)
  const adoptedArtifactId = text(props.snapshot?.final?.artifactId)
  const rawId = text(raw?.id)
  const isFinal = raw?.isFinal === true || raw?.final === true || raw?.selected === true ||
    raw?.adopted === true || decision === 'accept' ||
    (!!adoptedArtifactId && (reference === adoptedArtifactId || rawId === adoptedArtifactId))

  return {
    id: text(raw?.id) || reference,
    raw,
    reference,
    url,
    kind: artifactKind(raw, value, url),
    label: text(raw?.label || raw?.title || raw?.name || value?.label) || `候选作品 #${index + 1}`,
    summary: text(raw?.summary || raw?.description || value?.summary),
    attempt: Number(raw?.attempt || raw?.revision || value?.attempt) || index + 1,
    statusLabel: statusMeta(status).label,
    tone: statusMeta(status).tone,
    score: Number.isFinite(numericScore) ? Math.round(numericScore) : '',
    decision,
    isFinal,
    createdAt: timestamp(raw?.createdAt || raw?.timestamp || value?.createdAt)
  }
}

const normalizedArtifacts = computed(() => {
  const source = props.artifacts.length
    ? props.artifacts
    : (Array.isArray(props.snapshot?.artifacts)
        ? props.snapshot.artifacts
        : (Array.isArray(props.snapshot?.outputs) ? props.snapshot.outputs : []))
  return source.map(normalizeArtifact)
})

const explicitFinalObject = computed(() => {
  const delivery = props.snapshot?.finalDelivery || props.snapshot?.delivery || {}
  const final = props.snapshot?.finalArtifact || delivery?.artifact || props.snapshot?.result?.artifact
  return final && typeof final === 'object' ? final : null
})

const explicitFinalReference = computed(() => {
  const final = explicitFinalObject.value || props.snapshot?.finalArtifact ||
    props.snapshot?.finalDelivery?.artifact || props.snapshot?.delivery?.artifact || props.snapshot?.result?.artifact
  if (typeof final === 'string') return final
  return text(
    final?.artifactRef || final?.artifactId || final?.reference || final?.id || final?.value?.outputNodeId ||
    props.snapshot?.final?.artifactId
  )
})

const finalArtifact = computed(() => {
  const reference = explicitFinalReference.value
  if (reference) {
    const matched = normalizedArtifacts.value.find((artifact) => artifact.reference === reference || artifact.id === reference)
    if (matched) return { ...matched, isFinal: true }

    if (explicitFinalObject.value) return { ...normalizeArtifact(explicitFinalObject.value, 0), isFinal: true }
  }

  if (explicitFinalObject.value) return { ...normalizeArtifact(explicitFinalObject.value, 0), isFinal: true }

  const marked = [...normalizedArtifacts.value].reverse().find((artifact) => artifact.isFinal)
  if (marked) return marked
  if (['completed', 'complete', 'succeeded', 'success'].includes(rawStatus.value)) {
    return normalizedArtifacts.value.at(-1) || null
  }
  return null
})

const deliverySummary = computed(() => text(
  props.snapshot?.finalDelivery?.summary || props.snapshot?.delivery?.summary ||
  props.snapshot?.result?.summary || props.snapshot?.summary
))

const normalizedErrors = computed(() => {
  const source = []
  if (props.snapshot?.error) source.push(props.snapshot.error)
  if (Array.isArray(props.snapshot?.errors)) source.push(...props.snapshot.errors)
  normalizedTimeline.value
    .filter((event) => event.tone === 'error' && (event.message || event.raw?.error))
    .forEach((event) => source.push({
      message: event.message || event.raw?.error?.message,
      code: event.raw?.error?.code || event.raw?.code,
      action: event.raw?.action?.name || event.raw?.action,
      timestamp: event.raw?.timestamp
    }))

  const seen = new Set()
  return source.map((raw, index) => {
    const item = typeof raw === 'string' ? { message: raw } : (raw || {})
    const message = text(item.message || item.error || item.reason) || '未提供错误详情'
    const code = text(item.code || item.name)
    const key = `${code}\u0000${message}`
    if (seen.has(key)) return null
    seen.add(key)
    return {
      id: text(item.id) || `error-${index}-${key}`,
      message,
      code,
      action: text(item.action || item.tool),
      timeLabel: formatTime(item.timestamp || item.createdAt)
    }
  }).filter(Boolean)
})

const retryEventCount = computed(() => new Set(
  normalizedTimeline.value
    .filter((event) => event.attempt > 1)
    .map((event) => `${event.step}:${event.attempt}`)
).size)
const stopEventCount = computed(() => normalizedTimeline.value.filter((event) => event.tone === 'stopped').length)
const completedStepCount = computed(() => new Set(
  normalizedTimeline.value
    .filter((event) => ['tool_succeeded', 'completed'].includes(event.raw?.type) && event.step > 0)
    .map((event) => event.step)
).size)
const displayStepCount = computed(() => Math.max(
  Number(props.snapshot?.stepCount || props.snapshot?.totalSteps || 0),
  ...normalizedTimeline.value.map(event => event.step || 0),
  0
))
const isTerminal = computed(() => ['completed', 'complete', 'succeeded', 'success', 'failed', 'error', 'cancelled', 'canceled', 'stopped', 'aborted'].includes(rawStatus.value))
const canStop = computed(() => ['queued', 'planning', 'running', 'waiting', 'retrying'].includes(rawStatus.value))
const unsafeRetryCodes = new Set([
  'BACKGROUND_REQUEST_PENDING',
  'VIDEO_TASK_PENDING',
  'PROVIDER_EMPTY_IMAGE_RESULT',
  'PROVIDER_EMPTY_VIDEO_RESULT',
  'VIDEO_TASK_FAILED'
])
const unsafeProviderRetry = computed(() => (
  props.snapshot?.error?.acceptedByProvider === true ||
  unsafeRetryCodes.has(text(props.snapshot?.error?.code)) ||
  unsafeRetryCodes.has(text(props.snapshot?.error?.providerCode))
))
const canRetry = computed(() => ['failed', 'error'].includes(rawStatus.value) && !unsafeProviderRetry.value)
const terminalHint = computed(() => {
  if (unsafeProviderRetry.value) {
    return '供应商可能仍在后台执行；为避免重复计费，不提供一键重新执行。'
  }
  if (['cancelled', 'canceled', 'stopped', 'aborted'].includes(rawStatus.value)) {
    return '任务已停止。供应商已接收的远端任务可能仍会继续，因此不会自动重新提交。'
  }
  return '查看错误后可以重新执行；开始新运行时当前运行面板会被替换。'
})

const eventPayload = () => ({
  runId: runId.value,
  snapshot: props.snapshot
})

const requestStop = () => emit('stop', eventPayload())
const requestRetry = () => emit('retry', eventPayload())
const selectArtifact = (artifact) => emit('artifact-select', {
  runId: runId.value,
  artifact: artifact.raw,
  normalizedArtifact: artifact
})
</script>

<style scoped>
.agent-run-panel {
  --run-accent: #14b8a6;
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 26px;
  padding: 18px;
  color: var(--text-primary, #0f172a);
  background:
    radial-gradient(circle at 8% 0%, color-mix(in srgb, var(--run-accent) 13%, transparent), transparent 30%),
    color-mix(in srgb, var(--bg-secondary, #fff) 94%, transparent);
  box-shadow: 0 22px 64px rgba(15, 23, 42, 0.12);
}

.agent-run-panel.is-error { --run-accent: #ef4444; }
.agent-run-panel.is-stopped { --run-accent: #f59e0b; }
.agent-run-panel.is-success { --run-accent: #22c55e; }
.agent-run-panel.is-retry { --run-accent: #8b5cf6; }

.run-header,
.section-heading,
.timeline-event-head,
.artifact-copy > div:first-child,
.error-section li > div {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.run-heading {
  min-width: 0;
}

.run-kicker,
.section-heading p {
  margin: 0;
  color: var(--run-accent);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.17em;
}

.run-heading h2 {
  margin: 5px 0 0;
  font-size: clamp(18px, 2vw, 24px);
  line-height: 1.28;
}

.run-meta,
.run-actions,
.event-tags,
.artifact-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
}

.run-meta {
  margin-top: 9px;
  color: var(--text-secondary, #64748b);
  font-size: 11px;
}

.status-pill,
.event-tags span,
.artifact-copy span,
.final-badge,
.attempt-badge {
  border-radius: 999px;
  padding: 4px 8px;
  color: #475569;
  background: rgba(148, 163, 184, 0.13);
  font-size: 10px;
  font-weight: 750;
}

.status-pill.is-running,
.event-tags .is-running { color: #0369a1; background: rgba(14, 165, 233, 0.12); }
.status-pill.is-success,
.event-tags .is-success,
.artifact-copy span.is-success { color: #15803d; background: rgba(34, 197, 94, 0.12); }
.status-pill.is-error,
.event-tags .is-error,
.artifact-copy span.is-error { color: #dc2626; background: rgba(239, 68, 68, 0.11); }
.status-pill.is-stopped,
.event-tags .is-stopped { color: #b45309; background: rgba(245, 158, 11, 0.12); }
.status-pill.is-retry,
.event-tags .is-retry { color: #6d28d9; background: rgba(139, 92, 246, 0.12); }

.run-id {
  overflow: hidden;
  max-width: 160px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-actions {
  justify-content: flex-end;
}

.run-actions button {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--text-primary, #0f172a);
  background: color-mix(in srgb, var(--bg-tertiary, #f1f5f9) 82%, transparent);
  font-size: 11px;
  font-weight: 800;
  transition: transform 160ms ease, background 160ms ease;
}

.run-actions button:hover { transform: translateY(-1px); }
.run-actions button.danger { color: #dc2626; border-color: rgba(239, 68, 68, 0.25); background: rgba(239, 68, 68, 0.08); }
.run-actions button.primary { color: #0f766e; border-color: rgba(20, 184, 166, 0.28); background: rgba(20, 184, 166, 0.1); }

.run-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.run-summary-grid > div {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 15px;
  padding: 10px 11px;
  background: color-mix(in srgb, var(--bg-tertiary, #f1f5f9) 62%, transparent);
}

.run-summary-grid span {
  display: block;
  color: var(--text-secondary, #64748b);
  font-size: 9px;
}

.run-summary-grid strong {
  display: block;
  margin-top: 3px;
  font-size: 16px;
}

.run-layout {
  display: grid;
  grid-template-columns: minmax(260px, 0.88fr) minmax(360px, 1.4fr);
  gap: 12px;
  margin-top: 12px;
}

.run-results-column {
  display: grid;
  align-content: start;
  gap: 12px;
  min-width: 0;
}

.panel-section {
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.17);
  border-radius: 19px;
  padding: 13px;
  background: color-mix(in srgb, var(--bg-secondary, #fff) 74%, transparent);
}

.section-heading {
  align-items: center;
}

.section-heading h3 {
  margin: 2px 0 0;
  font-size: 14px;
}

.section-heading > span {
  color: var(--text-secondary, #64748b);
  font-size: 10px;
}

.timeline-list,
.error-section ul {
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.timeline-list {
  display: grid;
  gap: 3px;
}

.timeline-list > li {
  position: relative;
  display: grid;
  grid-template-columns: 18px 1fr;
  gap: 6px;
  min-width: 0;
  padding-bottom: 9px;
}

.timeline-list > li:not(:last-child)::before {
  position: absolute;
  top: 14px;
  bottom: -2px;
  left: 6px;
  width: 1px;
  background: rgba(148, 163, 184, 0.28);
  content: '';
}

.timeline-dot {
  position: relative;
  z-index: 1;
  width: 13px;
  height: 13px;
  margin-top: 3px;
  border: 3px solid color-mix(in srgb, var(--bg-secondary, #fff) 90%, transparent);
  border-radius: 999px;
  background: #94a3b8;
  box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.28);
}

.timeline-list > li.is-running .timeline-dot { background: #0ea5e9; }
.timeline-list > li.is-success .timeline-dot { background: #22c55e; }
.timeline-list > li.is-error .timeline-dot { background: #ef4444; }
.timeline-list > li.is-retry .timeline-dot { background: #8b5cf6; }
.timeline-list > li.is-stopped .timeline-dot { background: #f59e0b; }
.timeline-list > li.is-current .timeline-dot { box-shadow: 0 0 0 4px color-mix(in srgb, var(--run-accent) 15%, transparent); }

.timeline-event {
  min-width: 0;
  border-radius: 12px;
  padding: 7px 8px;
}

.timeline-list > li.is-current .timeline-event {
  background: color-mix(in srgb, var(--run-accent) 8%, transparent);
}

.timeline-event-head > div {
  min-width: 0;
}

.timeline-event-head strong {
  display: block;
  overflow: hidden;
  margin-top: 2px;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.event-step,
.timeline-event-head time,
.error-section time {
  color: var(--text-secondary, #64748b);
  font-size: 9px;
}

.timeline-event > p,
.artifact-copy p,
.delivery-card p,
.error-section li p {
  margin: 5px 0 0;
  color: var(--text-secondary, #64748b);
  font-size: 10px;
  line-height: 1.5;
}

.event-tags,
.artifact-meta {
  margin-top: 6px;
}

.event-tags span,
.artifact-meta span {
  overflow: hidden;
  max-width: 150px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 9px;
  margin-top: 12px;
}

.artifact-card {
  overflow: hidden;
  min-width: 0;
  border: 1px solid rgba(148, 163, 184, 0.19);
  border-radius: 15px;
  background: color-mix(in srgb, var(--bg-tertiary, #f1f5f9) 50%, transparent);
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}

.artifact-card:hover,
.artifact-card:focus-visible {
  border-color: rgba(20, 184, 166, 0.5);
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.11);
}

.artifact-card.is-final { border-color: rgba(34, 197, 94, 0.48); }
.artifact-card.is-error { border-color: rgba(239, 68, 68, 0.35); }

.artifact-preview,
.delivery-preview {
  position: relative;
  overflow: hidden;
  background: color-mix(in srgb, var(--bg-tertiary, #e2e8f0) 76%, transparent);
}

.artifact-preview { aspect-ratio: 16 / 10; }
.delivery-preview { min-height: 150px; border-radius: 13px; }

.artifact-preview img,
.artifact-preview video,
.delivery-preview img,
.delivery-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.artifact-placeholder {
  display: grid;
  min-height: 130px;
  place-content: center;
  gap: 4px;
  padding: 12px;
  color: var(--text-secondary, #64748b);
  text-align: center;
}

.artifact-placeholder span {
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.artifact-placeholder small { font-size: 9px; }

.final-badge,
.attempt-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  color: #fff;
  background: rgba(15, 23, 42, 0.72);
  backdrop-filter: blur(8px);
}

.final-badge { color: #dcfce7; background: rgba(21, 128, 61, 0.82); }

.artifact-copy { padding: 9px; }

.artifact-copy strong,
.delivery-card strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.artifact-meta {
  color: var(--text-secondary, #64748b);
  font-size: 9px;
}

.delivery-section.has-delivery {
  border-color: rgba(34, 197, 94, 0.28);
  background:
    linear-gradient(145deg, rgba(34, 197, 94, 0.08), transparent 48%),
    color-mix(in srgb, var(--bg-secondary, #fff) 74%, transparent);
}

.delivery-card {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(180px, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.delivery-card > div:last-child {
  min-width: 0;
  align-self: center;
}

.error-section {
  border-color: rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.045);
}

.error-section .section-heading p { color: #ef4444; }

.error-section ul {
  display: grid;
  gap: 7px;
}

.error-section li {
  border: 1px solid rgba(239, 68, 68, 0.16);
  border-radius: 12px;
  padding: 9px;
  background: rgba(255, 255, 255, 0.35);
}

.error-section li strong {
  color: #dc2626;
  font-size: 10px;
}

.error-section li > span {
  display: block;
  margin-top: 5px;
  color: var(--text-secondary, #64748b);
  font-size: 9px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  padding: 24px;
  color: var(--text-secondary, #64748b);
  text-align: center;
}

.empty-state.compact { min-height: 110px; padding: 16px; }
.empty-state strong { color: var(--text-primary, #0f172a); font-size: 11px; }
.empty-state span { max-width: 360px; margin-top: 5px; font-size: 10px; line-height: 1.5; }

@media (max-width: 840px) {
  .run-layout { grid-template-columns: 1fr; }
}

@media (max-width: 620px) {
  .agent-run-panel { border-radius: 18px; padding: 12px; }
  .run-header { flex-direction: column; }
  .run-actions { width: 100%; justify-content: flex-start; }
  .run-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .delivery-card { grid-template-columns: 1fr; }
  .delivery-preview { aspect-ratio: 16 / 10; min-height: 0; }
}
</style>

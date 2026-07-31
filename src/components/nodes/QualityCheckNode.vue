<template>
  <div class="quality-check-wrapper">
    <span class="node-port-label node-port-label-in">候选图片</span>
    <Handle type="target" :position="Position.Left" id="left" class="quality-handle" />
    <Handle type="source" :position="Position.Right" id="right" class="quality-handle" />

    <article class="quality-check-card" :class="[`is-${decision}`, { 'is-degraded': isDegraded }]">
      <header class="quality-check-head">
        <div>
          <p>QUALITY CHECK</p>
          <h3>{{ data.label || '作品质量检查' }}</h3>
        </div>
        <button
          type="button"
          class="quality-delete nodrag nopan"
          title="删除质量检查节点"
          @pointerdown.stop
          @mousedown.stop
          @click.stop="removeNode(id)"
        >
          ×
        </button>
      </header>

      <div class="quality-check-metrics">
        <div>
          <span>尝试</span>
          <strong>#{{ attempt }}</strong>
        </div>
        <div>
          <span>检查模式</span>
          <strong>{{ reviewModeLabel }}</strong>
        </div>
        <div>
          <span>总分</span>
          <strong>{{ scoreText }}</strong>
        </div>
      </div>

      <div v-if="isDegraded" class="quality-degraded-notice">
        <strong>未视觉验证</strong>
        <span>未配置可看图模型，仅完成图片技术检查。</span>
      </div>

      <div class="quality-decision-row">
        <span>结论</span>
        <strong :class="`is-${decision}`">{{ decisionLabel }}</strong>
      </div>

      <p v-if="summary" class="quality-summary">{{ summary }}</p>

      <section v-if="hardFailures.length" class="quality-list is-failure">
        <h4>硬失败</h4>
        <ul>
          <li v-for="(failure, index) in hardFailures" :key="`${failure}-${index}`">
            {{ formatListItem(failure) }}
          </li>
        </ul>
      </section>

      <section v-if="blockingReasons.length" class="quality-list is-failure">
        <h4>阻断原因</h4>
        <ul>
          <li v-for="(reason, index) in blockingReasons" :key="`${reason?.code || reason}-${index}`">
            {{ formatListItem(reason) }}
          </li>
        </ul>
      </section>

      <section v-if="improvements.length" class="quality-list is-improvement">
        <h4>改进建议</h4>
        <ul>
          <li v-for="(improvement, index) in improvements" :key="`${improvement}-${index}`">
            {{ formatListItem(improvement) }}
          </li>
        </ul>
      </section>

      <p v-if="!isDegraded && !hardFailures.length && !improvements.length" class="quality-clean">
        未发现需要修正的质量问题
      </p>
    </article>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { removeNode } from '../../stores/canvas'

const props = defineProps({
  id: {
    type: String,
    required: true
  },
  data: {
    type: Object,
    default: () => ({})
  }
})

const reviewData = computed(() => props.data?.review || props.data || {})
const attempt = computed(() => {
  const value = Number(props.data?.attempt || reviewData.value.attempt || 1)
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1
})
const reviewMode = computed(() => String(reviewData.value.reviewMode || 'degraded').toLowerCase())
const isDegraded = computed(() => reviewMode.value === 'degraded')
const decision = computed(() => String(reviewData.value.decision || (isDegraded.value ? 'unverified' : 'retry')).toLowerCase())
const summary = computed(() => String(reviewData.value.summary || '').trim())
const hardFailures = computed(() => Array.isArray(reviewData.value.hardFailures) ? reviewData.value.hardFailures : [])
const blockingReasons = computed(() => Array.isArray(reviewData.value.blockingReasons) ? reviewData.value.blockingReasons : [])
const improvements = computed(() => Array.isArray(reviewData.value.improvements) ? reviewData.value.improvements : [])

const reviewModeLabel = computed(() => isDegraded.value ? '降级技术检查' : '视觉模型')
const decisionLabel = computed(() => ({
  accept: '通过·采用',
  retry: '未通过·需重做',
  unverified: '未视觉验证'
}[decision.value] || reviewData.value.decision || '待检查'))

const scoreText = computed(() => {
  if (isDegraded.value) return '—'
  const value = Number(reviewData.value.overallScore)
  return Number.isFinite(value) ? `${Math.round(value)} / 100` : '—'
})

const formatListItem = (item) => {
  if (typeof item === 'string') return item
  if (!item || typeof item !== 'object') return String(item || '')
  return item.code || item.message || item.summary || item.feedback || JSON.stringify(item)
}
</script>

<style scoped>
.quality-check-wrapper {
  position: relative;
  width: 340px;
}

.quality-handle {
  background: #14b8a6 !important;
  border-color: rgba(204, 251, 241, 0.95) !important;
}

.quality-check-card {
  overflow: hidden;
  width: 340px;
  border: 1px solid color-mix(in srgb, var(--border-color) 76%, #14b8a6 24%);
  border-left: 4px solid #14b8a6;
  border-radius: 20px;
  padding: 14px;
  color: var(--text-primary);
  background:
    linear-gradient(145deg, rgba(20, 184, 166, 0.1), transparent 44%),
    var(--bg-secondary);
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.14);
}

.quality-check-card.is-accept {
  border-left-color: #22c55e;
}

.quality-check-card.is-retry {
  border-left-color: #ef4444;
}

.quality-check-card.is-unverified,
.quality-check-card.is-degraded {
  border-left-color: #f59e0b;
}

.quality-check-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.quality-check-head p,
.quality-check-head h3,
.quality-list h4,
.quality-summary,
.quality-clean {
  margin: 0;
}

.quality-check-head p {
  color: #14b8a6;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.17em;
}

.quality-check-head h3 {
  margin-top: 3px;
  font-size: 15px;
}

.quality-delete {
  display: grid;
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 999px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--bg-tertiary) 84%, transparent);
  font-size: 18px;
  line-height: 1;
}

.quality-delete:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

.quality-check-metrics {
  display: grid;
  grid-template-columns: 0.75fr 1.25fr 1fr;
  gap: 7px;
  margin-top: 12px;
}

.quality-check-metrics > div {
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--border-color) 74%, transparent);
  border-radius: 12px;
  padding: 8px;
  background: color-mix(in srgb, var(--bg-tertiary) 70%, transparent);
}

.quality-check-metrics span,
.quality-decision-row > span {
  display: block;
  color: var(--text-secondary);
  font-size: 9px;
}

.quality-check-metrics strong {
  display: block;
  overflow: hidden;
  margin-top: 3px;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quality-degraded-notice {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-top: 10px;
  border: 1px solid rgba(245, 158, 11, 0.3);
  border-radius: 12px;
  padding: 9px 10px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.1);
}

.quality-degraded-notice strong {
  font-size: 12px;
}

.quality-degraded-notice span {
  font-size: 10px;
  line-height: 1.45;
}

.quality-decision-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
}

.quality-decision-row strong {
  border-radius: 999px;
  padding: 4px 8px;
  color: #0f766e;
  background: rgba(20, 184, 166, 0.12);
  font-size: 10px;
}

.quality-decision-row strong.is-accept {
  color: #15803d;
  background: rgba(34, 197, 94, 0.12);
}

.quality-decision-row strong.is-retry {
  color: #dc2626;
  background: rgba(239, 68, 68, 0.11);
}

.quality-decision-row strong.is-unverified {
  color: #b45309;
  background: rgba(245, 158, 11, 0.12);
}

.quality-summary {
  margin-top: 9px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.55;
}

.quality-list {
  margin-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent);
  padding-top: 9px;
}

.quality-list h4 {
  font-size: 10px;
}

.quality-list.is-failure h4 {
  color: #ef4444;
}

.quality-list.is-improvement h4 {
  color: #0d9488;
}

.quality-list ul {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
  padding-left: 17px;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.45;
}

.quality-clean {
  margin-top: 10px;
  border-radius: 10px;
  padding: 7px 9px;
  color: #15803d;
  background: rgba(34, 197, 94, 0.09);
  font-size: 10px;
}
</style>

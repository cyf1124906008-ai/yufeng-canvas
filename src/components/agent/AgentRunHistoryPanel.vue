<template>
  <section class="agent-run-history" :aria-busy="loading ? 'true' : 'false'">
    <header class="history-header">
      <div>
        <p>RUN HISTORY</p>
        <h2>历史任务</h2>
      </div>
      <div class="history-header-actions">
        <span>{{ normalizedRecords.length }} 条记录</span>
        <button
          type="button"
          class="clear-button"
          :disabled="loading || normalizedRecords.length === 0"
          @click="emit('clear')"
        >
          清空历史
        </button>
      </div>
    </header>

    <div v-if="loading" class="history-loading" role="status">
      <span></span>
      <span></span>
      <span></span>
      <small>正在读取历史任务…</small>
    </div>

    <ol v-else-if="normalizedRecords.length" class="history-list">
      <li
        v-for="record in normalizedRecords"
        :key="record.key"
        :class="{ 'is-selected': record.id && record.id === normalizedSelectedId }"
      >
        <button
          type="button"
          class="history-select"
          :disabled="!record.id"
          :aria-current="record.id && record.id === normalizedSelectedId ? 'true' : undefined"
          @click="selectRecord(record)"
        >
          <span class="history-status" :class="`is-${record.tone}`">{{ record.label }}</span>
          <strong :title="record.goal">{{ record.goal }}</strong>
          <time :datetime="record.time ? new Date(record.time).toISOString() : undefined">
            {{ record.timeLabel }}
          </time>
          <span class="history-metrics">
            <span>{{ record.stepCount }} 步</span>
            <span>{{ record.artifactCount }} 个作品</span>
          </span>
        </button>

        <button
          type="button"
          class="delete-button"
          :disabled="!record.id"
          :aria-label="`删除历史任务：${record.goal}`"
          @click="deleteRecord(record)"
        >
          删除
        </button>
      </li>
    </ol>

    <div v-else class="history-empty">
      <strong>还没有历史任务</strong>
      <span>Agent 运行后，目标、轨迹和作品记录会保存在本机。</span>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { normalizeAgentRunHistoryRecords } from './agentRunHistoryView.js'

defineOptions({ name: 'AgentRunHistoryPanel' })

const props = defineProps({
  records: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: [String, Number],
    default: ''
  },
  loading: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits({
  select: id => typeof id === 'string' && id.length > 0,
  delete: id => typeof id === 'string' && id.length > 0,
  clear: () => true
})

const normalizedSelectedId = computed(() => String(props.selectedId ?? '').trim())
const normalizedRecords = computed(() => normalizeAgentRunHistoryRecords(props.records))

const selectRecord = (record) => {
  if (record.id) emit('select', record.id)
}

const deleteRecord = (record) => {
  if (record.id) emit('delete', record.id)
}
</script>

<style scoped>
.agent-run-history {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 22px;
  padding: 14px;
  color: inherit;
  background: color-mix(in srgb, var(--bg-secondary, #fff) 82%, transparent);
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.1);
}

.history-header,
.history-header-actions,
.history-metrics {
  display: flex;
  align-items: center;
}

.history-header {
  justify-content: space-between;
  gap: 12px;
}

.history-header p {
  margin: 0;
  color: #14b8a6;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.16em;
}

.history-header h2 {
  margin: 2px 0 0;
  font-size: 15px;
}

.history-header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  color: var(--text-secondary, #64748b);
  font-size: 10px;
}

.clear-button,
.delete-button {
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 999px;
  padding: 6px 9px;
  color: #dc2626;
  background: rgba(239, 68, 68, 0.07);
  font-size: 10px;
  font-weight: 800;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.history-list {
  display: grid;
  gap: 7px;
  margin: 12px 0 0;
  padding: 0;
  list-style: none;
}

.history-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 15px;
  padding: 7px;
  background: color-mix(in srgb, var(--bg-tertiary, #f1f5f9) 58%, transparent);
  transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
}

.history-list li:hover {
  border-color: rgba(20, 184, 166, 0.34);
  transform: translateY(-1px);
}

.history-list li.is-selected {
  border-color: rgba(20, 184, 166, 0.58);
  background:
    linear-gradient(135deg, rgba(20, 184, 166, 0.1), transparent),
    color-mix(in srgb, var(--bg-tertiary, #f1f5f9) 66%, transparent);
  box-shadow: inset 3px 0 0 #14b8a6;
}

.history-select {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px;
  color: inherit;
  text-align: left;
}

.history-select:focus-visible,
.clear-button:focus-visible,
.delete-button:focus-visible {
  outline: 2px solid rgba(20, 184, 166, 0.65);
  outline-offset: 2px;
}

.history-select strong {
  overflow: hidden;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-select time {
  color: var(--text-secondary, #64748b);
  font-size: 9px;
  white-space: nowrap;
}

.history-status {
  border-radius: 999px;
  padding: 4px 7px;
  color: #475569;
  background: rgba(148, 163, 184, 0.14);
  font-size: 9px;
  font-weight: 800;
  white-space: nowrap;
}

.history-status.is-running { color: #0369a1; background: rgba(14, 165, 233, 0.12); }
.history-status.is-retry { color: #6d28d9; background: rgba(139, 92, 246, 0.12); }
.history-status.is-success { color: #15803d; background: rgba(34, 197, 94, 0.12); }
.history-status.is-error { color: #dc2626; background: rgba(239, 68, 68, 0.11); }
.history-status.is-stopped { color: #b45309; background: rgba(245, 158, 11, 0.12); }

.history-metrics {
  grid-column: 2 / -1;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--text-secondary, #64748b);
  font-size: 9px;
}

.history-metrics span {
  border-radius: 999px;
  padding: 2px 6px;
  background: rgba(148, 163, 184, 0.1);
}

.history-loading,
.history-empty {
  min-height: 132px;
  margin-top: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.2);
  border-radius: 15px;
}

.history-loading {
  display: grid;
  grid-template-columns: repeat(3, 8px);
  place-content: center;
  gap: 6px;
}

.history-loading > span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #14b8a6;
  animation: history-pulse 900ms ease-in-out infinite alternate;
}

.history-loading > span:nth-child(2) { animation-delay: 150ms; }
.history-loading > span:nth-child(3) { animation-delay: 300ms; }

.history-loading small {
  grid-column: 1 / -1;
  margin-top: 5px;
  color: var(--text-secondary, #64748b);
  font-size: 9px;
  text-align: center;
}

.history-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  text-align: center;
}

.history-empty strong { font-size: 11px; }
.history-empty span {
  max-width: 320px;
  margin-top: 5px;
  color: var(--text-secondary, #64748b);
  font-size: 9px;
  line-height: 1.5;
}

@keyframes history-pulse {
  from { opacity: 0.35; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(-2px); }
}

@media (max-width: 620px) {
  .history-header { align-items: flex-start; }
  .history-select { grid-template-columns: auto minmax(0, 1fr); }
  .history-select time { grid-column: 2; }
  .history-metrics { grid-column: 2; }
}
</style>

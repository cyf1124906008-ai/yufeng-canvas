<template>
  <aside class="wb-inspector" :class="{ 'is-open': open }" aria-label="运行检查器">
    <header class="inspector-header">
      <div>
        <strong>检查器</strong>
        <small>实时任务详情</small>
      </div>
      <button type="button" aria-label="关闭检查器" @click="emit('close')">×</button>
    </header>

    <div class="inspector-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :id="`inspector-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id ? 'true' : 'false'"
        :aria-controls="`inspector-panel-${tab.id}`"
        :class="{ 'is-active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
        <span v-if="tab.count != null">{{ tab.count }}</span>
      </button>
    </div>

    <div class="inspector-scroll">
      <div
        v-if="activeTab === 'run'"
        id="inspector-panel-run"
        role="tabpanel"
        aria-labelledby="inspector-tab-run"
      >
        <section class="inspector-section run-overview">
          <header><strong>任务</strong><span class="status-chip" :class="`is-${inspector.run.tone}`">{{ inspector.run.statusLabel }}</span></header>
          <dl>
            <div><dt>ID</dt><dd :title="inspector.run.id">{{ inspector.run.id || '尚未开始' }}</dd></div>
            <div><dt>目标</dt><dd>{{ inspector.run.targetType || '自动判断' }}</dd></div>
            <div><dt>步骤</dt><dd>{{ inspector.run.stepCount }}</dd></div>
            <div><dt>开始</dt><dd>{{ formatTime(inspector.run.startedAt) || '—' }}</dd></div>
            <div><dt>更新</dt><dd>{{ formatTime(inspector.run.updatedAt) || '—' }}</dd></div>
          </dl>
        </section>

        <section class="inspector-section">
          <header><strong>上下文</strong><span>{{ contextRows.length }}</span></header>
          <div v-if="contextRows.length" class="context-list">
            <div v-for="row in contextRows" :key="row.key">
              <span>{{ row.key }}</span><strong :title="row.value">{{ row.value }}</strong>
            </div>
          </div>
          <p v-else class="empty-copy">暂无额外任务上下文。</p>
        </section>

        <section class="inspector-section usage-section">
          <header><strong>用量</strong><span>仅显示已上报数据</span></header>
          <div class="usage-grid">
            <div><span>输入 Token</span><strong>{{ usageValue(inspector.usage.inputTokens) }}</strong></div>
            <div><span>输出 Token</span><strong>{{ usageValue(inspector.usage.outputTokens) }}</strong></div>
            <div><span>费用</span><strong>{{ costValue }}</strong></div>
          </div>
          <p v-if="usageUnavailable">当前 Provider 尚未上报本次任务用量。</p>
        </section>
      </div>

      <section v-else-if="activeTab === 'changes'" id="inspector-panel-changes" role="tabpanel" aria-labelledby="inspector-tab-changes" class="inspector-section tab-section">
        <header><strong>文件变更</strong><span>{{ inspector.files.length }}</span></header>
        <div v-if="inspector.files.length" class="file-list">
          <article v-for="file in inspector.files" :key="file.id">
            <span class="file-status" :class="`is-${file.status}`">{{ file.status.slice(0, 1).toUpperCase() }}</span>
            <div><strong :title="file.path">{{ file.path }}</strong><small>+{{ file.additions }} −{{ file.deletions }}</small></div>
          </article>
        </div>
        <div v-else class="inspector-empty"><span>±</span><strong>暂无文件变更</strong><p>只有文件写入工具成功后才会显示在这里。</p></div>
      </section>

      <section v-else id="inspector-panel-artifacts" role="tabpanel" aria-labelledby="inspector-tab-artifacts" class="inspector-section tab-section">
        <header><strong>产物</strong><span>{{ inspector.artifacts.length }}</span></header>
        <div v-if="inspector.artifacts.length" class="artifact-list">
          <button
            v-for="artifact in inspector.artifacts"
            :key="artifact.id"
            type="button"
            :disabled="!artifact.url"
            @click="emit('artifact-select', artifact)"
          >
            <img v-if="artifact.kind === 'image' && artifact.url" :src="artifact.url" :alt="artifact.label" />
            <video v-else-if="artifact.kind === 'video' && artifact.url" :src="artifact.url" muted></video>
            <span v-else>{{ artifact.kind.toUpperCase() }}</span>
            <div><strong>{{ artifact.label }}</strong><small>{{ artifact.isFinal ? '最终交付' : artifact.status.label }}</small></div>
          </button>
        </div>
        <div v-else class="inspector-empty"><span>□</span><strong>暂无产物</strong><p>截图、图片或视频工具成功后会显示在这里。</p></div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import { buildWorkbenchInspector, formatWorkbenchTime } from './workbenchView.js'

defineOptions({ name: 'WorkbenchInspector' })

const props = defineProps({
  snapshot: { type: Object, default: () => ({}) },
  artifacts: { type: Array, default: () => [] },
  context: { type: Object, default: () => ({}) },
  fileChanges: { type: Array, default: () => [] },
  usage: { type: Object, default: () => ({}) },
  open: { type: Boolean, default: true }
})

const emit = defineEmits({
  close: () => true,
  'artifact-select': value => !!value && typeof value === 'object'
})

const activeTab = ref('run')
const inspector = computed(() => buildWorkbenchInspector({
  snapshot: props.snapshot,
  artifacts: props.artifacts,
  context: props.context,
  fileChanges: props.fileChanges,
  usage: props.usage
}))
const tabs = computed(() => [
  { id: 'run', label: '任务' },
  { id: 'changes', label: '变更', count: inspector.value.files.length },
  { id: 'artifacts', label: '产物', count: inspector.value.artifacts.length }
])
const contextRows = computed(() => Object.entries(inspector.value.context).slice(0, 30).map(([key, value]) => ({
  key,
  value: typeof value === 'string' ? value : JSON.stringify(value)
})))
const usageUnavailable = computed(() => [
  inspector.value.usage.inputTokens,
  inspector.value.usage.outputTokens,
  inspector.value.usage.cost
].every(value => value == null))
const costValue = computed(() => inspector.value.usage.cost == null
  ? '未上报'
  : `${inspector.value.usage.currency === 'CNY' ? '¥' : `${inspector.value.usage.currency} `}${inspector.value.usage.cost.toFixed(4)}`)
const usageValue = value => value == null ? '未上报' : value.toLocaleString()
const formatTime = value => formatWorkbenchTime(value)
</script>

<style scoped>
.wb-inspector { display: grid; grid-template-rows: auto auto minmax(0, 1fr); min-width: 0; height: 100%; border-left: 1px solid var(--wb-border); color: var(--wb-text); background: #111215; }
.inspector-header { display: flex; align-items: center; justify-content: space-between; min-height: 51px; border-bottom: 1px solid var(--wb-border); padding: 9px 11px; }
.inspector-header strong,
.inspector-header small { display: block; }
.inspector-header strong { color: #dedfe2; font-size: 10px; }
.inspector-header small { margin-top: 1px; color: #666970; font-size: 7.5px; }
.inspector-header button { display: grid; width: 25px; height: 25px; place-items: center; border-radius: 6px; color: #7e8188; font-size: 17px; }
.inspector-header button:hover { color: #fff; background: #25272b; }
.inspector-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-bottom: 1px solid var(--wb-border); padding: 5px; }
.inspector-tabs button { display: flex; align-items: center; justify-content: center; gap: 4px; border-radius: 6px; padding: 6px 4px; color: #74777e; font-size: 7.5px; font-weight: 650; }
.inspector-tabs button:hover { color: #bfc1c6; }
.inspector-tabs button.is-active { color: #d9dadd; background: #23252a; }
.inspector-tabs span { border-radius: 999px; padding: 1px 4px; color: #777a81; background: #303238; font-size: 6px; }
.inspector-scroll { min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #34363c transparent; }
.inspector-section { border-bottom: 1px solid #25272b; padding: 12px 11px; }
.inspector-section > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 9px; }
.inspector-section > header strong { color: #aeb0b6; font-size: 8px; text-transform: uppercase; letter-spacing: 0.08em; }
.inspector-section > header > span:not(.status-chip) { color: #62656c; font-size: 7px; }
.status-chip { border-radius: 999px; padding: 2px 6px; color: #85888f; background: #25272b; font-size: 6.5px; }
.status-chip.is-running { color: #86c8eb; background: #1c2c35; }
.status-chip.is-success { color: #82d4ad; background: #1e2f27; }
.status-chip.is-error { color: #ec9191; background: #342124; }
.status-chip.is-stopped { color: #d8aa6d; background: #33291d; }
.run-overview dl { display: grid; gap: 1px; margin: 0; }
.run-overview dl > div { display: grid; grid-template-columns: 58px minmax(0, 1fr); gap: 8px; border-radius: 5px; padding: 5px 6px; }
.run-overview dl > div:nth-child(odd) { background: #17181b; }
.run-overview dt { color: #686b72; font-size: 7px; }
.run-overview dd { overflow: hidden; margin: 0; color: #a6a8ae; font-size: 7.5px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.context-list { display: grid; gap: 3px; }
.context-list > div { display: grid; grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr); gap: 8px; border-radius: 5px; padding: 5px 6px; background: #18191c; }
.context-list span { overflow: hidden; color: #6e7178; font-size: 7px; text-overflow: ellipsis; white-space: nowrap; }
.context-list strong { overflow: hidden; color: #a3a5ab; font-size: 7px; font-weight: 550; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.empty-copy { margin: 0; color: #63666d; font-size: 7.5px; line-height: 1.5; }
.usage-grid { display: grid; grid-template-columns: 1fr; gap: 4px; }
.usage-grid > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; border-radius: 5px; padding: 6px; background: #18191c; }
.usage-grid span { color: #6d7077; font-size: 7px; }
.usage-grid strong { color: #a7a9af; font-size: 7.5px; }
.usage-section > p { margin: 7px 1px 0; color: #5d6067; font-size: 6.8px; line-height: 1.45; }
.tab-section { min-height: calc(100vh - 102px); border-bottom: 0; }
.file-list,
.artifact-list { display: grid; gap: 4px; }
.file-list article { display: grid; grid-template-columns: 21px minmax(0, 1fr); gap: 7px; border: 1px solid #292b30; border-radius: 6px; padding: 6px; background: #17181b; }
.file-status { display: grid; width: 20px; height: 20px; place-items: center; border-radius: 5px; color: #a5d8bd; background: #203028; font-size: 7px; font-weight: 850; }
.file-status.is-deleted { color: #e59a9a; background: #332124; }
.file-list div { min-width: 0; }
.file-list strong,
.file-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-list strong { color: #aeb0b5; font: 7.5px ui-monospace, SFMono-Regular, Menlo, monospace; }
.file-list small { margin-top: 2px; color: #6b6e75; font-size: 6.5px; }
.artifact-list button { display: grid; grid-template-columns: 46px minmax(0, 1fr); align-items: center; gap: 7px; overflow: hidden; border: 1px solid #292b30; border-radius: 7px; color: #aeb0b5; background: #18191c; text-align: left; }
.artifact-list button:not(:disabled):hover { border-color: #41444b; }
.artifact-list img,
.artifact-list video,
.artifact-list button > span { display: grid; width: 46px; height: 38px; place-items: center; object-fit: cover; color: #6c6f76; background: #202226; font-size: 6.5px; }
.artifact-list button > div { min-width: 0; padding-right: 6px; }
.artifact-list strong,
.artifact-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifact-list strong { font-size: 7.5px; }
.artifact-list small { margin-top: 2px; color: #676a71; font-size: 6.5px; }
.inspector-empty { display: flex; min-height: 220px; flex-direction: column; align-items: center; justify-content: center; color: #5e6168; text-align: center; }
.inspector-empty > span { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #2d2f34; border-radius: 9px; font-size: 13px; }
.inspector-empty strong { margin-top: 9px; color: #85888f; font-size: 8px; }
.inspector-empty p { max-width: 170px; margin: 4px 0 0; font-size: 7px; line-height: 1.5; }

@media (min-width: 1181px) {
  .wb-inspector:not(.is-open) { display: none; }
}

.inspector-header strong { font-size: 12px; }
.inspector-header small,
.inspector-tabs button,
.run-overview dd,
.empty-copy,
.usage-grid strong,
.artifact-list strong,
.file-list strong { font-size: 10px; }
.inspector-section > header strong,
.run-overview dt,
.context-list span,
.context-list strong,
.usage-grid span,
.artifact-list small,
.file-list small,
.inspector-empty p { font-size: 9px; }
.status-chip,
.inspector-section > header > span:not(.status-chip),
.usage-section > p { font-size: 8px; }

@media (max-width: 1180px) {
  .wb-inspector {
    position: fixed;
    z-index: 55;
    inset: 0 0 0 auto;
    width: min(310px, 88vw);
    box-shadow: -18px 0 60px rgba(0, 0, 0, 0.42);
    transform: translateX(103%);
    transition: transform 180ms ease;
  }
  .wb-inspector.is-open { transform: translateX(0); }
}
</style>

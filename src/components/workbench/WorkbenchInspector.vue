<template>
  <aside class="inspector" :class="{ 'is-open': open }" aria-label="任务上下文面板">
    <header class="inspector-header">
      <div>
        <strong>任务上下文</strong>
        <small>仅显示本次会话的真实数据</small>
      </div>
      <button type="button" aria-label="关闭上下文面板" @click="emit('close')">
        <workbench-icon name="close" :size="16" />
      </button>
    </header>

    <div class="inspector-tabs" role="tablist" aria-label="上下文分类">
      <button
        v-for="tab in tabs"
        :id="`inspector-tab-${tab.id}`"
        :key="tab.id"
        type="button"
        role="tab"
        :aria-selected="activeTab === tab.id ? 'true' : 'false'"
        :aria-controls="`inspector-panel-${tab.id}`"
        :class="{ 'is-active': activeTab === tab.id }"
        :title="tab.label"
        @click="selectTab(tab.id)"
      >
        <workbench-icon :name="tab.icon" :size="14" />
        <span>{{ tab.label }}</span>
        <i v-if="tab.count != null">{{ tab.count }}</i>
      </button>
    </div>

    <div class="inspector-scroll">
      <div
        v-if="activeTab === 'plan'"
        id="inspector-panel-plan"
        role="tabpanel"
        aria-labelledby="inspector-tab-plan"
      >
        <section class="inspector-section run-section">
          <div class="section-title"><strong>当前任务</strong><span class="status-chip" :class="`is-${inspector.run.tone}`"><i></i>{{ inspector.run.statusLabel }}</span></div>
          <dl>
            <div><dt>会话</dt><dd :title="inspector.run.id">{{ shortId }}</dd></div>
            <div><dt>开始</dt><dd>{{ formatTime(inspector.run.startedAt) || '—' }}</dd></div>
            <div><dt>更新</dt><dd>{{ formatTime(inspector.run.updatedAt) || '—' }}</dd></div>
          </dl>
        </section>

        <section class="inspector-section">
          <div class="section-title"><strong>执行计划</strong><span>{{ plan.length }}</span></div>
          <p v-if="planExplanation" class="plan-explanation">{{ planExplanation }}</p>
          <ol v-if="plan.length" class="inspector-plan">
            <li v-for="(item, index) in plan" :key="item.id" :class="`is-${item.status}`">
              <span class="plan-index">
                <workbench-icon v-if="item.status === 'completed'" name="check" :size="11" />
                <i v-else></i>
              </span>
              <div><strong>{{ item.label }}</strong><small>{{ planStatus(item.status) }}</small></div>
              <span>{{ String(index + 1).padStart(2, '0') }}</span>
            </li>
          </ol>
          <div v-else class="compact-empty"><workbench-icon name="list" :size="17" /><p>Agent 选择工具后，计划会在这里出现。</p></div>
        </section>

        <details class="inspector-section context-section" open>
          <summary><strong>运行上下文</strong><span>{{ contextRows.length }}</span><workbench-icon name="chevron-down" :size="12" /></summary>
          <div v-if="contextRows.length" class="context-list">
            <div v-for="row in contextRows" :key="row.key"><span>{{ row.key }}</span><strong :title="row.value">{{ row.value }}</strong></div>
          </div>
          <p v-else class="empty-copy">暂无额外上下文。</p>
        </details>

        <details class="inspector-section context-section">
          <summary><strong>模型用量</strong><span>{{ usageUnavailable ? '未上报' : '已上报' }}</span><workbench-icon name="chevron-down" :size="12" /></summary>
          <div class="usage-grid">
            <div><span>输入 Token</span><strong>{{ usageValue(inspector.usage.inputTokens) }}</strong></div>
            <div><span>输出 Token</span><strong>{{ usageValue(inspector.usage.outputTokens) }}</strong></div>
            <div><span>费用</span><strong>{{ costValue }}</strong></div>
          </div>
        </details>
      </div>

      <section
        v-else-if="activeTab === 'changes'"
        id="inspector-panel-changes"
        role="tabpanel"
        aria-labelledby="inspector-tab-changes"
        class="inspector-section tab-panel"
      >
        <div class="section-title"><strong>文件变更</strong><span>{{ inspector.files.length }}</span></div>
        <div v-if="inspector.files.length" class="file-list">
          <details v-for="file in inspector.files" :key="file.id">
            <summary>
              <span class="file-state" :class="`is-${file.status}`">{{ fileStatus(file.status) }}</span>
              <div><strong :title="file.path">{{ file.path }}</strong><small>{{ operationLabel(file.operation) }} · +{{ file.additions }} −{{ file.deletions }}</small></div>
              <workbench-icon name="chevron-down" :size="12" />
            </summary>
            <div v-if="file.hunks.length" class="diff-hunks">
              <section v-for="(hunk, hunkIndex) in file.hunks" :key="`${file.id}-hunk-${hunkIndex}`">
                <header>@@ 第 {{ hunk.startLine }} 行</header>
                <pre><span v-for="(line, lineIndex) in hunk.oldLines" :key="`old-${lineIndex}`" class="is-removed"><i>−</i><code>{{ line }}</code></span><span v-for="(line, lineIndex) in hunk.newLines" :key="`new-${lineIndex}`" class="is-added"><i>+</i><code>{{ line }}</code></span></pre>
              </section>
            </div>
            <p v-else class="diff-unavailable">此条记录没有可展示的逐行差异。</p>
            <footer v-if="file.rollback">回滚记录：{{ rollbackLabel(file.rollback) }}</footer>
          </details>
        </div>
        <div v-else class="panel-empty"><span><workbench-icon name="git-diff" :size="19" /></span><strong>没有文件变更</strong><p>Agent 成功应用补丁或写入文件后会在这里显示。</p></div>
      </section>

      <section
        v-else-if="activeTab === 'terminal'"
        id="inspector-panel-terminal"
        role="tabpanel"
        aria-labelledby="inspector-tab-terminal"
        class="inspector-section tab-panel"
      >
        <div class="section-title"><strong>终端记录</strong><span>{{ terminalRows.length }}</span></div>
        <div v-if="terminalRows.length" class="terminal-list">
          <details v-for="row in terminalRows" :key="row.id" :open="row.tone === 'error'">
            <summary>
              <span><workbench-icon name="terminal" :size="13" /></span>
              <code>{{ row.command ? `$ ${row.command}` : row.title }}</code>
              <i :class="`is-${row.tone}`"></i>
            </summary>
            <pre v-if="row.output">{{ row.output }}</pre>
            <p v-else>没有保留终端输出。</p>
          </details>
        </div>
        <div v-else class="panel-empty"><span><workbench-icon name="terminal" :size="19" /></span><strong>没有终端记录</strong><p>Agent 运行命令后，真实输出会出现在这里。</p></div>
      </section>

      <section
        v-else
        id="inspector-panel-artifacts"
        role="tabpanel"
        aria-labelledby="inspector-tab-artifacts"
        class="inspector-section tab-panel"
      >
        <div class="section-title"><strong>任务产物</strong><span>{{ inspector.artifacts.length }}</span></div>
        <div v-if="inspector.artifacts.length" class="artifact-list">
          <button v-for="artifact in inspector.artifacts" :key="artifact.id" type="button" :disabled="!artifact.url" @click="emit('artifact-select', artifact)">
            <img v-if="artifact.kind === 'image' && artifact.url" :src="artifact.url" :alt="artifact.label" />
            <video v-else-if="artifact.kind === 'video' && artifact.url" :src="artifact.url" muted></video>
            <span v-else><workbench-icon :name="artifact.kind === 'video' ? 'video' : artifact.kind === 'image' ? 'image' : 'file'" :size="17" /></span>
            <div><strong>{{ artifact.label }}</strong><small>{{ artifact.isFinal ? '最终交付' : artifact.status.label }}</small></div>
            <workbench-icon name="chevron-right" :size="12" />
          </button>
        </div>
        <div v-else class="panel-empty"><span><workbench-icon name="box" :size="19" /></span><strong>还没有产物</strong><p>截图、图片或视频生成后会出现在这里。</p></div>
      </section>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { buildWorkbenchActivities, buildWorkbenchInspector, buildWorkbenchPlan, formatWorkbenchTime } from './workbenchView.js'
import WorkbenchIcon from './WorkbenchIcon.vue'

defineOptions({ name: 'WorkbenchInspector' })

const props = defineProps({
  snapshot: { type: Object, default: () => ({}) },
  artifacts: { type: Array, default: () => [] },
  activities: { type: Array, default: () => [] },
  context: { type: Object, default: () => ({}) },
  fileChanges: { type: Array, default: () => [] },
  usage: { type: Object, default: () => ({}) },
  open: { type: Boolean, default: true },
  activeTab: { type: String, default: 'plan' }
})

const emit = defineEmits({
  close: () => true,
  'update:activeTab': value => ['plan', 'changes', 'terminal', 'artifacts'].includes(value),
  'artifact-select': value => !!value && typeof value === 'object'
})

const normalizedActivities = computed(() => buildWorkbenchActivities(props.snapshot, props.activities))
const plan = computed(() => buildWorkbenchPlan(props.snapshot, normalizedActivities.value))
const planExplanation = computed(() => String(props.snapshot?.plan?.explanation || '').trim())
const terminalRows = computed(() => normalizedActivities.value.filter(item => item.kind === 'terminal'))
const inspector = computed(() => buildWorkbenchInspector({
  snapshot: props.snapshot,
  artifacts: props.artifacts,
  context: props.context,
  fileChanges: props.fileChanges,
  usage: props.usage
}))
const tabs = computed(() => [
  { id: 'plan', label: '计划', icon: 'list', count: plan.value.length },
  { id: 'changes', label: '变更', icon: 'git-diff', count: inspector.value.files.length },
  { id: 'terminal', label: '终端', icon: 'terminal', count: terminalRows.value.length },
  { id: 'artifacts', label: '产物', icon: 'box', count: inspector.value.artifacts.length }
])
const contextRows = computed(() => Object.entries(inspector.value.context).slice(0, 30).map(([key, value]) => ({
  key,
  value: typeof value === 'string' ? value : JSON.stringify(value)
})))
const shortId = computed(() => inspector.value.run.id ? `${inspector.value.run.id.slice(0, 12)}…` : '尚未开始')
const usageUnavailable = computed(() => [inspector.value.usage.inputTokens, inspector.value.usage.outputTokens, inspector.value.usage.cost].every(value => value == null))
const costValue = computed(() => inspector.value.usage.cost == null
  ? '未上报'
  : `${inspector.value.usage.currency === 'CNY' ? '¥' : `${inspector.value.usage.currency} `}${inspector.value.usage.cost.toFixed(4)}`)

const selectTab = value => emit('update:activeTab', value)
const usageValue = value => value == null ? '未上报' : value.toLocaleString()
const formatTime = value => formatWorkbenchTime(value)
const planStatus = value => ({ planned: '待执行', running: '执行中', completed: '已完成', failed: '失败' })[value] || value
const fileStatus = value => ({ created: 'A', modified: 'M', deleted: 'D' })[value] || 'M'
const operationLabel = value => ({ apply: '应用补丁', revert: '回滚补丁', write: '写入文件' })[value] || '文件变更'
const rollbackLabel = rollback => ({
  conditional: '可在条件满足时回滚',
  available: '可回滚',
  unavailable: '不可回滚',
  expired: '已过期'
})[rollback?.state] || String(rollback?.state || '已记录')
</script>

<style scoped>
.inspector { display: grid; grid-template-rows: auto auto minmax(0,1fr); min-width: 0; height: 100%; overflow: hidden; border-left: 1px solid var(--wb-border); color: var(--wb-text); background: #111315; }
.inspector-header { display: flex; min-height: 51px; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 1px solid var(--wb-border); padding: 8px 10px 8px 12px; }
.inspector-header strong,
.inspector-header small { display: block; }
.inspector-header strong { color: #d8dcda; font-size: 13px; font-weight: 650; }
.inspector-header small { margin-top: 2px; color: #626869; font-size: 11px; }
.inspector-header button { display: grid; width: 27px; height: 27px; place-items: center; border: 1px solid transparent; border-radius: 7px; color: #747a7a; }
.inspector-header button:hover { border-color: #343839; color: #dce0de; background: #222527; }
.inspector-tabs { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 2px; border-bottom: 1px solid var(--wb-border); padding: 5px; }
.inspector-tabs button { display: flex; min-width: 0; height: 36px; align-items: center; justify-content: center; gap: 4px; border-radius: 7px; color: #6f7576; font-size: 11px; }
.inspector-tabs button:hover { color: #afb4b2; background: #1c1f21; }
.inspector-tabs button.is-active { color: #d9dddb; background: #25282a; box-shadow: inset 0 0 0 1px #303436; }
.inspector-tabs button i { display: grid; min-width: 16px; height: 16px; place-items: center; border-radius: 999px; color: #666c6c; background: #303435; font-size: 10px; font-style: normal; }
.inspector-scroll { min-height: 0; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #343839 transparent; }
.inspector-section { border-bottom: 1px solid #272b2c; padding: 11px; }
.section-title { display: flex; min-height: 22px; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 7px; }
.section-title > strong { color: #9da3a1; font-size: 11px; font-weight: 730; letter-spacing: .06em; text-transform: uppercase; }
.section-title > span:not(.status-chip) { color: #626869; font-size: 11px; }
.status-chip { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #303536; border-radius: 999px; padding: 3px 7px; color: #7e8483; background: #1d2022; font-size: 10px; }
.status-chip i { width: 5px; height: 5px; border-radius: 50%; background: #6d7373; }
.status-chip.is-running i { background: #6eb8e2; }
.status-chip.is-success i { background: #6dca9a; }
.status-chip.is-error i { background: #df7777; }
.run-section dl { display: grid; gap: 1px; margin: 0; }
.run-section dl > div { display: grid; grid-template-columns: 55px minmax(0,1fr); gap: 7px; border-radius: 5px; padding: 5px 6px; }
.run-section dl > div:nth-child(odd) { background: #181b1d; }
.run-section dt { color: #63696a; font-size: 11px; }
.run-section dd { overflow: hidden; margin: 0; color: #a1a7a5; font: 11px ui-monospace,SFMono-Regular,Menlo,monospace; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.inspector-plan { display: grid; gap: 2px; list-style: none; }
.plan-explanation { margin: -1px 0 8px; color: #747b79; font-size: 11px; line-height: 1.5; }
.inspector-plan li { display: grid; grid-template-columns: 20px minmax(0,1fr) auto; align-items: center; gap: 7px; border-radius: 6px; padding: 6px; color: #838987; }
.inspector-plan li.is-running { background: #1d2427; }
.inspector-plan li.is-completed { color: #71817a; }
.plan-index { display: grid; width: 18px; height: 18px; place-items: center; color: #70c99a; }
.plan-index i { width: 6px; height: 6px; border: 1px solid #596061; border-radius: 50%; }
.is-running .plan-index i { border-color: #72b7dd; background: #72b7dd; }
.inspector-plan strong,
.inspector-plan small { display: block; }
.inspector-plan strong { overflow: hidden; color: inherit; font-size: 11.5px; font-weight: 570; text-overflow: ellipsis; white-space: nowrap; }
.inspector-plan small { margin-top: 2px; color: #616768; font-size: 10px; }
.inspector-plan li > span:last-child { color: #53595a; font: 10px ui-monospace,SFMono-Regular,Menlo,monospace; }
.compact-empty { display: flex; align-items: center; gap: 8px; border: 1px dashed #303536; border-radius: 7px; padding: 9px; color: #626869; }
.compact-empty p { margin: 0; font-size: 11px; line-height: 1.45; }
.context-section { padding: 0; }
.context-section summary { display: grid; grid-template-columns: minmax(0,1fr) auto 16px; min-height: 40px; align-items: center; gap: 6px; padding: 0 11px; color: #777d7c; cursor: pointer; list-style: none; }
.context-section summary::-webkit-details-marker { display: none; }
.context-section summary strong { color: #999f9d; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; }
.context-section summary span { font-size: 10px; }
.context-section summary svg { transition: transform 140ms ease; }
.context-section[open] summary svg { transform: rotate(180deg); }
.context-list,
.usage-grid { display: grid; gap: 2px; padding: 0 11px 11px; }
.context-list > div,
.usage-grid > div { display: grid; grid-template-columns: minmax(0,.8fr) minmax(0,1.2fr); gap: 7px; border-radius: 5px; padding: 5px 6px; background: #181b1d; }
.context-list span,
.usage-grid span { overflow: hidden; color: #626869; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.context-list strong,
.usage-grid strong { overflow: hidden; color: #9da3a1; font-size: 11px; font-weight: 560; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.empty-copy { margin: 0; padding: 0 11px 11px; color: #626869; font-size: 11px; }
.tab-panel { min-height: calc(100vh - 103px); border-bottom: 0; }
.file-list,
.terminal-list,
.artifact-list { display: grid; gap: 4px; }
.file-list details { overflow: hidden; border: 1px solid #292d2f; border-radius: 7px; background: #171a1c; }
.file-list summary { display: grid; grid-template-columns: 23px minmax(0,1fr) 14px; align-items: center; gap: 7px; padding: 6px; cursor: pointer; list-style: none; }
.file-list summary::-webkit-details-marker { display: none; }
.file-list summary > svg { color: #5f6665; transition: transform 140ms ease; }
.file-list details[open] summary > svg { transform: rotate(180deg); }
.file-state { display: grid; width: 22px; height: 22px; place-items: center; border-radius: 5px; color: #9fd9b9; background: #203029; font-size: 10px; font-weight: 800; }
.file-state.is-deleted { color: #e09292; background: #322124; }
.file-list summary > div { min-width: 0; }
.file-list strong,
.file-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-list strong { color: #aeb4b1; font: 11px ui-monospace,SFMono-Regular,Menlo,monospace; }
.file-list small { margin-top: 2px; color: #616768; font-size: 10px; }
.diff-hunks { display: grid; gap: 1px; border-top: 1px solid #292d2f; background: #111314; }
.diff-hunks section + section { border-top: 1px solid #292d2f; }
.diff-hunks header { padding: 4px 8px; color: #667b8b; background: #151b1f; font: 10px ui-monospace,SFMono-Regular,Menlo,monospace; }
.diff-hunks pre { overflow: auto; max-height: 240px; margin: 0; padding: 4px 0; }
.diff-hunks pre span { display: grid; grid-template-columns: 20px minmax(max-content,1fr); min-height: 19px; align-items: start; padding: 1px 7px 1px 2px; font: 11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace; }
.diff-hunks pre span.is-removed { color: #c99393; background: rgba(112,48,51,.15); }
.diff-hunks pre span.is-added { color: #8fc1a4; background: rgba(45,96,69,.16); }
.diff-hunks i { color: inherit; font-style: normal; text-align: center; user-select: none; }
.diff-hunks code { font: inherit; white-space: pre; }
.diff-unavailable,
.file-list footer { margin: 0; border-top: 1px solid #292d2f; padding: 7px 8px; color: #656c6b; font-size: 10.5px; line-height: 1.45; }
.file-list footer { color: #718079; background: #151a17; }
.terminal-list details { overflow: hidden; border: 1px solid #292d2f; border-radius: 7px; background: #111315; }
.terminal-list summary { display: grid; grid-template-columns: 21px minmax(0,1fr) 8px; min-height: 34px; align-items: center; gap: 6px; padding: 5px 7px; cursor: pointer; list-style: none; }
.terminal-list summary::-webkit-details-marker { display: none; }
.terminal-list summary > span { display: grid; width: 20px; height: 20px; place-items: center; color: #828987; }
.terminal-list code { overflow: hidden; color: #a9b0ac; font: 11px ui-monospace,SFMono-Regular,Menlo,monospace; text-overflow: ellipsis; white-space: nowrap; }
.terminal-list summary i { width: 5px; height: 5px; border-radius: 50%; background: #777d7d; }
.terminal-list summary i.is-success { background: #6ec99a; }
.terminal-list summary i.is-error { background: #df7777; }
.terminal-list pre,
.terminal-list details > p { overflow: auto; max-height: 260px; margin: 0; border-top: 1px solid #262a2b; padding: 9px; color: #8f9894; font: 11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace; white-space: pre-wrap; }
.artifact-list button { display: grid; grid-template-columns: 43px minmax(0,1fr) 15px; align-items: center; gap: 7px; overflow: hidden; border: 1px solid #292d2f; border-radius: 7px; color: #adb2b0; background: #181b1d; text-align: left; }
.artifact-list button:not(:disabled):hover { border-color: #414748; background: #1d2022; }
.artifact-list img,
.artifact-list video,
.artifact-list button > span { display: grid; width: 43px; height: 39px; place-items: center; object-fit: cover; color: #6d7473; background: #222527; }
.artifact-list button > div { min-width: 0; }
.artifact-list strong,
.artifact-list small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.artifact-list strong { font-size: 11.5px; }
.artifact-list small { margin-top: 2px; color: #626869; font-size: 10px; }
.artifact-list button > svg { color: #555b5c; }
.panel-empty { display: flex; min-height: 260px; flex-direction: column; align-items: center; justify-content: center; color: #555b5c; text-align: center; }
.panel-empty > span { display: grid; width: 38px; height: 38px; place-items: center; border: 1px solid #2f3435; border-radius: 9px; background: #181b1d; }
.panel-empty strong { margin-top: 10px; color: #878d8b; font-size: 12px; }
.panel-empty p { max-width: 220px; margin: 4px 0 0; color: #5e6465; font-size: 11px; line-height: 1.5; }

@media (min-width: 1161px) {
  .inspector:not(.is-open) { display: none; }
}

@media (max-width: 1160px) {
  .inspector { position: fixed; z-index: 65; inset: 0 0 0 auto; width: min(350px,92vw); visibility: hidden; pointer-events: none; box-shadow: -18px 0 60px rgba(0,0,0,.45); transform: translateX(103%); transition: transform 170ms ease, visibility 0s linear 170ms; }
  .inspector.is-open { visibility: visible; pointer-events: auto; transform: translateX(0); transition-delay: 0s; }
}
</style>

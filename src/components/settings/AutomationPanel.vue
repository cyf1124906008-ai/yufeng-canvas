<template>
  <div class="automation-panel" :aria-busy="busy ? 'true' : 'false'">
    <header class="automation-header">
      <div>
        <span>AUTOMATIONS</span>
        <strong>本地计划任务</strong>
        <p>到点后由当前 App 调度 Agent；App 退出时不会在后台运行。</p>
      </div>
      <button type="button" class="create-button" :disabled="busy || !desktopReady || formOpen" @click="openCreate">
        <workbench-icon name="plus" :size="14" />新建自动化
      </button>
    </header>

    <p v-if="!desktopReady" class="desktop-notice">
        <workbench-icon name="monitor" :size="14" />自动化需要 DataEyes Code Desktop App；Web 预览只能查看界面。
    </p>
    <p v-else-if="!workspaceRoot" class="desktop-notice is-warning">
      <workbench-icon name="alert" :size="14" />当前没有可用工作区。桌面 App 会自动创建默认工作区；你仍可创建不绑定工作区的自动化。
    </p>

    <form v-if="formOpen" class="automation-form" @submit.prevent="submitForm">
      <header>
        <div>
          <span>{{ editingId ? 'EDIT AUTOMATION' : 'NEW AUTOMATION' }}</span>
          <strong>{{ editingId ? '编辑计划任务' : '创建计划任务' }}</strong>
        </div>
        <button type="button" aria-label="关闭表单" :disabled="busy" @click="closeForm"><workbench-icon name="close" :size="15" /></button>
      </header>

      <div class="form-scroll">
        <label class="field">
          <span>名称</span>
          <input v-model="draft.name" type="text" maxlength="100" autocomplete="off" placeholder="例如：每天检查项目测试" :disabled="formLocked" />
          <small v-if="validation.errors.name" class="field-error">{{ validation.errors.name }}</small>
        </label>

        <label class="field">
          <span>任务说明</span>
          <textarea v-model="draft.prompt" rows="5" maxlength="12000" placeholder="明确写出 Agent 要检查、执行和交付的结果…" :disabled="formLocked"></textarea>
          <small :class="{ 'field-error': validation.errors.prompt }">{{ validation.errors.prompt || `${draft.prompt.length.toLocaleString('zh-CN')} / 12,000` }}</small>
        </label>

        <fieldset class="form-section">
          <legend>运行计划</legend>
          <div class="schedule-types" role="radiogroup" aria-label="运行计划类型">
            <button v-for="option in scheduleTypes" :key="option.id" type="button" role="radio" :aria-checked="draft.scheduleType === option.id" :class="{ 'is-selected': draft.scheduleType === option.id }" :disabled="formLocked" @click="draft.scheduleType = option.id">
              <strong>{{ option.label }}</strong><small>{{ option.description }}</small>
            </button>
          </div>

          <label v-if="draft.scheduleType === 'interval'" class="field inline-field">
            <span>运行间隔</span>
            <span class="input-suffix"><input v-model.number="draft.intervalMinutes" type="number" min="5" max="43200" step="1" :disabled="formLocked" /><em>分钟</em></span>
          </label>
          <label v-else class="field inline-field">
            <span>本地时间</span>
            <input v-model="draft.time" type="time" :disabled="formLocked" />
          </label>

          <div v-if="draft.scheduleType === 'weekly'" class="weekday-field">
            <span>重复日期</span>
            <div aria-label="每周运行日期">
              <button v-for="day in weekdays" :key="day.id" type="button" :aria-pressed="draft.days.includes(day.id)" :class="{ 'is-selected': draft.days.includes(day.id) }" :disabled="formLocked" :title="day.label" @click="toggleDay(day.id)">{{ day.short }}</button>
            </div>
          </div>
          <small v-if="validation.errors.schedule" class="field-error schedule-error">{{ validation.errors.schedule }}</small>
        </fieldset>

        <fieldset class="form-section approval-section">
          <legend>执行模式</legend>
          <p>审批模式只控制工具门；计划任务仍会调用当前聊天模型进行规划。</p>
          <div class="approval-options" role="radiogroup" aria-label="自动化执行模式">
            <button v-for="mode in approvalModes" :key="mode.id" type="button" role="radio" :aria-checked="draft.approvalMode === mode.id" :class="[`is-${mode.id}`, { 'is-selected': draft.approvalMode === mode.id }]" :disabled="formLocked" @click="draft.approvalMode = mode.id">
              <span><i></i><strong>{{ mode.label }}</strong></span><small>{{ mode.description }}</small>
            </button>
          </div>
          <p v-if="draft.approvalMode === 'auto'" class="auto-warning">
            <workbench-icon name="alert" :size="14" />
            <span><strong>自动授权仅在本次 App 启动期间有效。</strong>可能直接产生创作模型费用；本机高风险操作仍会显示 Electron 原生确认。</span>
          </p>
        </fieldset>

        <section class="form-section behavior-section">
          <div class="form-toggle-row">
            <div><strong>绑定当前工作区</strong><p>{{ draft.bindWorkspace ? (draft.workspaceRoot || '默认工作区正在初始化') : '不向任务提供工作区目录' }}</p></div>
            <button type="button" class="switch" role="switch" :aria-checked="draft.bindWorkspace" :class="{ 'is-on': draft.bindWorkspace }" :disabled="formLocked || !workspaceRoot" @click="toggleWorkspaceBinding"><i></i></button>
          </div>
          <small v-if="validation.errors.workspaceRoot" class="field-error">{{ validation.errors.workspaceRoot }}</small>
          <div class="form-toggle-row">
            <div><strong>创建后启用</strong><p>关闭时保存计划，但不会进入调度队列。</p></div>
            <button type="button" class="switch" role="switch" :aria-checked="draft.enabled" :class="{ 'is-on': draft.enabled }" :disabled="formLocked" @click="draft.enabled = !draft.enabled"><i></i></button>
          </div>
        </section>

        <p v-if="editingActive" class="active-edit-notice"><workbench-icon name="loader" :size="14" />这条自动化正在运行，当前内容不可修改。</p>
      </div>

      <footer>
        <button type="button" class="cancel-button" :disabled="busy" @click="closeForm">取消</button>
        <button type="submit" class="save-button" :disabled="formLocked || !validation.valid || !desktopReady">
          {{ busy ? '处理中…' : (editingId ? '保存修改' : '创建自动化') }}
        </button>
      </footer>
    </form>

    <div v-if="normalizedAutomations.length" class="automation-list">
      <article v-for="automation in normalizedAutomations" :key="automation.id" class="automation-card" :class="{ 'is-disabled': !automation.enabled, 'is-active-run': automation.active }">
        <header>
          <button type="button" class="switch" role="switch" :aria-label="`${automation.enabled ? '暂停' : '启用'} ${automation.name}`" :aria-checked="automation.enabled" :class="{ 'is-on': automation.enabled }" :disabled="busy || automation.active || !desktopReady" @click="emit('toggle', automation.id, !automation.enabled)"><i></i></button>
          <div class="automation-title">
            <strong>{{ automation.name }}</strong>
            <p>{{ automation.prompt }}</p>
          </div>
          <span class="status-pill" :class="`is-${automation.status.tone}`"><i></i>{{ automation.active ? '当前' : '上次' }} · {{ automation.status.label }}</span>
        </header>

        <div class="automation-meta">
          <span><workbench-icon name="automation" :size="13" /><strong>{{ automation.scheduleLabel }}</strong></span>
          <span><workbench-icon name="history" :size="13" />下次：{{ automation.nextRunLabel }}</span>
          <span><workbench-icon name="shield" :size="13" />{{ automation.approvalLabel }}</span>
          <span :title="automation.workspaceRoot"><workbench-icon name="folder" :size="13" />{{ automation.workspaceLabel }}</span>
        </div>

        <details class="run-history">
          <summary>
            <span>最近运行记录</span>
            <small>{{ automation.runs.length ? `${automation.runs.length} 条` : '暂无' }}</small>
            <workbench-icon name="chevron-down" :size="13" />
          </summary>
          <div v-if="automation.runs.length">
            <div v-for="run in automation.runs" :key="run.id" class="run-row">
              <i :class="`is-${run.status.tone}`"></i>
              <span><strong>{{ run.status.label }}</strong><small>{{ run.timeLabel }}</small></span>
              <code v-if="run.error">{{ run.error }}</code>
            </div>
          </div>
          <p v-else>运行后会在这里显示状态和时间。</p>
        </details>

        <footer>
          <span v-if="automation.active" class="active-note"><workbench-icon name="loader" :size="13" />活动运行期间不能编辑、暂停或删除</span>
          <span v-else-if="!automation.enabled" class="paused-note">已暂停，不会自动运行</span>
          <span v-else></span>
          <button type="button" :disabled="busy || automation.active || !desktopReady" @click="openEdit(automation.raw)">编辑</button>
          <button type="button" class="run-button" :disabled="busy || automation.active || !automation.enabled || !desktopReady" @click="emit('run-now', automation.id)">
            <workbench-icon name="send" :size="12" />立即运行
          </button>
          <template v-if="deleteCandidateId === automation.id">
            <button type="button" :disabled="busy" @click="deleteCandidateId = ''">取消</button>
            <button type="button" class="confirm-delete" :disabled="busy" @click="confirmDelete(automation)">确认删除</button>
          </template>
          <button v-else type="button" class="delete-button" :disabled="busy || automation.active" @click="deleteCandidateId = automation.id">删除</button>
        </footer>
      </article>
    </div>

    <section v-else-if="!formOpen" class="automation-empty">
      <span><workbench-icon name="automation" :size="22" /></span>
      <strong>还没有计划任务</strong>
      <p>创建后，App 会按本机时间调度 Agent。退出 App 会停止调度。</p>
      <button type="button" :disabled="busy || !desktopReady" @click="openCreate">创建第一条自动化</button>
    </section>
  </div>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import {
  AUTOMATION_WEEKDAYS,
  automationApprovalLabel,
  automationDraftFromRecord,
  automationIsActive,
  automationPayloadFromDraft,
  automationScheduleView,
  automationStatusView,
  automationWorkspaceLabel,
  createAutomationDraft,
  formatAutomationDateTime,
  validateAutomationDraft
} from './automationPanelView.js'

defineOptions({ name: 'AutomationPanel' })

const props = defineProps({
  automations: { type: Array, default: () => [] },
  workspaceRoot: { type: String, default: '' },
  busy: { type: Boolean, default: false },
  desktopReady: { type: Boolean, default: false }
})

const emit = defineEmits({
  create: payload => payload && typeof payload === 'object',
  update: (id, payload) => typeof id === 'string' && !!id && payload && typeof payload === 'object',
  delete: id => typeof id === 'string' && !!id,
  toggle: (id, enabled) => typeof id === 'string' && !!id && typeof enabled === 'boolean',
  'run-now': id => typeof id === 'string' && !!id
})

const weekdays = AUTOMATION_WEEKDAYS
const scheduleTypes = [
  { id: 'interval', label: '间隔', description: '至少 5 分钟' },
  { id: 'daily', label: '每天', description: '按本机时间' },
  { id: 'weekly', label: '每周', description: '选择星期' }
]
const approvalModes = [
  { id: 'read_only', label: '只读', description: '仅开放安全读取工具；聊天模型仍可能计费。' },
  { id: 'ask', label: '每次审批', description: '高风险工具及创作模型调用需要批准。' },
  { id: 'auto', label: '自动执行', description: '连续执行工具；本机高风险仍原生确认。' }
]

const formOpen = ref(false)
const editingId = ref('')
const deleteCandidateId = ref('')
const draft = reactive(createAutomationDraft(props.workspaceRoot))

const validation = computed(() => validateAutomationDraft(draft))
const editingRecord = computed(() => props.automations.find(item => String(item?.id || '') === editingId.value) || null)
const editingActive = computed(() => Boolean(editingRecord.value && automationIsActive(editingRecord.value)))
const formLocked = computed(() => props.busy || editingActive.value)

const normalizedAutomations = computed(() => (Array.isArray(props.automations) ? props.automations : [])
  .filter(record => record && typeof record === 'object' && String(record.id || '').trim())
  .map(record => {
    const status = automationStatusView(record.lastStatus)
    const runs = (Array.isArray(record.runs) ? record.runs : []).slice(0, 5).map(run => ({
      id: String(run?.id || `${record.id}-${run?.startedAt || run?.scheduledFor || 'run'}`),
      status: automationStatusView(run?.status),
      timeLabel: formatAutomationDateTime(run?.finishedAt || run?.startedAt || run?.scheduledFor, '时间未记录'),
      error: String(run?.error?.message || '').trim().slice(0, 240)
    }))
    return {
      id: String(record.id),
      name: String(record.name || '未命名自动化'),
      prompt: String(record.prompt || '').trim(),
      enabled: record.enabled !== false,
      active: automationIsActive(record),
      status,
      scheduleLabel: automationScheduleView(record.schedule),
      nextRunLabel: record.enabled !== false ? formatAutomationDateTime(record.nextRunAt) : '已暂停',
      approvalLabel: automationApprovalLabel(record.approvalMode),
      workspaceRoot: String(record.workspaceRoot || ''),
      workspaceLabel: automationWorkspaceLabel(record.workspaceRoot),
      runs,
      raw: record
    }
  }))

const replaceDraft = value => {
  Object.assign(draft, value)
  draft.days = [...(value.days || [])]
}

const openCreate = () => {
  if (props.busy || !props.desktopReady) return
  editingId.value = ''
  deleteCandidateId.value = ''
  replaceDraft(createAutomationDraft(props.workspaceRoot))
  formOpen.value = true
}

const openEdit = record => {
  if (props.busy || automationIsActive(record)) return
  editingId.value = String(record?.id || '')
  deleteCandidateId.value = ''
  replaceDraft(automationDraftFromRecord(record, props.workspaceRoot))
  formOpen.value = Boolean(editingId.value)
}

const closeForm = () => {
  if (props.busy) return
  formOpen.value = false
  editingId.value = ''
}

const toggleDay = day => {
  if (formLocked.value) return
  draft.days = draft.days.includes(day)
    ? draft.days.filter(value => value !== day)
    : [...draft.days, day].sort((left, right) => left - right)
}

const toggleWorkspaceBinding = () => {
  if (formLocked.value || !props.workspaceRoot) return
  draft.bindWorkspace = !draft.bindWorkspace
  if (draft.bindWorkspace) draft.workspaceRoot = props.workspaceRoot
}

const submitForm = () => {
  if (formLocked.value || !validation.value.valid || !props.desktopReady) return
  const payload = automationPayloadFromDraft(draft)
  if (editingId.value) emit('update', editingId.value, payload)
  else emit('create', payload)
  formOpen.value = false
  editingId.value = ''
}

const confirmDelete = automation => {
  if (props.busy || automation.active || deleteCandidateId.value !== automation.id) return
  emit('delete', automation.id)
  deleteCandidateId.value = ''
}

watch(() => props.automations, records => {
  if (editingId.value && !records.some(item => String(item?.id || '') === editingId.value)) closeForm()
  if (deleteCandidateId.value && !records.some(item => String(item?.id || '') === deleteCandidateId.value)) deleteCandidateId.value = ''
}, { deep: true })
</script>

<style scoped>
.automation-panel { min-height: 300px; color: var(--sc-text,#e5e9e7); background: var(--sc-panel,#1b1e20); }
.automation-header { display: flex; align-items: center; justify-content: space-between; gap: 18px; border-bottom: 1px solid var(--sc-border,#303435); padding: 15px; }
.automation-header > div > span,
.automation-form > header span { display: block; color: #58ad80; font-size: 9px; font-weight: 800; letter-spacing: .1em; }
.automation-header > div > strong,
.automation-form > header strong { display: block; margin-top: 2px; font-size: 13px; }
.automation-header p { margin: 3px 0 0; color: var(--sc-muted,#8a918d); font-size: 10px; }
.create-button { display: inline-flex; min-height: 33px; align-items: center; gap: 6px; border-radius: 7px; padding: 0 10px; color: #153122; background: #a5e5c1; font-size: 10.5px; font-weight: 700; }
.create-button:hover { background: #b7edcf; }
.create-button:disabled { cursor: not-allowed; opacity: .4; }
.desktop-notice { display: flex; align-items: center; gap: 7px; margin: 12px 15px 0; border: 1px solid color-mix(in srgb,#b78b55 34%,var(--sc-border,#303435)); border-radius: 7px; padding: 8px 10px; color: #a98250; background: color-mix(in srgb,#c89a5d 7%,var(--sc-subtle,#181a1c)); font-size: 10px; }
.desktop-notice.is-warning { color: var(--sc-muted,#8a918d); }
.automation-form { margin: 14px; overflow: hidden; border: 1px solid #4b5d53; border-radius: 10px; background: var(--sc-panel,#1b1e20); box-shadow: 0 14px 38px rgba(0,0,0,.12); }
.automation-form > header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--sc-border,#303435); padding: 11px 13px; background: var(--sc-subtle,#181a1c); }
.automation-form > header button { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 6px; color: var(--sc-faint,#646b68); }
.automation-form > header button:hover { color: var(--sc-text,#e5e9e7); background: var(--sc-hover,#25292a); }
.form-scroll { display: grid; gap: 13px; max-height: min(62vh,620px); overflow-y: auto; padding: 14px; scrollbar-width: thin; }
.field { display: grid; gap: 6px; min-width: 0; }
.field > span,
.weekday-field > span { color: var(--sc-muted,#8a918d); font-size: 10px; font-weight: 650; }
.field input,
.field textarea { width: 100%; border: 1px solid var(--sc-border,#303435); border-radius: 7px; outline: 0; padding: 8px 9px; color: var(--sc-text,#e5e9e7); background: var(--sc-subtle,#181a1c); font-size: 11px; }
.field input { height: 34px; }
.field textarea { min-height: 92px; resize: vertical; line-height: 1.55; }
.field input:focus,
.field textarea:focus { border-color: #5fa87f; box-shadow: 0 0 0 2px rgba(102,196,143,.09); }
.field input:disabled,
.field textarea:disabled { opacity: .55; }
.field > small { justify-self: end; color: var(--sc-faint,#646b68); font-size: 9px; }
.field-error { color: #d37474 !important; }
.form-section { min-width: 0; border: 1px solid var(--sc-border,#303435); border-radius: 8px; padding: 11px; }
.form-section legend { padding: 0 5px; color: var(--sc-muted,#8a918d); font-size: 10px; font-weight: 700; }
.schedule-types,
.approval-options { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 6px; }
.schedule-types button,
.approval-options button { min-width: 0; border: 1px solid var(--sc-border,#303435); border-radius: 7px; padding: 8px; color: var(--sc-muted,#8a918d); background: var(--sc-subtle,#181a1c); text-align: left; }
.schedule-types button:hover,
.approval-options button:hover { background: var(--sc-hover,#25292a); }
.schedule-types button.is-selected,
.approval-options button.is-selected { border-color: #67b78b; color: var(--sc-text,#e5e9e7); box-shadow: inset 0 0 0 1px rgba(103,183,139,.2); }
.schedule-types strong,
.schedule-types small,
.approval-options strong,
.approval-options small { display: block; }
.schedule-types strong,
.approval-options strong { font-size: 10.5px; }
.schedule-types small,
.approval-options small { margin-top: 3px; color: var(--sc-faint,#646b68); font-size: 8.5px; line-height: 1.4; }
.inline-field { grid-template-columns: 90px minmax(0,180px); align-items: center; margin-top: 10px; }
.input-suffix { display: grid; grid-template-columns: minmax(0,1fr) 43px; overflow: hidden; border: 1px solid var(--sc-border,#303435); border-radius: 7px; background: var(--sc-subtle,#181a1c); }
.input-suffix input { border: 0; border-radius: 0; }
.input-suffix em { display: grid; place-items: center; border-left: 1px solid var(--sc-border,#303435); color: var(--sc-faint,#646b68); font-size: 9px; font-style: normal; }
.weekday-field { display: grid; grid-template-columns: 90px minmax(0,1fr); align-items: center; margin-top: 10px; }
.weekday-field > div { display: flex; flex-wrap: wrap; gap: 4px; }
.weekday-field button { width: 27px; height: 27px; border: 1px solid var(--sc-border,#303435); border-radius: 6px; color: var(--sc-muted,#8a918d); background: var(--sc-subtle,#181a1c); font-size: 9px; }
.weekday-field button.is-selected { border-color: #64b487; color: #4faa76; background: color-mix(in srgb,#66c48f 9%,var(--sc-subtle,#181a1c)); }
.schedule-error { display: block; margin-top: 7px; font-size: 9px; }
.approval-section > p { margin: -2px 0 9px; color: var(--sc-faint,#646b68); font-size: 9px; }
.approval-options button > span { display: flex; align-items: center; gap: 6px; }
.approval-options button > span i { width: 6px; height: 6px; border-radius: 50%; background: #8a918d; }
.approval-options button.is-ask > span i { background: #d2a35c; }
.approval-options button.is-auto > span i { background: #65c18c; }
.auto-warning { display: flex; align-items: flex-start; gap: 7px; margin: 9px 0 0 !important; border: 1px solid #685231; border-radius: 7px; padding: 8px; color: #bd985d !important; background: #282116; line-height: 1.5; }
.auto-warning svg { flex: 0 0 auto; margin-top: 1px; }
.auto-warning strong { display: block; color: #d5b477; font-size: 9.5px; }
.behavior-section { padding: 0; }
.form-toggle-row { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 15px; min-height: 56px; padding: 9px 11px; }
.form-toggle-row + .form-toggle-row { border-top: 1px solid var(--sc-border,#303435); }
.form-toggle-row strong { font-size: 10.5px; }
.form-toggle-row p { overflow: hidden; margin: 3px 0 0; color: var(--sc-faint,#646b68); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.switch { position: relative; width: 34px; height: 19px; flex: 0 0 auto; border-radius: 999px; background: #454b48; }
.switch i { position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.22); transition: transform 140ms ease; }
.switch.is-on { background: #5bbb85; }
.switch.is-on i { transform: translateX(15px); }
.switch:disabled { cursor: not-allowed; opacity: .4; }
.behavior-section > .field-error { display: block; padding: 0 11px 8px; font-size: 9px; }
.active-edit-notice { display: flex; align-items: center; gap: 6px; border: 1px solid #5b4930; border-radius: 7px; padding: 8px; color: #c39a5e; background: #251f17; font-size: 9.5px; }
.active-edit-notice svg,
.active-note svg { animation: spin 900ms linear infinite; }
.automation-form > footer { display: flex; justify-content: flex-end; gap: 6px; border-top: 1px solid var(--sc-border,#303435); padding: 10px 13px; background: var(--sc-subtle,#181a1c); }
.automation-form > footer button { min-height: 31px; border-radius: 7px; padding: 0 11px; font-size: 10px; }
.cancel-button { color: var(--sc-muted,#8a918d); }
.cancel-button:hover { background: var(--sc-hover,#25292a); }
.save-button { color: #143020; background: #a5e5c1; font-weight: 700; }
.save-button:disabled { cursor: not-allowed; opacity: .35; }
.automation-list { display: grid; gap: 9px; padding: 14px; }
.automation-card { overflow: hidden; border: 1px solid var(--sc-border,#303435); border-radius: 9px; background: var(--sc-subtle,#181a1c); }
.automation-card.is-active-run { border-color: #4b5f53; box-shadow: inset 3px 0 #67bd8c; }
.automation-card.is-disabled { opacity: .72; }
.automation-card > header { display: grid; grid-template-columns: 34px minmax(0,1fr) auto; align-items: start; gap: 9px; padding: 11px 12px 8px; }
.automation-title { min-width: 0; }
.automation-title strong { display: block; overflow: hidden; font-size: 11.5px; text-overflow: ellipsis; white-space: nowrap; }
.automation-title p { display: -webkit-box; overflow: hidden; margin: 4px 0 0; color: var(--sc-muted,#8a918d); font-size: 9.5px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.status-pill { display: inline-flex; height: 23px; align-items: center; gap: 5px; border: 1px solid var(--sc-border,#303435); border-radius: 999px; padding: 0 7px; color: var(--sc-faint,#646b68); font-size: 8.5px; white-space: nowrap; }
.status-pill i { width: 5px; height: 5px; border-radius: 50%; background: #858c88; }
.status-pill.is-running i { background: #6ab6df; animation: pulse 800ms infinite alternate; }
.status-pill.is-queued i { background: #9b8bd2; }
.status-pill.is-approval i { background: #d3a35a; }
.status-pill.is-success i { background: #61c18a; }
.status-pill.is-error i { background: #db7272; }
.automation-meta { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px 12px; border-top: 1px solid var(--sc-border,#303435); padding: 8px 12px; }
.automation-meta span { display: flex; min-width: 0; align-items: center; gap: 6px; overflow: hidden; color: var(--sc-faint,#646b68); font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.automation-meta strong { color: var(--sc-muted,#8a918d); font-weight: 620; }
.run-history { border-top: 1px solid var(--sc-border,#303435); }
.run-history summary { display: grid; grid-template-columns: minmax(0,1fr) auto 15px; align-items: center; gap: 7px; min-height: 32px; padding: 0 12px; color: var(--sc-muted,#8a918d); cursor: pointer; list-style: none; font-size: 9.5px; }
.run-history summary::-webkit-details-marker { display: none; }
.run-history summary small { color: var(--sc-faint,#646b68); font-size: 8.5px; }
.run-history summary svg { transition: transform 140ms ease; }
.run-history[open] summary svg { transform: rotate(180deg); }
.run-history > div,
.run-history > p { border-top: 1px solid var(--sc-border,#303435); padding: 6px 12px; background: var(--sc-panel,#1b1e20); }
.run-history > p { margin: 0; color: var(--sc-faint,#646b68); font-size: 9px; }
.run-row { display: grid; grid-template-columns: 7px minmax(0,1fr) minmax(0,1.25fr); align-items: center; gap: 7px; min-height: 28px; }
.run-row + .run-row { border-top: 1px solid var(--sc-border,#303435); }
.run-row > i { width: 6px; height: 6px; border-radius: 50%; background: #858c88; }
.run-row > i.is-success { background: #61c18a; }
.run-row > i.is-error { background: #db7272; }
.run-row > i.is-running { background: #6ab6df; }
.run-row span strong,
.run-row span small { display: block; }
.run-row span strong { font-size: 9px; }
.run-row span small { margin-top: 2px; color: var(--sc-faint,#646b68); font-size: 8px; }
.run-row code { overflow: hidden; color: #bd7777; font-size: 8px; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.automation-card > footer { display: flex; min-height: 39px; align-items: center; justify-content: flex-end; gap: 4px; border-top: 1px solid var(--sc-border,#303435); padding: 6px 8px 6px 12px; }
.automation-card > footer > span { min-width: 0; flex: 1; color: var(--sc-faint,#646b68); font-size: 8.5px; }
.active-note { display: flex; align-items: center; gap: 5px; color: #b49159 !important; }
.automation-card > footer button { display: inline-flex; min-height: 27px; align-items: center; gap: 4px; border-radius: 6px; padding: 0 7px; color: var(--sc-muted,#8a918d); font-size: 9px; }
.automation-card > footer button:hover { color: var(--sc-text,#e5e9e7); background: var(--sc-hover,#25292a); }
.automation-card > footer button:disabled { cursor: not-allowed; opacity: .32; }
.automation-card > footer .run-button { color: #3e9167; background: color-mix(in srgb,#66c48f 10%,transparent); }
.automation-card > footer .delete-button,
.automation-card > footer .confirm-delete { color: #cc7070; }
.automation-card > footer .confirm-delete { background: color-mix(in srgb,#d77474 12%,transparent); }
.automation-empty { display: flex; min-height: 280px; flex-direction: column; align-items: center; justify-content: center; padding: 30px; text-align: center; }
.automation-empty > span { display: grid; width: 43px; height: 43px; place-items: center; border: 1px solid var(--sc-border,#303435); border-radius: 11px; color: #60b486; background: var(--sc-subtle,#181a1c); }
.automation-empty > strong { margin-top: 12px; font-size: 12px; }
.automation-empty > p { max-width: 380px; margin: 5px 0 0; color: var(--sc-muted,#8a918d); font-size: 9.5px; line-height: 1.55; }
.automation-empty > button { min-height: 31px; margin-top: 13px; border-radius: 7px; padding: 0 10px; color: #153122; background: #a5e5c1; font-size: 10px; font-weight: 700; }
.automation-empty > button:disabled { cursor: not-allowed; opacity: .38; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { to { opacity: .35; } }

@media (max-width: 620px) {
  .automation-header { align-items: flex-start; padding: 12px; }
  .automation-header p { max-width: 220px; }
  .create-button { padding-inline: 8px; }
  .automation-form,
  .automation-list { margin: 10px; }
  .automation-list { padding: 0; }
  .schedule-types,
  .approval-options { grid-template-columns: minmax(0,1fr); }
  .schedule-types button { display: grid; grid-template-columns: 70px minmax(0,1fr); align-items: center; }
  .schedule-types small { margin: 0; }
  .inline-field,
  .weekday-field { grid-template-columns: 72px minmax(0,1fr); }
  .automation-card > header { grid-template-columns: 34px minmax(0,1fr); }
  .status-pill { grid-column: 2; width: max-content; }
  .automation-meta { grid-template-columns: minmax(0,1fr); }
  .automation-card > footer { flex-wrap: wrap; }
  .automation-card > footer > span { flex-basis: 100%; }
  .run-row { grid-template-columns: 7px minmax(0,1fr); }
  .run-row code { grid-column: 2; text-align: left; }
}
</style>

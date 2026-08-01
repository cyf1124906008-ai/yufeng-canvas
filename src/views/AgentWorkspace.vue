<template>
  <main class="agent-workbench" :class="{ 'inspector-open': inspectorOpen }">
    <workbench-sidebar
      :records="historyRecords"
      :selected-id="workbench.selectedSessionId.value"
      :loading="false"
      :provider="providerLabel"
      :workspaces="workspaces"
      :active-workspace-id="workspace.id"
      :new-task-disabled="workbench.isRunning.value || workbench.isAwaitingApproval.value"
      :open="navigationOpen"
      @new-task="newTask"
      @select-history="selectHistory"
      @delete-history="confirmDeleteHistory"
      @clear-history="confirmClearHistory"
      @select-workspace="selectWorkspace"
      @open-settings="showSettings = true"
      @close="navigationOpen = false"
    />

    <section class="workbench-center">
      <workbench-activity-feed
        :snapshot="displaySnapshot"
        :artifacts="displayArtifacts"
        :injected-activities="workbenchActivities"
        :mode="sessionMode"
        :loading="false"
        :read-only="workbench.isHistorySelection.value"
        :suggestions="suggestions"
        @open-navigation="navigationOpen = true"
        @toggle-inspector="inspectorOpen = !inspectorOpen"
        @apply-suggestion="applySuggestion"
        @reuse-goal="reuseHistoricalGoal"
        @artifact-select="selectArtifact"
        @approval="handleApproval"
      />

      <workbench-composer
        v-model="goal"
        :running="workbench.isRunning.value"
        :disabled="workbench.isAwaitingApproval.value || workbench.isHistorySelection.value"
        :placeholder="composerPlaceholder"
        :tools="toolShortcuts"
        :selected-tool="selectedTool"
        :model-label="selectedModelLabel"
        :autofocus-token="composerFocusToken"
        @submit="submit"
        @stop="cancel"
        @select-tool="selectTool"
        @open-settings="showSettings = true"
      />
    </section>

    <workbench-inspector
      :snapshot="displaySnapshot"
      :artifacts="displayArtifacts"
      :context="sessionContext"
      :file-changes="fileChanges"
      :usage="usage"
      :open="inspectorOpen"
      @close="inspectorOpen = false"
      @artifact-select="selectArtifact"
    />

    <button
      v-if="navigationOpen || inspectorOpen"
      type="button"
      class="mobile-backdrop"
      aria-label="关闭面板"
      @click="closeMobilePanels"
    ></button>

    <api-settings v-model:show="showSettings" />

    <div v-if="selectedArtifact" class="artifact-lightbox" role="dialog" aria-modal="true" aria-label="产物预览" @click.self="selectedArtifact = null">
      <button type="button" aria-label="关闭预览" @click="selectedArtifact = null">×</button>
      <img v-if="selectedArtifact.kind === 'image'" :src="selectedArtifact.url" :alt="selectedArtifact.label" />
      <video v-else-if="selectedArtifact.kind === 'video'" :src="selectedArtifact.url" controls autoplay></video>
    </div>
  </main>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import ApiSettings from '../components/ApiSettings.vue'
import WorkbenchActivityFeed from '../components/workbench/WorkbenchActivityFeed.vue'
import WorkbenchComposer from '../components/workbench/WorkbenchComposer.vue'
import WorkbenchInspector from '../components/workbench/WorkbenchInspector.vue'
import WorkbenchSidebar from '../components/workbench/WorkbenchSidebar.vue'
import { WORKBENCH_TOOL_SHORTCUTS } from '../components/workbench/workbenchView.js'
import { useAgentWorkbench } from '../agent/runtime/useAgentWorkbench.js'
import { useModelStore } from '../stores/pinia/index.js'

defineOptions({ name: 'AgentWorkspace' })

const modelStore = useModelStore()
const workbench = useAgentWorkbench({ modelStore })

const workspace = computed(() => ({
  id: 'local-workspace',
  label: workbench.workspaceRoot.value
    ? workbench.workspaceRoot.value.split(/[\\/]/).filter(Boolean).at(-1) || '本地工作区'
    : '选择本地工作区'
}))
const usage = ref({})

const goal = ref('')
const selectedTool = ref('auto')
const selectedArtifact = ref(null)
const showSettings = ref(false)
const navigationOpen = ref(false)
const inspectorOpen = ref(typeof window !== 'undefined' && window.innerWidth > 1180)
const composerFocusToken = ref(0)

const workspaces = computed(() => [
  {
    id: 'local-workspace',
    label: workspace.value.label,
    description: workbench.workspaceRoot.value || (workbench.desktopReady.value ? '点击选择目录' : 'Mac App 中启用'),
    icon: '⌂',
    badge: workbench.desktopReady.value ? 'LOCAL' : 'WEB'
  },
  { id: 'tools', label: '工具与权限', description: '终端、文件、电脑控制', icon: '>_', badge: 'V0.6' },
  { id: 'artifacts', label: '产物', description: '截图、图片和视频', icon: '□' }
])
const suggestions = [
  '检查当前项目，告诉我它的架构和最需要修复的问题',
  '读取 README 和 package.json，然后运行测试并总结结果',
  '截取当前屏幕，告诉我正在打开什么，并建议下一步操作',
  '调用 Creative 工具制作一张黑银科技感新能源汽车海报'
]
const toolShortcuts = WORKBENCH_TOOL_SHORTCUTS

const sessionMode = computed(() => workbench.isHistorySelection.value
  ? 'history'
  : (workbench.messages.value.length ? 'live' : 'draft'))
const firstUserMessage = computed(() => workbench.messages.value.find(message => message.role === 'user'))
const activeToolCall = computed(() => [...workbench.toolCalls.value].reverse().find(call =>
  ['pending', 'running', 'awaiting_approval'].includes(call.status)
))
const displaySnapshot = computed(() => ({
  ...workbench.projection.value,
  runId: workbench.projection.value.sessionId,
  goal: firstUserMessage.value?.content || '',
  stepCount: workbench.toolCalls.value.length,
  currentAction: activeToolCall.value || null,
  timeline: []
}))
const screenshotArtifacts = computed(() => workbench.screenshots.value.map(screenshot => ({
  id: screenshot.id,
  kind: 'image',
  type: 'image',
  url: screenshot.dataUrl,
  label: '桌面截图',
  status: 'completed',
  createdAt: screenshot.createdAt
})))
const displayArtifacts = computed(() => [
  ...screenshotArtifacts.value,
  ...workbench.creativeArtifacts.value
])
const workbenchActivities = computed(() => [
  ...workbench.messages.value.filter(message => message.id !== firstUserMessage.value?.id),
  ...workbench.toolCalls.value,
  ...workbench.observations.value,
  ...(workbench.pendingApproval.value && workbench.pendingToolCall.value
    ? [{
        type: 'approval_requested',
        id: workbench.pendingApproval.value.id,
        approvalId: workbench.pendingApproval.value.id,
        toolCallId: workbench.pendingApproval.value.toolCallId,
        toolName: workbench.pendingToolCall.value.name,
        input: workbench.pendingToolCall.value.input,
        status: 'pending_approval',
        message: approvalMessage.value,
        createdAt: workbench.pendingApproval.value.requestedAt
      }]
    : [])
])
const providerLabel = computed(() => String(modelStore.providerLabel || modelStore.currentProvider || 'DataEyes'))
const selectedModelLabel = computed(() => String(modelStore.selectedChatModel || '自动路由'))
const approvalMessage = computed(() => {
  const call = workbench.pendingToolCall.value
  if (!call) return ''
  if (call.name === 'terminal.run') {
    return `允许执行命令：${JSON.stringify(call.input?.command || '')}，参数：${JSON.stringify(call.input?.args || [])}，目录：${JSON.stringify(call.input?.cwd || '.')}`
  }
  if (call.name === 'workspace.write') {
    const bytes = new TextEncoder().encode(String(call.input?.content || '')).length
    return `允许${call.input?.create ? '新建' : '覆盖'}文件：${call.input?.path || '未指定路径'}（${bytes} 字节）`
  }
  if (call.name === 'computer.click') return `允许在 ${call.input?.application || '未指定应用'} 的屏幕坐标 (${call.input?.x}, ${call.input?.y}) 点击一次`
  if (call.name === 'computer.type_text') return `允许向 ${call.input?.application || '未指定应用'} 输入：${JSON.stringify(call.input?.text || '')}`
  if (call.name === 'computer.open_application') return `允许打开应用：${JSON.stringify(call.input?.application || '')}`
  if (call.name === 'computer.inspect_screen') return `允许截取并分析${call.input?.application ? ` ${call.input.application} 的` : '当前'}屏幕`
  if (call.name.startsWith('computer.')) return `允许电脑操作：${call.name}`
  if (call.name === 'creative.generate') return '允许调用图片/视频模型；此操作可能产生费用。'
  return `允许 Agent 执行工具：${call.name}`
})
const composerPlaceholder = computed(() => {
  if (workbench.isHistorySelection.value) return '这是一条只读历史；可点击“使用此目标新建任务”。'
  if (workbench.isAwaitingApproval.value) return '请先批准或拒绝上方操作…'
  if (workbench.isRunning.value) return 'Agent 正在规划或执行工具…'
  return workbench.messages.value.length ? '继续补充要求或提出下一步…' : '描述你希望 Agent 在电脑上完成的任务…'
})
const sessionContext = computed(() => {
  return {
    工作区: workspace.value.label,
    根目录: workbench.workspaceRoot.value || '未选择',
    模式: workbench.desktopReady.value ? '桌面 App' : 'Web 预览',
    Provider: providerLabel.value,
    模型: selectedModelLabel.value,
    工具数量: workbench.toolRegistry.list().length,
    电脑权限: workbench.capabilities.value?.computer ? JSON.stringify(workbench.capabilities.value.computer) : '不可用'
  }
})
const fileChanges = computed(() => workbench.observations.value
  .filter(observation => observation.toolName === 'workspace.write' && observation.status === 'succeeded')
  .map(observation => ({
    id: observation.id,
    path: observation.output?.path || '未知文件',
    status: observation.output?.created ? 'created' : 'modified'
  })))
const historyRecords = computed(() => workbench.historyRecords.value.map(record => ({
  id: record.sessionId,
  runId: record.sessionId,
  goal: record.title,
  status: record.status,
  stepCount: record.toolCallCount,
  artifactCount: 0,
  createdAt: record.createdAt,
  historyUpdatedAt: record.updatedAt
})))

const focusComposer = () => {
  composerFocusToken.value += 1
}

const newTask = () => {
  if (workbench.isRunning.value || workbench.isAwaitingApproval.value) return
  workbench.newTask()
  goal.value = ''
  selectedTool.value = 'auto'
  selectedArtifact.value = null
  closeMobilePanels()
  focusComposer()
}

const submit = async (input = goal.value) => {
  const normalized = String(input || '').trim()
  if (!normalized || workbench.isRunning.value || workbench.isAwaitingApproval.value) return
  selectedArtifact.value = null
  closeMobilePanels()
  try {
    goal.value = ''
    await workbench.submit(normalized)
  } catch (error) {
    if (['AbortError'].includes(error?.name) || ['WORKBENCH_CANCELLED', 'ABORT_ERR'].includes(error?.code)) return
    window.$message?.error(error?.message || 'Agent 执行失败')
  }
}

const cancel = () => {
  workbench.cancel()
}

const retry = async () => {
  const lastUser = [...workbench.messages.value].reverse().find(message => message.role === 'user')
  if (lastUser?.content) await submit(lastUser.content)
}

const approve = async (payload) => {
  if (!workbench.pendingApproval.value || payload?.id !== workbench.pendingApproval.value.id) return false
  await workbench.approve()
  return true
}

const reject = async (payload) => {
  if (!workbench.pendingApproval.value || payload?.id !== workbench.pendingApproval.value.id) return false
  await workbench.reject('用户在工作台中拒绝了操作')
  return true
}

const handleApproval = async (payload) => {
  try {
    return payload?.decision === 'approve' ? await approve(payload) : await reject(payload)
  } catch (error) {
    window.$message?.error(error?.message || '处理审批失败')
    return false
  }
}

const selectHistory = (sessionId) => {
  navigationOpen.value = false
  const selected = workbench.selectSession(sessionId)
  if (!selected) {
    window.$message?.warning(workbench.isRunning.value || workbench.isAwaitingApproval.value
      ? '当前任务仍在执行，请先停止后再切换历史'
      : '没有找到或无法恢复这条任务记录')
  }
}

const reuseHistoricalGoal = () => {
  const historicalGoal = String(firstUserMessage.value?.content || '').trim()
  workbench.newTask()
  goal.value = historicalGoal
  focusComposer()
}

const applySuggestion = (value) => {
  if (workbench.isRunning.value) return
  goal.value = String(value || '')
  focusComposer()
}

const selectTool = (tool) => {
  if (!tool?.id || workbench.isRunning.value) return
  selectedTool.value = tool.id
  if (!goal.value.trim() && tool.hint) goal.value = tool.hint
  focusComposer()
}

const selectWorkspace = async (workspaceId) => {
  navigationOpen.value = false
  if (workspaceId === 'local-workspace') {
    try {
      await workbench.chooseWorkspace()
    } catch (error) {
      window.$message?.warning(error?.message || '无法选择工作区')
    }
    return
  }
  if (['tools', 'artifacts'].includes(workspaceId)) inspectorOpen.value = true
}

const selectArtifact = (artifact) => {
  const normalized = artifact?.normalizedArtifact || artifact
  if (normalized?.url) selectedArtifact.value = normalized
}

const confirmAction = ({ title, content, positiveText }, action) => {
  if (window.$dialog?.warning) {
    window.$dialog.warning({ title, content, positiveText, negativeText: '取消', onPositiveClick: action })
    return
  }
  if (window.confirm(content)) action()
}

const confirmDeleteHistory = (runId) => {
  const record = historyRecords.value.find(item => String(item?.runId || item?.id || '') === String(runId))
  const label = String(record?.goal || '').trim()
  confirmAction({
    title: '删除这条任务？',
    content: `${label ? `“${label}”` : '这条任务'}的本地事件记录将被删除，此操作无法撤销。`,
    positiveText: '删除'
  }, () => {
    workbench.deleteSession(runId)
  })
}

const confirmClearHistory = () => confirmAction({
  title: '清空全部任务历史？',
  content: '所有 Workbench 本地任务事件都会被删除，此操作无法撤销。',
  positiveText: '全部清空'
}, () => {
  workbench.clearHistory()
})

const closeMobilePanels = () => {
  navigationOpen.value = false
  inspectorOpen.value = false
}

const onGlobalKeydown = (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault()
    newTask()
  }
  if (event.key === 'Escape') {
    if (selectedArtifact.value) selectedArtifact.value = null
    else closeMobilePanels()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

defineExpose({
  workspace,
  messages: workbench.messages,
  toolCalls: workbench.toolCalls,
  pendingApproval: workbench.pendingApproval,
  submit,
  retry,
  approve,
  reject,
  cancel,
  newTask,
  selectHistory,
  workbench
})
</script>

<style scoped>
.agent-workbench {
  --wb-bg: #151619;
  --wb-panel: #111215;
  --wb-border: #292b30;
  --wb-text: #d9dade;
  --wb-muted: #74777e;
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  width: 100%;
  height: 100dvh;
  min-height: 0;
  overflow: hidden;
  color: var(--wb-text);
  background: var(--wb-bg);
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif;
}

.agent-workbench.inspector-open { grid-template-columns: 252px minmax(0, 1fr) 286px; }

.workbench-center { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; min-height: 0; background: #151619; }
.mobile-backdrop { display: none; }
.artifact-lightbox { position: fixed; z-index: 100; inset: 0; display: grid; place-items: center; padding: 42px; background: rgba(4, 5, 6, 0.9); backdrop-filter: blur(12px); }
.artifact-lightbox img,
.artifact-lightbox video { max-width: min(92vw, 1280px); max-height: 86vh; border: 1px solid #3a3d43; border-radius: 10px; box-shadow: 0 24px 90px #000; }
.artifact-lightbox > button { position: fixed; top: 18px; right: 20px; display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #41444a; border-radius: 8px; color: #d9dade; background: #202226; font-size: 21px; }

@media (max-width: 1180px) {
  .agent-workbench,
  .agent-workbench.inspector-open { grid-template-columns: 240px minmax(0, 1fr); }
  .mobile-backdrop { position: fixed; z-index: 50; inset: 0; display: block; background: rgba(5, 6, 7, 0.5); }
}

@media (max-width: 880px) {
  .agent-workbench,
  .agent-workbench.inspector-open { grid-template-columns: minmax(0, 1fr); }
}
</style>

<template>
  <footer class="composer-shell">
    <div class="composer-wrap">
      <div v-if="showCommands" class="command-menu" role="listbox" aria-label="快捷命令">
        <header>
          <span>快捷命令</span>
          <small>选择一种任务起点</small>
        </header>
        <button
          v-for="tool in commandTools"
          :key="tool.id"
          type="button"
          role="option"
          @click="selectCommand(tool)"
        >
          <span class="command-icon"><workbench-icon :name="iconForTool(tool.id)" :size="15" /></span>
          <span><strong>/{{ tool.id }}</strong><small>{{ tool.hint || tool.label }}</small></span>
          <kbd>↵</kbd>
        </button>
      </div>

      <div v-if="showApprovalModes" class="approval-menu" role="menu" aria-label="选择审批模式">
        <header>
          <span>
            <workbench-icon name="shield" :size="14" />
            审批模式
          </span>
          <small>仅在任务开始前可更改</small>
        </header>
        <button
          v-for="mode in approvalModes"
          :key="mode.id"
          type="button"
          role="menuitemradio"
          :class="[`is-${mode.tone}`, { 'is-selected': mode.id === currentApprovalMode.id }]"
          :aria-checked="mode.id === currentApprovalMode.id"
          @click="selectApprovalMode(mode.id)"
        >
          <span class="approval-mode-indicator"><i></i></span>
          <span class="approval-mode-copy">
            <strong>{{ mode.label }}<small>{{ mode.summary }}</small></strong>
            <em>{{ mode.description }}</em>
          </span>
          <workbench-icon v-if="mode.id === currentApprovalMode.id" name="check" :size="15" />
        </button>
        <p><workbench-icon name="alert" :size="13" />审批模式只控制工具门；任务规划仍会使用当前聊天模型。自动执行不会绕过本机安全确认；完全访问还需要风险页与系统确认，并且只在当前 App 会话有效。</p>
      </div>

      <form class="composer" :class="{ 'is-disabled': disabled, 'is-running': running }" @submit.prevent="submit">
        <div v-if="attachments.length" class="attachment-list" aria-label="已附加文件">
          <span v-for="attachment in attachments" :key="attachment.id">
            <workbench-icon name="file" :size="13" />
            <strong>{{ attachment.name }}</strong>
            <small>{{ formatBytes(attachment.size) }}</small>
            <button type="button" :aria-label="`移除 ${attachment.name}`" :disabled="disabled" @click="emit('remove-attachment', attachment.id)">
              <workbench-icon name="close" :size="12" />
            </button>
          </span>
        </div>

        <textarea
          ref="input"
          :value="modelValue"
          rows="1"
          :disabled="disabled"
          :placeholder="placeholder"
          aria-label="任务输入"
          @input="onInput"
          @keydown.meta.enter.exact.prevent="submit"
          @keydown.ctrl.enter.exact.prevent="submit"
          @keydown.escape="showCommands = false"
        ></textarea>

        <div class="composer-toolbar">
          <div class="composer-tools">
            <input ref="fileInput" class="file-input" type="file" multiple :accept="acceptedFiles" @change="onFilesSelected" />
            <button type="button" class="tool-button" :disabled="disabled || active" title="附加文本文件" aria-label="附加文本文件" @click="fileInput?.click()">
              <workbench-icon name="paperclip" :size="15" />
            </button>
            <button type="button" class="tool-button" :class="{ 'is-active': showCommands }" :disabled="disabled || active" title="快捷命令" aria-label="打开快捷命令" @click="showCommands = !showCommands">
              <workbench-icon name="slash" :size="15" />
            </button>
            <span class="toolbar-divider"></span>
            <div class="model-picker">
              <button
                type="button"
                class="model-control"
                :disabled="active"
                aria-haspopup="listbox"
                :aria-expanded="showModelMenu"
                title="选择当前任务使用的模型"
                @click="toggleModelMenu"
              >
                <workbench-icon name="brain" :size="14" />
                <span>{{ modelLabel || '自动路由' }}</span>
                <workbench-icon name="chevron-down" :size="12" />
              </button>
              <div v-if="showModelMenu" class="model-menu" role="listbox" aria-label="选择模型">
                <header>
                  <span><workbench-icon name="brain" :size="14" />模型</span>
                  <small>下一次任务生效</small>
                </header>
                <section v-for="group in modelGroups" :key="group.id" class="model-menu-group">
                  <div class="model-menu-label">{{ group.label }}</div>
                  <button
                    type="button"
                    role="option"
                    :aria-selected="selectedModels[group.id] === ''"
                    :class="{ 'is-selected': selectedModels[group.id] === '' }"
                    @click="selectModel(group.id, '')"
                  >
                    <span class="model-option-copy"><strong>自动路由</strong><small>由 Agent 根据任务选择</small></span>
                    <workbench-icon v-if="selectedModels[group.id] === ''" name="check" :size="14" />
                  </button>
                  <button
                    v-for="option in group.options"
                    :key="option.key"
                    type="button"
                    role="option"
                    :aria-selected="selectedModels[group.id] === option.key"
                    :class="{ 'is-selected': selectedModels[group.id] === option.key }"
                    @click="selectModel(group.id, option.key)"
                  >
                    <span class="model-option-copy"><strong>{{ option.label || option.key }}</strong><small>{{ option.key }}</small></span>
                    <workbench-icon v-if="selectedModels[group.id] === option.key" name="check" :size="14" />
                  </button>
                  <p v-if="!group.options.length" class="model-menu-empty">尚未配置模型</p>
                </section>
                <button type="button" class="model-settings-link" @click="openModelSettings">
                  管理 Provider 与模型目录
                  <workbench-icon name="chevron-right" :size="13" />
                </button>
              </div>
            </div>
            <reasoning-effort-selector
              :model-value="reasoningEffort"
              :disabled="running || awaitingApproval || history"
              @update:model-value="emit('update-reasoning-effort', $event)"
            />
            <button
              type="button"
              class="permission-mode"
              :class="[`is-${currentApprovalMode.tone}`, { 'is-active': showApprovalModes }]"
              :disabled="approvalModeLocked"
              aria-haspopup="menu"
              :aria-expanded="showApprovalModes"
              :title="approvalModeLocked ? approvalModeLockedReason : currentApprovalMode.description"
              @click="toggleApprovalModes"
            >
              <workbench-icon name="shield" :size="13" />
              <span>{{ currentApprovalMode.label }}</span>
              <workbench-icon name="chevron-down" :size="11" />
            </button>
          </div>

          <div class="composer-actions">
            <span class="runtime-state" :class="runtimeState.tone">
              <i></i>{{ runtimeState.label }}
            </span>
            <button v-if="active && canSubmit" type="submit" class="guide-button" aria-label="发送执行引导">
              <workbench-icon name="send" :size="13" />引导
            </button>
            <button v-if="active" type="button" class="stop-button" aria-label="停止任务" @click="emit('stop')">
              <workbench-icon name="stop" :size="14" />
            </button>
            <button v-else-if="canResume" type="button" class="resume-button" aria-label="继续任务" @click="emit('resume')">
              <workbench-icon name="activity" :size="13" />继续
            </button>
            <button v-else type="submit" class="send-button" :disabled="disabled || !canSubmit" aria-label="运行任务">
              <workbench-icon name="send" :size="15" />
              <span>运行</span>
            </button>
          </div>
        </div>
      </form>
      <p class="composer-hint">
        <span>⌘ ↵</span>
        {{ active ? '发送执行引导 · 在安全检查点生效' : (canResume ? '可直接继续，或输入修改要求后继续' : `发送 · ${currentApprovalMode.label}：${currentApprovalMode.summary}`) }}
      </p>
    </div>
  </footer>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ReasoningEffortSelector from '../settings/ReasoningEffortSelector.vue'
import WorkbenchIcon from './WorkbenchIcon.vue'
import { WORKBENCH_APPROVAL_MODES, workbenchApprovalMode } from './workbenchView.js'

defineOptions({ name: 'WorkbenchComposer' })

const props = defineProps({
  modelValue: { type: String, default: '' },
  running: { type: Boolean, default: false },
  stopping: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  history: { type: Boolean, default: false },
  awaitingApproval: { type: Boolean, default: false },
  placeholder: { type: String, default: '描述你希望 Agent 完成的任务…' },
  tools: { type: Array, default: () => [] },
  selectedTool: { type: String, default: 'auto' },
  modelLabel: { type: String, default: '' },
  modelOptions: {
    type: Object,
    default: () => ({ chat: [], image: [], video: [] })
  },
  selectedModels: {
    type: Object,
    default: () => ({ chat: '', image: '', video: '' })
  },
  approvalMode: { type: String, default: 'ask' },
  reasoningEffort: { type: String, default: 'auto' },
  guidancePending: { type: Boolean, default: false },
  canResume: { type: Boolean, default: false },
  attachments: { type: Array, default: () => [] },
  autofocusToken: { type: [String, Number], default: 0 }
})

const emit = defineEmits({
  'update:modelValue': value => typeof value === 'string',
  submit: value => typeof value === 'string' && !!value.trim(),
  guide: value => typeof value === 'string' && !!value.trim(),
  resume: () => true,
  stop: () => true,
  'select-tool': tool => !!tool && typeof tool === 'object',
  'files-selected': files => Array.isArray(files),
  'remove-attachment': id => typeof id === 'string',
  'open-settings': () => true,
  'select-model': payload => Boolean(payload && typeof payload === 'object' && typeof payload.capability === 'string' && typeof payload.model === 'string'),
  'update-approval-mode': mode => WORKBENCH_APPROVAL_MODES.some(item => item.id === mode),
  'update-reasoning-effort': value => typeof value === 'string' && !!value
})

const input = ref(null)
const fileInput = ref(null)
const showCommands = ref(false)
const showApprovalModes = ref(false)
const showModelMenu = ref(false)
const acceptedFiles = '.txt,.md,.json,.jsonl,.js,.mjs,.cjs,.ts,.tsx,.jsx,.vue,.css,.scss,.html,.xml,.yml,.yaml,.toml,.py,.go,.rs,.java,.c,.h,.cpp,.hpp,.sh,.zsh,.sql,.log,.csv'
const canSubmit = computed(() => !!props.modelValue.trim())
const active = computed(() => props.running || props.awaitingApproval)
const commandTools = computed(() => props.tools.filter(tool => tool.id !== 'auto'))
const modelGroups = computed(() => [
  { id: 'chat', label: '对话模型', options: props.modelOptions?.chat || [] },
  { id: 'image', label: '图片模型', options: props.modelOptions?.image || [] },
  { id: 'video', label: '视频模型', options: props.modelOptions?.video || [] }
])
const selectedModels = computed(() => ({
  chat: props.selectedModels?.chat || '',
  image: props.selectedModels?.image || '',
  video: props.selectedModels?.video || ''
}))
const approvalModes = WORKBENCH_APPROVAL_MODES
const currentApprovalMode = computed(() => workbenchApprovalMode(props.approvalMode))
const approvalModeLocked = computed(() => props.running || props.awaitingApproval || props.history)
const approvalModeLockedReason = computed(() => {
  if (props.history) return '历史任务为只读，审批模式不可更改'
  if (props.awaitingApproval) return '请先处理当前审批请求'
  return '任务执行期间不能更改审批模式'
})
const runtimeState = computed(() => {
  if (props.history) return { label: '只读历史', tone: 'history' }
  if (props.stopping) return { label: '正在安全停止', tone: 'stopping' }
  if (props.awaitingApproval) return { label: '等待批准', tone: 'approval' }
  if (props.guidancePending) return { label: '引导已排队', tone: 'guidance' }
  if (props.running) return { label: '执行中', tone: 'running' }
  return { label: '就绪', tone: 'ready' }
})

const iconForTool = id => ({ files: 'file', terminal: 'terminal', computer: 'monitor', creative: 'sparkles' })[id] || 'slash'

const resize = (target) => {
  if (!target) return
  target.style.height = 'auto'
  target.style.height = `${Math.min(target.scrollHeight, 184)}px`
}

const onInput = (event) => {
  const value = event.target.value
  emit('update:modelValue', value)
  resize(event.target)
  if (value === '/') showCommands.value = true
}

const selectCommand = (tool) => {
  emit('select-tool', tool)
  showCommands.value = false
}

const toggleApprovalModes = () => {
  if (approvalModeLocked.value) return
  showCommands.value = false
  showModelMenu.value = false
  showApprovalModes.value = !showApprovalModes.value
}

const toggleModelMenu = () => {
  if (active.value) return
  showApprovalModes.value = false
  showCommands.value = false
  showModelMenu.value = !showModelMenu.value
}

const selectModel = (capability, model) => {
  if (active.value) return
  emit('select-model', { capability, model })
  showModelMenu.value = false
}

const openModelSettings = () => {
  showModelMenu.value = false
  emit('open-settings')
}

const selectApprovalMode = mode => {
  if (approvalModeLocked.value || !WORKBENCH_APPROVAL_MODES.some(item => item.id === mode)) return
  emit('update-approval-mode', mode)
  showApprovalModes.value = false
}

const closeFloatingMenus = event => {
  if (!event.target?.closest?.('.approval-menu, .permission-mode')) showApprovalModes.value = false
  if (!event.target?.closest?.('.command-menu, [aria-label="打开快捷命令"]')) showCommands.value = false
  if (!event.target?.closest?.('.model-menu, .model-control')) showModelMenu.value = false
}

const onFilesSelected = (event) => {
  const files = Array.from(event.target.files || [])
  if (files.length) emit('files-selected', files)
  event.target.value = ''
}

const submit = () => {
  const value = props.modelValue.trim()
  if (!value || props.disabled) return
  showCommands.value = false
  showApprovalModes.value = false
  emit(active.value ? 'guide' : 'submit', value)
}

const formatBytes = value => {
  const bytes = Number(value) || 0
  if (bytes < 1024) return `${bytes} B`
  return `${Math.ceil(bytes / 1024)} KB`
}

watch(() => props.autofocusToken, async () => {
  await nextTick()
  input.value?.focus()
})

watch(() => props.modelValue, async () => {
  await nextTick()
  resize(input.value)
})

watch(approvalModeLocked, locked => {
  if (locked) showApprovalModes.value = false
})

watch(active, activeNow => {
  if (activeNow) showModelMenu.value = false
})

onMounted(() => document.addEventListener('pointerdown', closeFloatingMenus))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeFloatingMenus))
</script>

<style scoped>
.composer-shell { position: relative; z-index: 12; padding: 8px clamp(14px, 2.4vw, 28px) 11px; background: linear-gradient(180deg, rgba(18,19,21,0), #121315 24%); }
.composer-wrap { position: relative; width: min(850px, 100%); margin: 0 auto; }
.composer { overflow: visible; border: 1px solid #3a3e40; border-radius: 12px; background: #1e2022; box-shadow: 0 16px 45px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.025); transition: border-color 130ms ease, box-shadow 130ms ease; }
.composer:focus-within { border-color: #52625a; box-shadow: 0 16px 45px rgba(0,0,0,.22), 0 0 0 3px rgba(127,208,167,.06); }
.composer.is-running { border-color: #364850; }
.composer.is-disabled { opacity: .72; }
.composer textarea { display: block; width: 100%; min-height: 56px; max-height: 184px; resize: none; border: 0; outline: 0; padding: 14px 15px 8px; color: #edf0ee; background: transparent; font: 14px/1.55 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; }
.composer textarea::placeholder { color: #717678; }
.composer textarea:disabled { cursor: not-allowed; }
.attachment-list { display: flex; flex-wrap: wrap; gap: 5px; border-bottom: 1px solid #2a2d2f; padding: 8px 9px 0; }
.attachment-list > span { display: flex; max-width: 230px; align-items: center; gap: 5px; border: 1px solid #34383a; border-radius: 6px; padding: 4px 5px 4px 7px; color: #9ca2a0; background: #25282a; }
.attachment-list strong { overflow: hidden; max-width: 150px; color: #cdd1cf; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.attachment-list small { color: #6b7171; font-size: 10px; }
.attachment-list button { color: #707677; }
.attachment-list button:hover { color: #e18b8b; }
.composer-toolbar { display: flex; min-height: 37px; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 7px 7px 8px; }
.composer-tools,
.composer-actions { display: flex; min-width: 0; align-items: center; gap: 4px; }
.file-input { display: none; }
.tool-button { display: grid; width: 27px; height: 27px; place-items: center; border-radius: 6px; color: #858b8b; }
.tool-button:hover,
.tool-button.is-active { color: #d8dcda; background: #2a2d2f; }
.tool-button:disabled { cursor: not-allowed; opacity: .38; }
.toolbar-divider { width: 1px; height: 15px; margin: 0 3px; background: #343739; }
.model-picker { position: relative; min-width: 0; }
.model-control { display: flex; min-width: 0; max-width: 200px; height: 30px; align-items: center; gap: 6px; border-radius: 7px; padding: 0 8px; color: #9ba09f; font-size: 12px; }
.model-control:hover { color: #d8dcda; background: #292c2e; }
.model-control:disabled { opacity: .5; }
.model-control span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-menu { position: absolute; z-index: 24; bottom: calc(100% + 7px); left: 0; width: min(360px, calc(100vw - 30px)); max-height: min(520px, 70vh); overflow-y: auto; border: 1px solid #404546; border-radius: 11px; padding: 6px; background: #1b1d1f; box-shadow: 0 24px 78px rgba(0,0,0,.48); }
.model-menu header { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px 8px; }
.model-menu header > span { display: flex; align-items: center; gap: 6px; color: #d4d8d6; font-size: 12px; font-weight: 700; }
.model-menu header small { color: #666c6c; font-size: 10px; font-weight: 500; }
.model-menu-group { border-top: 1px solid #2d3032; padding: 7px 0 3px; }
.model-menu-label { padding: 0 8px 4px; color: #777e7c; font-size: 10px; font-weight: 700; letter-spacing: .03em; }
.model-menu-group > button { display: grid; grid-template-columns: minmax(0, 1fr) 18px; width: 100%; align-items: center; gap: 8px; border: 1px solid transparent; border-radius: 8px; padding: 7px 8px; color: #9ca2a0; text-align: left; }
.model-menu-group > button:hover { color: #e5e9e7; background: #25282a; }
.model-menu-group > button.is-selected { border-color: #3d4642; color: #e5e9e7; background: #242826; }
.model-option-copy, .model-option-copy strong, .model-option-copy small { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-option-copy strong { font-size: 11.5px; font-weight: 700; }
.model-option-copy small { margin-top: 2px; color: #707776; font-size: 10px; }
.model-menu-group > button.is-selected .model-option-copy small { color: #929997; }
.model-menu-group > button > .wb-icon { color: #83cea6; }
.model-menu-empty { margin: 2px 8px 5px; color: #666c6c; font-size: 10px; }
.model-settings-link { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 6px; border-top: 1px solid #2d3032; margin-top: 5px; padding: 9px 8px 5px; color: #83cea6; font-size: 11px; text-align: left; }
.model-settings-link:hover { color: #b1efd0; }
.permission-mode { display: flex; height: 30px; align-items: center; gap: 5px; border-left: 1px solid #333638; margin-left: 2px; border-radius: 0 7px 7px 0; padding: 0 7px 0 8px; color: #858b89; font-size: 11px; white-space: nowrap; }
.permission-mode:hover,
.permission-mode.is-active { color: #d8dcda; background: #292c2e; }
.permission-mode.is-readonly { color: #99a09e; }
.permission-mode.is-ask { color: #d2aa6d; }
.permission-mode.is-auto { color: #82cfa6; }
.permission-mode.is-full { color: #d68a8f; }
.permission-mode:disabled { cursor: not-allowed; opacity: .42; }
.runtime-state { display: inline-flex; align-items: center; gap: 5px; color: #777d7c; font-size: 11px; white-space: nowrap; }
.runtime-state i { width: 5px; height: 5px; border-radius: 50%; background: #6e7473; }
.runtime-state.ready i { background: #70cb9b; }
.runtime-state.running i { background: #6fb9e4; animation: pulse 900ms infinite alternate; }
.runtime-state.approval i { background: #d4a65c; }
.runtime-state.guidance i { background: #bd8edf; animation: pulse 850ms infinite alternate; }
.runtime-state.stopping i { background: #d18467; animation: pulse 700ms infinite alternate; }
.runtime-state.history i { background: #8b8f91; }
.send-button,
.stop-button { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 8px; }
.send-button { color: #142119; background: #a8e7c3; }
.send-button:hover { background: #baf2d1; }
.send-button:disabled { cursor: not-allowed; opacity: .28; }
.stop-button { color: #efb5b5; background: #422528; }
.stop-button:hover { background: #512b2e; }
.guide-button,
.resume-button { display: inline-flex; height: 29px; align-items: center; gap: 5px; border-radius: 8px; padding: 0 10px; color: #ddd1e7; background: #3a2d43; font-size: 10.5px; font-weight: 700; }
.guide-button:hover,
.resume-button:hover { color: #f1e8f7; background: #493753; }
.composer-hint { margin: 6px 2px 0; color: #555a5c; font-size: 10px; text-align: center; }
.composer-hint span { color: #747a7a; }
.command-menu { position: absolute; z-index: 20; right: 0; bottom: calc(100% + 7px); left: 0; overflow: hidden; border: 1px solid #383d3e; border-radius: 10px; padding: 5px; background: #1b1d1f; box-shadow: 0 22px 70px rgba(0,0,0,.42); }
.command-menu header { display: flex; align-items: center; justify-content: space-between; padding: 5px 7px 7px; }
.command-menu header span { color: #c7cbc9; font-size: 12px; font-weight: 700; }
.command-menu header small { color: #606566; font-size: 11px; }
.command-menu > button { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; width: 100%; align-items: center; gap: 8px; border-radius: 7px; padding: 6px 7px; color: #aeb3b1; text-align: left; }
.command-menu > button:hover { color: #edf0ee; background: #25282a; }
.command-icon { display: grid; width: 28px; height: 28px; place-items: center; border: 1px solid #343839; border-radius: 6px; color: #8d9692; background: #202325; }
.command-menu strong,
.command-menu small { display: block; }
.command-menu strong { font-size: 12px; }
.command-menu small { margin-top: 2px; color: #6d7273; font-size: 11px; }
.command-menu kbd { color: #575c5e; font-size: 10px; }
.approval-menu { position: absolute; z-index: 22; bottom: calc(100% + 7px); left: 52px; width: min(430px, calc(100% - 64px)); overflow: hidden; border: 1px solid #404546; border-radius: 11px; padding: 6px; background: #1b1d1f; box-shadow: 0 24px 78px rgba(0,0,0,.48); }
.approval-menu header { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px 9px; }
.approval-menu header > span { display: flex; align-items: center; gap: 6px; color: #d4d8d6; font-size: 12px; font-weight: 700; }
.approval-menu header small { color: #666c6c; font-size: 10px; font-weight: 500; }
.approval-menu > button { display: grid; grid-template-columns: 18px minmax(0,1fr) 18px; width: 100%; align-items: start; gap: 8px; border: 1px solid transparent; border-radius: 8px; padding: 9px 8px; color: #9ca2a0; text-align: left; }
.approval-menu > button:hover { color: #e5e9e7; background: #25282a; }
.approval-menu > button.is-selected { border-color: #3d4642; color: #e5e9e7; background: #242826; }
.approval-mode-indicator { display: grid; height: 18px; place-items: center; }
.approval-mode-indicator i { width: 7px; height: 7px; border-radius: 50%; background: #777e7c; box-shadow: 0 0 0 3px rgba(119,126,124,.1); }
.approval-menu > button.is-ask .approval-mode-indicator i { background: #d1a65f; box-shadow: 0 0 0 3px rgba(209,166,95,.1); }
.approval-menu > button.is-auto .approval-mode-indicator i { background: #77ca9e; box-shadow: 0 0 0 3px rgba(119,202,158,.1); }
.approval-menu > button.is-full .approval-mode-indicator i { background: #cf7b81; box-shadow: 0 0 0 3px rgba(207,123,129,.1); }
.approval-mode-copy,
.approval-mode-copy strong,
.approval-mode-copy small,
.approval-mode-copy em { display: block; min-width: 0; }
.approval-mode-copy strong { color: inherit; font-size: 12px; font-style: normal; font-weight: 700; }
.approval-mode-copy strong small { display: inline; margin-left: 7px; color: #737978; font-size: 10px; font-weight: 500; }
.approval-mode-copy em { margin-top: 3px; color: #777d7b; font-size: 10.5px; font-style: normal; line-height: 1.45; }
.approval-menu > button.is-selected .approval-mode-copy em { color: #929997; }
.approval-menu > button > .wb-icon { margin-top: 2px; color: #83cea6; }
.approval-menu > p { display: flex; align-items: flex-start; gap: 6px; margin: 5px 6px 2px; border-top: 1px solid #2d3032; padding: 8px 2px 2px; color: #777d7c; font-size: 10px; line-height: 1.45; }
.approval-menu > p .wb-icon { margin-top: 1px; color: #b49362; }

/* DataEyes Code — command dock */
.composer-shell {
  padding: 12px clamp(16px, 3vw, 36px) 15px;
  background: linear-gradient(180deg, rgba(241, 243, 245, 0), #f1f3f5 28%);
}

.composer-wrap { width: min(940px, 100%); }

.composer {
  position: relative;
  border-color: rgba(34, 61, 65, .24);
  border-radius: 16px;
  background: #111820;
  box-shadow: 0 19px 46px rgba(24, 43, 50, .18), inset 0 1px rgba(255, 255, 255, .08);
}

.composer::before {
  position: absolute;
  top: -1px;
  right: 18px;
  left: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(94, 231, 196, .7), transparent);
  content: '';
  opacity: .7;
}

.composer:focus-within {
  border-color: rgba(94, 231, 196, .5);
  box-shadow: 0 19px 46px rgba(24, 43, 50, .2), 0 0 0 3px rgba(94, 231, 196, .08), inset 0 1px rgba(255, 255, 255, .08);
}

.composer textarea {
  min-height: 68px;
  padding: 17px 18px 9px;
  color: #eff7f5;
  font-size: 14px;
  line-height: 1.6;
}

.composer textarea::placeholder { color: #7b8d91; }
.attachment-list { border-bottom-color: rgba(255, 255, 255, .09); padding: 10px 11px 2px; }
.attachment-list > span { border-color: rgba(255, 255, 255, .12); border-radius: 8px; color: #b3c2c1; background: rgba(255, 255, 255, .06); }
.attachment-list strong { color: #d5e1df; }
.attachment-list small { color: #819294; }

.composer-toolbar { min-height: 42px; padding: 6px 9px 9px 10px; }
.composer-tools, .composer-actions { gap: 5px; }
.tool-button { width: 30px; height: 30px; border-radius: 8px; color: #829398; }
.tool-button:hover, .tool-button.is-active { color: #d9efea; background: rgba(255, 255, 255, .08); }
.toolbar-divider { height: 18px; margin: 0 5px; background: rgba(255, 255, 255, .12); }
.model-control,
.permission-mode {
  height: 32px;
  border-radius: 8px;
  color: #b2c4c2;
  background: rgba(255, 255, 255, .04);
}

.model-control { max-width: 210px; padding-inline: 9px; }
.model-control:hover, .permission-mode:hover, .permission-mode.is-active { color: #e7f5f2; background: rgba(94, 231, 196, .1); }
.permission-mode { border-left: 0; margin-left: 0; padding-inline: 9px; }
.runtime-state { color: #8ca0a0; font-size: 10.5px; }
.runtime-state.ready i { background: #5ee7c4; box-shadow: 0 0 10px rgba(94, 231, 196, .38); }
.runtime-state.running i { background: #63c9e0; }
.send-button, .stop-button { width: auto; min-width: 70px; height: 33px; gap: 6px; border-radius: 10px; padding: 0 12px; font-size: 11px; font-weight: 720; }
.send-button { color: #09201c; background: #63e3c2; box-shadow: 0 7px 18px rgba(55, 195, 162, .2); }
.send-button:hover { background: #8aeed6; transform: translateY(-1px); }
.send-button:disabled { transform: none; }
.send-button span { display: inline; }
.stop-button { color: #ffd9d7; background: #7c3d43; }
.stop-button:hover { background: #924b52; }
.guide-button, .resume-button { height: 33px; border: 1px solid rgba(94, 231, 196, .2); border-radius: 9px; padding-inline: 11px; color: #c9f2e8; background: rgba(52, 124, 111, .3); }
.guide-button:hover, .resume-button:hover { color: #e8fff8; background: rgba(65, 155, 137, .45); }
.composer-hint { margin-top: 8px; color: #7a898d; font-size: 10.5px; }
.composer-hint span { color: #39766d; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

.composer :is(button, textarea, input):focus-visible {
  outline: 2px solid rgba(94, 231, 196, .9);
  outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .send-button,
  .composer { transition-duration: 0s; }
}

@keyframes pulse { to { opacity: .35; } }

@media (max-width: 620px) {
  .composer-shell { padding: 7px 8px 9px; }
  .composer-toolbar { gap: 4px; }
  .runtime-state,
  .composer-hint { display: none; }
  .model-control { display: grid; width: 29px; min-width: 29px; max-width: 29px; place-items: center; padding: 0; }
  .model-control span,
  .model-control > svg:last-child { display: none; }
  .model-menu { right: 0; left: auto; width: min(340px, calc(100vw - 16px)); }
  .permission-mode { max-width: 82px; padding-right: 6px; }
  .approval-menu { right: 0; left: 0; width: auto; }
  .approval-menu header small { display: none; }
  .approval-menu > button { padding-block: 8px; }
  .composer textarea { min-height: 48px; }
}
</style>

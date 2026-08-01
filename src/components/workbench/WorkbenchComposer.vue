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
            <button type="button" class="tool-button" :disabled="disabled || running" title="附加文本文件" aria-label="附加文本文件" @click="fileInput?.click()">
              <workbench-icon name="paperclip" :size="15" />
            </button>
            <button type="button" class="tool-button" :class="{ 'is-active': showCommands }" :disabled="disabled || running" title="快捷命令" aria-label="打开快捷命令" @click="showCommands = !showCommands">
              <workbench-icon name="slash" :size="15" />
            </button>
            <span class="toolbar-divider"></span>
            <button type="button" class="model-control" :disabled="running" @click="emit('open-settings')">
              <workbench-icon name="brain" :size="14" />
              <span>{{ modelLabel || '自动路由' }}</span>
              <workbench-icon name="chevron-down" :size="12" />
            </button>
            <span class="permission-mode" title="危险操作会在执行前请求批准">
              <workbench-icon name="shield" :size="13" />
              审批保护
            </span>
          </div>

          <div class="composer-actions">
            <span class="runtime-state" :class="runtimeState.tone">
              <i></i>{{ runtimeState.label }}
            </span>
            <button v-if="running" type="button" class="stop-button" aria-label="停止任务" @click="emit('stop')">
              <workbench-icon name="stop" :size="14" />
            </button>
            <button v-else type="submit" class="send-button" :disabled="disabled || !canSubmit" aria-label="运行任务">
              <workbench-icon name="send" :size="15" />
            </button>
          </div>
        </div>
      </form>
      <p class="composer-hint"><span>⌘ ↵</span> 发送 · Agent 只会在需要时请求高风险权限</p>
    </div>
  </footer>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import WorkbenchIcon from './WorkbenchIcon.vue'

defineOptions({ name: 'WorkbenchComposer' })

const props = defineProps({
  modelValue: { type: String, default: '' },
  running: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  history: { type: Boolean, default: false },
  awaitingApproval: { type: Boolean, default: false },
  placeholder: { type: String, default: '描述你希望 Agent 完成的任务…' },
  tools: { type: Array, default: () => [] },
  selectedTool: { type: String, default: 'auto' },
  modelLabel: { type: String, default: '' },
  attachments: { type: Array, default: () => [] },
  autofocusToken: { type: [String, Number], default: 0 }
})

const emit = defineEmits({
  'update:modelValue': value => typeof value === 'string',
  submit: value => typeof value === 'string' && !!value.trim(),
  stop: () => true,
  'select-tool': tool => !!tool && typeof tool === 'object',
  'files-selected': files => Array.isArray(files),
  'remove-attachment': id => typeof id === 'string',
  'open-settings': () => true
})

const input = ref(null)
const fileInput = ref(null)
const showCommands = ref(false)
const acceptedFiles = '.txt,.md,.json,.jsonl,.js,.mjs,.cjs,.ts,.tsx,.jsx,.vue,.css,.scss,.html,.xml,.yml,.yaml,.toml,.py,.go,.rs,.java,.c,.h,.cpp,.hpp,.sh,.zsh,.sql,.log,.csv'
const canSubmit = computed(() => !!props.modelValue.trim())
const commandTools = computed(() => props.tools.filter(tool => tool.id !== 'auto'))
const runtimeState = computed(() => {
  if (props.history) return { label: '只读历史', tone: 'history' }
  if (props.awaitingApproval) return { label: '等待批准', tone: 'approval' }
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

const onFilesSelected = (event) => {
  const files = Array.from(event.target.files || [])
  if (files.length) emit('files-selected', files)
  event.target.value = ''
}

const submit = () => {
  const value = props.modelValue.trim()
  if (!value || props.disabled || props.running) return
  showCommands.value = false
  emit('submit', value)
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
</script>

<style scoped>
.composer-shell { position: relative; z-index: 12; padding: 8px clamp(14px, 2.4vw, 28px) 11px; background: linear-gradient(180deg, rgba(18,19,21,0), #121315 24%); }
.composer-wrap { position: relative; width: min(850px, 100%); margin: 0 auto; }
.composer { overflow: hidden; border: 1px solid #3a3e40; border-radius: 12px; background: #1e2022; box-shadow: 0 16px 45px rgba(0,0,0,.22), inset 0 1px rgba(255,255,255,.025); transition: border-color 130ms ease, box-shadow 130ms ease; }
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
.model-control { display: flex; min-width: 0; max-width: 200px; height: 30px; align-items: center; gap: 6px; border-radius: 7px; padding: 0 8px; color: #9ba09f; font-size: 12px; }
.model-control:hover { color: #d8dcda; background: #292c2e; }
.model-control:disabled { opacity: .5; }
.model-control span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.permission-mode { display: flex; height: 30px; align-items: center; gap: 5px; border-left: 1px solid #333638; margin-left: 2px; padding-left: 8px; color: #747a79; font-size: 11px; white-space: nowrap; }
.runtime-state { display: inline-flex; align-items: center; gap: 5px; color: #777d7c; font-size: 11px; white-space: nowrap; }
.runtime-state i { width: 5px; height: 5px; border-radius: 50%; background: #6e7473; }
.runtime-state.ready i { background: #70cb9b; }
.runtime-state.running i { background: #6fb9e4; animation: pulse 900ms infinite alternate; }
.runtime-state.approval i { background: #d4a65c; }
.runtime-state.history i { background: #8b8f91; }
.send-button,
.stop-button { display: grid; width: 29px; height: 29px; place-items: center; border-radius: 8px; }
.send-button { color: #142119; background: #a8e7c3; }
.send-button:hover { background: #baf2d1; }
.send-button:disabled { cursor: not-allowed; opacity: .28; }
.stop-button { color: #efb5b5; background: #422528; }
.stop-button:hover { background: #512b2e; }
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

@keyframes pulse { to { opacity: .35; } }

@media (max-width: 620px) {
  .composer-shell { padding: 7px 8px 9px; }
  .permission-mode,
  .runtime-state,
  .composer-hint { display: none; }
  .model-control { max-width: 120px; }
  .composer textarea { min-height: 48px; }
}
</style>

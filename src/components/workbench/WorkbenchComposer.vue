<template>
  <footer class="wb-composer-shell">
    <form class="wb-composer" @submit.prevent="submit">
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
      ></textarea>

      <div class="composer-toolbar">
        <div class="tool-shortcuts" aria-label="工具偏好">
          <button
            v-for="tool in tools"
            :key="tool.id"
            type="button"
            :class="{ 'is-active': tool.id === selectedTool }"
            :disabled="disabled"
            @click="emit('select-tool', tool)"
          >
            {{ tool.label }}
          </button>
        </div>

        <div class="composer-actions">
          <button type="button" class="model-button" @click="emit('open-settings')">
            <span>模型</span>
            <strong>{{ modelLabel || '自动路由' }}</strong>
          </button>
          <button v-if="running" type="button" class="stop-button" aria-label="停止任务" @click="emit('stop')">■</button>
          <button v-else type="submit" class="send-button" :disabled="disabled || !canSubmit" aria-label="运行任务">↑</button>
        </div>
      </div>
    </form>
    <p>Agent 可以读取工作区并调用终端、电脑控制和 Creative 工具；高风险操作会先请求批准。</p>
  </footer>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'

defineOptions({ name: 'WorkbenchComposer' })

const props = defineProps({
  modelValue: { type: String, default: '' },
  running: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  placeholder: { type: String, default: '描述你希望 Agent 完成的任务…' },
  tools: { type: Array, default: () => [] },
  selectedTool: { type: String, default: 'auto' },
  modelLabel: { type: String, default: '' },
  autofocusToken: { type: [String, Number], default: 0 }
})

const emit = defineEmits({
  'update:modelValue': value => typeof value === 'string',
  submit: value => typeof value === 'string' && !!value.trim(),
  stop: () => true,
  'select-tool': tool => !!tool && typeof tool === 'object',
  'open-settings': () => true
})

const input = ref(null)
const canSubmit = computed(() => !!props.modelValue.trim())

const onInput = (event) => {
  emit('update:modelValue', event.target.value)
  event.target.style.height = 'auto'
  event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`
}

const submit = () => {
  const value = props.modelValue.trim()
  if (!value || props.disabled || props.running) return
  emit('submit', value)
}

watch(() => props.autofocusToken, async () => {
  await nextTick()
  input.value?.focus()
})
</script>

<style scoped>
.wb-composer-shell {
  position: relative;
  z-index: 10;
  padding: 10px clamp(14px, 3vw, 36px) 12px;
  background: linear-gradient(180deg, rgba(20, 21, 24, 0), #141518 28%);
}

.wb-composer {
  width: min(860px, 100%);
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid #3a3c42;
  border-radius: 13px;
  background: #202226;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.24), inset 0 1px rgba(255, 255, 255, 0.025);
}

.wb-composer:focus-within { border-color: #555860; box-shadow: 0 15px 45px rgba(0, 0, 0, 0.24), 0 0 0 1px rgba(155, 224, 192, 0.08); }
.wb-composer textarea {
  display: block;
  width: 100%;
  min-height: 54px;
  max-height: 180px;
  resize: none;
  border: 0;
  outline: 0;
  padding: 14px 15px 7px;
  color: #f0f1f2;
  background: transparent;
  font-size: 11px;
  line-height: 1.55;
}
.wb-composer textarea::placeholder { color: #777a82; }
.wb-composer textarea:disabled { opacity: 0.55; }

.composer-toolbar { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; padding: 6px 8px 8px 10px; }
.tool-shortcuts { display: flex; flex-wrap: wrap; gap: 4px; }
.tool-shortcuts button {
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 4px 7px;
  color: #8f9299;
  font-size: 8px;
  font-weight: 650;
}
.tool-shortcuts button:hover { color: #d5d6d9; background: #292b30; }
.tool-shortcuts button.is-active { border-color: #3b4c44; color: #a7dfc4; background: #233129; }
.tool-shortcuts button:disabled { cursor: default; opacity: 0.45; }
.composer-actions { display: flex; align-items: center; gap: 6px; }
.model-button { display: flex; align-items: center; gap: 5px; max-width: 160px; border-radius: 6px; padding: 5px 7px; color: #777a82; background: #191a1d; font-size: 7.5px; }
.model-button strong { overflow: hidden; color: #aeb0b6; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.send-button,
.stop-button { display: grid; flex: 0 0 auto; width: 29px; height: 29px; place-items: center; border-radius: 8px; font-size: 15px; font-weight: 850; }
.send-button { color: #132018; background: #b7f5d5; }
.send-button:hover { background: #caffea; }
.send-button:disabled { cursor: not-allowed; opacity: 0.35; }
.stop-button { color: #f5caca; background: #4a2528; font-size: 10px; }
.wb-composer-shell > p { margin: 6px auto 0; color: #5f6269; font-size: 7.5px; text-align: center; }

@media (max-width: 620px) {
  .wb-composer-shell { padding: 8px; }
  .tool-shortcuts button:not(.is-active) { display: none; }
  .model-button span { display: none; }
  .model-button { max-width: 105px; }
  .wb-composer-shell > p { display: none; }
}
</style>

<template>
  <div ref="root" class="reasoning-selector">
    <button
      type="button"
      class="reasoning-trigger"
      :class="[`is-${current.tone}`, { 'is-open': open }]"
      :disabled="disabled"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :title="`推理强度：${current.label} · ${current.description}`"
      @click="open = !open"
    >
      <workbench-icon name="brain" :size="14" />
      <span><small>推理</small><strong>{{ current.label }}</strong></span>
      <span class="effort-meter" aria-hidden="true">
        <i v-for="index in 5" :key="index" :class="{ 'is-filled': index <= effortLevel }"></i>
      </span>
      <workbench-icon name="chevron-down" :size="11" />
    </button>

    <div v-if="open" class="reasoning-popover" role="listbox" aria-label="选择推理强度">
      <header><span>推理强度</span><small>不同模型支持范围不同</small></header>
      <div class="effort-options">
        <button
          v-for="option in options"
          :key="option.id"
          type="button"
          role="option"
          :aria-selected="option.id === current.id"
          :class="[`is-${option.tone}`, { 'is-selected': option.id === current.id }]"
          @click="select(option.id)"
        >
          <span class="option-code">{{ option.short }}</span>
          <span><strong>{{ option.label }}</strong><small>{{ option.description }}</small></span>
          <workbench-icon v-if="option.id === current.id" name="check" :size="14" />
        </button>
      </div>
      <p><workbench-icon name="info" :size="13" />当前模型明确不支持所选档位时，Provider 会回退到模型默认强度并写入日志。</p>
    </div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import WorkbenchIcon from '../workbench/WorkbenchIcon.vue'
import { REASONING_EFFORT_OPTIONS, reasoningEffortView } from './reasoningView.js'

defineOptions({ name: 'ReasoningEffortSelector' })

const props = defineProps({
  modelValue: { type: String, default: 'auto' },
  disabled: { type: Boolean, default: false }
})

const emit = defineEmits({
  'update:modelValue': value => REASONING_EFFORT_OPTIONS.some(option => option.id === value),
  update: value => REASONING_EFFORT_OPTIONS.some(option => option.id === value)
})

const options = REASONING_EFFORT_OPTIONS
const root = ref(null)
const open = ref(false)
const current = computed(() => reasoningEffortView(props.modelValue))
const effortLevel = computed(() => ({
  auto: 3,
  minimal: 1,
  low: 2,
  medium: 3,
  high: 4,
  xhigh: 5,
  max: 5
})[current.value.id] || 3)

const select = value => {
  if (props.disabled) return
  emit('update:modelValue', value)
  emit('update', value)
  open.value = false
}

const onDocumentPointerDown = event => {
  if (!root.value?.contains(event.target)) open.value = false
}
const onDocumentKeydown = event => {
  if (event.key === 'Escape') open.value = false
}

watch(() => props.disabled, value => {
  if (value) open.value = false
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<style scoped>
.reasoning-selector { position: relative; display: inline-flex; min-width: 0; }
.reasoning-trigger { display: flex; min-width: 128px; height: 30px; align-items: center; gap: 6px; border: 1px solid var(--sc-border,#373b3c); border-radius: 7px; padding: 0 7px; color: var(--sc-muted,#929895); background: var(--sc-subtle,#1b1e20); }
.reasoning-trigger:hover,
.reasoning-trigger.is-open { border-color: #4a5a52; color: var(--sc-text,#e5e9e7); background: var(--sc-hover,#25292a); }
.reasoning-trigger:disabled { cursor: not-allowed; opacity: .42; }
.reasoning-trigger > span:nth-of-type(1) { display: flex; min-width: 0; align-items: baseline; gap: 4px; }
.reasoning-trigger small { color: var(--sc-faint,#686e6b); font-size: 8.5px; }
.reasoning-trigger strong { font-size: 10.5px; font-weight: 680; }
.reasoning-trigger > svg:last-child { margin-left: auto; }
.effort-meter { display: flex; align-items: flex-end; gap: 1.5px; height: 11px; }
.effort-meter i { width: 2px; height: 4px; border-radius: 2px; background: #505653; }
.effort-meter i:nth-child(2) { height: 5px; }
.effort-meter i:nth-child(3) { height: 7px; }
.effort-meter i:nth-child(4) { height: 9px; }
.effort-meter i:nth-child(5) { height: 11px; }
.effort-meter i.is-filled { background: #68bf8e; }
.reasoning-trigger.is-fast .effort-meter i.is-filled { background: #79b7dd; }
.reasoning-trigger.is-max .effort-meter i.is-filled { background: #bb8fe2; }
.reasoning-popover { position: absolute; z-index: 80; bottom: calc(100% + 7px); left: 0; width: min(390px,calc(100vw - 22px)); overflow: hidden; border: 1px solid var(--sc-border,#373b3c); border-radius: 10px; padding: 6px; color: var(--sc-text,#e5e9e7); background: var(--sc-panel,#1b1e20); box-shadow: 0 22px 68px rgba(0,0,0,.36); }
.reasoning-popover > header { display: flex; align-items: center; justify-content: space-between; padding: 5px 7px 8px; }
.reasoning-popover > header span { font-size: 11px; font-weight: 700; }
.reasoning-popover > header small { color: var(--sc-faint,#686e6b); font-size: 9px; }
.effort-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 3px; }
.effort-options > button { display: grid; grid-template-columns: 35px minmax(0,1fr) 15px; align-items: center; gap: 7px; min-height: 48px; border: 1px solid transparent; border-radius: 7px; padding: 6px; color: var(--sc-muted,#929895); text-align: left; }
.effort-options > button:hover { color: var(--sc-text,#e5e9e7); background: var(--sc-hover,#25292a); }
.effort-options > button.is-selected { border-color: #415047; color: var(--sc-text,#e5e9e7); background: color-mix(in srgb,#63bd89 8%,var(--sc-subtle,#1b1e20)); }
.option-code { display: grid; min-width: 33px; height: 24px; place-items: center; border-radius: 5px; color: #67b98a; background: color-mix(in srgb,#63bd89 10%,var(--sc-subtle,#1b1e20)); font: 7.5px ui-monospace,SFMono-Regular,Menlo,monospace; }
.is-max .option-code { color: #bc91df; background: color-mix(in srgb,#ac75da 10%,var(--sc-subtle,#1b1e20)); }
.effort-options strong,
.effort-options small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.effort-options strong { font-size: 10.5px; }
.effort-options small { margin-top: 2px; color: var(--sc-faint,#686e6b); font-size: 8.5px; }
.effort-options svg { color: #67be8c; }
.reasoning-popover > p { display: flex; align-items: flex-start; gap: 6px; margin: 6px 4px 1px; border-top: 1px solid var(--sc-border,#373b3c); padding: 7px 3px 2px; color: var(--sc-faint,#686e6b); font-size: 8.5px; line-height: 1.45; }
.reasoning-popover > p svg { flex: 0 0 auto; margin-top: 1px; color: #a88bd0; }

@media (max-width: 520px) {
  .reasoning-trigger { min-width: 105px; }
  .reasoning-trigger small,
  .effort-meter { display: none; }
  .reasoning-popover { position: fixed; right: 8px; bottom: 58px; left: 8px; width: auto; }
  .effort-options { grid-template-columns: minmax(0,1fr); }
}
</style>

<template>
  <Teleport to="body">
    <Transition name="dataeyes-startup" appear @after-leave="restoreFocus">
      <section
        v-if="visible"
        class="dataeyes-startup-shell"
        ref="shell"
        role="dialog"
        aria-modal="true"
        aria-label="DataEyes Code 正在启动"
        aria-labelledby="dataeyes-startup-title"
        tabindex="-1"
        @click.self="skip"
      >
        <main class="startup-sequence">
          <div class="startup-mark" aria-hidden="true">
            <span class="mark-orbit"></span>
            <span class="mark-core">DE</span>
          </div>
          <h1 id="dataeyes-startup-title" class="startup-wordmark">DataEyes Code</h1>
          <p class="startup-status">正在准备本地工作区</p>
          <div class="startup-progress" aria-hidden="true">
            <span></span>
          </div>
        </main>

        <button class="startup-skip" type="button" aria-label="跳过 DataEyes Code 启动动画" @click="skip">
          <span>跳过</span><kbd>Esc</kbd>
        </button>

      </section>
    </Transition>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue'
import {
  DATAEYES_STARTUP_DEFAULT_HOLD_MS,
  DATAEYES_STARTUP_STORAGE_KEY,
  prefersReducedStartupMotion,
  rememberDataEyesStartup,
  resolveDataEyesStartupHold,
  shouldShowDataEyesStartup
} from './dataEyesStartup.js'

defineOptions({ name: 'DataEyesCodeStartup' })

const props = defineProps({
  duration: { type: Number, default: DATAEYES_STARTUP_DEFAULT_HOLD_MS },
  storageKey: { type: String, default: DATAEYES_STARTUP_STORAGE_KEY },
  replay: { type: Boolean, default: false }
})

const emit = defineEmits({
  complete: reason => typeof reason === 'string',
  skip: () => true
})

const shell = ref(null)
const visible = ref(props.replay || shouldShowDataEyesStartup(undefined, props.storageKey))
let closeTimer = 0
let focusFrame = 0
let previousFocus = null
let completed = false

const removeKeyboardListener = () => {
  globalThis.removeEventListener?.('keydown', handleKeydown)
}

const complete = (reason = 'complete') => {
  if (completed) return
  completed = true
  globalThis.clearTimeout(closeTimer)
  globalThis.cancelAnimationFrame?.(focusFrame)
  removeKeyboardListener()
  visible.value = false
  emit('complete', reason)
}

const restoreFocus = () => {
  if (previousFocus && previousFocus !== globalThis.document?.body && previousFocus.isConnected) {
    previousFocus.focus?.({ preventScroll: true })
  }
  previousFocus = null
}

const skip = () => {
  if (!visible.value || completed) return
  emit('skip')
  complete('skipped')
}

function handleKeydown(event) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  skip()
}

onMounted(() => {
  if (!visible.value) {
    complete('seen')
    return
  }

  previousFocus = globalThis.document?.activeElement ?? null
  rememberDataEyesStartup(undefined, props.storageKey)
  globalThis.addEventListener?.('keydown', handleKeydown)
  if (typeof globalThis.requestAnimationFrame === 'function') {
    focusFrame = globalThis.requestAnimationFrame(() => shell.value?.focus?.({ preventScroll: true }))
  } else {
    shell.value?.focus?.({ preventScroll: true })
  }
  const hold = resolveDataEyesStartupHold(props.duration, prefersReducedStartupMotion())
  closeTimer = globalThis.setTimeout(() => complete('elapsed'), hold)
})

onBeforeUnmount(() => {
  globalThis.clearTimeout(closeTimer)
  removeKeyboardListener()
})
</script>

<style scoped>
.dataeyes-startup-shell {
  --startup-bg: #f5f5f7;
  --startup-panel: rgba(255, 255, 255, .84);
  --startup-text: #1d1d1f;
  --startup-muted: #6e6e73;
  --startup-border: rgba(0, 0, 0, .08);
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: grid;
  min-width: 280px;
  place-items: center;
  overflow: hidden;
  outline: 2px solid transparent;
  outline-offset: -2px;
  color: var(--startup-text);
  background: var(--startup-bg);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", "PingFang SC", sans-serif;
}

:global(html.dark) .dataeyes-startup-shell {
  --startup-bg: #0e0e10;
  --startup-panel: rgba(28, 28, 30, .86);
  --startup-text: #f5f5f7;
  --startup-muted: #98989d;
  --startup-border: rgba(255, 255, 255, .1);
}

.startup-sequence {
  position: relative;
  display: grid;
  width: min(460px, calc(100vw - 48px));
  justify-items: center;
  padding: 40px 28px;
  text-align: center;
}

.startup-mark {
  position: relative;
  display: grid;
  width: 68px;
  height: 68px;
  place-items: center;
  animation: mark-arrive 520ms cubic-bezier(.2, .78, .2, 1) both;
}

.mark-orbit {
  position: absolute;
  inset: 0;
  border: 1px solid color-mix(in srgb, #147d92 35%, var(--startup-border));
  border-radius: 22px;
  background: var(--startup-panel);
  box-shadow: 0 18px 48px rgba(20, 125, 146, .11), inset 0 1px 0 rgba(255, 255, 255, .38);
  transform: rotate(9deg);
  animation: orbit-settle 760ms cubic-bezier(.2, .8, .2, 1) both;
}

.mark-core {
  position: relative;
  z-index: 1;
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border-radius: 17px;
  color: #fff;
  background: linear-gradient(145deg, #168ea4, #0c697d);
  box-shadow: 0 8px 22px rgba(20, 125, 146, .22);
  font-size: 14px;
  font-weight: 720;
  letter-spacing: -.04em;
}

.startup-wordmark {
  margin: 24px 0 0;
  color: var(--startup-text);
  font-size: clamp(28px, 5vw, 38px);
  font-weight: 650;
  line-height: 1.08;
  letter-spacing: -.045em;
  animation: copy-rise 420ms cubic-bezier(.2, .75, .2, 1) 140ms both;
}

.startup-status {
  margin: 9px 0 0;
  color: var(--startup-muted);
  font-size: 13px;
  line-height: 1.5;
  animation: copy-rise 420ms ease-out 220ms both;
}

.startup-progress {
  width: 128px;
  height: 3px;
  margin-top: 24px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--startup-text) 9%, transparent);
  animation: copy-rise 380ms ease-out 300ms both;
}

.startup-progress span {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: #147d92;
  transform: translateX(-104%);
  animation: progress-fill 940ms cubic-bezier(.3, .7, .2, 1) 230ms forwards;
}

.startup-skip {
  position: absolute;
  right: clamp(22px, 4vw, 58px);
  bottom: clamp(28px, 5vw, 54px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px 7px 11px;
  border: 1px solid var(--startup-border);
  border-radius: 9px;
  color: var(--startup-muted);
  background: var(--startup-panel);
  font-size: 10px;
  animation: copy-rise 360ms ease-out 420ms both;
  transition: opacity 120ms ease, transform 120ms ease;
}

.startup-skip:hover,
.startup-skip:focus-visible {
  color: var(--startup-text);
  opacity: 1;
  transform: translateY(-1px);
}

.startup-skip:focus-visible { outline: 2px solid #147d92; outline-offset: 3px; }
.startup-skip kbd {
  padding: 2px 5px;
  border: 1px solid var(--startup-border);
  border-radius: 4px;
  color: var(--startup-muted);
  background: color-mix(in srgb, var(--startup-text) 4%, transparent);
  font: 500 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.dataeyes-startup-enter-active,
.dataeyes-startup-leave-active { transition: opacity 160ms ease; }
.dataeyes-startup-enter-from,
.dataeyes-startup-leave-to { opacity: 0; }

@keyframes mark-arrive {
  from { opacity: 0; transform: translateY(8px) scale(.92); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes orbit-settle {
  from { transform: rotate(-18deg) scale(.84); }
  to { transform: rotate(9deg) scale(1); }
}

@keyframes copy-rise {
  from { opacity: 0; transform: translate3d(0, 9px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes progress-fill {
  from { transform: translateX(-104%); }
  to { transform: translateX(0); }
}

@media (max-width: 560px) {
  .startup-skip { right: 50%; bottom: 62px; transform: translateX(50%); }
  .startup-skip:hover,
  .startup-skip:focus-visible { transform: translate3d(50%, -1px, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .dataeyes-startup-enter-active,
  .dataeyes-startup-leave-active,
  .startup-mark,
  .mark-orbit,
  .startup-wordmark,
  .startup-status,
  .startup-progress,
  .startup-progress span,
  .startup-skip {
    animation: none !important;
    transition-duration: 1ms !important;
  }

  .startup-mark,
  .mark-orbit,
  .startup-wordmark,
  .startup-status,
  .startup-progress,
  .startup-progress span,
  .startup-skip {
    opacity: 1;
    transform: none;
  }
}
</style>

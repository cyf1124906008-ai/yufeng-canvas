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
        <div class="startup-chrome startup-chrome-top" aria-hidden="true">
          <span>DATAEYES / LOCAL AGENT</span>
          <span>BOOT 01</span>
        </div>

        <main class="startup-sequence">
          <div class="execution-rail" aria-hidden="true">
            <span class="rail-line"></span>
            <span class="rail-packet rail-packet-left"></span>
            <span class="rail-packet rail-packet-right"></span>
            <span class="rail-cursor"></span>
          </div>

          <p class="startup-kicker">LOCAL AGENT WORKBENCH</p>
          <h1 id="dataeyes-startup-title" class="startup-wordmark">
            <span>DataEyes</span><em>Code</em>
          </h1>
          <p id="dataeyes-startup-manifesto" class="startup-manifesto">Plan <i></i> Act <i></i> Verify</p>

          <div class="startup-signal" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span>
          </div>
        </main>

        <button class="startup-skip" type="button" aria-label="跳过 DataEyes Code 启动动画" @click="skip">
          <span>跳过</span><kbd>Esc</kbd>
        </button>

        <div class="startup-chrome startup-chrome-bottom" aria-hidden="true">
          <span>WORKSPACE BOUNDARY</span>
          <span>APPROVAL PROTECTED</span>
        </div>
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
  position: fixed;
  z-index: 2147483000;
  inset: 0;
  display: grid;
  min-width: 280px;
  place-items: center;
  overflow: hidden;
  color: #edf3ef;
  background:
    radial-gradient(circle at 50% 46%, rgba(128, 228, 176, .075), transparent 29%),
    linear-gradient(145deg, #0d1010, #121615 58%, #0d1010);
  font-family: "HarmonyOS Sans SC", "MiSans", "PingFang SC", sans-serif;
}

.dataeyes-startup-shell::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: .18;
  background-image:
    linear-gradient(rgba(255, 255, 255, .025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, .018) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: radial-gradient(circle at center, #000 0 34%, transparent 74%);
}

.startup-chrome {
  position: absolute;
  right: clamp(22px, 4vw, 58px);
  left: clamp(22px, 4vw, 58px);
  display: flex;
  justify-content: space-between;
  color: #59615e;
  font: 600 9px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .18em;
  text-transform: uppercase;
  animation: chrome-reveal 360ms ease-out 120ms both;
}

.startup-chrome-top { top: clamp(22px, 4vw, 48px); }
.startup-chrome-bottom { bottom: clamp(22px, 4vw, 48px); }

.startup-sequence {
  position: relative;
  width: min(720px, calc(100vw - 48px));
  padding: 44px 20px 34px;
  text-align: center;
}

.execution-rail {
  position: relative;
  width: min(460px, 78vw);
  height: 24px;
  margin: 0 auto 26px;
}

.rail-line,
.rail-packet,
.rail-cursor {
  position: absolute;
  top: 50%;
  display: block;
}

.rail-line {
  right: 0;
  left: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, #47534e 18%, #86d8ad 50%, #47534e 82%, transparent);
  transform: scaleX(.06);
  animation: rail-open 650ms cubic-bezier(.22, .75, .2, 1) 90ms both;
}

.rail-packet {
  width: 7px;
  height: 7px;
  margin-top: -3px;
  border: 1px solid rgba(139, 222, 177, .72);
  background: #12251b;
  box-shadow: 0 0 14px rgba(115, 221, 165, .24);
}

.rail-packet-left {
  left: 50%;
  animation: packet-left 720ms cubic-bezier(.18, .72, .16, 1) 120ms both;
}

.rail-packet-right {
  right: 50%;
  animation: packet-right 720ms cubic-bezier(.18, .72, .16, 1) 120ms both;
}

.rail-cursor {
  left: 50%;
  width: 2px;
  height: 18px;
  margin-top: -9px;
  background: #a4efc5;
  box-shadow: 0 0 18px rgba(139, 232, 182, .5);
  animation: cursor-resolve 420ms ease-out 680ms both;
}

.startup-kicker {
  color: #76b895;
  font: 700 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .22em;
  animation: copy-rise 430ms cubic-bezier(.2, .75, .2, 1) 260ms both;
}

.startup-wordmark {
  display: flex;
  justify-content: center;
  margin-top: 10px;
  color: #f2f5f3;
  font-size: clamp(42px, 8vw, 78px);
  font-weight: 650;
  line-height: .95;
  letter-spacing: -.065em;
}

.startup-wordmark span,
.startup-wordmark em {
  display: inline-block;
  font-style: normal;
  animation: copy-rise 500ms cubic-bezier(.2, .75, .2, 1) both;
}

.startup-wordmark span { animation-delay: 330ms; }
.startup-wordmark em {
  margin-left: .18em;
  color: #9ae3b9;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: .86em;
  font-weight: 420;
  letter-spacing: -.08em;
  animation-delay: 410ms;
}

.startup-manifesto {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
  color: #717a76;
  font: 600 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .15em;
  text-transform: uppercase;
  animation: copy-rise 420ms ease-out 530ms both;
}

.startup-manifesto i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #56876c;
}

.startup-signal {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 13px;
  margin-top: 26px;
  animation: copy-rise 380ms ease-out 620ms both;
}

.startup-signal span {
  display: block;
  width: 2px;
  height: 8px;
  border-radius: 2px;
  background: #78c89c;
  transform-origin: 50% 100%;
  animation: signal-pulse 520ms ease-in-out 720ms alternate both;
}

.startup-signal span:nth-child(2),
.startup-signal span:nth-child(4) { animation-delay: 790ms; }
.startup-signal span:nth-child(3) { animation-delay: 850ms; }

.startup-skip {
  position: absolute;
  right: clamp(22px, 4vw, 58px);
  bottom: clamp(50px, 7vw, 84px);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px 7px 11px;
  border: 1px solid rgba(255, 255, 255, .08);
  border-radius: 7px;
  color: #7c8581;
  background: rgba(255, 255, 255, .025);
  font-size: 10px;
  animation: chrome-reveal 360ms ease-out 560ms both;
  transition: opacity 120ms ease, transform 120ms ease;
}

.startup-skip:hover,
.startup-skip:focus-visible {
  color: #dbe3df;
  opacity: 1;
  transform: translateY(-1px);
}

.startup-skip:focus-visible { outline: 1px solid #83cfa4; outline-offset: 3px; }
.startup-skip kbd {
  padding: 2px 5px;
  border: 1px solid rgba(255, 255, 255, .09);
  border-radius: 4px;
  color: #656e6a;
  background: rgba(255, 255, 255, .035);
  font: 500 8px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.dataeyes-startup-enter-active,
.dataeyes-startup-leave-active { transition: opacity 160ms ease; }
.dataeyes-startup-enter-from,
.dataeyes-startup-leave-to { opacity: 0; }

@keyframes rail-open {
  from { opacity: 0; transform: scaleX(.06); }
  to { opacity: 1; transform: scaleX(1); }
}

@keyframes packet-left {
  from { opacity: 0; transform: translate3d(-220px, 0, 0) rotate(45deg) scale(.6); }
  70% { opacity: 1; }
  to { opacity: 0; transform: translate3d(-3px, 0, 0) rotate(45deg) scale(.8); }
}

@keyframes packet-right {
  from { opacity: 0; transform: translate3d(220px, 0, 0) rotate(45deg) scale(.6); }
  70% { opacity: 1; }
  to { opacity: 0; transform: translate3d(3px, 0, 0) rotate(45deg) scale(.8); }
}

@keyframes cursor-resolve {
  from { opacity: 0; transform: scaleY(.2); }
  55% { opacity: 1; transform: scaleY(1); }
  to { opacity: .72; transform: scaleY(.74); }
}

@keyframes copy-rise {
  from { opacity: 0; transform: translate3d(0, 9px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes chrome-reveal {
  from { opacity: 0; transform: translate3d(0, 4px, 0); }
  to { opacity: 1; transform: translate3d(0, 0, 0); }
}

@keyframes signal-pulse {
  from { opacity: .3; transform: scaleY(.38); }
  to { opacity: 1; transform: scaleY(1); }
}

@media (max-width: 560px) {
  .startup-wordmark { display: block; }
  .startup-wordmark em { margin-top: 8px; margin-left: 0; }
  .startup-skip { right: 50%; bottom: 62px; transform: translateX(50%); }
  .startup-skip:hover,
  .startup-skip:focus-visible { transform: translate3d(50%, -1px, 0); }
  .startup-chrome-bottom span:last-child { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .dataeyes-startup-enter-active,
  .dataeyes-startup-leave-active,
  .startup-chrome,
  .rail-line,
  .rail-packet,
  .rail-cursor,
  .startup-kicker,
  .startup-wordmark span,
  .startup-wordmark em,
  .startup-manifesto,
  .startup-signal,
  .startup-signal span,
  .startup-skip {
    animation: none !important;
    transition-duration: 1ms !important;
  }

  .rail-line,
  .rail-cursor,
  .startup-chrome,
  .startup-kicker,
  .startup-wordmark span,
  .startup-wordmark em,
  .startup-manifesto,
  .startup-signal,
  .startup-skip {
    opacity: 1;
    transform: none;
  }

  .rail-packet { display: none; }
}
</style>

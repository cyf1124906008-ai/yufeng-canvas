<template>
  <Teleport to="body">
    <Transition name="tour-fade">
      <div v-if="show" class="guided-tour-layer" @keydown.esc="skipTour">
        <div class="tour-dim"></div>
        <div v-if="targetRect" class="tour-spotlight" :style="spotlightStyle"></div>
        <section class="tour-card" :class="{ 'is-center': !targetRect }" :style="cardStyle">
          <div class="tour-card-head">
            <span>{{ currentStepNumber }}</span>
            <button @click="skipTour">跳过</button>
          </div>
          <p class="tour-kicker">{{ currentStep.kicker || 'YUFENG GUIDE' }}</p>
          <h3>{{ currentStep.title }}</h3>
          <p class="tour-body">{{ currentStep.body }}</p>
          <div v-if="currentStep.hint" class="tour-hint">{{ currentStep.hint }}</div>
          <div class="tour-progress" aria-hidden="true">
            <i
              v-for="(_, index) in steps"
              :key="index"
              :class="{ active: index === currentIndex }"
            ></i>
          </div>
          <div class="tour-actions">
            <button class="tour-secondary" :disabled="currentIndex === 0" @click="previousStep">上一步</button>
            <button class="tour-primary" @click="nextStep">
              {{ isLastStep ? '完成导览' : '下一步' }}
            </button>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  steps: {
    type: Array,
    default: () => []
  },
  storageKey: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:show', 'finish', 'skip', 'step-change'])

const currentIndex = ref(0)
const targetRect = ref(null)

const currentStep = computed(() => props.steps[currentIndex.value] || {})
const isLastStep = computed(() => currentIndex.value >= props.steps.length - 1)
const currentStepNumber = computed(() => `${currentIndex.value + 1}/${Math.max(props.steps.length, 1)}`)

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

const measureTarget = () => {
  const selector = currentStep.value?.target
  if (!selector) {
    targetRect.value = null
    return
  }

  const element = document.querySelector(selector)
  if (!element) {
    targetRect.value = null
    return
  }

  const rect = element.getBoundingClientRect()
  targetRect.value = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height
  }
}

const updateTarget = async ({ scroll = false } = {}) => {
  if (!props.show) return
  await nextTick()

  const selector = currentStep.value?.target
  if (!selector) {
    targetRect.value = null
    return
  }

  const element = document.querySelector(selector)
  if (!element) {
    targetRect.value = null
    return
  }

  if (scroll) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    window.setTimeout(measureTarget, 260)
    return
  }

  measureTarget()
}

const spotlightStyle = computed(() => {
  if (!targetRect.value) return {}
  const pad = currentStep.value.padding ?? 10
  return {
    top: `${targetRect.value.top - pad}px`,
    left: `${targetRect.value.left - pad}px`,
    width: `${targetRect.value.width + pad * 2}px`,
    height: `${targetRect.value.height + pad * 2}px`
  }
})

const cardStyle = computed(() => {
  if (!targetRect.value) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)'
    }
  }

  const width = Math.min(420, window.innerWidth - 32)
  const gap = 18
  const side = currentStep.value.side || 'auto'
  const rect = targetRect.value

  let top = rect.top + rect.height + gap
  let left = rect.left + rect.width / 2 - width / 2

  if (side === 'top' || (side === 'auto' && top + 260 > window.innerHeight)) {
    top = rect.top - 260 - gap
  }

  if (side === 'right') {
    top = rect.top + rect.height / 2 - 130
    left = rect.left + rect.width + gap
  }

  if (side === 'left') {
    top = rect.top + rect.height / 2 - 130
    left = rect.left - width - gap
  }

  return {
    width: `${width}px`,
    top: `${clamp(top, 16, window.innerHeight - 292)}px`,
    left: `${clamp(left, 16, window.innerWidth - width - 16)}px`
  }
})

const finishTour = (eventName = 'finish') => {
  if (props.storageKey) {
    localStorage.setItem(props.storageKey, 'done')
  }
  emit('update:show', false)
  emit(eventName)
}

const nextStep = () => {
  if (isLastStep.value) {
    finishTour('finish')
    return
  }
  currentIndex.value += 1
}

const previousStep = () => {
  currentIndex.value = Math.max(0, currentIndex.value - 1)
}

const skipTour = () => {
  finishTour('skip')
}

const handleKeydown = (event) => {
  if (!props.show) return
  if (event.key === 'Escape') skipTour()
  if (event.key === 'ArrowRight') nextStep()
  if (event.key === 'ArrowLeft') previousStep()
}

watch(
  () => props.show,
  (visible) => {
  if (visible) {
    currentIndex.value = 0
      emit('step-change', currentStep.value, currentIndex.value)
      updateTarget({ scroll: true })
      window.addEventListener('keydown', handleKeydown)
      window.addEventListener('resize', measureTarget)
      window.addEventListener('scroll', measureTarget, true)
    } else {
      window.removeEventListener('keydown', handleKeydown)
      window.removeEventListener('resize', measureTarget)
      window.removeEventListener('scroll', measureTarget, true)
    }
  }
)

watch(currentIndex, () => {
  emit('step-change', currentStep.value, currentIndex.value)
  updateTarget({ scroll: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', measureTarget)
  window.removeEventListener('scroll', measureTarget, true)
})
</script>

<style scoped>
.guided-tour-layer {
  position: fixed;
  inset: 0;
  z-index: 1000000;
  pointer-events: none;
}

.tour-dim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at var(--tour-x, 50%) var(--tour-y, 45%), rgba(30, 255, 214, 0.12), transparent 28%),
    rgba(2, 8, 16, 0.48);
}

.tour-spotlight {
  position: fixed;
  border-radius: 24px;
  border: 2px solid rgba(111, 255, 221, 0.95);
  box-shadow:
    0 0 0 9999px rgba(2, 8, 16, 0.24),
    0 0 38px rgba(45, 255, 211, 0.6),
    inset 0 0 34px rgba(255, 255, 255, 0.18);
  background: rgba(98, 255, 219, 0.08);
  pointer-events: none;
  transition: all 0.28s ease;
  overflow: hidden;
}

.tour-spotlight::before {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: inherit;
  padding: 3px;
  background: conic-gradient(from 0deg, transparent 0 16%, #6dffd9 26%, #2cbcff 34%, transparent 46% 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: tour-ring-spin 4.8s linear infinite;
}

.tour-spotlight::after {
  content: "";
  position: absolute;
  top: 8px;
  left: 14px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #74ffe1;
  box-shadow: 0 0 18px #74ffe1;
  animation: tour-orbit 3.6s ease-in-out infinite;
}

.tour-card {
  position: fixed;
  pointer-events: auto;
  max-width: calc(100vw - 32px);
  padding: 22px;
  border-radius: 28px;
  color: #ecfeff;
  border: 1px solid rgba(170, 255, 235, 0.28);
  background:
    linear-gradient(145deg, rgba(7, 28, 40, 0.78), rgba(8, 72, 68, 0.58)),
    rgba(4, 15, 25, 0.72);
  box-shadow:
    0 24px 70px rgba(0, 0, 0, 0.42),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(12px) saturate(1.25);
  transition: all 0.28s ease;
}

.tour-card::before {
  content: "";
  position: absolute;
  inset: 1px;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(110deg, rgba(255, 255, 255, 0.26), transparent 34%, rgba(82, 255, 210, 0.16) 72%, transparent);
  opacity: 0.65;
}

.tour-card-head,
.tour-actions,
.tour-progress,
.tour-hint,
.tour-kicker,
.tour-body,
.tour-card h3 {
  position: relative;
  z-index: 1;
}

.tour-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.tour-card-head span {
  font-size: 12px;
  letter-spacing: 0.18em;
  color: rgba(175, 255, 232, 0.82);
}

.tour-card-head button,
.tour-secondary,
.tour-primary {
  border: 0;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.tour-card-head button {
  border-radius: 999px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.1);
}

.tour-kicker {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.22em;
  color: #5dffd0;
}

.tour-card h3 {
  margin: 0;
  font-size: 24px;
  line-height: 1.18;
  letter-spacing: -0.03em;
}

.tour-body {
  margin: 12px 0 0;
  color: rgba(236, 254, 255, 0.82);
  line-height: 1.7;
  font-size: 14px;
}

.tour-hint {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 18px;
  color: rgba(236, 254, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-size: 13px;
}

.tour-progress {
  display: flex;
  gap: 7px;
  margin-top: 18px;
}

.tour-progress i {
  width: 22px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  transition: all 0.2s ease;
}

.tour-progress i.active {
  width: 42px;
  background: linear-gradient(90deg, #61ffd5, #2aa8ff);
  box-shadow: 0 0 18px rgba(64, 255, 212, 0.42);
}

.tour-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
}

.tour-secondary,
.tour-primary {
  min-width: 94px;
  border-radius: 999px;
  padding: 11px 16px;
  font-weight: 800;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.tour-secondary {
  background: rgba(255, 255, 255, 0.16);
  color: #ecfeff;
}

.tour-secondary:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.tour-primary {
  color: #031417;
  background: linear-gradient(135deg, #78ffe0, #20b7ff);
  box-shadow: 0 16px 34px rgba(28, 203, 255, 0.28);
}

.tour-secondary:not(:disabled):hover,
.tour-primary:hover {
  transform: translateY(-1px);
}

.tour-fade-enter-active,
.tour-fade-leave-active {
  transition: opacity 0.22s ease;
}

.tour-fade-enter-from,
.tour-fade-leave-to {
  opacity: 0;
}

@media (prefers-color-scheme: light) {
  .tour-dim {
    background:
      radial-gradient(circle at 50% 45%, rgba(20, 184, 166, 0.16), transparent 32%),
      rgba(226, 246, 247, 0.5);
  }

  .tour-card {
    color: #09222d;
    background:
      linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(222, 255, 247, 0.88)),
      rgba(255, 255, 255, 0.9);
    border-color: rgba(15, 118, 110, 0.28);
    box-shadow:
      0 28px 70px rgba(19, 95, 115, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.72);
  }

  .tour-body,
  .tour-hint {
    color: rgba(9, 34, 45, 0.72);
  }

  .tour-card-head button,
  .tour-secondary,
  .tour-hint {
    color: #09222d;
    background: rgba(255, 255, 255, 0.72);
  }
}

@keyframes tour-ring-spin {
  to {
    transform: rotate(1turn);
  }
}

@keyframes tour-orbit {
  0%, 100% {
    transform: translate(0, 0);
  }
  25% {
    transform: translate(calc(100% + 22px), 0);
  }
  50% {
    transform: translate(calc(100% + 22px), calc(100% + 22px));
  }
  75% {
    transform: translate(0, calc(100% + 22px));
  }
}
</style>

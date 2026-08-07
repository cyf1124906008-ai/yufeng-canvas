<template>
  <svg
    class="dataeyes-mark"
    :width="size"
    :height="size"
    viewBox="0 0 40 40"
    fill="none"
    aria-hidden="true"
  >
    <circle class="mark-orbit mark-orbit-outer" cx="20" cy="20" r="15.25" />
    <circle class="mark-orbit mark-orbit-inner" cx="20" cy="20" r="9.25" />
    <path class="mark-signal" d="M4.5 20h9.15l3.25-5.25 5.15 10.5 3.15-5.25H35.5" />
    <circle class="mark-core" cx="20" cy="20" r="2.6" />
  </svg>
</template>

<script setup>
defineOptions({ name: 'DataEyesMark' })

defineProps({
  size: { type: [Number, String], default: 32 }
})
</script>

<style scoped>
.dataeyes-mark {
  display: block;
  overflow: visible;
  color: currentColor;
}

.mark-orbit {
  stroke: currentColor;
  stroke-width: 1.25;
  opacity: .34;
}

.mark-orbit-inner {
  stroke-dasharray: 3 3.5;
  opacity: .58;
}

.mark-signal {
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mark-core {
  fill: currentColor;
  filter: drop-shadow(0 0 4px currentColor);
}

@media (prefers-reduced-motion: no-preference) {
  .mark-orbit-inner {
    animation: dataeyes-mark-orbit 8s linear infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
}

@keyframes dataeyes-mark-orbit {
  to { transform: rotate(360deg); }
}
</style>

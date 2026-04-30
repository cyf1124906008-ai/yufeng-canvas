<template>
  <div class="handle-menu-anchor nodrag nopan">
    <Handle type="source" :position="Position.Right" id="right" class="node-source-handle" />

    <div
      v-if="showHandleHoverZone"
      class="handle-add-button nodrag nopan"
      role="button"
      tabindex="0"
      :aria-expanded="showMenu"
      title="添加下一个节点"
      @mouseenter="handleMouseEnter"
      @mouseleave="handleMouseLeave"
      @pointerdown.stop
      @mousedown.stop
      @mouseup.stop
      @click.stop="toggleMenu"
      @keydown.enter.prevent.stop="toggleMenu"
      @keydown.space.prevent.stop="toggleMenu"
    >
      <n-icon :size="16" class="add-icon">
        <AddOutline />
      </n-icon>
    </div>

    <transition name="menu-fade">
      <div
        v-if="showMenu"
        class="handle-menu nodrag nopan"
        @mouseenter="handleMenuMouseEnter"
        @mouseleave="handleMenuMouseLeave"
        @pointerdown.stop
        @mousedown.stop
        @mouseup.stop
        @click.stop
      >
        <button
          v-for="item in menuItems"
          :key="item.action || item.type"
          type="button"
          class="menu-item group nodrag nopan"
          @pointerdown.stop
          @mousedown.stop
          @mouseup.stop
          @click.stop="handleCreate(item)"
        >
          <n-icon :size="15" class="menu-icon">
            <component :is="item.icon" />
          </n-icon>
          <span class="menu-label">{{ item.label }}</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { NIcon } from 'naive-ui'
import { AddOutline } from '@vicons/ionicons5'

const props = defineProps({
  nodeId: { type: String, required: true },
  nodeType: { type: String, required: true },
  visible: { type: Boolean },
  dotColor: { type: String, default: 'var(--accent-color)' },
  operations: { type: Array, default: null }
})

const emit = defineEmits(['select'])

const showMenu = ref(false)
let hideTimeout = null

const clearHideTimer = () => {
  if (hideTimeout) {
    clearTimeout(hideTimeout)
    hideTimeout = null
  }
}

const handleMouseEnter = () => {
  clearHideTimer()
  showMenu.value = true
}

const handleMouseLeave = () => {
  clearHideTimer()
  hideTimeout = setTimeout(() => {
    showMenu.value = false
  }, 220)
}

const handleMenuMouseEnter = () => {
  clearHideTimer()
  showMenu.value = true
}

const handleMenuMouseLeave = () => {
  handleMouseLeave()
}

const toggleMenu = () => {
  clearHideTimer()
  showMenu.value = !showMenu.value
}

const menuItems = computed(() => props.operations || [])

const showHandleHoverZone = computed(() => {
  return props.operations && props.operations.length > 0
})

const handleCreate = (item) => {
  emit('select', item)
  showMenu.value = false
}
</script>

<style scoped>
.handle-menu-anchor {
  position: absolute;
  left: 100%;
  top: 50%;
  width: 128px;
  height: 78px;
  transform: translateY(-50%);
  z-index: 10050;
  pointer-events: none;
}

.node-source-handle {
  left: 0 !important;
  right: auto !important;
  top: 50% !important;
  width: 16px !important;
  height: 16px !important;
  border: 2px solid rgba(240, 253, 250, 0.98) !important;
  background: linear-gradient(135deg, #5eead4, #22c55e) !important;
  box-shadow:
    0 0 0 4px rgba(20, 184, 166, 0.18),
    0 0 18px rgba(45, 212, 191, 0.72) !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  z-index: 10054 !important;
}

.handle-add-button {
  position: absolute;
  left: 28px;
  top: 50%;
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%);
  border: 1px solid rgba(240, 253, 250, 0.78);
  border-radius: 14px;
  color: #fff;
  background:
    radial-gradient(circle at 30% 20%, rgba(255, 255, 255, 0.88), transparent 36%),
    linear-gradient(135deg, rgba(20, 184, 166, 0.96), rgba(14, 165, 233, 0.86));
  box-shadow:
    0 12px 28px rgba(15, 23, 42, 0.24),
    0 0 24px rgba(45, 212, 191, 0.46);
  cursor: pointer;
  pointer-events: auto;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
  z-index: 10056;
}

.handle-add-button:hover,
.handle-add-button:focus-visible {
  border-color: rgba(255, 255, 255, 0.96);
  transform: translateY(-50%) scale(1.08);
  box-shadow:
    0 14px 32px rgba(15, 23, 42, 0.28),
    0 0 30px rgba(94, 234, 212, 0.62);
  outline: none;
}

.add-icon {
  color: #fff;
  filter: drop-shadow(0 1px 4px rgba(6, 78, 59, 0.5));
}

.handle-menu {
  position: absolute;
  left: 68px;
  top: 50%;
  display: flex;
  min-width: 148px;
  flex-direction: column;
  gap: 4px;
  padding: 7px;
  transform: translateY(-50%);
  border: 1px solid rgba(94, 234, 212, 0.32);
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(15, 23, 42, 0.92), rgba(8, 47, 73, 0.86)),
    rgba(15, 23, 42, 0.9);
  box-shadow:
    0 18px 46px rgba(0, 0, 0, 0.36),
    0 0 28px rgba(45, 212, 191, 0.16);
  white-space: nowrap;
  backdrop-filter: blur(18px);
  z-index: 10060;
  pointer-events: auto;
}

.menu-item {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 8px 10px;
  color: rgba(226, 252, 249, 0.86);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
  user-select: none;
}

.menu-item:hover {
  border-color: rgba(94, 234, 212, 0.34);
  color: #ecfeff;
  background: rgba(20, 184, 166, 0.22);
}

.menu-icon {
  color: rgba(94, 234, 212, 0.88);
}

.menu-label {
  font-weight: 700;
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translate(6px, -50%);
}
</style>

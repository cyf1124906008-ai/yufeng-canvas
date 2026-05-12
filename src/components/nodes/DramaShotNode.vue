<template>
  <div class="drama-shot-node" :class="[`status-${data.status || 'idle'}`]">
    <Handle type="target" :position="Position.Left" class="handle-left" />
    <Handle type="source" :position="Position.Right" class="handle-right" />

    <div class="shot-header">
      <span class="shot-index">#{{ data.shotIndex || '?' }}</span>
      <span class="shot-camera">{{ cameraLabel }}</span>
      <span class="shot-badge" :class="`badge-${data.status || 'idle'}`">{{ statusLabel }}</span>
    </div>

    <div v-if="data.sceneName" class="shot-meta">
      <span class="meta-label">场景</span> {{ data.sceneName }}
    </div>
    <div v-if="data.characterNames" class="shot-meta">
      <span class="meta-label">角色</span> {{ data.characterNames }}
    </div>

    <div class="shot-desc">{{ data.description || '无描述' }}</div>

    <div class="shot-actions">
      <button class="sa-btn sa-firstframe" :disabled="data.firstFrameStatus === 'generating'" @click.stop="emitAction('createFirstFrameWorkflow', data.shotId)">首帧</button>
      <button class="sa-btn sa-video" :disabled="data.videoStatus === 'generating'" @click.stop="emitAction('createVideoWorkflow', data.shotId)">视频</button>
      <button class="sa-btn sa-edit" @click.stop="emitAction('locateDramaShot', data.shotId)">编辑</button>
      <button class="sa-btn sa-delete" @click.stop="emitAction('removeDramaShot', data.shotId)">删除</button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { DRAMA_STATUS_LABELS } from '../../integrations/drama/dramaWorkspace'

const props = defineProps({ id: String, data: { type: Object, default: () => ({}) } })

const emit = defineEmits(['action'])

const cameraLabel = computed(() => {
  const parts = [props.data.shotType, props.data.angle, props.data.movement].filter(Boolean)
  return parts.length ? parts.join(' · ') : ''
})

const statusLabel = computed(() => DRAMA_STATUS_LABELS[props.data.status] || props.data.status || '空闲')

function emitAction(action, payload) {
  window.dispatchEvent(new CustomEvent('yufeng:drama-action', { detail: { action, payload, nodeId: props.id } }))
}

function handleShotUpdate(e) {
  // Node doesn't directly mutate — Canvas.vue handles sync
}

onMounted(() => {
  if (props.data.shotId) {
    window.addEventListener(`yufeng:update-drama-shot-${props.data.shotId}`, handleShotUpdate)
  }
})

onBeforeUnmount(() => {
  if (props.data.shotId) {
    window.removeEventListener(`yufeng:update-drama-shot-${props.data.shotId}`, handleShotUpdate)
  }
})
</script>

<style scoped>
.drama-shot-node {
  position: relative;
  min-width: 220px;
  max-width: 260px;
  border-radius: 16px;
  border: 1px solid rgba(255,255,255,0.1);
  background: rgba(15, 23, 42, 0.92);
  padding: 10px 12px;
  font-size: 11px;
  color: rgba(255,255,255,0.85);
  box-shadow: 0 4px 24px rgba(0,0,0,0.3);
  overflow: visible;
}
.shot-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.shot-index {
  font-weight: 800;
  font-size: 14px;
  color: #34d399;
}
.shot-camera {
  flex: 1;
  font-size: 10px;
  color: rgba(255,255,255,0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.shot-badge {
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 999px;
  white-space: nowrap;
}
.badge-idle { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); }
.badge-pending { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.5); }
.badge-queued { background: rgba(251,191,36,0.15); color: #fbbf24; }
.badge-generating { background: rgba(96,165,250,0.15); color: #60a5fa; }
.badge-completed { background: rgba(52,211,153,0.15); color: #34d399; }
.badge-failed { background: rgba(248,113,113,0.15); color: #f87171; }
.badge-firstFrameReady { background: rgba(52,211,153,0.15); color: #34d399; }
.badge-videoReady { background: rgba(52,211,153,0.15); color: #34d399; }
.shot-meta {
  font-size: 10px;
  color: rgba(255,255,255,0.6);
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-label {
  color: rgba(255,255,255,0.35);
  margin-right: 4px;
}
.shot-desc {
  margin: 6px 0;
  font-size: 11px;
  line-height: 1.4;
  color: rgba(255,255,255,0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.shot-actions {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.sa-btn {
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.65);
  font-size: 10px;
  padding: 4px 8px;
  cursor: pointer;
}
.sa-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: white; }
.sa-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sa-firstframe:hover:not(:disabled) { border-color: rgba(96,165,250,0.4); }
.sa-video:hover:not(:disabled) { border-color: rgba(168,85,247,0.4); }
.sa-edit:hover:not(:disabled) { border-color: rgba(52,211,153,0.4); }
.sa-delete:hover:not(:disabled) { border-color: rgba(248,113,113,0.4); }
.handle-left, .handle-right {
  width: 22px !important;
  height: 22px !important;
  background: linear-gradient(135deg, #5eead4, #22c55e) !important;
  border: 2px solid rgba(240, 253, 250, 0.98) !important;
  box-shadow: none !important;
  pointer-events: auto !important;
  z-index: 100000 !important;
  cursor: crosshair !important;
}
</style>

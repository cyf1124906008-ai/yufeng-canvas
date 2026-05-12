<template>
  <BaseEdge :path="path" :style="edgeStyle" />

  <EdgeLabelRenderer>
    <div
      :style="{
        position: 'absolute',
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: 'all'
      }"
      class="nodrag nopan"
    >
      <n-dropdown :options="imageRoleOptions" @select="handleRoleSelect" size="small">
        <button class="edge-label-pill image-role-label">
          {{ currentRoleLabel }}
          <n-icon :size="10"><ChevronDownOutline /></n-icon>
        </button>
      </n-dropdown>
    </div>
  </EdgeLabelRenderer>
</template>

<script setup>
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useVueFlow } from '@vue-flow/core'
import { NDropdown, NIcon } from 'naive-ui'
import { ChevronDownOutline } from '@vicons/ionicons5'
import { edges } from '../../stores/canvas'

const { updateEdgeData } = useVueFlow()

const props = defineProps({
  id: String,
  source: String,
  target: String,
  sourceX: Number,
  sourceY: Number,
  targetX: Number,
  targetY: Number,
  sourcePosition: String,
  targetPosition: String,
  data: Object,
  markerEnd: String,
  style: Object
})

const imageRoleOptions = [
  { label: '首帧', key: 'first_frame_image' },
  { label: '尾帧', key: 'last_frame_image' },
  { label: '参考图', key: 'input_reference' }
]

const currentRole = computed(() => props.data?.imageRole || 'first_frame_image')

const currentRoleLabel = computed(() => {
  const option = imageRoleOptions.find(item => item.key === currentRole.value)
  return option?.label || '首帧'
})

const path = computed(() => {
  const [edgePath] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition
  })
  return edgePath
})

const labelX = computed(() => (props.sourceX + props.targetX) / 2)
const labelY = computed(() => (props.sourceY + props.targetY) / 2)

const edgeStyle = computed(() => ({
  stroke: '#60a5fa',
  strokeWidth: 4.2,
  strokeLinecap: 'round',
  ...props.style
}))

const handleRoleSelect = (role) => {
  if (role === 'first_frame_image' || role === 'last_frame_image') {
    const sameTargetEdges = edges.value.filter(edge =>
      edge.target === props.target &&
      edge.id !== props.id &&
      edge.data?.imageRole === role
    )

    sameTargetEdges.forEach(edge => {
      const oppositeRole = role === 'first_frame_image' ? 'last_frame_image' : 'first_frame_image'
      updateEdgeData(edge.id, { imageRole: oppositeRole })
    })
  }

  updateEdgeData(props.id, { imageRole: role })
}
</script>

<style scoped>
.edge-label-pill {
  min-width: 68px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid rgba(191, 219, 254, 0.82);
  border-radius: 999px;
  padding: 0 11px;
  color: #dbeafe;
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.32), transparent 42%),
    linear-gradient(135deg, rgba(30, 64, 175, 0.92), rgba(14, 116, 144, 0.86));
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.28);
  font-size: 11px;
  font-weight: 900;
}

.edge-label-pill:hover {
  transform: scale(1.04);
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.32);
}
</style>

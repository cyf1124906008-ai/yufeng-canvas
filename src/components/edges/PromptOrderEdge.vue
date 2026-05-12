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
      <n-dropdown :options="orderOptions" @select="handleOrderSelect" size="small">
        <button class="edge-order-badge">
          Prompt {{ currentOrder }}
        </button>
      </n-dropdown>
    </div>
  </EdgeLabelRenderer>
</template>

<script setup>
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useVueFlow } from '@vue-flow/core'
import { NDropdown } from 'naive-ui'
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

const orderLabels = [
  { label: 'Prompt 1', key: 1 },
  { label: 'Prompt 2', key: 2 },
  { label: 'Prompt 3', key: 3 },
  { label: 'Prompt 4', key: 4 },
  { label: 'Prompt 5', key: 5 }
]

const orderOptions = computed(() => {
  const sameTargetTextEdges = edges.value.filter(edge =>
    edge.target === props.target &&
    edge.type === 'promptOrder'
  )
  const count = sameTargetTextEdges.length || 1
  return orderLabels.slice(0, count)
})

const currentOrder = computed(() => props.data?.promptOrder || 1)

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
const labelY = computed(() => (props.sourceY + props.targetY) / 2 + (currentOrder.value - 1) * 18)

const edgeStyle = computed(() => ({
  stroke: '#34d399',
  strokeWidth: 4.2,
  strokeLinecap: 'round',
  ...props.style
}))

const handleOrderSelect = (newOrder) => {
  const sameTargetTextEdges = edges.value.filter(edge =>
    edge.target === props.target &&
    edge.type === 'promptOrder'
  )

  const edgeWithSameOrder = sameTargetTextEdges.find(edge =>
    edge.id !== props.id &&
    edge.data?.promptOrder === newOrder
  )

  if (edgeWithSameOrder) {
    updateEdgeData(edgeWithSameOrder.id, { promptOrder: currentOrder.value })
  }

  updateEdgeData(props.id, { promptOrder: newOrder })
}
</script>

<style scoped>
.edge-order-badge {
  min-width: 76px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(240, 253, 250, 0.94);
  border-radius: 999px;
  padding: 0 11px;
  color: #f0fdf4;
  background:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.5), transparent 38%),
    linear-gradient(135deg, #5eead4, #10b981);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.32);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.02em;
}

.edge-order-badge:hover {
  transform: scale(1.04);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.34);
}
</style>

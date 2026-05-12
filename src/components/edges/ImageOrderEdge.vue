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
          参考图 {{ currentOrder }}
        </button>
      </n-dropdown>
    </div>
  </EdgeLabelRenderer>
</template>

<script setup>
import { computed } from 'vue'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useVueFlow } from '@vue-flow/core'
import { NDropdown } from 'naive-ui'
import { edges, nodes } from '../../stores/canvas'

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
  { label: '参考图 1', key: 1 },
  { label: '参考图 2', key: 2 },
  { label: '参考图 3', key: 3 },
  { label: '参考图 4', key: 4 },
  { label: '参考图 5', key: 5 }
]

const orderOptions = computed(() => {
  const sameTargetImageEdges = edges.value.filter(edge =>
    edge.target === props.target &&
    edge.type === 'imageOrder'
  )
  const edgeCount = sameTargetImageEdges.length || 1

  let mentionedImageCount = 0
  const connectedTextEdges = edges.value.filter(edge => edge.target === props.target)
  for (const edge of connectedTextEdges) {
    const sourceNode = nodes.value.find(node => node.id === edge.source)
    if (sourceNode?.type !== 'text') continue

    const content = sourceNode.data?.content || ''
    const mentionRegex = /@\[([^\]|]+)(?:\|([^\]]+))?\]/g
    let match
    while ((match = mentionRegex.exec(content)) !== null) {
      const mentionedNode = nodes.value.find(node => node.id === match[1])
      if (mentionedNode?.type === 'image') {
        mentionedImageCount++
      }
    }
  }

  const minOrder = mentionedImageCount + 1
  const maxOrder = Math.min(edgeCount + mentionedImageCount, 5)
  return orderLabels.filter(label => label.key >= minOrder && label.key <= maxOrder)
})

const currentOrder = computed(() => props.data?.imageOrder || 1)

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
  stroke: '#38bdf8',
  strokeWidth: 4.2,
  strokeLinecap: 'round',
  ...props.style
}))

const handleOrderSelect = (newOrder) => {
  const sameTargetImageEdges = edges.value.filter(edge =>
    edge.target === props.target &&
    edge.type === 'imageOrder'
  )

  const edgeWithSameOrder = sameTargetImageEdges.find(edge =>
    edge.id !== props.id &&
    edge.data?.imageOrder === newOrder
  )

  if (edgeWithSameOrder) {
    updateEdgeData(edgeWithSameOrder.id, { imageOrder: currentOrder.value })
  }

  updateEdgeData(props.id, { imageOrder: newOrder })
}
</script>

<style scoped>
.edge-order-badge {
  min-width: 82px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(240, 249, 255, 0.94);
  border-radius: 999px;
  padding: 0 11px;
  color: #f0f9ff;
  background:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.5), transparent 38%),
    linear-gradient(135deg, #38bdf8, #2563eb);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.32);
  font-size: 11px;
  font-weight: 900;
}

.edge-order-badge:hover {
  transform: scale(1.04);
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.34);
}
</style>

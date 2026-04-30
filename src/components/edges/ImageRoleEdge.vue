<template>
  <!-- Custom edge with image role selector | 带图片角色选择器的自定义边 -->
  <BaseEdge :path="path" :style="edgeStyle" />
  
  <!-- Edge label with role dropdown | 带角色下拉的边标签 -->
  <EdgeLabelRenderer>
    <div 
      :style="{ 
        position: 'absolute', 
        transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
        pointerEvents: 'all'
      }"
      class="nodrag nopan"
    >
      <n-dropdown 
        :options="imageRoleOptions" 
        @select="handleRoleSelect"
        size="small"
      >
        <button 
          class="edge-label-pill image-role-label flex items-center gap-1 text-xs px-2 py-1 rounded-full shadow-sm hover:shadow transition-shadow"
        >
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

// Get VueFlow instance | 获取 VueFlow 实例
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

// Image role options | 图片角色选项
const imageRoleOptions = [
  { label: '首帧', key: 'first_frame_image' },
  { label: '尾帧', key: 'last_frame_image' },
  { label: '参考图', key: 'input_reference' }
]

// Current role from edge data | 从边数据获取当前角色
const currentRole = computed(() => props.data?.imageRole || 'first_frame_image')

// Current role label | 当前角色标签
const currentRoleLabel = computed(() => {
  const option = imageRoleOptions.find(o => o.key === currentRole.value)
  return option?.label || '首帧'
})

// Calculate bezier path | 计算贝塞尔路径
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

// Label position (center of edge) | 标签位置（边的中心）
const labelX = computed(() => (props.sourceX + props.targetX) / 2)
const labelY = computed(() => (props.sourceY + props.targetY) / 2)

// Edge style | 边样式
const edgeStyle = computed(() => ({
  stroke: '#60a5fa',
  strokeWidth: 3.5,
  filter: 'drop-shadow(0 0 7px rgba(96, 165, 250, 0.55))',
  ...props.style
}))

// Handle role selection | 处理角色选择
const handleRoleSelect = (role) => {
  // If selecting first_frame or last_frame, ensure uniqueness | 如果选择首帧或尾帧，确保唯一性
  if (role === 'first_frame_image' || role === 'last_frame_image') {
    // Find other edges connected to the same target with the same role | 查找连接到同一目标且具有相同角色的其他边
    const sameTargetEdges = edges.value.filter(edge => 
      edge.target === props.target && 
      edge.id !== props.id && 
      edge.data?.imageRole === role
    )
    
    // Auto-switch the other edge to the opposite role | 自动切换其他边到相反角色
    sameTargetEdges.forEach(edge => {
      const oppositeRole = role === 'first_frame_image' ? 'last_frame_image' : 'first_frame_image'
      updateEdgeData(edge.id, { imageRole: oppositeRole })
    })
  }
  
  // Update current edge role | 更新当前边角色
  updateEdgeData(props.id, { imageRole: role })
}
</script>

<style scoped>
.edge-label-pill {
  border: 1px solid rgba(191, 219, 254, 0.72);
  color: #dbeafe;
  background:
    radial-gradient(circle at 20% 0%, rgba(255, 255, 255, 0.32), transparent 42%),
    linear-gradient(135deg, rgba(30, 64, 175, 0.92), rgba(14, 116, 144, 0.86));
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.28), 0 0 18px rgba(96, 165, 250, 0.24);
  backdrop-filter: blur(12px);
}
</style>

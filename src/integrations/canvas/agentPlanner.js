import { nodes, edges } from '@/stores/canvas'

const NODE_DATA_KEYS = {
  text: ['content', 'label'],
  imageConfig: ['label', 'model', 'size', 'quality', 'prompt'],
  image: ['label', 'source', 'prompt'],
  videoConfig: ['label', 'model', 'ratio', 'duration', 'prompt'],
  video: ['label', 'source', 'duration'],
  llmConfig: ['label', 'systemPrompt', 'outputFormat'],
  comfyWorkflow: ['label', 'prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'status']
}

function summarizeValue(value) {
  if (typeof value !== 'string') return value
  if (/^(data:|blob:|file:|https?:)/i.test(value)) return '[media-url-hidden]'
  return value.length > 300 ? `${value.slice(0, 300)}...` : value
}

export function buildCanvasSnapshot() {
  const nodeSummaries = nodes.value.map(n => {
    const dataKeys = NODE_DATA_KEYS[n.type] || ['label']
    const dataSummary = {}
    for (const k of dataKeys) {
      const v = n.data?.[k]
      if (v != null && v !== '' && typeof v !== 'object') dataSummary[k] = summarizeValue(v)
      else if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length <= 5) dataSummary[k] = v
    }
    return { id: n.id, type: n.type, position: n.position, data: dataSummary }
  })

  const edgeSummaries = edges.value.map(e => ({
    id: e.id, source: e.source, target: e.target,
    sourceHandle: e.sourceHandle, targetHandle: e.targetHandle
  }))

  return { nodes: nodeSummaries, edges: edgeSummaries, nodeCount: nodeSummaries.length, edgeCount: edgeSummaries.length }
}

export function buildCanvasAgentSystemPrompt(snapshot) {
  return `你是一个画布助手，可以根据用户自然语言指令操控画布节点。

当前画布状态：
${JSON.stringify(snapshot, null, 2)}

可用命令：
- addNode: { type, position: {x,y}, data: {...} }
  type 可选：text | imageConfig | image | videoConfig | video | llmConfig | comfyWorkflow
  新建节点后要连接时，可以给 addNode 增加 ref，例如 { "ref": "promptNode" }，后续 connectNodes.source/target 可直接使用这个 ref。
- updateNode: { id, data: {...} }
- removeNode: { id }
- connectNodes: { source, target, sourceHandle?, targetHandle?, edgeType? }
- runComfyWorkflow: { nodeId }
- createDramaProject: { title?, premise? }
- createShotList: { shots: [{ title, description?, prompt?, duration?, status? }] }

updateNode 只允许修改这些用户可见字段：
- text: content, label
- imageConfig: prompt, label, model, size, quality
- videoConfig: prompt, label, model, ratio, duration
- llmConfig: systemPrompt, label, model, outputFormat
- comfyWorkflow: prompt, negativePrompt, width, height, seed, steps, cfg, label
禁止修改 apiWorkflow / baseUrl / bindings / url / assetPath / status / outputNodeIds 等内部字段。

规则：
1. 你必须只返回 JSON，不要返回其他内容。
2. addNode 的 position 要避免和现有节点重叠，y 值比现有最大 y 至少大 200。
3. updateNode 需要指定现有节点的 id。
4. removeNode 必须谨慎，只有在用户明确要求删除时才使用。
5. connectNodes 的 sourceHandle 默认 "right"，targetHandle 默认 "left"。
6. runComfyWorkflow 只触发运行，不创建节点。

返回格式：
{
  "summary": "一句话说明要做什么",
  "commands": [
    { "name": "addNode", "params": {...} },
    { "name": "connectNodes", "params": {...} }
  ],
  "requiresConfirmation": false
}

requiresConfirmation 规则：
- 包含 removeNode → true
- 包含 runComfyWorkflow → true
- 其他 → false`
}

export function parseAgentCommandResponse(text) {
  if (!text || typeof text !== 'string') {
    return { ok: false, error: '模型返回为空' }
  }

  // Try extracting from ```json code block first
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonCandidate = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim()

  // Try to find JSON object
  const jsonMatch = jsonCandidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { ok: false, error: '模型返回中未找到 JSON' }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.commands || !Array.isArray(parsed.commands)) {
      return { ok: false, error: '返回的 JSON 缺少 commands 数组' }
    }
    return { ok: true, plan: parsed }
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${e.message}` }
  }
}

export function classifyCommandRisk(commands) {
  const risks = { safe: [], destructive: [], execution: [] }
  for (const cmd of commands) {
    if (cmd.name === 'removeNode') risks.destructive.push(cmd)
    else if (cmd.name === 'runComfyWorkflow') risks.execution.push(cmd)
    else if (cmd.name === 'createDramaProject') risks.execution.push(cmd)
    else risks.safe.push(cmd)
  }
  const needsConfirm = risks.destructive.length > 0 || risks.execution.length > 0
  return { risks, needsConfirm, riskLabels: [] }
}

function getNextPosition(snapshot, index = 0) {
  const maxY = snapshot.nodes.length
    ? Math.max(...snapshot.nodes.map(node => Number(node.position?.y) || 0))
    : 0
  return { x: 120 + index * 360, y: maxY + 220 }
}

function hasAny(input, words) {
  return words.some(word => input.includes(word))
}

function findFirstNode(snapshot, type) {
  return snapshot.nodes.find(node => node.type === type) || null
}

function createDramaShotCommands(userInput, snapshot) {
  const shotCountMatch = String(userInput).match(/(\d{1,2})\s*(个|條|条)?\s*(镜头|分镜|shot)/i)
  const shotCount = Math.min(24, Math.max(4, Number(shotCountMatch?.[1] || 8)))
  const commands = [
    {
      name: 'createDramaProject',
      params: {
        title: 'AI 短剧项目',
        premise: userInput
      }
    },
    {
      name: 'createShotList',
      params: {
        shots: Array.from({ length: shotCount }, (_, index) => ({
          title: `镜头 ${index + 1}`,
          description: `根据用户设定拆分的第 ${index + 1} 个镜头`,
          prompt: `${userInput}，镜头 ${index + 1}，电影感分镜，主体清晰，构图明确`,
          duration: 5,
          status: 'pending'
        }))
      }
    }
  ]

  for (let i = 0; i < shotCount; i++) {
    const textRef = `shotText${i + 1}`
    const imageRef = `shotImage${i + 1}`
    commands.push(
      {
        name: 'addNode',
        params: {
          ref: textRef,
          type: 'text',
          position: { x: 120, y: getNextPosition(snapshot, 0).y + i * 180 },
          data: {
            label: `镜头 ${i + 1} 提示词`,
            content: `${userInput}，镜头 ${i + 1}，电影感分镜，主体清晰，构图明确`
          }
        }
      },
      {
        name: 'addNode',
        params: {
          ref: imageRef,
          type: 'imageConfig',
          position: { x: 520, y: getNextPosition(snapshot, 0).y + i * 180 },
          data: {
            label: `镜头 ${i + 1} 首帧`,
            prompt: `${userInput}，镜头 ${i + 1}，电影感首帧`
          }
        }
      },
      { name: 'connectNodes', params: { source: textRef, target: imageRef } }
    )
  }

  return {
    summary: `创建短剧项目和 ${shotCount} 个分镜首帧节点`,
    commands,
    requiresConfirmation: false
  }
}

export function buildLocalCommandPlan(userInput, snapshot = buildCanvasSnapshot()) {
  const input = String(userInput || '').trim().toLowerCase()
  if (!input) return null

  const asksVideo = hasAny(input, ['视频', 'video', '短片', '短剧', 'tvc', '镜头'])
  const asksImage = hasAny(input, ['图', '图片', '照片', '海报', '广告', 'banner', '封面', 'image'])
  const asksWorkflow = hasAny(input, ['工作流', '流程', '创建', '生成', '做一个', '搭一个'])
  const asksDrama = hasAny(input, ['短剧', '剧本', '分镜', '镜头表', '角色设定', '第一集', '剧情'])

  const sizeMatch = input.match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/)
  const mentionsComfy = hasAny(input, ['comfy', 'comfyui', '工作流节点'])
  const comfyNode = findFirstNode(snapshot, 'comfyWorkflow')

  if (mentionsComfy && comfyNode && sizeMatch && hasAny(input, ['改', '设置', '尺寸', '大小', '分辨率'])) {
    return {
      summary: `更新 Comfy 工作流尺寸为 ${sizeMatch[1]}x${sizeMatch[2]}`,
      commands: [{
        name: 'updateNode',
        params: {
          id: comfyNode.id,
          data: { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) }
        }
      }],
      requiresConfirmation: false
    }
  }

  if (mentionsComfy && comfyNode && hasAny(input, ['运行', '执行', '开始'])) {
    return {
      summary: '运行当前 Comfy 工作流',
      commands: [{ name: 'runComfyWorkflow', params: { nodeId: comfyNode.id } }],
      requiresConfirmation: true
    }
  }

  if (asksDrama && hasAny(input, ['创建', '生成', '做', '拆', '规划', '第一集', '分镜', '镜头'])) {
    return createDramaShotCommands(userInput, snapshot)
  }

  if (asksWorkflow && asksVideo && asksImage) {
    return {
      summary: '创建文生图到视频工作流',
      commands: [
        { name: 'addNode', params: { ref: 'prompt', type: 'text', position: getNextPosition(snapshot, 0), data: { label: '提示词', content: userInput } } },
        { name: 'addNode', params: { ref: 'imageConfig', type: 'imageConfig', position: getNextPosition(snapshot, 1), data: { label: '文生图', prompt: userInput } } },
        { name: 'addNode', params: { ref: 'videoConfig', type: 'videoConfig', position: getNextPosition(snapshot, 2), data: { label: '图生视频', prompt: userInput } } },
        { name: 'connectNodes', params: { source: 'prompt', target: 'imageConfig' } },
        { name: 'connectNodes', params: { source: 'imageConfig', target: 'videoConfig' } }
      ],
      requiresConfirmation: false
    }
  }

  if (asksWorkflow && (asksImage || !asksVideo)) {
    return {
      summary: '创建文生图工作流',
      commands: [
        { name: 'addNode', params: { ref: 'prompt', type: 'text', position: getNextPosition(snapshot, 0), data: { label: '提示词', content: userInput } } },
        { name: 'addNode', params: { ref: 'imageConfig', type: 'imageConfig', position: getNextPosition(snapshot, 1), data: { label: '文生图', prompt: userInput } } },
        { name: 'connectNodes', params: { source: 'prompt', target: 'imageConfig' } }
      ],
      requiresConfirmation: false
    }
  }

  return null
}

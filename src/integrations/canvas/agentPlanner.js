import { nodes, edges } from '@/stores/canvas'

const NODE_DATA_KEYS = {
  text: ['content', 'label'],
  imageConfig: ['label', 'model', 'size', 'quality', 'prompt'],
  image: ['label', 'source', 'prompt'],
  videoConfig: ['label', 'model', 'ratio', 'duration', 'prompt'],
  video: ['label', 'source', 'duration'],
  llmConfig: ['label', 'systemPrompt', 'outputFormat'],
  comfyWorkflow: ['label', 'prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'status'],
  cloudImageWorkflow: ['label', 'prompt', 'negativePrompt', 'model', 'size', 'seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'status'],
  dramaShot: ['label', 'shotId', 'shotIndex', 'shotTitle', 'shotType', 'angle', 'movement', 'sceneName', 'characterNames', 'description', 'status', 'firstFrameStatus', 'videoStatus']
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
    for (const key of dataKeys) {
      const value = n.data?.[key]
      if (value != null && value !== '' && typeof value !== 'object') dataSummary[key] = summarizeValue(value)
      else if (typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length <= 5) dataSummary[key] = value
    }
    return { id: n.id, type: n.type, position: n.position, data: dataSummary }
  })
  const edgeSummaries = edges.value.map(e => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle }))
  return { nodes: nodeSummaries, edges: edgeSummaries, nodeCount: nodeSummaries.length, edgeCount: edgeSummaries.length }
}

export function buildCanvasAgentSystemPrompt(snapshot) {
  return `你是 YUFENG Canvas 的画布操控 Agent。你不能只聊天，必须把用户目标转换成 Canvas Action Protocol 命令。
当前画布状态：
${JSON.stringify(snapshot, null, 2)}

可用命令：createProject, addNode, updateNode, removeNode, connectNodes, createDramaProject, createCharacterBible, createSceneBible, createEpisodeOutline, createShotList, createFirstFrameWorkflow, createVideoWorkflow, createCloudImageWorkflow, runCloudImageWorkflow, updateDramaShot, locateDramaShot, addDramaShot, removeDramaShot, duplicateDramaShot, fixWorkflowError。注意：importComfyWorkflow 和 runComfyWorkflow 是高级本地 Comfy 兼容命令，仅供已有本地 ComfyUI 的用户，不要对普通用户使用。普通用户图片生成请使用 cloudImageWorkflow 节点。Drama 命令：addDramaShot 添加镜头、removeDramaShot 删除镜头、duplicateDramaShot 复制镜头、updateDramaShot 更新镜头（shotId + patch）。

规则：只返回 JSON；addNode 后要连接时使用 ref；updateNode 只能修改用户可见字段；删除需要确认。
返回格式：{"summary":"一句话说明","commands":[{"name":"addNode","params":{}}],"requiresConfirmation":false}`
}

export function parseAgentCommandResponse(text) {
  if (!text || typeof text !== 'string') return { ok: false, error: '模型返回为空' }
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonCandidate = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim()
  const jsonMatch = jsonCandidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, error: '模型返回中未找到 JSON' }
  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.commands || !Array.isArray(parsed.commands)) return { ok: false, error: 'JSON 缺少 commands 数组' }
    return { ok: true, plan: parsed }
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${e.message}` }
  }
}

export function classifyCommandRisk(commands) {
  const risks = { safe: [], destructive: [], execution: [] }
  for (const cmd of commands) {
    if (cmd.name === 'removeNode' || cmd.name === 'removeDramaShot') risks.destructive.push(cmd)
    else if (cmd.name === 'runComfyWorkflow' || cmd.name === 'runCloudImageWorkflow') risks.execution.push(cmd)
    else risks.safe.push(cmd)
  }
  const needsConfirm = risks.destructive.length > 0 || risks.execution.length > 0
  return { risks, needsConfirm, riskLabels: [] }
}

function getNextPosition(snapshot, index = 0) {
  const maxY = snapshot.nodes.length ? Math.max(...snapshot.nodes.map(node => Number(node.position?.y) || 0)) : 0
  return { x: 120 + index * 360, y: maxY + 220 }
}

function hasAny(input, words) {
  return words.some(word => input.includes(word))
}

function findFirstNode(snapshot, type) {
  return snapshot.nodes.find(node => node.type === type) || null
}

function createDramaShotCommands(userInput) {
  const shotCountMatch = String(userInput).match(/(\d{1,2})/)
  const shotCount = Math.min(24, Math.max(4, Number(shotCountMatch?.[1] || 8)))
  return {
    summary: `创建短剧项目、角色场景设定和 ${shotCount} 个镜头工作流`,
    commands: [
      { name: 'createDramaProject', params: { title: 'AI 短剧项目', premise: userInput } },
      { name: 'createCharacterBible', params: {} },
      { name: 'createSceneBible', params: {} },
      { name: 'createEpisodeOutline', params: { summary: userInput } },
      { name: 'createShotList', params: { premise: userInput, count: shotCount } }
    ],
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
  const mentionsComfy = hasAny(input, ['comfy', 'comfyui', '本地工作流'])
  const sizeMatch = input.match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/)
  const comfyNode = findFirstNode(snapshot, 'comfyWorkflow')

  if (mentionsComfy && comfyNode && sizeMatch && hasAny(input, ['改', '设置', '尺寸', '大小', '分辨率'])) {
    return {
      summary: `更新 Comfy 工作流尺寸为 ${sizeMatch[1]}x${sizeMatch[2]}`,
      commands: [{ name: 'updateNode', params: { id: comfyNode.id, data: { width: Number(sizeMatch[1]), height: Number(sizeMatch[2]) } } }],
      requiresConfirmation: false
    }
  }

  if (mentionsComfy && comfyNode && hasAny(input, ['运行', '执行', '开始'])) {
    return { summary: '运行当前 Comfy 工作流', commands: [{ name: 'runComfyWorkflow', params: { nodeId: comfyNode.id } }], requiresConfirmation: true }
  }

  if (mentionsComfy && asksWorkflow) {
    return {
      summary: '创建云端专业文生图工作流',
      commands: [
        { name: 'addNode', params: { ref: 'prompt', type: 'text', position: getNextPosition(snapshot, 0), data: { label: '提示词', content: '描述你想生成的画面' } } },
        { name: 'addNode', params: { ref: 'cloudImg', type: 'cloudImageWorkflow', position: getNextPosition(snapshot, 1), data: { label: '云端专业文生图', prompt: '高质量视觉作品', steps: 20, cfg: 7 } } },
        { name: 'connectNodes', params: { source: 'prompt', target: 'cloudImg' } }
      ],
      requiresConfirmation: false
    }
  }

  if (asksDrama && hasAny(input, ['创建', '生成', '做', '拆', '规划', '第一集', '分镜', '镜头'])) return createDramaShotCommands(userInput)

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

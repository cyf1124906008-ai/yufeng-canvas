import { nodes, edges } from '@/stores/canvas'
import { COMMAND_REGISTRY, COMMAND_NAMES } from './commands'

const NODE_DATA_KEYS = {
  text: ['content', 'label'],
  imageConfig: ['label', 'model', 'size', 'quality', 'prompt'],
  image: ['label', 'source', 'prompt'],
  videoConfig: ['label', 'model', 'ratio', 'duration', 'prompt'],
  video: ['label', 'source', 'duration'],
  llmConfig: ['label', 'systemPrompt', 'model', 'outputFormat'],
  comfyWorkflow: ['label', 'prompt', 'negativePrompt', 'width', 'height', 'seed', 'steps', 'cfg', 'status'],
  cloudImageWorkflow: ['label', 'prompt', 'negativePrompt', 'model', 'size', 'seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'status'],
  dramaShot: ['label', 'shotId', 'shotIndex', 'shotTitle', 'shotType', 'angle', 'movement', 'sceneName', 'characterNames', 'description', 'dialogue', 'status', 'firstFrameStatus', 'videoStatus']
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
  const cmdList = COMMAND_NAMES
    .filter(n => n !== 'importComfyWorkflow' && n !== 'importComfyWorkflowTemplate' && n !== 'createComfyWrapper' && n !== 'runComfyWorkflow')
    .map(n => {
      const meta = COMMAND_REGISTRY[n]
      return `- ${n}: ${meta?.description || n} (${meta?.risk || 'safe'})`
    }).join('\n')

  return `你是 YUFENG Canvas 的画布操控 Agent。你必须且只能返回一个 JSON 对象。不要使用 markdown 代码围栏，不要输出解释文字，不要在 JSON 前后添加任何内容。

当前画布状态：
${JSON.stringify(snapshot, null, 2)}

可用命令：
${cmdList}

禁令：
- 不允许使用 importComfyWorkflow / runComfyWorkflow（仅供本地 ComfyUI 用户）
- 不允许在未配置模型时调用 runCloudImageWorkflow
- 不允许假成功

返回格式（严格 JSON，无 markdown）：
{"summary":"一句话中文说明","commands":[{"name":"命令名","params":{}}],"requiresConfirmation":false}

示例：
用户："做一个古装短剧第一集，12个分镜"
→ {"summary":"创建古装短剧项目及12个分镜","commands":[{"name":"createDramaProject","params":{"title":"古装短剧","premise":"古装短剧第一集"}},{"name":"createShotList","params":{"count":12}}],"requiresConfirmation":false}

用户："给第1个镜头创建首帧工作流"
→ {"summary":"为镜头1创建首帧云端工作流","commands":[{"name":"createCloudImageWorkflow","params":{"prompt":"电影感首帧","size":"1440x2560"}}],"requiresConfirmation":false}

用户："删除第5个镜头"
→ {"summary":"删除镜头5","commands":[{"name":"removeDramaShot","params":{"shotId":"<从画布状态获取>"}}],"requiresConfirmation":true}`
}

export function parseAgentCommandResponse(text) {
  if (!text || typeof text !== 'string') return { ok: false, error: '模型返回为空', rawText: text }
  // Strip markdown code fences if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonCandidate = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim()
  const jsonMatch = jsonCandidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return { ok: false, error: 'AI 返回格式异常，无法解析为命令。请用自然语言重新描述你的需求。', rawText: text }
  }
  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.commands || !Array.isArray(parsed.commands)) {
      return { ok: false, error: 'AI 返回的 JSON 缺少 commands 数组。', rawText: text }
    }
    if (parsed.commands.length === 0) {
      return { ok: false, error: 'AI 未生成任何可执行命令。', rawText: text }
    }
    return { ok: true, plan: parsed }
  } catch (e) {
    return { ok: false, error: `JSON 解析失败: ${e.message}。请用自然语言重新描述你的需求。`, rawText: text }
  }
}

export function classifyCommandRisk(commands) {
  const risks = { safe: [], destructive: [], execution: [] }
  for (const cmd of commands) {
    const meta = COMMAND_REGISTRY[cmd.name]
    const risk = meta?.risk || 'safe'
    risks[risk === 'destructive' ? 'destructive' : risk === 'execution' ? 'execution' : 'safe'].push(cmd)
  }
  const needsConfirm = risks.destructive.length > 0 || risks.execution.length > 0
  return { risks, needsConfirm, riskLabels: [] }
}

// --- Scenario helpers ---

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

function parseShotIndex(input) {
  const match = input.match(/第\s*(\d{1,2})\s*[个名张个道]*镜头/)
  if (match) return Number(match[1])
  return null
}

function findDramaShotByIndex(snapshot, index) {
  return snapshot.nodes.find(n => n.type === 'dramaShot' && Number(n.data?.shotIndex) === index) || null
}

// Scenario A: 创建短剧项目 + N 个分镜
function createDramaShotCommands(userInput) {
  const shotCountMatch = String(userInput).match(/(\d{1,2})/)
  const shotCount = Math.min(24, Math.max(4, Number(shotCountMatch?.[1] || 8)))
  return {
    summary: `创建短剧项目及 ${shotCount} 个镜头`,
    commands: [
      { name: 'createDramaProject', params: { title: '短剧创作项目', premise: userInput } },
      { name: 'createShotList', params: { premise: userInput, count: shotCount } }
    ],
    requiresConfirmation: false
  }
}

// Scenario B: 给第 N 个镜头创建首帧工作流
function createFirstFrameForShot(snapshot, input) {
  const idx = parseShotIndex(input)
  if (idx == null) return null
  const shotNode = findDramaShotByIndex(snapshot, idx)
  if (!shotNode) return null
  const prompt = shotNode.data?.description || '电影感短剧首帧，主体清晰，构图明确'
  const shotId = shotNode.data?.shotId || ''
  const y = (shotNode.position?.y || 200)
  return {
    summary: `为镜头 ${idx} 创建首帧云端工作流`,
    commands: [
      { name: 'addNode', params: { ref: 'firstFrame', type: 'cloudImageWorkflow', position: { x: (shotNode.position?.x || 300) + 320, y }, data: { label: `镜头${idx} 首帧`, prompt, size: '1440x2560', steps: 20, cfg: 7, sampler: 'euler', scheduler: 'normal', denoise: 1.0 } } },
      { name: 'connectNodes', params: { source: shotNode.id, target: 'firstFrame' } }
    ],
    requiresConfirmation: false
  }
}

// Scenario C: 给所有镜头创建视频工作流
function createVideoForAllShots(snapshot) {
  const shotNodes = snapshot.nodes.filter(n => n.type === 'dramaShot')
  if (shotNodes.length === 0) return null
  const commands = []
  for (const shotNode of shotNodes) {
    const idx = shotNode.data?.shotIndex || '?'
    const prompt = shotNode.data?.description || '自然镜头运动，画面稳定'
    const baseX = Number(shotNode.position?.x || 300) + 640
    const baseY = Number(shotNode.position?.y || 200)
    // If shot has a firstFrameNodeId, connect from that; otherwise from dramaShot
    const sourceId = shotNode.data?.firstFrameNodeId || shotNode.id
    commands.push(
      { name: 'addNode', params: { ref: `video_${idx}`, type: 'videoConfig', position: { x: baseX, y: baseY }, data: { label: `镜头${idx} 视频`, prompt, ratio: '9:16', duration: 5 } } },
      { name: 'connectNodes', params: { source: sourceId, target: `video_${idx}` } }
    )
  }
  return {
    summary: `为 ${shotNodes.length} 个镜头批量创建视频工作流`,
    commands,
    requiresConfirmation: true
  }
}

// Scenario D: 修改第 N 个镜头
function updateShotByDescription(snapshot, input) {
  const idx = parseShotIndex(input)
  if (idx == null) return null
  const shotNode = findDramaShotByIndex(snapshot, idx)
  if (!shotNode) return null
  const shotId = shotNode.data?.shotId || ''
  const patch = { updatedAt: Date.now() }
  // Extract shot type
  if (hasAny(input, ['特写'])) patch.shotType = '特写'
  else if (hasAny(input, ['近景'])) patch.shotType = '近景'
  else if (hasAny(input, ['中景'])) patch.shotType = '中景'
  else if (hasAny(input, ['全景'])) patch.shotType = '全景'
  else if (hasAny(input, ['远景'])) patch.shotType = '远景'
  // Extract time
  if (hasAny(input, ['夜晚', '夜间', '深夜', '晚上'])) patch.time = '夜晚'
  else if (hasAny(input, ['白天', '日间', '清晨', '上午'])) patch.time = '白天'
  else if (hasAny(input, ['黄昏', '傍晚', '日落'])) patch.time = '黄昏'
  // Extract angle
  if (hasAny(input, ['仰视', '仰拍'])) patch.angle = '仰视'
  else if (hasAny(input, ['俯视', '俯拍'])) patch.angle = '俯视'
  // Extract movement
  if (hasAny(input, ['推进', '推镜'])) patch.movement = '推进'
  else if (hasAny(input, ['跟拍', '跟镜'])) patch.movement = '跟拍'
  else if (hasAny(input, ['横移', '平移'])) patch.movement = '横移'
  // Use remaining text as description if substantive
  const descMatch = input.match(/(?:改|修改|更新|调整|设为|改成)\s*(?:为|成|到)?\s*(.+)/)
  if (descMatch && descMatch[1].length > 5) patch.description = descMatch[1].trim()
  return {
    summary: `更新镜头 ${idx}: ${Object.keys(patch).filter(k => k !== 'updatedAt').join(', ')}`,
    commands: [{ name: 'updateDramaShot', params: { shotId, patch } }],
    requiresConfirmation: false
  }
}

// Scenario E: 删除第 N 个镜头
function removeShotByIndex(snapshot, input) {
  const idx = parseShotIndex(input)
  if (idx == null) return null
  const shotNode = findDramaShotByIndex(snapshot, idx)
  if (!shotNode) return null
  const shotId = shotNode.data?.shotId || ''
  return {
    summary: `删除镜头 ${idx}`,
    commands: [{ name: 'removeDramaShot', params: { shotId } }],
    requiresConfirmation: true
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

  // --- Scenario E: Delete shot ---
  if (hasAny(input, ['删除', '移除', '去掉', '删掉']) && hasAny(input, ['镜头'])) {
    return removeShotByIndex(snapshot, input)
  }

  // --- Scenario D: Update shot ---
  if (hasAny(input, ['改', '修改', '更新', '调整']) && hasAny(input, ['镜头']) && parseShotIndex(input) != null) {
    return updateShotByDescription(snapshot, input)
  }

  // --- Scenario B: First frame for specific shot ---
  if (hasAny(input, ['首帧', '首图', '第一帧', 'first frame']) && hasAny(input, ['镜头', 'shot']) && parseShotIndex(input) != null) {
    return createFirstFrameForShot(snapshot, input)
  }

  // --- Scenario C: Video for all shots ---
  if (hasAny(input, ['所有镜头', '全部镜头', '批量', '每个镜头', '各镜头', '全部镜头']) && hasAny(input, ['视频', 'video', '视频工作流'])) {
    return createVideoForAllShots(snapshot)
  }

  // --- Scenario A: Create drama project + shots ---
  if (asksDrama && hasAny(input, ['创建', '生成', '做', '拆', '规划', '第一集', '分镜', '镜头'])) return createDramaShotCommands(userInput)

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

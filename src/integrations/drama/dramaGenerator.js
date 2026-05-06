import { useModelStore } from '../../stores/pinia'

const SYSTEM_PROMPT = `你是专业的短剧编剧和导演。根据用户的故事创意，生成完整的短剧制作方案。

你必须返回严格的 JSON 格式（不要包裹在代码块中），结构如下：
{
  "premise": "一句话故事概述",
  "characters": [
    { "name": "角色名", "role": "主角/配角/群众", "appearance": "外貌描述", "personality": "性格描述", "voiceStyle": "声音风格" }
  ],
  "scenes": [
    { "name": "场景名", "location": "具体地点", "time": "时间段", "prompt": "场景视觉描述" }
  ],
  "episodes": [
    { "title": "集标题", "summary": "本集概要" }
  ],
  "shots": [
    {
      "index": 1,
      "title": "镜头标题",
      "sceneIndex": 0,
      "characterIndices": [0],
      "description": "画面描述",
      "camera": { "shotType": "景别", "angle": "角度", "movement": "运镜" },
      "dialogue": "台词",
      "firstFramePrompt": "用于AI绘图的首帧画面描述，必须具体：主体、姿态、表情、光线、构图",
      "videoPrompt": "用于AI视频的运镜指令，必须具体：镜头运动方向、速度、画面变化",
      "duration": 5,
      "atmosphere": "氛围描述"
    }
  ]
}

规则：
- 镜头必须使用专业摄影术语（远景/全景/中景/近景/特写）
- 角度和运镜要多样化（平视/俯视/仰视/推进/横移/跟拍/摇镜）
- firstFramePrompt 必须是可直接用于 AI 绘图的详细画面描述
- videoPrompt 必须是具体的动态运镜指令
- 对话要自然口语化
- 每个镜头之间要有叙事连贯性`

export async function generateDramaContent(userInput, settings = {}) {
  const modelStore = useModelStore()
  const apiKey = modelStore.currentChatApiKey
  const baseUrl = modelStore.currentChatBaseUrl
  const model = modelStore.selectedChatModel

  if (!apiKey || !baseUrl) {
    return { ok: false, error: '需要先配置文本模型 API Key 和 Base URL。请前往设置 → API 设置中配置。' }
  }

  const shotCount = Number(settings.shotCount) || 8
  const charCount = Number(settings.characterCount) || 2
  const sceneCount = Number(settings.sceneCount) || 3
  const epCount = Number(settings.episodeCount) || 1
  const style = settings.style || '短剧'
  const duration = Number(settings.targetDurationSec) || 60
  const tone = settings.tone || ''

  const userPrompt = `故事创意：${userInput}

要求：
- ${charCount} 个角色
- ${sceneCount} 个场景
- ${epCount} 集，共 ${shotCount} 个镜头
- 风格：${style}
- 总时长约 ${duration} 秒
${tone ? `- 基调：${tone}` : ''}

请生成完整 JSON。`

  try {
    const endpoint = modelStore.getChatEndpoint ? modelStore.getChatEndpoint() : `${baseUrl.replace(/\/+$/, '')}/v1/chat/completions`
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.8,
        max_tokens: 4096
      })
    })

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '')
      return { ok: false, error: `文本模型请求失败 (HTTP ${resp.status})：${errText.slice(0, 200)}` }
    }

    const result = await resp.json()
    const content = result?.choices?.[0]?.message?.content || ''
    return parseDramaResponse(content)
  } catch (err) {
    return { ok: false, error: `网络请求失败：${err.message}。请检查 API Base URL 是否正确。` }
  }
}

function parseDramaResponse(content) {
  // Try direct JSON parse
  let jsonStr = content.trim()

  // Try extracting from code block
  const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeMatch) jsonStr = codeMatch[1].trim()

  // Find JSON object
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return { ok: false, error: '模型返回中未找到有效 JSON，请重试。' }

  try {
    const data = JSON.parse(jsonMatch[0])

    if (!data.shots || !Array.isArray(data.shots)) {
      return { ok: false, error: '模型返回的 JSON 缺少 shots 数组，请重试。' }
    }

    return { ok: true, data }
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${e.message}。请重试。` }
  }
}

export function convertGeneratedDataToProject(generatedData, settings = {}) {
  const now = Date.now()
  const characters = (generatedData.characters || []).map((c, i) => ({
    id: `char_${now}_${i}`,
    name: c.name || `角色${i + 1}`,
    role: c.role || '配角',
    appearance: c.appearance || '',
    personality: c.personality || '',
    voiceStyle: c.voiceStyle || '',
    seedValue: null,
    referenceImages: [],
    imageUrl: '',
    description: ''
  }))

  const scenes = (generatedData.scenes || []).map((s, i) => ({
    id: `scene_${now}_${i}`,
    name: s.name || `场景${i + 1}`,
    location: s.location || s.name || '',
    time: s.time || '白天',
    prompt: s.prompt || '',
    imageUrl: '',
    status: 'idle'
  }))

  const episodes = (generatedData.episodes || []).map((e, i) => ({
    id: `ep_${now}_${i}`,
    index: i + 1,
    title: e.title || `第${i + 1}集`,
    summary: e.summary || '',
    status: 'draft'
  }))

  const shots = generatedData.shots.map((s, i) => {
    const sceneIdx = s.sceneIndex != null ? Number(s.sceneIndex) : -1
    const scene = scenes[sceneIdx] || scenes[0]
    const charIndices = Array.isArray(s.characterIndices) ? s.characterIndices : []
    const charIds = charIndices.map(idx => characters[Number(idx)]?.id).filter(Boolean)
    const camera = s.camera || {}

    return {
      id: `shot_${now}_${i}`,
      index: i + 1,
      storyboardNumber: i + 1,
      title: s.title || `镜头 ${i + 1}`,
      shotType: camera.shotType || '',
      angle: camera.angle || '',
      movement: camera.movement || '',
      sceneId: scene?.id || '',
      location: scene?.name || '',
      time: scene?.time || '',
      characterIds: charIds,
      action: '',
      dialogue: s.dialogue || '',
      description: s.description || '',
      result: '',
      atmosphere: s.atmosphere || '',
      imagePrompt: s.firstFramePrompt || s.description || '',
      prompt: s.firstFramePrompt || s.description || '',
      firstFramePrompt: s.firstFramePrompt || s.description || '',
      videoPrompt: s.videoPrompt || s.description || '',
      bgmPrompt: '',
      soundEffect: '',
      duration: Number(s.duration) || 5,
      status: 'idle',
      firstFrameStatus: 'idle',
      videoStatus: 'idle',
      nodeIds: {},
      firstFrameNodeId: '',
      videoNodeId: '',
      assetIds: [],
      episodeId: episodes[0]?.id || '',
      createdAt: now,
      updatedAt: now
    }
  })

  return {
    premise: generatedData.premise || '',
    genre: '',
    style: settings.style || 'realistic',
    characters,
    scenes,
    episodes,
    shots
  }
}

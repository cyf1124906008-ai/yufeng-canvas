/**
 * Huobao Drama core absorbed into YUFENG Canvas.
 * This maps the original huobao-drama domain model
 * (dramas / episodes / characters / scenes / storyboards / image/video generations)
 * into YUFENG local project schema and canvas nodes.
 */

export const HUOBAO_DRAMA_TABLES = [
  'dramas', 'episodes', 'characters', 'scenes', 'storyboards',
  'image_generations', 'video_generations', 'ai_service_configs', 'ai_voices'
]

export const HUOBAO_AGENT_SKILLS = {
  scriptRewriter: {
    name: 'script_rewriter',
    title: '小说/创意改写成短剧剧本',
    output: ['premise', 'episodes', 'characters', 'scenes']
  },
  extractor: {
    name: 'extractor',
    title: '角色与场景抽取去重',
    output: ['characters', 'locations']
  },
  storyboardBreaker: {
    name: 'storyboard_breaker',
    title: '剧本拆分镜',
    output: ['shots', 'imagePrompt', 'videoPrompt', 'bgmPrompt', 'soundEffect']
  },
  voiceAssigner: {
    name: 'voice_assigner',
    title: '角色配音分配',
    output: ['voiceStyle', 'ttsTasks']
  },
  gridPromptGenerator: {
    name: 'grid_prompt_generator',
    title: '宫格图/角色/场景提示词生成',
    output: ['gridPrompts', 'referenceFrames']
  }
}

export const HUOBAO_SHOT_FIELDS = [
  'title', 'shotType', 'angle', 'movement', 'location', 'time', 'action', 'dialogue',
  'description', 'result', 'atmosphere', 'imagePrompt', 'videoPrompt', 'bgmPrompt',
  'soundEffect', 'duration', 'characterIds', 'sceneId'
]

export function createHuobaoDramaProjectSeed(idea = '短剧项目') {
  const now = Date.now()
  return {
    premise: idea,
    characters: [
      {
        id: `char_heroine_${now}`,
        name: '女主',
        role: '主角',
        appearance: '外观稳定、五官清晰、服装固定',
        personality: '目标明确，有强行动机',
        description: '适合作为角色一致性参考的核心人物'
      },
      {
        id: `char_hero_${now}`,
        name: '男主',
        role: '主角',
        appearance: '气质鲜明、服装固定、识别度高',
        personality: '与女主形成关系张力',
        description: '推动剧情冲突和反转的核心人物'
      }
    ],
    locations: [
      {
        id: `scene_main_${now}`,
        name: '主场景',
        location: '主场景',
        time: '夜晚',
        prompt: '统一时代、空间布局、光影和色彩风格，适合多镜头复用'
      }
    ],
    episodes: [
      {
        id: `ep_1_${now}`,
        index: 1,
        title: '第一集',
        summary: '建立人物、抛出冲突、结尾留下钩子',
        status: 'draft'
      }
    ]
  }
}

export function createHuobaoStoryboards(idea = '短剧项目', count = 8) {
  const safeCount = Math.min(24, Math.max(1, Number(count || 8)))
  const now = Date.now()
  const shotTypes = ['远景', '全景', '中景', '近景', '特写']
  const movements = ['固定镜头', '缓慢推进', '跟拍', '横移', '轻微摇镜']
  return Array.from({ length: safeCount }, (_, index) => {
    const n = index + 1
    const shotType = shotTypes[index % shotTypes.length]
    const movement = movements[index % movements.length]
    const title = `镜头 ${n}`
    const description = `${idea}。${title}，${shotType}，单一动作推进，明确人物、场景、情绪和叙事信息。`
    const imagePrompt = `${description} 电影感短剧首帧，主体清晰，构图明确，角色一致，场景连续，光影统一，高质量剧照。`
    const videoPrompt = [
      `0-3秒：${idea}，${shotType}，${movement}，角色进入情绪状态。`,
      '3-6秒：动作继续推进，镜头保持稳定，场景细节清晰。',
      '6-9秒：情绪或信息形成结果，为下一镜头留下衔接。'
    ].join('\n')
    return {
      id: `shot_${now}_${n}`,
      index: n,
      storyboardNumber: n,
      title,
      shotType,
      angle: index % 2 === 0 ? '平视' : '轻微俯视',
      movement,
      location: '主场景',
      time: index < safeCount / 2 ? '夜晚' : '清晨',
      action: '单一动作推进剧情',
      dialogue: '',
      description,
      result: '形成清晰的视觉结果并推动下一镜头',
      atmosphere: '电影感、情绪明确、光影统一',
      imagePrompt,
      prompt: imagePrompt,
      videoPrompt,
      bgmPrompt: '悬念感、节奏克制、适合短剧推进',
      soundEffect: '环境声、脚步声、轻微转场音效',
      duration: 9,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }
  })
}

export function normalizeHuobaoShotToYufengShot(shot) {
  return {
    ...shot,
    prompt: shot.prompt || shot.imagePrompt || shot.description || '',
    imagePrompt: shot.imagePrompt || shot.prompt || shot.description || '',
    videoPrompt: shot.videoPrompt || shot.description || '',
    status: shot.status || 'pending'
  }
}

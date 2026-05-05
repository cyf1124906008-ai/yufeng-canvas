const DEFAULT_GRID = { col: 390, row: 230 }

const createIdFactory = (prefix = 'complex_workflow') => {
  let count = 0
  return (hint = 'node') => `${prefix}_${Date.now()}_${count++}_${hint}`
}

const connect = (source, target, extra = {}) => ({
  id: `edge_${source}_${target}_${Math.random().toString(36).slice(2, 7)}`,
  source,
  target,
  sourceHandle: 'right',
  targetHandle: 'left',
  ...extra
})

const makeText = (id, stage, position) => ({
  id,
  type: 'text',
  position,
  data: {
    label: stage.label,
    content: stage.content,
    workflowRole: stage.role || 'prompt',
    yufengHint: stage.hint || ''
  }
})

const makeLLM = (id, stage, position) => ({
  id,
  type: 'llmConfig',
  position,
  data: {
    label: stage.label,
    systemPrompt: stage.systemPrompt || stage.content,
    outputFormat: stage.outputFormat || 'text',
    workflowRole: stage.role || 'planner',
    yufengHint: stage.hint || ''
  }
})

const makeImageConfig = (id, stage, position) => ({
  id,
  type: 'imageConfig',
  position,
  data: {
    label: stage.label,
    prompt: stage.prompt || stage.content || '',
    size: stage.size || '1024x1024',
    count: stage.count || 1,
    quality: stage.quality || 'high',
    seed: stage.seed || '',
    negativePrompt: stage.negativePrompt || '',
    workflowRole: stage.role || 'image_generation',
    professionalParams: stage.professionalParams || {},
    beginnerHelp: stage.beginnerHelp || ''
  }
})

const makeImage = (id, stage, position) => ({
  id,
  type: 'image',
  position,
  data: {
    label: stage.label,
    url: '',
    workflowRole: stage.role || 'image_output',
    assetKind: stage.assetKind || 'image'
  }
})

const makeVideoConfig = (id, stage, position) => ({
  id,
  type: 'videoConfig',
  position,
  data: {
    label: stage.label,
    prompt: stage.prompt || stage.content || '',
    ratio: stage.ratio || '9:16',
    dur: stage.dur || 5,
    resolution: stage.resolution || '1080p',
    seed: stage.seed || '',
    negativePrompt: stage.negativePrompt || '',
    cameraMotion: stage.cameraMotion || '',
    workflowRole: stage.role || 'video_generation',
    beginnerHelp: stage.beginnerHelp || ''
  }
})

const makeVideo = (id, stage, position) => ({
  id,
  type: 'video',
  position,
  data: {
    label: stage.label,
    url: '',
    workflowRole: stage.role || 'video_output',
    assetKind: 'video'
  }
})

const nodeFactory = {
  text: makeText,
  llm: makeLLM,
  imageConfig: makeImageConfig,
  image: makeImage,
  videoConfig: makeVideoConfig,
  video: makeVideo
}

const getLibraryCategory = (id, fallback) => {
  if (id.includes('inpaint') || id.includes('outpaint') || id.includes('hires-fix')) return 'repair'
  if (id.includes('nine-grid') || id.includes('xyz-plot') || id.includes('map-worldbuilding')) return 'grid'
  return fallback
}

const enrichText = (base, workflow) => `${base}\n\n【YUFENG 执行说明】\n- 来源思路：${workflow.sourceName}\n- 复杂度：${workflow.complexity}\n- 小白用法：先替换项目/角色/产品信息，再运行右侧生成节点。\n- 专业参数：${workflow.parameters.join(' / ')}\n- 云端适配：如果当前模型不支持 LoRA、ControlNet、Sampler、Scheduler，YUFENG 应自动隐藏或回退到参考图、负面提示词、尺寸和 Seed。`

const createComplexTemplate = (workflow) => ({
  id: workflow.id,
  name: workflow.name,
  description: workflow.description,
  category: workflow.category,
  icon: workflow.icon || 'GridOutline',
  complexity: workflow.complexity,
  sourceName: workflow.sourceName,
  sourceUrl: workflow.sourceUrl,
  parameters: workflow.parameters,
  inputSummary: workflow.inputSummary,
  outputSummary: workflow.outputSummary,
  beginnerHelp: workflow.beginnerHelp,
  createNodes: (startPosition) => {
    const getId = createIdFactory(workflow.id)
    const nodes = []
    const edges = []
    const stageIds = []

    workflow.stages.forEach((stage, index) => {
      const id = getId(stage.type)
      stageIds[index] = id
      const position = {
        x: startPosition.x + (stage.col ?? index) * DEFAULT_GRID.col,
        y: startPosition.y + (stage.row ?? 0) * DEFAULT_GRID.row
      }
      const normalizedStage = {
        ...stage,
        content: stage.type === 'text' ? enrichText(stage.content, workflow) : stage.content
      }
      nodes.push(nodeFactory[stage.type](id, normalizedStage, position))
    })

    workflow.links.forEach((link) => {
      const [from, to, type, data = {}] = link
      if (!stageIds[from] || !stageIds[to]) return
      edges.push(connect(stageIds[from], stageIds[to], {
        type,
        data: {
          promptOrder: data.promptOrder,
          imageRole: data.imageRole,
          workflowLink: data.workflowLink || workflow.id,
          label: data.label
        }
      }))
    })

    return { nodes, edges }
  }
})

const imageProductionStages = ({ brief, planner, firstPrompt, secondPrompt, firstLabel = '主视觉生成', secondLabel = '精修/放大生成', size = '1440x1920' }) => ([
  { type: 'text', label: '项目 Brief', col: 0, row: 0, content: brief },
  { type: 'llm', label: 'AI 拆解提示词', col: 1, row: 0, content: planner },
  { type: 'text', label: '正向提示词', col: 1, row: 1, content: firstPrompt },
  { type: 'imageConfig', label: firstLabel, col: 2, row: 0, size, count: 2, negativePrompt: '低清晰度、畸形手、乱码文字、水印、过曝、主体变形', professionalParams: { seed: '固定构图', steps: '细节强度', cfg: '提示词遵循', sampler: '采样风格' } },
  { type: 'image', label: `${firstLabel}结果`, col: 3, row: 0 },
  { type: 'text', label: '二阶段修正提示词', col: 2, row: 1, content: secondPrompt },
  { type: 'imageConfig', label: secondLabel, col: 4, row: 0, size, count: 1, negativePrompt: '模糊、破损边缘、错误文字、过度锐化、伪影', professionalParams: { inpaint: '局部重绘', upscale: '高清放大', control: '参考图控制' } },
  { type: 'image', label: `${secondLabel}结果`, col: 5, row: 0 }
])

const imageProductionLinks = [
  [0, 1, 'promptOrder', { promptOrder: 1 }],
  [1, 3, 'promptOrder', { promptOrder: 1 }],
  [2, 3, 'promptOrder', { promptOrder: 2 }],
  [3, 4],
  [4, 6, 'imageRole', { imageRole: 'reference_image' }],
  [5, 6, 'promptOrder', { promptOrder: 1 }],
  [6, 7]
]

const videoProductionStages = ({ brief, planner, firstFramePrompt, motionPrompt, ratio = '9:16', dur = 5 }) => ([
  { type: 'text', label: '视频项目 Brief', col: 0, row: 0, content: brief },
  { type: 'llm', label: '镜头语言规划', col: 1, row: 0, content: planner },
  { type: 'text', label: '首帧提示词', col: 1, row: 1, content: firstFramePrompt },
  { type: 'imageConfig', label: '首帧生成', col: 2, row: 0, size: ratio === '16:9' ? '1920x1080' : '1080x1920', count: 1, negativePrompt: '低清晰度、人物变形、文字水印、错误肢体' },
  { type: 'image', label: '首帧结果', col: 3, row: 0 },
  { type: 'text', label: '运镜/动作提示词', col: 3, row: 1, content: motionPrompt },
  { type: 'videoConfig', label: '图生视频', col: 4, row: 0, ratio, dur, cameraMotion: '按运镜提示词执行，保持主体一致' },
  { type: 'video', label: '视频结果', col: 5, row: 0 }
])

const videoProductionLinks = [
  [0, 1, 'promptOrder', { promptOrder: 1 }],
  [1, 3, 'promptOrder', { promptOrder: 1 }],
  [2, 3, 'promptOrder', { promptOrder: 2 }],
  [3, 4],
  [4, 6, 'imageRole', { imageRole: 'first_frame_image' }],
  [5, 6, 'promptOrder', { promptOrder: 1 }],
  [6, 7]
]

const dramaStages = ({ title, premise, genre }) => ([
  { type: 'text', label: '短剧设定', col: 0, row: 1, content: `项目：${title}\n类型：${genre}\n核心设定：${premise}\n目标：生成角色库、场景库、8 个分镜、首帧和图生视频链路。` },
  { type: 'llm', label: '角色库生成', col: 1, row: 0, content: '根据短剧设定生成主角、反派、关键配角。每个角色包含外貌、服装、性格、动机、禁忌、视觉一致性关键词。' },
  { type: 'llm', label: '场景库生成', col: 1, row: 1, content: '根据短剧设定生成主要场景，包含时代、空间、光线、道具、色调、镜头氛围。' },
  { type: 'llm', label: '8 分镜拆解', col: 1, row: 2, content: '把第一集拆成 8 个镜头。每个镜头输出：镜头编号、画面、台词、人物、场景、首帧提示词、视频运镜提示词。' },
  { type: 'text', label: '首帧统一规则', col: 2, row: 0, content: '所有首帧必须保持角色脸型、服装、场景色调一致。画面要电影感，避免字幕、水印和明显 AI 伪影。' },
  { type: 'imageConfig', label: '镜头 1 首帧', col: 3, row: 0, size: '1080x1920', count: 1 },
  { type: 'image', label: '镜头 1 首帧图', col: 4, row: 0 },
  { type: 'imageConfig', label: '镜头 2-4 首帧批量', col: 3, row: 1, size: '1080x1920', count: 3 },
  { type: 'image', label: '镜头 2-4 首帧组', col: 4, row: 1 },
  { type: 'imageConfig', label: '镜头 5-8 首帧批量', col: 3, row: 2, size: '1080x1920', count: 4 },
  { type: 'image', label: '镜头 5-8 首帧组', col: 4, row: 2 },
  { type: 'text', label: '视频运镜规则', col: 5, row: 0, content: '每个镜头 5 秒，人物动作自然，镜头运动清晰，保持角色一致，避免闪烁和变脸。' },
  { type: 'videoConfig', label: '首帧到视频', col: 6, row: 1, ratio: '9:16', dur: 5 },
  { type: 'video', label: '短剧镜头视频', col: 7, row: 1 }
])

const dramaLinks = [
  [0, 1], [0, 2], [0, 3], [1, 5, 'promptOrder', { promptOrder: 1 }], [2, 5, 'promptOrder', { promptOrder: 2 }], [3, 5, 'promptOrder', { promptOrder: 3 }], [4, 5, 'promptOrder', { promptOrder: 4 }], [5, 6],
  [1, 7, 'promptOrder', { promptOrder: 1 }], [2, 7, 'promptOrder', { promptOrder: 2 }], [3, 7, 'promptOrder', { promptOrder: 3 }], [4, 7, 'promptOrder', { promptOrder: 4 }], [7, 8],
  [1, 9, 'promptOrder', { promptOrder: 1 }], [2, 9, 'promptOrder', { promptOrder: 2 }], [3, 9, 'promptOrder', { promptOrder: 3 }], [4, 9, 'promptOrder', { promptOrder: 4 }], [9, 10],
  [6, 12, 'imageRole', { imageRole: 'first_frame_image' }], [11, 12, 'promptOrder', { promptOrder: 1 }], [12, 13]
]

const imageWorkflows = [
  ['character-instantid-pack', '角色一致性：参考图到三视图+表情', 'character', 'PersonOutline', '参考角色图生成三视图、表情表、姿势库，适合短剧角色锁定。', '角色参考图、角色描述', '三视图、表情、首帧素材', 'ZHO InstantID / PhotoMaker 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '角色是一名古装女刺客，冷白肤色，黑金劲装，眼神克制，目标是建立可反复使用的视觉一致性。', '把角色参考图拆成身份特征、服装、脸型、发型、表情和禁忌项，输出可用于图片和视频的一致性提示词。', '生成同一角色的正面、侧面、背面、半身、近景、武器特写，保持脸型、服装和发色一致。', '基于首轮结果生成 12 宫格表情和 8 个动作姿势，明确每格标签，方便后续短剧分镜调用。'],
  ['photomaker-drama-cast', 'PhotoMaker 风格：短剧角色定妆包', 'character', 'PersonOutline', '从演员参考图生成短剧定妆照、海报照、剧情首帧。', '人物参考图、剧名、服装方向', '角色定妆资产包', 'ZHO PhotoMaker 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '都市悬疑短剧女主，职业法医，冷静、敏锐，常穿深灰风衣，画面偏冷色。', '提取人物身份、妆发、服装、气质和镜头风格，输出统一角色 Bible。', '生成角色定妆海报、半身照、工作状态照、情绪特写，统一冷色电影质感。', '生成不同场景下的角色保持一致性测试图：办公室、雨夜街头、案发现场、车内。'],
  ['controlnet-pose-fashion', '姿势控制：服装大片多姿态', 'creative', 'ImageOutline', '用姿势/构图参考控制人物动作，批量生成商业服装大片。', '服装 brief、姿势参考、品牌调性', '多姿态服装大片', 'Comfy ControlNet / OpenPose 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '品牌是高端机能风女装，目标生成 6 张可用于淘宝详情页和小红书的模特大片。', '分析品牌调性、模特气质、拍摄棚光、动作姿态，输出统一视觉规则。', '生成模特全身站姿、坐姿、走路、回头、侧身、特写，保持服装细节清晰。', '对最好的两张做局部重绘，修复手部、衣摆、面部和背景边缘。'],
  ['ipadapter-product-scene', '参考图控制：产品场景迁移', 'ecommerce', 'ShoppingOutline', '产品参考图进入不同场景，保持产品结构和 Logo 区域可控。', '产品图、场景方向、营销卖点', '电商主图、场景图、海报图', 'Comfy IPAdapter 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '一款透明瓶身精华液，主打修护、清爽、高级科技感，需要多场景广告图。', '提取产品材质、轮廓、卖点和禁止变形区域，生成场景迁移提示词。', '生成浴室水雾、实验室、自然植物、黑金高端四种产品场景图，产品保持一致。', '精修最适合广告投放的一张，强化瓶身高光、文字留白和平台安全边距。'],
  ['inpaint-face-beauty-retouch', '局部重绘：人像修脸+服装修复', 'creative', 'ImageOutline', '模拟 Inpaint 流程，解决脸部、手部、服装、背景瑕疵。', '原图、修复区域描述、风格要求', '修复图、高清图', 'Comfy Inpainting 思路', 'https://github.com/diodiogod/Comfy-Inpainting-Works', '一张人像大片需要修复手指、皮肤瑕疵、衣服褶皱和背景穿帮，但保留原始人物气质。', '把修复需求拆成脸部、手部、服装、背景四类，输出分区修复提示词。', '生成修复版本：自然肤质、正确手指、服装干净、背景无穿帮，不能过度磨皮。', '二次高清放大，保留毛孔、发丝和布料纹理，避免塑料感。'],
  ['outpaint-poster-extension', '扩图：竖图变海报留白版式', 'brand', 'ImageOutline', '把已有竖图扩展成可放标题和卖点的商业海报。', '原图、标题文案、品牌色', '海报底图、社媒版式', 'Comfy Outpainting 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '已有一张产品竖图，需要扩成 9:16 海报，顶部放主标题，底部放购买按钮和卖点。', '分析原图主体位置、可扩展区域、标题留白和品牌色，输出扩图策略。', '生成上下左右自然扩展的商业海报底图，主体不变形，边缘自然延展。', '加入干净的排版留白和光影层次，适配小红书、抖音封面、电商详情页。'],
  ['hires-fix-creative-poster', '高清修复：创意海报精修链路', 'brand', 'ImageOutline', '先生成创意海报，再进行细节修复和高清放大。', '创意 brief、标题、品牌色', '高清海报成品', 'Comfy Hires Fix / Upscale 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '为 AI 创作工具生成一张未来感发布会海报，视觉关键词：节点、画布、绿光、黑色玻璃。', '把品牌关键词转成构图、光线、字体区域、主体视觉和质感规则。', '生成第一版发布会主海报，中心构图，强视觉冲击，保留标题区和 CTA 区。', '高清修复海报细节，强化文字留白、边缘锐度、背景层次，去除乱码和伪影。'],
  ['nine-grid-selling-points', '九宫格卖点图：生成+拆分准备', 'ecommerce', 'GridOutline', '为后续九宫格自动裁剪准备标准 3x3 卖点图。', '产品信息、9 个卖点、品牌色', '3x3 总图、9 张拆分素材', '火宝短剧宫格图/Comfy Grid 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '一款户外露营灯，需要生成 3x3 九宫格卖点图：亮度、防水、续航、便携、氛围、充电、材质、安全、场景。', '整理 9 个卖点，每格生成一句短标题、一句补充文案、图标方向和产品角度。', '生成标准 3x3 九宫格广告图，每格边界清晰，适合后续自动裁剪拆分。', '二次优化每格留白和产品一致性，确保裁剪成 9 张后仍能独立使用。']
]

const videoWorkflows = [
  ['hunyuan-video-drama-shot', '图生视频：短剧首帧到运镜', 'video', 'VideocamOutline', '首帧生成后接图生视频，适合短剧单镜头生产。', '剧本镜头、首帧提示词、运镜', '首帧图、5 秒视频', 'ZHO Hunyuan Video 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '古装短剧镜头：女刺客在雨夜屋檐下回头，远处王府灯火摇曳。', '拆出人物动作、环境变化、镜头运动和情绪节奏，输出视频生成提示词。', '电影感首帧，雨夜屋檐、冷色月光、女刺客回头，背景王府灯火虚化。', '慢速 dolly in，雨滴和衣摆轻动，女主缓慢回头，镜头保持脸部一致，5 秒。'],
  ['product-tvc-firstframe', '产品 TVC：主图到广告视频', 'video', 'VideocamOutline', '产品广告首帧、运镜、视频成片一条链。', '产品图、卖点、广告风格', '首帧和广告视频', 'Comfy Video Workflow 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '一款蓝牙耳机，卖点是降噪、轻量、金属质感，目标生成 5 秒电商广告视频。', '把产品卖点转成镜头脚本：入场、旋转、特写、光效、结尾留白。', '生成耳机悬浮在暗色玻璃台面的广告首帧，蓝色边缘光，金属质感清晰。', '产品缓慢旋转，蓝色声波扩散，镜头推进到 Logo 区域，结尾留出文案空间。'],
  ['character-expression-video', '角色表情视频测试', 'video', 'PersonOutline', '用角色定妆首帧测试眨眼、转头、微表情。', '角色首帧、情绪要求', '角色一致性视频片段', 'PhotoMaker + Video 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '短剧男主王爷，冷峻克制，镜头是半身近景，从无表情到轻微皱眉。', '生成保持身份一致的视频提示词，重点控制脸型、发型、服装、情绪变化幅度。', '生成王爷半身首帧，古装深色锦袍，室内烛光，脸部清晰。', '轻微眨眼，缓慢转头，眉头微皱，背景烛火轻动，不能换脸，不能夸张表情。'],
  ['fashion-runway-video', '服装走秀短视频', 'video', 'VideocamOutline', '服装大片首帧转走秀动作，用于社媒短视频。', '服装图、模特气质、镜头风格', '走秀视频', 'ControlNet + Video 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '机能风外套模特在极简棚拍空间中向镜头走来，突出衣服廓形和材质。', '拆解步态、镜头高度、服装细节、灯光反射和背景控制。', '生成棚拍全身首帧，模特站立，服装廓形清晰，背景极简。', '模特向前走两步，衣摆自然摆动，镜头轻微后退，保持服装和脸部一致。'],
  ['map-worldbuilding-video', '世界观地图动态镜头', 'video', 'GridOutline', '先生成世界观地图，再做推拉镜头视频。', '世界观设定、地点、势力', '地图图、动态镜头', 'Comfy 3D / Video 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '玄幻短剧世界观：北境雪原、王都、黑水港、禁林、古战场五个区域。', '把世界观转成地图符号、地形、势力颜色、路线和镜头讲述顺序。', '生成古卷轴风格世界观地图，五大区域清晰，有路线、图例和留白。', '镜头从王都缓慢推向禁林，地图上微弱光点移动，史诗感，适合片头。'],
  ['food-commercial-video', '美食广告：首帧到微距视频', 'video', 'VideocamOutline', '食物微距图生视频，适合餐饮广告。', '菜品、卖点、场景', '食物微距视频', 'Video Prompt 思路', 'https://github.com/geekjourneyx/awesome-ai-video-prompts', '一份炭烤牛排，卖点是汁水、烟火气、黑金高端餐厅风格。', '拆解食物质感、热气、油光、刀叉动作和镜头节奏。', '生成牛排微距首帧，切面粉红、热气、海盐颗粒、暗色背景。', '热气缓慢上升，油光闪动，刀切开牛排露出汁水，镜头微距推进。']
]

const dramaWorkflows = [
  ['drama-costume-assassin-8shots', '短剧：古装刺客第一集 8 分镜', '古装复仇', '女刺客潜入王府刺杀王爷，却发现王爷正在调查同一场灭门案。'],
  ['drama-urban-suspense-8shots', '短剧：都市悬疑第一集 8 分镜', '都市悬疑', '女法医在雨夜发现死者手机里有自己三年前失踪妹妹的照片。'],
  ['drama-ceo-romance-12shots', '短剧：霸总反转 12 分镜', '都市情感', '被误解的女主进入集团调查父亲旧案，冷面总裁其实一直在保护她。'],
  ['drama-fantasy-academy-8shots', '短剧：玄幻学院 8 分镜', '玄幻成长', '废柴少年在学院试炼中意外唤醒禁忌灵纹，被所有势力盯上。'],
  ['drama-republic-spy-8shots', '短剧：民国谍战 8 分镜', '民国谍战', '女记者收到密信，发现未婚夫可能是敌方卧底。'],
  ['drama-family-revenge-8shots', '短剧：家族复仇 8 分镜', '现实复仇', '被逐出家门的女主五年后以投资人身份归来，第一集完成身份反转。'],
  ['drama-sci-fi-loop-8shots', '短剧：时间循环 8 分镜', '科幻悬疑', '男主每天醒来都在同一辆即将爆炸的地铁上，只能靠细节改变结局。'],
  ['drama-comedy-livecommerce-8shots', '短剧：直播电商喜剧 8 分镜', '轻喜剧电商', '破产老板娘用 AI 画布重做直播间，第一晚意外爆单。']
]

const professionalWorkflows = [
  ['flux-prompt-to-poster-system', 'FLUX 风格：商业海报系统', 'brand', 'GridOutline', '高质量提示词、构图、字体留白、高清输出的完整链。', '品牌 brief、标题、主视觉方向', '海报主图、社媒改版', 'ZHO FLUX 工作流思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '为一款云端 AI 视频工具设计发布海报，关键词：高速、专业、短剧、工作流。', '生成 FLUX 风格强结构提示词，包含主体、背景、版式、光线、材质、字体区域。', '生成商业发布海报主视觉，强对比，留出标题区和 CTA。', '按 9:16、1:1、16:9 三种比例重构版式，保持主视觉一致。'],
  ['sd3-cinematic-concept-art', 'SD3 风格：电影概念设计', 'creative', 'ImageOutline', '电影概念图从文本设定到高清气氛图。', '世界观、场景、色调', '概念图、气氛图', 'ZHO SD3 / Stable Cascade 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '末日城市中的地下避难所入口，霓虹残光，雨水，远处巨型无人机巡逻。', '拆成电影美术设定：时代、建筑、光线、人物比例、镜头焦段、情绪。', '生成宽幅电影概念图，强空间纵深，暗色调，细节丰富。', '高清精修光影层次和远景细节，保留电影感，不增加乱码文字。'],
  ['stable-cascade-architecture', 'Stable Cascade 风格：建筑场景推敲', 'creative', 'GridOutline', '建筑/室内从草案到多角度效果图。', '建筑 brief、材质、视角', '外观、室内、多角度图', 'ZHO Stable Cascade 思路', 'https://github.com/ZHO-ZHO-ZHO/ComfyUI-Workflows-ZHO', '海边 AI 创作者工作室，玻璃、木材、混凝土，黄昏光线，适合品牌宣传片。', '整理建筑体块、材质、采光、机位和环境关系。', '生成建筑外观、入口、室内工作区、露台四宫格效果图。', '选择最佳角度做高清放大和细节修复，增强真实建筑摄影质感。'],
  ['llm-llava-visual-analyze-redesign', 'LLM+视觉：参考图分析再重设计', 'ui', 'ChatbubbleOutline', '参考图理解、提示词改写、重新生成。', '参考图、改版目标', '分析文本、新版视觉', 'Comfy LLM_Llava 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '分析一张竞品 App 首页截图，重新设计成 YUFENG Canvas 风格的 AI 创作工作区首页。', '识别参考图布局、色彩、组件、优缺点，输出可执行 redesign prompt。', '生成新版深色科技感 App 首页，突出画布、节点、模型、短剧工作区。', '优化 UI 层级、按钮状态、卡片信息密度和移动端适配。'],
  ['xyz-plot-style-matrix', 'XYZ Plot 思路：风格矩阵批量测试', 'creative', 'GridOutline', '批量测试风格/CFG/Seed 的差异，适合选型。', '主题、风格列表、参数范围', '风格矩阵图', 'Comfy XYZ Plot 思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '同一角色生成 3 种风格：电影写实、日系动画、国风插画；每种 3 个 Seed。', '生成矩阵测试规则，横轴风格，纵轴 Seed，保持角色一致。', '输出 3x3 风格矩阵图，每格标注风格和 Seed，主体一致。', '挑选最佳格子做高清重绘，形成正式角色风格基准。'],
  ['multi-controlnet-scene-lock', '多控制：构图+深度+风格锁定', 'creative', 'GridOutline', '模拟多 ControlNet：构图、深度、风格三层控制。', '构图参考、深度参考、风格参考', '稳定场景图', 'Comfy ControlNet 组合思路', 'https://github.com/pwillia7/Basic_ComfyUI_Workflows', '保持一张街景构图，改成赛博朋克雨夜风格，人物站位和透视不变。', '把控制条件拆成构图、深度、风格、主体禁区和可变区域。', '生成构图稳定的赛博朋克街景，雨夜霓虹，人物站位不变。', '局部修复透视、招牌乱码、人物边缘和地面反射。']
]

const allWorkflows = [
  ...imageWorkflows.map(([id, name, category, icon, description, inputSummary, outputSummary, sourceName, sourceUrl, brief, planner, firstPrompt, secondPrompt]) => ({
    id: `complex-${id}`,
    name,
    category,
    icon,
    description,
    sourceName,
    sourceUrl,
    complexity: '复杂 / 多阶段',
    parameters: ['Prompt 正向提示词', 'Negative Prompt 反向提示词', 'Seed 随机种子', 'Steps 生成步数', 'CFG 提示词遵循', '参考图', '局部重绘', '高清放大'],
    inputSummary,
    outputSummary,
    beginnerHelp: '替换 Brief 和提示词后，先运行主视觉生成，再用结果作为参考图执行精修/放大。',
    stages: imageProductionStages({ brief, planner, firstPrompt, secondPrompt }),
    links: imageProductionLinks
  })),
  ...videoWorkflows.map(([id, name, category, icon, description, inputSummary, outputSummary, sourceName, sourceUrl, brief, planner, firstFramePrompt, motionPrompt]) => ({
    id: `complex-${id}`,
    name,
    category,
    icon,
    description,
    sourceName,
    sourceUrl,
    complexity: '复杂 / 图片到视频',
    parameters: ['Prompt 正向提示词', '首帧参考图', '镜头运动', 'Seed 随机种子', '视频比例', '视频时长', '负面提示词'],
    inputSummary,
    outputSummary,
    beginnerHelp: '先生成首帧，确认角色和构图正确后，再运行图生视频节点。',
    stages: videoProductionStages({ brief, planner, firstFramePrompt, motionPrompt }),
    links: videoProductionLinks
  })),
  ...dramaWorkflows.map(([id, title, genre, premise]) => ({
    id: `complex-${id}`,
    name: title,
    category: 'drama',
    icon: 'BookOutline',
    description: '一句话短剧到角色库、场景库、8 分镜、首帧和视频节点的完整链路。',
    sourceName: 'huobao-drama + Codeywood/VibeFrame 生产流程思路',
    sourceUrl: 'https://codeywood.com/',
    complexity: '复杂 / Drama Pipeline',
    parameters: ['故事设定', '角色库', '场景库', '镜头表', '首帧 Prompt', '视频 Prompt', '镜头状态'],
    inputSummary: '一句话故事、类型、角色方向',
    outputSummary: '角色库、场景库、8 分镜、首帧、视频节点',
    beginnerHelp: '先运行角色库/场景库/分镜拆解，再批量生成首帧，最后选择镜头转视频。',
    stages: dramaStages({ title, premise, genre }),
    links: dramaLinks
  })),
  ...professionalWorkflows.map(([id, name, category, icon, description, inputSummary, outputSummary, sourceName, sourceUrl, brief, planner, firstPrompt, secondPrompt]) => ({
    id: `complex-${id}`,
    name,
    category,
    icon,
    description,
    sourceName,
    sourceUrl,
    complexity: '复杂 / Comfy 专业参数',
    parameters: ['Sampler 采样器', 'Scheduler 调度器', 'Steps 生成步数', 'CFG 提示词遵循', 'Seed 随机种子', 'LoRA 风格/角色', 'ControlNet 构图控制', 'Upscale 高清放大'],
    inputSummary,
    outputSummary,
    beginnerHelp: '小白只改 Brief；专业用户展开生成节点参数，按模型能力保留或回退专业参数。',
    stages: imageProductionStages({ brief, planner, firstPrompt, secondPrompt, firstLabel: '专业主图生成', secondLabel: '专业二阶段精修', size: category === 'creative' ? '1920x1080' : '1440x1920' }),
    links: imageProductionLinks
  }))
]

export const COMPLEX_WORKFLOW_TEMPLATES = allWorkflows.map(createComplexTemplate)

export default COMPLEX_WORKFLOW_TEMPLATES

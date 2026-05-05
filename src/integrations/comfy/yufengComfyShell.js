export const COMFY_SHELL_LAYERS = [
  {
    id: 'engine',
    title: 'ComfyUI 原生引擎层',
    description: '保留 ComfyUI 的本地模型、节点生态、LoRA、ControlNet、IPAdapter、放大、重绘和自定义节点能力。',
    visibleToUser: false
  },
  {
    id: 'adapter',
    title: 'YUFENG 工作流适配层',
    description: '把 Comfy API workflow JSON 解析成可运行任务，负责 /prompt、/history、/view、资产持久化和错误提示。',
    visibleToUser: false
  },
  {
    id: 'wrapper',
    title: '小白表单包装层',
    description: '把复杂 Comfy 节点包装成提示词、反向提示词、参考图、尺寸、Seed、Steps、CFG、LoRA 等中文表单。',
    visibleToUser: true
  },
  {
    id: 'canvas',
    title: 'Canvas 操控层',
    description: '语言模型通过 Canvas Action Protocol 创建、连接、运行、修复 Comfy 工作流节点。',
    visibleToUser: true
  }
]

export const COMFY_WRAPPER_TEMPLATES = [
  {
    id: 'txt2img-basic',
    title: '本地文生图',
    level: '小白',
    tags: ['SD', 'Flux', '基础生成'],
    fields: ['模型', '提示词', '反向提示词', '尺寸', 'Seed', 'Steps', 'CFG'],
    outputs: ['图片节点', '本地资产']
  },
  {
    id: 'reference-character',
    title: '参考图角色一致性',
    level: '创作者',
    tags: ['IPAdapter', '角色一致性', '参考图'],
    fields: ['角色参考图', '提示词', '相似度', '尺寸', 'Seed'],
    outputs: ['角色图', '角色素材']
  },
  {
    id: 'controlnet-pose',
    title: '姿态/构图控制',
    level: '创作者',
    tags: ['ControlNet', 'Pose', 'Depth'],
    fields: ['控制图', '控制类型', '提示词', '强度', '尺寸'],
    outputs: ['受控构图图片']
  },
  {
    id: 'inpaint-upscale',
    title: '局部重绘 + 高清放大',
    level: '专业',
    tags: ['Inpaint', 'Upscale', '修图'],
    fields: ['原图', '遮罩', '修改说明', '放大倍率', '降噪强度'],
    outputs: ['修复图', '高清图']
  },
  {
    id: 'video-first-frame',
    title: '视频首帧生产',
    level: '视频',
    tags: ['首帧', '短剧', '图生视频'],
    fields: ['镜头描述', '角色参考', '场景参考', '比例', '风格一致性'],
    outputs: ['首帧图', '视频节点输入']
  }
]

export function getComfyShellSummary(state) {
  const installed = !!state?.installed
  const running = !!state?.running
  const connected = !!state?.objectInfoCount && !state?.error
  return {
    installed,
    running,
    connected,
    statusLabel: connected ? '已连接' : running ? '运行中' : installed ? '已安装' : '未安装',
    objectInfoCount: Number(state?.objectInfoCount || 0),
    baseUrl: state?.baseUrl || 'http://127.0.0.1:8188',
    error: state?.error || ''
  }
}

export function buildDefaultComfyWrapperData(templateId = 'txt2img-basic') {
  const template = COMFY_WRAPPER_TEMPLATES.find(item => item.id === templateId) || COMFY_WRAPPER_TEMPLATES[0]
  return {
    label: template.title,
    prompt: '输入你的画面需求，YUFENG 会把它映射到 Comfy 工作流参数。',
    negativePrompt: '低清晰度、畸形、错误文字、噪点、过曝',
    width: templateId === 'video-first-frame' ? 1920 : 1024,
    height: templateId === 'video-first-frame' ? 1080 : 1024,
    seed: -1,
    steps: 20,
    cfg: 7,
    bindings: {
      prompt: { virtual: true },
      negativePrompt: { virtual: true },
      width: { virtual: true },
      height: { virtual: true },
      seed: { virtual: true },
      steps: { virtual: true },
      cfg: { virtual: true }
    },
    apiWorkflow: null,
    status: 'idle',
    error: '这是 YUFENG 简化包装节点。要真实运行，请导入 Comfy API workflow JSON 或在专业模式绑定底层 workflow。',
    wrapperTemplateId: template.id,
    wrapperTemplateTitle: template.title,
    yufengShell: true
  }
}

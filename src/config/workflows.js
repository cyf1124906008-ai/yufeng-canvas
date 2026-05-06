/**
 * Workflow Templates Configuration | 工作流模板配置
 * 预设工作流模板，支持一键添加到画布
 */
import coverMultiAngle from '@/assets/workflow-covers/multi-angle-cover.jpg'
import coverEcommerce from '@/assets/workflow-covers/ecommerce-cover.jpg'
import coverCharacter from '@/assets/workflow-covers/character-cover.jpg'
import coverScene from '@/assets/workflow-covers/scene-cover.jpg'
import coverPictureBook from '@/assets/workflow-covers/picture-book-cover.jpg'
import coverTextVideo from '@/assets/workflow-covers/text-video-cover.jpg'
import coverImageVideo from '@/assets/workflow-covers/image-video-cover.jpg'
import coverBrandKit from '@/assets/workflow-covers/brand-kit-cover.jpg'
import coverSocialPoster from '@/assets/workflow-covers/social-poster-cover.jpg'
import coverAiVideoAppUi from '@/assets/inspiration-cases/ai-video-app-ui.jpg'
import coverCameraExplodedView from '@/assets/inspiration-cases/camera-exploded-view.jpg'
import coverCityTravelGuide from '@/assets/inspiration-cases/city-travel-guide.jpg'
import coverFashionCampaign from '@/assets/inspiration-cases/fashion-campaign-grid.jpg'
import coverLiveCommerce from '@/assets/inspiration-cases/douyin-live-commerce.jpg'
import coverLanternPanorama from '@/assets/inspiration-cases/lantern-panorama-long-scroll.jpg'

// Multi-angle prompts | 多角度提示词模板
export const MULTI_ANGLE_PROMPTS = {
  front: {
    label: '正视',
    english: 'Front View',
    prompt: (character) => `使用提供的图片，生成四宫格分镜，每张四宫格包括人物正面对着镜头的4个景别（远景、中景、近景、和局部特写），保持场景、产品、人物特征的一致性，宫格里的每一张照片保持和提供图片相同的比例。并在图片下方用英文标注这个景别

角色参考: ${character}`
  },
  side: {
    label: '侧视',
    english: 'Side View', 
    prompt: (character) => `使用提供的图片，分别生成四宫格分镜，每张四宫格包括人物侧面角度的4个景别（远景、中景、近景、和局部特写），保持场景、产品、人物特征的一致性，宫格里的每一张照片保持和提供图片相同的比例。并在图片下方用英文标注这个景别

角色参考: ${character}`
  },
  back: {
    label: '后视',
    english: 'Back View',
    prompt: (character) => `使用提供的图片，分别生成四宫格分镜，每张四宫格包括人物背影角度的4个景别（远景、中景、近景、和局部特写），保持场景、产品、人物特征的一致性，宫格里的每一张照片保持和提供图片相同的比例。并在图片下方用英文标注这个景别

角色参考: ${character}`
  },
  top: {
    label: '俯视',
    english: 'Top/Bird\'s Eye View',
    prompt: (character) => `使用提供的图片，分别生成四宫格分镜，每张四宫格包括俯视角度的4个景别（远景、中景、近景、和局部特写），保持场景、产品、人物特征的一致性，宫格里的每一张照片保持和提供图片相同的比例。并在图片下方用英文标注这个景别

角色参考: ${character}`
  }
}

const createIdFactory = () => {
  let nodeIdCounter = 0
  return () => `workflow_node_${Date.now()}_${nodeIdCounter++}`
}

const connect = (source, target, extra = {}) => ({
  id: `edge_${source}_${target}`,
  source,
  target,
  sourceHandle: 'right',
  targetHandle: 'left',
  ...extra
})

const createTextToImagePreset = ({
  prompt,
  promptLabel,
  configLabel,
  resultLabel,
  size = '1440x2560'
}) => (startPosition) => {
  const getNodeId = createIdFactory()
  const textId = getNodeId()
  const configId = getNodeId()
  const resultId = getNodeId()

  return {
    nodes: [
      {
        id: textId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: { content: prompt, label: promptLabel }
      },
      {
        id: configId,
        type: 'imageConfig',
        position: { x: startPosition.x + 420, y: startPosition.y },
        data: { label: configLabel, size }
      },
      {
        id: resultId,
        type: 'image',
        position: { x: startPosition.x + 820, y: startPosition.y },
        data: { url: '', label: resultLabel }
      }
    ],
    edges: [
      connect(textId, configId, { type: 'promptOrder', data: { promptOrder: 1 } }),
      connect(configId, resultId)
    ]
  }
}

const createCloudWorkflowPreset = ({
  prompt,
  promptLabel,
  configLabel,
  resultLabel,
  size = '1440x2560',
  steps = 20,
  cfg = 7,
  sampler = 'euler',
  scheduler = 'normal',
  denoise = 1.0
}) => (startPosition) => {
  const getNodeId = createIdFactory()
  const textId = getNodeId()
  const configId = getNodeId()
  const resultId = getNodeId()

  return {
    nodes: [
      {
        id: textId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: { content: prompt, label: promptLabel }
      },
      {
        id: configId,
        type: 'cloudImageWorkflow',
        position: { x: startPosition.x + 420, y: startPosition.y },
        data: { label: configLabel, size, steps, cfg, sampler, scheduler, denoise }
      },
      {
        id: resultId,
        type: 'image',
        position: { x: startPosition.x + 820, y: startPosition.y },
        data: { url: '', label: resultLabel }
      }
    ],
    edges: [
      connect(textId, configId, { type: 'promptOrder', data: { promptOrder: 1 } }),
      connect(configId, resultId)
    ]
  }
}

const createTextToVideoPreset = ({
  prompt,
  ratio = '16:9',
  dur = 5
}) => (startPosition) => {
  const getNodeId = createIdFactory()
  const textId = getNodeId()
  const videoConfigId = getNodeId()
  const videoId = getNodeId()

  return {
    nodes: [
      {
        id: textId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: { content: prompt, label: '视频提示词' }
      },
      {
        id: videoConfigId,
        type: 'videoConfig',
        position: { x: startPosition.x + 420, y: startPosition.y },
        data: { label: '文生视频', ratio, dur }
      },
      {
        id: videoId,
        type: 'video',
        position: { x: startPosition.x + 800, y: startPosition.y },
        data: { url: '', label: '视频结果' }
      }
    ],
    edges: [
      connect(textId, videoConfigId, { type: 'promptOrder', data: { promptOrder: 1 } }),
      connect(videoConfigId, videoId)
    ]
  }
}

const createImageToVideoPreset = ({
  prompt,
  ratio = '9:16',
  dur = 5
}) => (startPosition) => {
  const getNodeId = createIdFactory()
  const imageId = getNodeId()
  const textId = getNodeId()
  const videoConfigId = getNodeId()
  const videoId = getNodeId()

  return {
    nodes: [
      {
        id: imageId,
        type: 'image',
        position: { x: startPosition.x, y: startPosition.y },
        data: { url: '', label: '首帧图片' }
      },
      {
        id: textId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y + 250 },
        data: { content: prompt, label: '运镜提示词' }
      },
      {
        id: videoConfigId,
        type: 'videoConfig',
        position: { x: startPosition.x + 430, y: startPosition.y + 100 },
        data: { label: '图生视频', ratio, dur }
      },
      {
        id: videoId,
        type: 'video',
        position: { x: startPosition.x + 810, y: startPosition.y + 100 },
        data: { url: '', label: '视频结果' }
      }
    ],
    edges: [
      connect(imageId, videoConfigId, { type: 'imageRole', data: { imageRole: 'first_frame_image' } }),
      connect(textId, videoConfigId, { type: 'promptOrder', data: { promptOrder: 1 } }),
      connect(videoConfigId, videoId)
    ]
  }
}

const createBrandVisualKit = (startPosition) => {
  const colSpacing = 430
  const rowSpacing = 260
  const getNodeId = createIdFactory()
  const nodes = []
  const edges = []

  const brandBriefId = getNodeId()
  nodes.push({
    id: brandBriefId,
    type: 'text',
    position: { x: startPosition.x, y: startPosition.y + rowSpacing },
    data: {
      label: '品牌简报',
      content: '品牌名称：YUFENG Lab\n关键词：未来感、清爽、可信赖、创作者工具\n主色：深青黑、荧光绿、科技蓝\n受众：AI 创作者、短视频团队、电商设计师\n目标：生成一套可用于官网、社媒和产品发布的品牌视觉。'
    }
  })

  const prompts = [
    ['品牌主视觉海报', '根据品牌简报生成一张高级科技感品牌主视觉海报，中心构图，抽象Y形光轨，深青黑背景，荧光绿和科技蓝点缀，适合官网首屏。', '1440x2560'],
    ['社媒方图', '根据品牌简报生成一张适合小红书/朋友圈发布的方形宣传图，干净留白，醒目的标题区域，包含抽象AI画布和节点元素。', '1024x1024'],
    ['产品发布横幅', '根据品牌简报生成一张16:9产品发布横幅，展示桌面软件界面氛围、画布节点、生成图片和视频的视觉流程，高级、简洁、有品牌识别度。', '1920x1080'],
    ['应用商店封面', '根据品牌简报生成一张应用商店封面图，突出本地AI视觉工作台、工作流、图片与视频生成，明亮可信，适合软件下载页。', '1440x1024']
  ]

  prompts.forEach(([label, content, size], index) => {
    const y = startPosition.y + index * rowSpacing
    const promptId = getNodeId()
    const configId = getNodeId()
    const imageId = getNodeId()

    nodes.push({
      id: promptId,
      type: 'text',
      position: { x: startPosition.x + colSpacing, y },
      data: { label: `${label}提示词`, content }
    })
    nodes.push({
      id: configId,
      type: 'imageConfig',
      position: { x: startPosition.x + colSpacing * 2, y },
      data: { label, size }
    })
    nodes.push({
      id: imageId,
      type: 'image',
      position: { x: startPosition.x + colSpacing * 3, y },
      data: { url: '', label: `${label}结果` }
    })
    edges.push(connect(brandBriefId, configId, { type: 'promptOrder', data: { promptOrder: 1 } }))
    edges.push(connect(promptId, configId, { type: 'promptOrder', data: { promptOrder: 2 } }))
    edges.push(connect(configId, imageId))
  })

  return { nodes, edges }
}

/**
 * Workflow Templates | 工作流模板
 */
export const WORKFLOW_TEMPLATES = [
  {
    id: 'multi-angle-storyboard',
    name: '多角度分镜',
    description: '生成角色的正视、侧视、后视、俯视四宫格分镜图',
    icon: 'GridOutline',
    category: 'storyboard',
    cover: coverMultiAngle,
    // 节点配置
    createNodes: (startPosition) => {
      const nodeSpacing = 400
      const rowSpacing = 280
      const angles = ['front', 'side', 'back', 'top']
      
      const nodes = []
      const edges = []
      let nodeIdCounter = 0
      const getNodeId = () => `workflow_node_${Date.now()}_${nodeIdCounter++}`
      
      // 主角色图：提示词 + 文生图配置
      const characterTextId = getNodeId()
      nodes.push({
        id: characterTextId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y + rowSpacing * 1.5 },
        data: {
          content: '',
          label: '角色提示词'
        }
      })
      
      const characterConfigId = getNodeId()
      nodes.push({
        id: characterConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + nodeSpacing, y: startPosition.y + rowSpacing * 1.5 },
        data: {
          label: '主角色图',
          size: '2048x2048'
        }
      })
      
      // 主角色图结果节点（空白图片节点）
      const characterImageId = getNodeId()
      nodes.push({
        id: characterImageId,
        type: 'image',
        position: { x: startPosition.x + nodeSpacing * 2, y: startPosition.y + rowSpacing * 1.5 },
        data: {
          url: '',
          label: '角色图结果'
        }
      })
      
      // 连线：角色提示词 → 角色图配置
      edges.push({
        id: `edge_${characterTextId}_${characterConfigId}`,
        source: characterTextId,
        target: characterConfigId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // 连线：角色图配置 → 角色图结果
      edges.push({
        id: `edge_${characterConfigId}_${characterImageId}`,
        source: characterConfigId,
        target: characterImageId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // 创建4个角度的节点
      const angleX = startPosition.x + nodeSpacing * 3 + 100
      
      angles.forEach((angleKey, index) => {
        const angleConfig = MULTI_ANGLE_PROMPTS[angleKey]
        const angleY = startPosition.y + index * rowSpacing
        let currentX = angleX
        
        // 提示词节点（预填充默认提示词）
        const textNodeId = getNodeId()
        nodes.push({
          id: textNodeId,
          type: 'text',
          position: { x: currentX, y: angleY },
          data: {
            content: angleConfig.prompt(''),
            label: `${angleConfig.label}提示词`
          }
        })
        currentX += nodeSpacing
        
        // 图片配置节点
        const configNodeId = getNodeId()
        nodes.push({
          id: configNodeId,
          type: 'imageConfig',
          position: { x: currentX, y: angleY },
          data: {
            label: `${angleConfig.label} (${angleConfig.english})`,
            size: '2048x2048'
          }
        })
        
        // 连线：提示词 → 配置
        edges.push({
          id: `edge_${textNodeId}_${configNodeId}`,
          source: textNodeId,
          target: configNodeId,
          type: 'promptOrder',
          data: { promptOrder: 1 },
          sourceHandle: 'right',
          targetHandle: 'left'
        })
        
        // 连线：角色图结果 → 角度配置（参考图）
        edges.push({
          id: `edge_${characterImageId}_${configNodeId}`,
          source: characterImageId,
          target: configNodeId,
          type: 'imageOrder',
          data: { imageOrder: 1 },
          sourceHandle: 'right',
          targetHandle: 'left'
        })
      })
      
      return { nodes, edges }
    }
  },
  {
    id: 'product-ecommerce-full-set',
    name: '通用产品全套电商图',
    description: '根据产品信息和图片，生成模特图、侧面展示图、俯瞰展示图',
    icon: 'ShoppingOutline',
    category: 'ecommerce',
    cover: coverEcommerce,
    // 节点配置
    createNodes: (startPosition) => {
      const colSpacing = 500  // 列间距
      const rowSpacing = 350  // 行间距
      
      const nodes = []
      const edges = []
      let nodeIdCounter = 0
      const getNodeId = () => `workflow_node_${Date.now()}_${nodeIdCounter++}`
      
      // ========== 布局说明 ==========
      // 第一列: A(产品信息), B(产品图片) - 输入节点
      // 第二列: C, D, E - 提示词节点
      // 第三列: 生成模特图, 侧面展示图, 俯瞰展示图 - 输出节点
      
      // ========== 第一列：输入节点 ==========
      // A: 产品信息文本节点
      const nodeA_productInfoId = getNodeId()
      nodes.push({
        id: nodeA_productInfoId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: {
          content: 'Soundcore by Anker P20i真无线耳机，10mm驱动单元带来强劲低音，蓝牙5.3，30小时超长续航，防水，2个麦克风实现AI清晰通话，22种预设均衡器，可通过App定制 强劲低音：Soundcore P20i真无线耳机搭载超大10mm驱动单元，带来强劲音效和增强的低音，让您沉浸在喜爱的歌曲中。 个性化聆听体验：使用Soundcore App自定义控制选项，并从22种预设均衡器中进行选择。借助“Find My Earbuds”（查找我的耳机）功能，丢失的耳机可以发出声音，帮助您定位。 长续航，快速充电：单次充电可提供10小时电池续航，搭配充电盒则可延长至30小时。如果P20i真无线耳机电量不足，仅需10分钟快速充电即可提供2小时播放时间。 便携式设计：Soundcore P20i真无线耳机和充电盒小巧轻便，配有挂绳。其体积足够小，可轻松放入口袋，或挂在包或钥匙上，让您无需担心空间问题。 AI增强清晰通话：2个内置麦克风和AI算法协同工作，捕捉您的声音，让您无需在电话中大喊大叫。',
          label: '产品信息'
        }
      })
      
      // B: 产品图片节点
      const nodeB_productImageId = getNodeId()
      nodes.push({
        id: nodeB_productImageId,
        type: 'image',
        position: { x: startPosition.x, y: startPosition.y + rowSpacing },
        data: {
    url: '',
          label: '产品图片'
        }
      })
      
      // ========== 第二列：提示词节点 ==========
      // C: 模特图提示词 (与生成模特图对齐)
      const nodeC_modelPromptId = getNodeId()
      nodes.push({
        id: nodeC_modelPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing, y: startPosition.y },
        data: {
          content: '根据产品特性，生成一个适合展示该产品且时尚富有高级感的模特图，彩色人像，背景是白底，人物居中，欧美人优先',
          label: '模特图提示词'
        }
      })
      
      // D: 侧面展示图提示词 (与侧面展示图对齐)
      const nodeD_sidePromptId = getNodeId()
      nodes.push({
        id: nodeD_sidePromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing, y: startPosition.y + rowSpacing },
        data: {
          content: '根据产品图和产品信息，生成左侧侧面45度的展示图，高清展示侧面的产品形状和细节，保持产品不变形',
          label: '侧面展示图提示词'
        }
      })
      
      // E: 俯瞰展示图提示词 (与俯瞰展示图对齐)
      const nodeE_topPromptId = getNodeId()
      nodes.push({
        id: nodeE_topPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing, y: startPosition.y + rowSpacing * 2 },
        data: {
          content: '根据产品图和产品信息，生成从上往下俯瞰的产品展示图，高清展示俯瞰角度的产品形状和细节，保持产品不变形',
          label: '俯瞰展示图提示词'
        }
      })
      
      // F: 拆解图提示词 (与拆解图对齐)
      const nodeF_explodedPromptId = getNodeId()
      nodes.push({
        id: nodeF_explodedPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing, y: startPosition.y + rowSpacing * 3 },
        data: {
          content: '根据产品材质功能，生成一张产品核心部件的结构示意图，要展现出产品核心部件的内部构造，画面清晰呈现产品关键部件，背景为简洁的浅色调，同时包含核心卖点文案',
          label: '拆解图提示词'
        }
      })
      
      // ========== 第三列：生成节点 ==========
      // B+C = 生成模特图
      const modelConfigId = getNodeId()
      nodes.push({
        id: modelConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y },
        data: {
          label: '生成模特图',
          size: '2048x2048'
        }
      })
      
      // B+D = 生成侧面展示图
      const sideConfigId = getNodeId()
      nodes.push({
        id: sideConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y + rowSpacing },
        data: {
          label: '侧面展示图',
          size: '2048x2048'
        }
      })
      
      // B+E = 生成俯瞰展示图
      const topConfigId = getNodeId()
      nodes.push({
        id: topConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y + rowSpacing * 2 },
        data: {
          label: '俯瞰展示图',
          size: '2048x2048'
        }
      })
      
      // AB+F = 生成拆解图
      const explodedConfigId = getNodeId()
      nodes.push({
        id: explodedConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y + rowSpacing * 3 },
        data: {
          label: '拆解图',
          size: '2048x2048'
        }
      })
      
      // ========== 连线 ==========
      // AB+C → 生成模特图
      edges.push({
        id: `edge_${nodeA_productInfoId}_${modelConfigId}`,
        source: nodeA_productInfoId,
        target: modelConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeB_productImageId}_${modelConfigId}`,
        source: nodeB_productImageId,
        target: modelConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeC_modelPromptId}_${modelConfigId}`,
        source: nodeC_modelPromptId,
        target: modelConfigId,
        type: 'promptOrder',
        data: { promptOrder: 2 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // AB+D → 生成侧面展示图
      edges.push({
        id: `edge_${nodeA_productInfoId}_${sideConfigId}`,
        source: nodeA_productInfoId,
        target: sideConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeB_productImageId}_${sideConfigId}`,
        source: nodeB_productImageId,
        target: sideConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeD_sidePromptId}_${sideConfigId}`,
        source: nodeD_sidePromptId,
        target: sideConfigId,
        type: 'promptOrder',
        data: { promptOrder: 2 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // AB+E → 生成俯瞰展示图
      edges.push({
        id: `edge_${nodeA_productInfoId}_${topConfigId}`,
        source: nodeA_productInfoId,
        target: topConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeB_productImageId}_${topConfigId}`,
        source: nodeB_productImageId,
        target: topConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeE_topPromptId}_${topConfigId}`,
        source: nodeE_topPromptId,
        target: topConfigId,
        type: 'promptOrder',
        data: { promptOrder: 2 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // AB+F → 生成拆解图
      edges.push({
        id: `edge_${nodeA_productInfoId}_${explodedConfigId}`,
        source: nodeA_productInfoId,
        target: explodedConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeB_productImageId}_${explodedConfigId}`,
        source: nodeB_productImageId,
        target: explodedConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nodeF_explodedPromptId}_${explodedConfigId}`,
        source: nodeF_explodedPromptId,
        target: explodedConfigId,
        type: 'promptOrder',
        data: { promptOrder: 2 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      return { nodes, edges }
    }
  },
  // ========== 短剧生图工作流 ==========
  {
    id: 'drama-character-design',
    name: '短剧角色设计',
    description: '根据角色描述生成一致性角色形象，后续多角度图依赖正面图保持一致性',
    icon: 'PersonOutline',
    category: 'drama',
    cover: coverCharacter,
    createNodes: (startPosition) => {
      const colSpacing = 400
      const rowSpacing = 280
      
      const nodes = []
      const edges = []
      let nodeIdCounter = 0
      const getNodeId = () => `workflow_node_${Date.now()}_${nodeIdCounter++}`
      
      // ========== 第一阶段：生成正面角色图 ==========
      // 角色描述
      const characterDescId = getNodeId()
      nodes.push({
        id: characterDescId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: {
          content: '角色名称：林小雨\n性别：女\n年龄：22岁\n外貌特征：长发及腰，眼睛明亮有神，皮肤白皙，身材高挑\n服装风格：现代都市风，白色连衣裙\n性格特点：温柔善良，内心坚强',
          label: '角色描述'
        }
      })
      
      // 风格参考图（可选）
      const styleRefId = getNodeId()
      nodes.push({
        id: styleRefId,
        type: 'image',
        position: { x: startPosition.x, y: startPosition.y + rowSpacing },
        data: {
          url: '',
          label: '风格参考图（可选）'
        }
      })
      
      // 正面全身提示词
      const frontPromptId = getNodeId()
      nodes.push({
        id: frontPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing, y: startPosition.y },
        data: {
          content: '根据角色描述，生成角色的正面全身照，人物居中，白色简洁背景，高清写实风格，电影级画质',
          label: '正面全身提示词'
        }
      })
      
      // 正面全身生成配置
      const frontConfigId = getNodeId()
      nodes.push({
        id: frontConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y },
        data: {
          label: '生成正面全身图',
          size: '1440x2560'
        }
      })
      
      // 正面全身图结果（作为后续生成的参考）
      const frontResultId = getNodeId()
      nodes.push({
        id: frontResultId,
        type: 'image',
        position: { x: startPosition.x + colSpacing * 3, y: startPosition.y },
        data: {
          url: '',
          label: '正面角色图（参考基准）'
        }
      })
      
      // ========== 第二阶段：基于正面图生成多角度 ==========
      // 侧面半身提示词
      const sidePromptId = getNodeId()
      nodes.push({
        id: sidePromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 3 + 100, y: startPosition.y + rowSpacing },
        data: {
          content: '参考提供的角色正面图，保持人物外貌、服装完全一致，生成角色的侧面半身照，45度角侧脸，展示五官轮廓，白色简洁背景，高清写实风格',
          label: '侧面半身提示词'
        }
      })
      
      // 表情特写提示词
      const closeupPromptId = getNodeId()
      nodes.push({
        id: closeupPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 3 + 100, y: startPosition.y + rowSpacing * 2 },
        data: {
          content: '参考提供的角色正面图，保持人物五官、发型完全一致，生成角色的面部特写，展示多种表情（微笑、严肃、惊讶、悲伤），四宫格布局，高清写实风格',
          label: '表情特写提示词'
        }
      })
      
      // 背面全身提示词
      const backPromptId = getNodeId()
      nodes.push({
        id: backPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 3 + 100, y: startPosition.y + rowSpacing * 3 },
        data: {
          content: '参考提供的角色正面图，保持人物发型、服装、身材完全一致，生成角色的背面全身照，展示背影，白色简洁背景，高清写实风格',
          label: '背面全身提示词'
        }
      })
      
      // 侧面生成配置
      const sideConfigId = getNodeId()
      nodes.push({
        id: sideConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 4 + 100, y: startPosition.y + rowSpacing },
        data: {
          label: '侧面半身图',
          size: '2048x2048'
        }
      })
      
      // 表情特写生成配置
      const closeupConfigId = getNodeId()
      nodes.push({
        id: closeupConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 4 + 100, y: startPosition.y + rowSpacing * 2 },
        data: {
          label: '表情特写图',
          size: '2048x2048'
        }
      })
      
      // 背面生成配置
      const backConfigId = getNodeId()
      nodes.push({
        id: backConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 4 + 100, y: startPosition.y + rowSpacing * 3 },
        data: {
          label: '背面全身图',
          size: '1440x2560'
        }
      })
      
      // ========== 连线：第一阶段 ==========
      // 角色描述 → 正面生成
      edges.push({
        id: `edge_${characterDescId}_${frontConfigId}`,
        source: characterDescId,
        target: frontConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 风格参考 → 正面生成
      edges.push({
        id: `edge_${styleRefId}_${frontConfigId}`,
        source: styleRefId,
        target: frontConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 正面提示词 → 正面生成
      edges.push({
        id: `edge_${frontPromptId}_${frontConfigId}`,
        source: frontPromptId,
        target: frontConfigId,
        type: 'promptOrder',
        data: { promptOrder: 2 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 正面生成 → 正面结果
      edges.push({
        id: `edge_${frontConfigId}_${frontResultId}`,
        source: frontConfigId,
        target: frontResultId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // ========== 连线：第二阶段（依赖正面图） ==========
      // 正面结果 → 侧面生成（作为参考图）
      edges.push({
        id: `edge_${frontResultId}_${sideConfigId}`,
        source: frontResultId,
        target: sideConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 正面结果 → 表情生成（作为参考图）
      edges.push({
        id: `edge_${frontResultId}_${closeupConfigId}`,
        source: frontResultId,
        target: closeupConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 正面结果 → 背面生成（作为参考图）
      edges.push({
        id: `edge_${frontResultId}_${backConfigId}`,
        source: frontResultId,
        target: backConfigId,
        type: 'imageOrder',
        data: { imageOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // 提示词 → 各生成节点
      edges.push({
        id: `edge_${sidePromptId}_${sideConfigId}`,
        source: sidePromptId,
        target: sideConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${closeupPromptId}_${closeupConfigId}`,
        source: closeupPromptId,
        target: closeupConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${backPromptId}_${backConfigId}`,
        source: backPromptId,
        target: backConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      return { nodes, edges }
    }
  },
  {
    id: 'drama-scene-background',
    name: '多时段场景背景',
    description: '先生成基础场景，再基于基础场景生成多时段变体，保持场景一致性',
    icon: 'ImageOutline',
    category: 'drama',
    cover: coverScene,
    createNodes: (startPosition) => {
      const colSpacing = 400
      const rowSpacing = 260
      
      const nodes = []
      const edges = []
      let nodeIdCounter = 0
      const getNodeId = () => `workflow_node_${Date.now()}_${nodeIdCounter++}`
      
      // ========== 第一阶段：生成基础场景 ==========
      // 场景描述
      const sceneDescId = getNodeId()
      nodes.push({
        id: sceneDescId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: {
          content: '场景名称：现代都市街道\n位置：繁华商业区主街道\n环境特征：高楼大厦林立，霓虹灯招牌，车水马龙\n氛围：都市繁华、现代感强\n特殊元素：咖啡店、书店、商场入口',
          label: '场景描述'
        }
      })
      
      // 基础场景提示词
      const basePromptId = getNodeId()
      nodes.push({
        id: basePromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing, y: startPosition.y },
        data: {
          content: '根据场景描述，生成白天正午时段的场景背景作为基准，阳光明媚，光线充足均匀，展示场景全貌和所有环境元素，纯背景无人物，电影级画质，宽屏构图',
          label: '基础场景提示词'
        }
      })
      
      // 基础场景生成配置
      const baseConfigId = getNodeId()
      nodes.push({
        id: baseConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y },
        data: {
          label: '生成基础场景',
          size: '2560x1440'
        }
      })
      
      // 基础场景结果（作为后续生成的参考）
      const baseResultId = getNodeId()
      nodes.push({
        id: baseResultId,
        type: 'image',
        position: { x: startPosition.x + colSpacing * 3, y: startPosition.y },
        data: {
          url: '',
          label: '基础场景图（参考基准）'
        }
      })
      
      // ========== 第二阶段：基于基础场景生成多时段变体 ==========
      // 傍晚场景提示词
      const eveningPromptId = getNodeId()
      nodes.push({
        id: eveningPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 3 + 100, y: startPosition.y + rowSpacing },
        data: {
          content: '参考提供的基础场景图，保持场景构图、建筑、环境元素完全一致，仅改变光照为傍晚时段：夕阳西下，天空呈橙红色渐变，光线柔和温暖，建筑投射长影',
          label: '傍晚场景提示词'
        }
      })
      
      // 夜晚场景提示词
      const nightPromptId = getNodeId()
      nodes.push({
        id: nightPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 3 + 100, y: startPosition.y + rowSpacing * 2 },
        data: {
          content: '参考提供的基础场景图，保持场景构图、建筑、环境元素完全一致，仅改变光照为夜晚时段：霓虹灯亮起，城市灯光璀璨，天空深蓝或黑色，窗户透出暖光',
          label: '夜晚场景提示词'
        }
      })
      
      // 雨天场景提示词
      const rainPromptId = getNodeId()
      nodes.push({
        id: rainPromptId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 3 + 100, y: startPosition.y + rowSpacing * 3 },
        data: {
          content: '参考提供的基础场景图，保持场景构图、建筑、环境元素完全一致，仅改变天气为雨天：细雨绵绵，地面湿润有倒影，天空阴沉灰暗，氛围忧郁',
          label: '雨天场景提示词'
        }
      })
      
      // 傍晚生成配置
      const eveningConfigId = getNodeId()
      nodes.push({
        id: eveningConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 4 + 100, y: startPosition.y + rowSpacing },
        data: {
          label: '傍晚场景',
          size: '2560x1440'
        }
      })
      
      // 夜晚生成配置
      const nightConfigId = getNodeId()
      nodes.push({
        id: nightConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 4 + 100, y: startPosition.y + rowSpacing * 2 },
        data: {
          label: '夜晚场景',
          size: '2560x1440'
        }
      })
      
      // 雨天生成配置
      const rainConfigId = getNodeId()
      nodes.push({
        id: rainConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 4 + 100, y: startPosition.y + rowSpacing * 3 },
        data: {
          label: '雨天场景',
          size: '2560x1440'
        }
      })
      
      // ========== 连线：第一阶段 ==========
      // 场景描述 → 基础场景生成
      edges.push({
        id: `edge_${sceneDescId}_${baseConfigId}`,
        source: sceneDescId,
        target: baseConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 基础提示词 → 基础场景生成
      edges.push({
        id: `edge_${basePromptId}_${baseConfigId}`,
        source: basePromptId,
        target: baseConfigId,
        type: 'promptOrder',
        data: { promptOrder: 2 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      // 基础场景生成 → 基础场景结果
      edges.push({
        id: `edge_${baseConfigId}_${baseResultId}`,
        source: baseConfigId,
        target: baseResultId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      // ========== 连线：第二阶段（依赖基础场景图） ==========
      // 基础场景结果 → 各时段生成（作为参考图）
      const variantConfigs = [eveningConfigId, nightConfigId, rainConfigId]
      variantConfigs.forEach(configId => {
        edges.push({
          id: `edge_${baseResultId}_${configId}`,
          source: baseResultId,
          target: configId,
          type: 'imageOrder',
          data: { imageOrder: 1 },
          sourceHandle: 'right',
          targetHandle: 'left'
        })
      })
      
      // 提示词 → 各生成节点
      edges.push({
        id: `edge_${eveningPromptId}_${eveningConfigId}`,
        source: eveningPromptId,
        target: eveningConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${nightPromptId}_${nightConfigId}`,
        source: nightPromptId,
        target: nightConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      edges.push({
        id: `edge_${rainPromptId}_${rainConfigId}`,
        source: rainPromptId,
        target: rainConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })
      
      return { nodes, edges }
    }
  },
  // {
  //   id: 'drama-storyboard-shot',
  //   name: '短剧分镜图',
  //   description: '根据角色、场景和剧情描述生成分镜画面',
  //   icon: 'FilmOutline',
  //   category: 'drama',
  //   cover: workflowCover1,
  //   createNodes: (startPosition) => {
  //     const colSpacing = 400
  //     const rowSpacing = 250
      
  //     const nodes = []
  //     const edges = []
  //     let nodeIdCounter = 0
  //     const getNodeId = () => `workflow_node_${Date.now()}_${nodeIdCounter++}`
      
  //     // ========== 输入节点 ==========
  //     // 角色参考图
  //     const characterRefId = getNodeId()
  //     nodes.push({
  //       id: characterRefId,
  //       type: 'image',
  //       position: { x: startPosition.x, y: startPosition.y },
  //       data: {
  //         url: '',
  //         label: '角色参考图'
  //       }
  //     })
      
  //     // 场景背景图
  //     const sceneRefId = getNodeId()
  //     nodes.push({
  //       id: sceneRefId,
  //       type: 'image',
  //       position: { x: startPosition.x, y: startPosition.y + rowSpacing },
  //       data: {
  //         url: '',
  //         label: '场景背景图'
  //       }
  //     })
      
  //     // 分镜描述
  //     const shotDescId = getNodeId()
  //     nodes.push({
  //       id: shotDescId,
  //       type: 'text',
  //       position: { x: startPosition.x, y: startPosition.y + rowSpacing * 2 },
  //       data: {
  //         content: '分镜编号：001\n景别：中景\n镜头角度：平视\n画面描述：女主角站在咖啡店门口，手持一杯咖啡，微微低头看着手机，若有所思\n人物动作：站立，单手持咖啡，另一手拿手机\n表情：略带忧郁，眉头微蹙\n光线：自然光，侧逆光',
  //         label: '分镜描述'
  //       }
  //     })
      
  //     // ========== 生成提示词 ==========
  //     const shotPromptId = getNodeId()
  //     nodes.push({
  //       id: shotPromptId,
  //       type: 'text',
  //       position: { x: startPosition.x + colSpacing, y: startPosition.y + rowSpacing },
  //       data: {
  //         content: '根据角色参考图、场景背景和分镜描述，生成电影级分镜画面，保持角色外貌一致，场景融合自然，光影效果符合描述，16:9宽屏比例，电影调色',
  //         label: '分镜生成提示词'
  //       }
  //     })
      
  //     // ========== 生成节点 ==========
  //     const shotConfigId = getNodeId()
  //     nodes.push({
  //       id: shotConfigId,
  //       type: 'imageConfig',
  //       position: { x: startPosition.x + colSpacing * 2, y: startPosition.y + rowSpacing },
  //       data: {
  //         label: '分镜画面',
  //         model: 'doubao-seedream-4-5-251128',
  //         size: '2560x1440'
  //       }
  //     })
      
  //     // ========== 连线 ==========
  //     edges.push({
  //       id: `edge_${characterRefId}_${shotConfigId}`,
  //       source: characterRefId,
  //       target: shotConfigId,
  //       sourceHandle: 'right',
  //       targetHandle: 'left'
  //     })
  //     edges.push({
  //       id: `edge_${sceneRefId}_${shotConfigId}`,
  //       source: sceneRefId,
  //       target: shotConfigId,
  //       sourceHandle: 'right',
  //       targetHandle: 'left'
  //     })
  //     edges.push({
  //       id: `edge_${shotDescId}_${shotConfigId}`,
  //       source: shotDescId,
  //       target: shotConfigId,
  //       type: 'promptOrder',
  //       data: { promptOrder: 1 },
  //       sourceHandle: 'right',
  //       targetHandle: 'left'
  //     })
  //     edges.push({
  //       id: `edge_${shotPromptId}_${shotConfigId}`,
  //       source: shotPromptId,
  //       target: shotConfigId,
  //       type: 'promptOrder',
  //       data: { promptOrder: 2 },
  //       sourceHandle: 'right',
  //       targetHandle: 'left'
  //     })
      
  //     return { nodes, edges }
  //   }
  // },
  {
    id: 'brand-visual-kit',
    name: '品牌视觉套装',
    description: '从品牌简报生成主视觉、社媒方图、发布横幅和应用商店封面',
    icon: 'ImageOutline',
    category: 'brand',
    cover: coverBrandKit,
    createNodes: createBrandVisualKit
  },
  {
    id: 'text-to-short-video',
    name: '文生短视频',
    description: '预置提示词、比例、时长和结果节点，适合直接生成短片',
    icon: 'VideocamOutline',
    category: 'video',
    cover: coverTextVideo,
    createNodes: createTextToVideoPreset({
      prompt: '生成一个 5 秒电影感短片：雨夜城市街角，一只发光的小狐狸穿过霓虹灯下的巷子，镜头缓慢推进，地面积水反射灯牌，氛围神秘、精致、无文字。',
      ratio: '16:9',
      dur: 5
    })
  },
  {
    id: 'image-to-video-motion',
    name: '首帧图生视频',
    description: '上传首帧图后生成运镜视频，适合产品、角色和海报动效',
    icon: 'VideocamOutline',
    category: 'video',
    cover: coverImageVideo,
    createNodes: createImageToVideoPreset({
      prompt: '保持首帧主体一致，镜头缓慢向前推进，增加轻微景深、光影流动和空气颗粒感，画面稳定、高级、电影感，不要改变主体结构。',
      ratio: '9:16',
      dur: 5
    })
  },
  {
    id: 'social-poster-variations',
    name: '社媒海报变体',
    description: '一键生成适合小红书、朋友圈和宣传页的竖版海报',
    icon: 'ImageOutline',
    category: 'brand',
    cover: coverSocialPoster,
    createNodes: createTextToImagePreset({
      promptLabel: '海报提示词',
      configLabel: '竖版海报',
      resultLabel: '海报结果',
      size: '1440x2560',
      prompt: '生成一张高级社媒竖版海报：深青黑渐变背景，中心有简洁的Y形发光符号，周围是AI画布节点、图片缩略图、视频播放符号，构图简洁、留白充足、适合软件产品宣传，无文字。'
    })
  },
  // ========== 儿童绘本工作流 ==========
  {
    id: 'picture-book-generator',
    name: '儿童绘本生成',
    description: '角色生成 → 剧情文字 → 绘本插画，支持角色一致性',
    icon: 'BookOutline',
    category: 'creative',
    cover: coverPictureBook,
    createNodes: (startPosition) => {
      const colSpacing = 420
      const rowSpacing = 280
      const pageRowSpacing = 240

      const nodes = []
      const edges = []
      let nodeIdCounter = 0
      const getNodeId = () => `workflow_node_${Date.now()}_${nodeIdCounter++}`

      // ========== 第一阶段：故事输入 ==========
      const storyInputId = getNodeId()
      nodes.push({
        id: storyInputId,
        type: 'text',
        position: { x: startPosition.x, y: startPosition.y },
        data: {
          content: `【绘本名称】小兔子的冒险之旅

【故事主题】勇气与友谊

【主要角色】
1. 小白兔米米 - 主角，白色毛发，粉红色耳朵内侧，穿蓝色背带裤，性格勇敢好奇
2. 小狐狸橙橙 - 伙伴，橙色毛发，白色尾巴尖，戴绿色围巾，聪明机智

【故事梗概】
小白兔米米住在森林边的小木屋里，有一天她发现了一张神秘的藏宝图。在好朋友小狐狸橙橙的陪伴下，她们踏上了寻宝之旅。途中遇到各种挑战，最后发现真正的宝藏是友谊和勇气。

【画风要求】
温馨治愈的水彩绘本风格，色彩明亮柔和，适合3-6岁儿童阅读`,
          label: '故事大纲'
        }
      })

      // ========== 第二阶段：LLM 角色设计 ==========
      const characterLLMId = getNodeId()
      nodes.push({
        id: characterLLMId,
        type: 'llmConfig',
        position: { x: startPosition.x + colSpacing, y: startPosition.y - rowSpacing },
        data: {
          label: '角色设计生成',
          systemPrompt: `你是专业的绘本角色设计师。根据故事大纲提取所有角色，为每个角色生成适合图像生成的详细提示词。

输出格式（用换行分隔每个角色）：
[角色名]
[角色图像生成提示词]
---

输出要求：
1. 识别故事中的所有角色（主角、配角等）
2. 提示词包含：外貌特征、服装、表情、姿态、场景
3. 使用绘本水彩风格描述
4. 末尾加上"白色简洁背景，儿童绘本水彩风格，温馨治愈，色彩明亮柔和"
5. 直接输出，不要编号、标题或其他格式标记`,
          outputFormat: 'text'
        }
      })

      // 故事大纲 → 角色设计LLM
      edges.push({
        id: `edge_${storyInputId}_${characterLLMId}`,
        source: storyInputId,
        target: characterLLMId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })

      // 角色参考图配置
      const characterConfigId = getNodeId()
      nodes.push({
        id: characterConfigId,
        type: 'imageConfig',
        position: { x: startPosition.x + colSpacing * 2, y: startPosition.y - rowSpacing },
        data: {
          label: '角色参考图',
          size: '2048x2048'
        }
      })

      // LLM → 角色图配置
      edges.push({
        id: `edge_${characterLLMId}_${characterConfigId}`,
        source: characterLLMId,
        target: characterConfigId,
        type: 'promptOrder',
        data: { promptOrder: 1 },
        sourceHandle: 'right',
        targetHandle: 'left'
      })

      // 角色参考图结果
      const characterImageId = getNodeId()
      nodes.push({
        id: characterImageId,
        type: 'image',
        position: { x: startPosition.x + colSpacing * 3, y: startPosition.y - rowSpacing },
        data: {
          url: '',
          label: '角色参考图结果'
        }
      })

      // 角色配置 → 角色图结果
      edges.push({
        id: `edge_${characterConfigId}_${characterImageId}`,
        source: characterConfigId,
        target: characterImageId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })

      // ========== 第三阶段：LLM 剧情拆分 ==========
      const storyLLMId = getNodeId()
      nodes.push({
        id: storyLLMId,
        type: 'llmConfig',
        position: { x: startPosition.x + colSpacing, y: startPosition.y + rowSpacing * 0.5 },
        data: {
          label: '剧情拆分',
          systemPrompt: `你是专业的绘本编剧。将故事拆分成绘本页面内容。

输出格式（严格按此格式，换行分割每页）：
第1页：[故事配文] | [插画描述提示词]
第2页：[故事配文] | [插画描述提示词]
...

要求：
1. 根据故事复杂度拆分为4-8页
2. 故事配文简洁温馨，适合3-6岁儿童（每页不超过30字）
3. 插画描述要详细，包含角色外貌特征、动作、场景、色调
4. 每页插画描述末尾加上画风说明以保持一致
5. 故事节奏：开场→发展→高潮→温馨结局`,
          model: 'gpt-4o',
          outputFormat: 'text'
        }
      })

      // 故事大纲 → 剧情拆分LLM
      edges.push({
        id: `edge_${storyInputId}_${storyLLMId}`,
        source: storyInputId,
        target: storyLLMId,
        sourceHandle: 'right',
        targetHandle: 'left'
      })

      // ========== 第四阶段：绘本页面（由 LLM 拆分动态生成） ==========
      // 操作提示节点
      const hintId = getNodeId()
      nodes.push({
        id: hintId,
        type: 'text',
        position: { x: startPosition.x + colSpacing * 2.5, y: startPosition.y + rowSpacing * 0.5 },
        data: {
          content: `操作步骤：
1. 先点击「角色设计生成」的【执行生成】，等待生成所有角色参考图
2. 再点击「剧情拆分」的【执行生成】，等待 LLM 输出剧本
3. 在剧情拆分节点中点击【拆分为绘本页】按钮
4. 系统将自动创建每页的故事文字、插画描述和图片生成节点
5. 每页图片会自动关联角色参考图，保持角色一致性
6. 点击各页的【立即生成】按钮生成绘本插画`,
          label: '📖 操作指南'
        }
      })

      return { nodes, edges }
    }
  }
]



const createBriefToImageSetPreset = ({
  briefLabel = '创作简报',
  brief,
  outputs = [],
  rowSpacing = 260,
  size = '1440x2560'
}) => (startPosition) => {
  const getNodeId = createIdFactory()
  const nodes = []
  const edges = []
  const briefId = getNodeId()

  nodes.push({
    id: briefId,
    type: 'text',
    position: { x: startPosition.x, y: startPosition.y + Math.max(0, outputs.length - 1) * rowSpacing * 0.35 },
    data: { label: briefLabel, content: brief }
  })

  outputs.forEach((output, index) => {
    const promptId = getNodeId()
    const configId = getNodeId()
    const imageId = getNodeId()
    const y = startPosition.y + index * rowSpacing

    nodes.push({
      id: promptId,
      type: 'text',
      position: { x: startPosition.x + 420, y },
      data: { label: output.promptLabel || output.label || ('提示词 ' + (index + 1)), content: output.prompt }
    })

    nodes.push({
      id: configId,
      type: 'imageConfig',
      position: { x: startPosition.x + 840, y },
      data: { label: output.configLabel || output.label || ('生成图 ' + (index + 1)), size: output.size || size }
    })

    nodes.push({
      id: imageId,
      type: 'image',
      position: { x: startPosition.x + 1220, y },
      data: { label: output.resultLabel || ((output.label || '结果') + ' · 输出'), url: '' }
    })

    edges.push(connect(briefId, configId, { type: 'promptOrder', data: { promptOrder: 1 } }))
    edges.push(connect(promptId, configId, { type: 'promptOrder', data: { promptOrder: 2 } }))
    edges.push(connect(configId, imageId))
  })

  return { nodes, edges }
}

const createImageToVideoCampaignPreset = ({
  brief,
  imagePrompt,
  videoPrompt,
  imageSize = '1440x2560',
  ratio = '9:16',
  dur = 5
}) => (startPosition) => {
  const getNodeId = createIdFactory()
  const briefId = getNodeId()
  const imagePromptId = getNodeId()
  const imageConfigId = getNodeId()
  const imageResultId = getNodeId()
  const videoPromptId = getNodeId()
  const videoConfigId = getNodeId()
  const videoResultId = getNodeId()

  const nodes = [
    { id: briefId, type: 'text', position: { x: startPosition.x, y: startPosition.y + 140 }, data: { label: '项目简报', content: brief } },
    { id: imagePromptId, type: 'text', position: { x: startPosition.x + 420, y: startPosition.y }, data: { label: '首帧 / 主视觉提示词', content: imagePrompt } },
    { id: imageConfigId, type: 'imageConfig', position: { x: startPosition.x + 840, y: startPosition.y }, data: { label: '生成首帧主视觉', size: imageSize } },
    { id: imageResultId, type: 'image', position: { x: startPosition.x + 1220, y: startPosition.y }, data: { label: '首帧 / 主视觉结果', url: '' } },
    { id: videoPromptId, type: 'text', position: { x: startPosition.x + 420, y: startPosition.y + 300 }, data: { label: '视频运镜提示词', content: videoPrompt } },
    { id: videoConfigId, type: 'videoConfig', position: { x: startPosition.x + 840, y: startPosition.y + 300 }, data: { label: '图生视频配置', ratio, dur } },
    { id: videoResultId, type: 'video', position: { x: startPosition.x + 1220, y: startPosition.y + 300 }, data: { label: '视频结果', url: '' } }
  ]

  const edges = [
    connect(briefId, imageConfigId, { type: 'promptOrder', data: { promptOrder: 1 } }),
    connect(imagePromptId, imageConfigId, { type: 'promptOrder', data: { promptOrder: 2 } }),
    connect(imageConfigId, imageResultId),
    connect(imageResultId, videoConfigId, { type: 'imageRole', data: { imageRole: 'first_frame_image' } }),
    connect(videoPromptId, videoConfigId, { type: 'promptOrder', data: { promptOrder: 1 } }),
    connect(videoConfigId, videoResultId)
  ]

  return { nodes, edges }
}

WORKFLOW_TEMPLATES.push(
  {
    id: 'ai-video-app-ui',
    name: 'AI 视频 App 首页',
    description: '一键生成深色 iOS AI 视频工具首页，适合产品原型、落地页和 App Store 展示',
    icon: 'ImageOutline',
    category: 'ui',
    cover: coverAiVideoAppUi,
    createNodes: createTextToImagePreset({
      promptLabel: 'UI 需求',
      configLabel: 'App 首页图',
      resultLabel: 'UI 结果',
      size: '1440x2560',
      prompt: '设计一个专业的 iOS AI Video Generator App 首页，深色主题，真实产品截图感。顶部包含应用名、Pro 标识和用户头像；Hero 卡片展示宇航员穿过发光传送门，按钮文案为 Create Video；中部有 Text to Video、Image to Video、Script to Video、Templates 四个功能入口；下方是 Recent Creations 列表和底部导航。整体像可上线的移动端产品，不要水印。'
    })
  },
  {
    id: 'camera-exploded-infographic',
    name: '产品爆炸拆解图',
    description: '把相机、耳机、鞋、机械键盘等产品拆成零件层级和参数说明',
    icon: 'ImageOutline',
    category: 'ecommerce',
    cover: coverCameraExplodedView,
    createNodes: createTextToImagePreset({
      promptLabel: '产品拆解提示词',
      configLabel: '拆解信息图',
      resultLabel: '拆解图结果',
      size: '1440x2560',
      prompt: '生成一张高端工业设计爆炸视图信息图，主题为一台专业微单相机。机身、镜头、传感器、电池、按键、螺丝、接口和内部模块沿中心轴悬浮拆解排列，每个零件带编号和短标签，背景干净，细线标注，金属、玻璃、橡胶材质清晰，像真实产品发布会技术海报。'
    })
  },
  {
    id: 'city-travel-guide-card',
    name: '城市旅行攻略图',
    description: '生成可收藏的城市路线、预算、美食、拍照点和注意事项信息图',
    icon: 'ImageOutline',
    category: 'creative',
    cover: coverCityTravelGuide,
    createNodes: createTextToImagePreset({
      promptLabel: '旅行攻略提示词',
      configLabel: '攻略信息图',
      resultLabel: '攻略图结果',
      size: '1440x2560',
      prompt: '制作一张“成都三日旅行攻略”竖版信息图，包含手绘地图路线、Day 1/Day 2/Day 3 行程、美食推荐、交通方式、预算、拍照点和注意事项。中文标题清晰，图标精致，排版像高质量旅行杂志页面，信息丰富但不拥挤，适合收藏分享。'
    })
  },
  {
    id: 'fashion-campaign-grid',
    name: '六宫格时尚大片',
    description: '为服装、饰品、香水等品牌生成一组统一风格的广告镜头',
    icon: 'GridOutline',
    category: 'brand',
    cover: coverFashionCampaign,
    createNodes: createTextToImagePreset({
      promptLabel: 'Campaign 提示词',
      configLabel: '六宫格广告图',
      resultLabel: '广告图结果',
      size: '2048x2048',
      prompt: '生成一套 6 宫格时尚品牌广告大片，同一位模特穿黑色皮夹克、长裙和高筒靴，在城市街头完成六个不同镜头：全身行走、半身回望、鞋靴特写、皮革材质特写、街角环境、强情绪近景。统一阴天自然光、电影街拍质感、杂志 campaign 版式。'
    })
  },
  {
    id: 'live-commerce-screenshot',
    name: '直播带货界面',
    description: '生成真实手机直播间截图，适合电商、社媒、短视频案例演示',
    icon: 'ImageOutline',
    category: 'ecommerce',
    cover: coverLiveCommerce,
    createNodes: createTextToImagePreset({
      promptLabel: '直播界面提示词',
      configLabel: '直播截图',
      resultLabel: '直播图结果',
      size: '1440x2560',
      prompt: '生成真实手机竖屏直播带货截图，主播正在展示一款透明蓝牙耳机，画面包含商品卡片、限时优惠券、弹幕评论、点赞动画、成交提示、购买按钮和右侧互动栏。中文 UI 清晰，平台感真实，灯光明亮，有电商转化氛围但不要出现真实品牌商标。'
    })
  },
  {
    id: 'historical-panorama-long-scroll',
    name: '古城灯会长卷',
    description: '生成超宽横向国风全景图，可用于海报背景、视频首帧和文化项目',
    icon: 'ImageOutline',
    category: 'creative',
    cover: coverLanternPanorama,
    createNodes: createTextToImagePreset({
      promptLabel: '长卷提示词',
      configLabel: '横向长卷',
      resultLabel: '长卷结果',
      size: '2560x1440',
      prompt: '横向超宽古代城市元宵灯会长卷，河道穿城而过，宫殿、桥梁、楼阁、船只和密集人群铺满画面，天空漂浮大量孔明灯，暖金夜景，历史画卷质感，细节极丰富但层级清晰，适合作为视频首帧或文化海报背景。'
    })
  }
)



WORKFLOW_TEMPLATES.push(
  {
    id: 'evolink-ad-banner-grid',
    name: '四宫格广告 Banner',
    description: '简单：把一个产品拆成旅行/美妆/美食/教育式广告四宫格，适合快速测风格',
    icon: 'GridOutline',
    category: 'brand',
    cover: coverLiveCommerce,
    createNodes: createTextToImagePreset({
      promptLabel: '广告 Banner 提示词',
      configLabel: '四宫格广告图',
      resultLabel: '广告图结果',
      size: '2048x2048',
      prompt: '生成 2x2 数字广告 Banner 网格，四个象限分别展示同一品牌的不同营销卖点：主视觉、产品特写、优惠信息、用户场景。每个象限有清晰标题、价格/权益标签、图标和行动按钮；整体统一品牌色，中文排版清楚，商业广告质感，无水印。'
    })
  },
  {
    id: 'evolink-portrait-lighting-pack',
    name: '人像光影实验',
    description: '简单：一条提示词生成电影人像，可替换人物、服装、地点和灯光',
    icon: 'PersonOutline',
    category: 'creative',
    cover: coverSocialPoster,
    createNodes: createTextToImagePreset({
      promptLabel: '人像提示词',
      configLabel: '电影人像图',
      resultLabel: '人像结果',
      size: '1440x2560',
      prompt: '电影级街头人像摄影：原创人物站在夜晚便利店门口，冷白荧光灯与粉蓝霓虹混合照明，玻璃反射、真实皮肤纹理、轻微胶片颗粒、35mm 镜头、浅景深、杂志编辑大片感。无水印，无乱码文字。'
    })
  },
  {
    id: 'evolink-poster-typography-pack',
    name: '海报字体版式包',
    description: '简单：生成带主标题、信息层级和视觉主体的竖版海报',
    icon: 'ImageOutline',
    category: 'creative',
    cover: coverLanternPanorama,
    createNodes: createTextToImagePreset({
      promptLabel: '海报提示词',
      configLabel: '竖版海报',
      resultLabel: '海报结果',
      size: '1440x2560',
      prompt: '生成一张高完成度竖版主题海报，主题为“未来城市文化节”。画面包含强主视觉、中文大标题区、日期地点、嘉宾/活动模块、票务按钮样式、底部赞助信息。风格为电影概念艺术 + 瑞士平面设计排版，层级清楚，文字区域留白明确。'
    })
  },
  {
    id: 'evolink-ui-social-mockup',
    name: 'App + 社媒 Mockup',
    description: '简单：生成移动端 App 首页或社交媒体截图，适合产品展示',
    icon: 'ImageOutline',
    category: 'ui',
    cover: coverAiVideoAppUi,
    createNodes: createTextToImagePreset({
      promptLabel: 'UI Mockup 提示词',
      configLabel: 'UI 截图',
      resultLabel: 'UI 结果',
      size: '1440x2560',
      prompt: '设计一张真实可上线的 iOS App 首页截图，主题为 AI 创意工作台。包含顶部欢迎语、Hero 功能卡、文本生图/图生视频/工作流模板入口、最近项目列表、底部导航和 Pro 标识。深色玻璃拟态界面，中文 UI 清晰，产品截图质感。'
    })
  },
  {
    id: 'evolink-before-after-remix',
    name: '前后对比重绘',
    description: '简单：把参考图改造成高级商业稿，并输出 before/after 对比版式',
    icon: 'GridOutline',
    category: 'creative',
    cover: coverCameraExplodedView,
    createNodes: createTextToImagePreset({
      promptLabel: '对比重绘提示词',
      configLabel: '对比图',
      resultLabel: '对比结果',
      size: '2048x2048',
      prompt: '根据参考图生成 before/after 对比海报：左侧保留原始构图的朴素版本，右侧升级为高级商业摄影版本。中间用细线分割，底部加简洁说明标签，突出光影、材质、构图、色彩和排版升级。不要真实品牌商标。'
    })
  },
  {
    id: 'evolink-product-launch-kit',
    name: '产品发布全套物料',
    description: '复杂：从产品简报生成主视觉、白底图、详情页、社媒图和发布会横幅',
    icon: 'ShoppingOutline',
    category: 'ecommerce',
    cover: coverEcommerce,
    createNodes: createBriefToImageSetPreset({
      brief: '产品：一款透明无线降噪耳机\n品牌关键词：轻盈、未来感、清澈声音、年轻专业\n品牌色：冰蓝、银白、深空灰\n目标：生成一套电商和发布会都能使用的视觉物料。',
      outputs: [
        { label: '主视觉 Hero', size: '1440x2560', prompt: '透明无线降噪耳机悬浮在冰蓝光场中，玻璃、金属、微型声波粒子，中央构图，标题区留白，高级科技发布海报质感。' },
        { label: '白底电商主图', size: '2048x2048', prompt: '白底电商主图，耳机与充电盒 45 度摆放，阴影柔和，材质真实，周围用小图标标注降噪、续航、低延迟、高清通话，中文标签清晰。' },
        { label: '详情页长图', size: '1440x2560', prompt: '电商详情页长图，分屏展示卖点：主动降噪、空间音频、透明机身、佩戴舒适、续航参数，包含产品微距和生活方式场景，排版清爽。' },
        { label: '社媒方图', size: '1024x1024', prompt: '社交媒体方形海报，耳机漂浮在渐变冰蓝背景，主标题“清澈入耳”，短卖点三条，年轻科技品牌视觉。' },
        { label: '发布会横幅', size: '1920x1080', prompt: '产品发布会 16:9 横幅，深空背景、巨大发光耳机轮廓、演示舞台光束、标题区留白，适合作为官网首屏。' }
      ]
    })
  },
  {
    id: 'evolink-character-ip-kit',
    name: '角色 IP 商业套装',
    description: '复杂：角色设定、表情、周边、社媒头像和品牌板一次铺开',
    icon: 'PersonOutline',
    category: 'brand',
    cover: coverCharacter,
    createNodes: createBriefToImageSetPreset({
      brief: '原创角色：云朵邮差小狐狸\n关键词：温柔、治愈、轻幻想、浅蓝白、手账感\n目标：发展成可用于表情包、头像、周边和品牌合作的 IP 视觉套装。',
      outputs: [
        { label: '角色设定表', size: '2048x2048', prompt: '生成原创角色设定表：正面、侧面、背面、三种表情、服装道具拆解、色板和简短世界观说明，治愈系手绘风。' },
        { label: '表情包九宫格', size: '2048x2048', prompt: '同一角色九宫格表情包，开心、疑惑、努力、困倦、惊喜、委屈、加油、收到、晚安；动作夸张但可爱，背景透明感。' },
        { label: '周边品牌板', size: '2048x2048', prompt: '角色 IP 周边品牌板，展示贴纸、徽章、帆布袋、钥匙扣、包装盒、明信片，统一浅蓝白品牌系统，像商业提案页。' },
        { label: '社媒头像', size: '1024x1024', prompt: '角色头像特写，圆形头像构图，柔和光线，浅蓝云朵背景，清晰可识别，适合社交媒体。' },
        { label: '故事海报', size: '1440x2560', prompt: '角色故事竖版海报，云朵邮局、漂浮信件、夕阳天空和小狐狸主角，标题区留白，温柔绘本电影感。' }
      ]
    })
  },
  {
    id: 'evolink-commerce-tvc-storyboard-video',
    name: '电商 TVC 首帧到视频',
    description: '复杂：先生成商品 9 宫格分镜/首帧，再接图生视频运镜',
    icon: 'VideocamOutline',
    category: 'video',
    cover: coverFashionCampaign,
    createNodes: createImageToVideoCampaignPreset({
      brief: '商品：手工青花瓷香薰\n目标：做 15 秒竖屏电商广告，先生成专业分镜板，再用首帧转视频。',
      imagePrompt: '把手工青花瓷香薰生成 9 宫格 TVC 分镜板，包含环境建立、产品英雄镜头、纹样微距、点燃香薰、烟雾升起、居家使用、包装展示、夜晚氛围、品牌收尾。每格有中文镜头标题和时间码，高级商业摄影。',
      videoPrompt: '镜头从产品微距缓慢后拉，香薰烟雾自然上升，青花瓷纹样在暖光中闪烁，桌面环境柔和，最后定格到品牌主视觉。运动平稳、真实、5 秒竖屏广告质感。',
      ratio: '9:16',
      dur: 5
    })
  },
  {
    id: 'evolink-cinematic-trailer-first-frame',
    name: '电影预告首帧链路',
    description: '复杂：先做电影首帧，再转成 5 秒预告片镜头',
    icon: 'VideocamOutline',
    category: 'video',
    cover: coverScene,
    createNodes: createImageToVideoCampaignPreset({
      brief: '短片主题：雨夜未来城的信使\n目标：生成电影级首帧并延展成 5 秒镜头，可作为短片开场。',
      imagePrompt: '电影级首帧：雨夜未来城市，年轻信使站在高架桥边，远处霓虹塔楼、无人机灯光、湿润路面反射，红蓝对比光，强叙事留白，宽银幕构图。',
      videoPrompt: '镜头缓慢向前推进，雨滴划过镜头，远处霓虹闪烁，无人机穿过画面，人物披风轻动但主体结构保持一致，电影预告片开场氛围。',
      imageSize: '1920x1080',
      ratio: '16:9',
      dur: 5
    })
  },
  {
    id: 'evolink-worldbuilding-map-pack',
    name: '世界观地图资产包',
    description: '复杂：地图、城市、阵营、道具和宣传海报一起生成',
    icon: 'BookOutline',
    category: 'creative',
    cover: coverLanternPanorama,
    createNodes: createBriefToImageSetPreset({
      brief: '世界观：漂浮岛群与风帆列车\n关键词：奇幻、蒸汽机械、手绘地图、冒险、温暖金色\n目标：为游戏/小说项目生成可继续扩展的视觉资产。',
      outputs: [
        { label: '世界地图', size: '2048x2048', prompt: '手绘奇幻世界地图，漂浮岛群、风帆列车航线、港口城市、瀑布云海、地名标签和路线标记，羊皮纸质感。' },
        { label: '主城概念图', size: '1920x1080', prompt: '漂浮岛主城概念艺术，层叠屋顶、空中码头、风帆列车进站、云海金光，宽幅场景图。' },
        { label: '阵营信息图', size: '1440x2560', prompt: '三大阵营信息图，徽章、代表角色、领地、信念、颜色系统和短说明，游戏设定集排版。' },
        { label: '道具设定', size: '2048x2048', prompt: '冒险道具设定板，风向罗盘、机械钥匙、云晶能源瓶、列车票据，材质拆解和编号标注。' },
        { label: '宣传海报', size: '1440x2560', prompt: '冒险主题竖版宣传海报，主角站在风帆列车前，天空岛与云海背景，标题区留白，温暖史诗感。' }
      ]
    })
  },
  {
    id: 'evolink-social-content-calendar',
    name: '社媒内容日历套装',
    description: '复杂：为品牌一次生成 6 个平台内容方向和配图结构',
    icon: 'ChatbubbleOutline',
    category: 'brand',
    cover: coverBrandKit,
    createNodes: createBriefToImageSetPreset({
      brief: '品牌：新中式茶饮「山月青」\n目标：生成一周社媒内容视觉，兼顾小红书、抖音封面、公众号头图和电商活动。',
      outputs: [
        { label: '品牌故事', size: '1440x2560', prompt: '小红书品牌故事图，山间茶园、手写标题、茶饮杯、创始人短句，温润新中式排版。' },
        { label: '新品上市', size: '1440x2560', prompt: '新品上市竖版海报，青梅冷萃茶，冰块、青梅、茶叶和水珠，标题“初夏一口山月青”，商业摄影。' },
        { label: '制作过程', size: '2048x2048', prompt: '四宫格制作过程图，采茶、冷萃、调饮、封杯，每格有简短中文说明和统一品牌色。' },
        { label: '门店打卡', size: '1440x2560', prompt: '门店打卡海报，新中式空间、竹影、年轻人拿茶拍照，适合朋友圈和小红书。' },
        { label: '抖音封面', size: '1440x2560', prompt: '抖音短视频封面，大字标题“这杯青梅茶太会了”，强对比、产品特写、人物反应，留出标题区。' },
        { label: '电商活动', size: '1440x2560', prompt: '电商促销活动图，组合套餐、优惠券、限时文案、商品卡片和购买按钮，中文 UI 清晰，真实平台感。' }
      ]
    })
  }
)

WORKFLOW_TEMPLATES.push(
  {
    id: 'cloud-txt2img-pro',
    name: '云端专业文生图',
    description: '使用云端模型的高级参数（Steps、CFG、Sampler）生成高质量图片',
    icon: 'ImageOutline',
    category: 'cloud',
    cover: coverSocialPoster,
    createNodes: createCloudWorkflowPreset({
      promptLabel: '专业提示词',
      configLabel: '云端专业文生图',
      resultLabel: '生成结果',
      size: '1440x2560',
      prompt: '高质量视觉作品，精细画面，专业摄影质感，电影级光影',
      steps: 30,
      cfg: 7,
      sampler: 'euler_a',
      scheduler: 'karras',
      denoise: 1.0
    })
  },
  {
    id: 'cloud-img2img-pro',
    name: '云端专业图生图',
    description: '上传参考图后用专业参数重绘，保持构图同时提升质量',
    icon: 'ImageOutline',
    category: 'cloud',
    cover: coverCameraExplodedView,
    createNodes: (startPosition) => {
      const getNodeId = createIdFactory()
      const imageId = getNodeId()
      const textId = getNodeId()
      const configId = getNodeId()
      const resultId = getNodeId()

      return {
        nodes: [
          { id: imageId, type: 'image', position: { x: startPosition.x, y: startPosition.y }, data: { url: '', label: '参考图' } },
          { id: textId, type: 'text', position: { x: startPosition.x, y: startPosition.y + 200 }, data: { content: '保持参考图构图，提升画质和细节，增强光影效果', label: '重绘提示词' } },
          { id: configId, type: 'cloudImageWorkflow', position: { x: startPosition.x + 420, y: startPosition.y + 80 }, data: { label: '云端图生图', size: '1440x2560', steps: 25, cfg: 7, sampler: 'dpmpp_2m', scheduler: 'karras', denoise: 0.6 } },
          { id: resultId, type: 'image', position: { x: startPosition.x + 820, y: startPosition.y + 80 }, data: { url: '', label: '重绘结果' } }
        ],
        edges: [
          connect(imageId, configId, { type: 'imageOrder', data: { imageOrder: 1 } }),
          connect(textId, configId, { type: 'promptOrder', data: { promptOrder: 1 } }),
          connect(configId, resultId)
        ]
      }
    }
  },
  {
    id: 'cloud-hd-upscale',
    name: '云端高清放大',
    description: '低分辨率图片通过高 Denoise 重绘提升到高清',
    icon: 'ImageOutline',
    category: 'cloud',
    cover: coverFashionCampaign,
    createNodes: (startPosition) => {
      const getNodeId = createIdFactory()
      const imageId = getNodeId()
      const configId = getNodeId()
      const resultId = getNodeId()

      return {
        nodes: [
          { id: imageId, type: 'image', position: { x: startPosition.x, y: startPosition.y }, data: { url: '', label: '原图' } },
          { id: configId, type: 'cloudImageWorkflow', position: { x: startPosition.x + 420, y: startPosition.y }, data: { label: '高清放大', size: '2048x2048', steps: 35, cfg: 8, sampler: 'dpmpp_sde', scheduler: 'karras', denoise: 0.45, prompt: '超高清，精细纹理，无损放大，保持原始构图和色彩' } },
          { id: resultId, type: 'image', position: { x: startPosition.x + 820, y: startPosition.y }, data: { url: '', label: '高清结果' } }
        ],
        edges: [
          connect(imageId, configId, { type: 'imageOrder', data: { imageOrder: 1 } }),
          connect(configId, resultId)
        ]
      }
    }
  },
  {
    id: 'cloud-portrait-pro',
    name: '人像精修 Pro',
    description: '高 Steps + DPM++ SDE 生成电影级人像，支持参考图风格迁移',
    icon: 'PersonOutline',
    category: 'cloud',
    cover: coverCharacter,
    createNodes: createCloudWorkflowPreset({
      promptLabel: '人像提示词',
      configLabel: '人像精修 Pro',
      resultLabel: '人像结果',
      size: '1440x2560',
      prompt: '电影级人像摄影，自然光线，浅景深，皮肤纹理真实，杂志编辑大片质感，面部细节清晰，无水印',
      steps: 40,
      cfg: 8,
      sampler: 'dpmpp_sde',
      scheduler: 'karras',
      denoise: 1.0
    })
  }
)

/**
 * Get workflow template by ID | 根据ID获取工作流模板
 */
export const getWorkflowById = (id) => {
  return WORKFLOW_TEMPLATES.find(w => w.id === id)
}

/**
 * Get workflows by category | 根据分类获取工作流
 */
export const getWorkflowsByCategory = (category) => {
  return WORKFLOW_TEMPLATES.filter(w => w.category === category)
}

export default WORKFLOW_TEMPLATES

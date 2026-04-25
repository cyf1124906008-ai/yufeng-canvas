import characterSheetImage from '../assets/inspiration-cases/character-sheet.jpg'
import chengduFoodMapImage from '../assets/inspiration-cases/chengdu-food-map.jpg'
import futureCityPosterImage from '../assets/inspiration-cases/future-city-poster.jpg'
import greenTeaProductImage from '../assets/inspiration-cases/green-tea-product.jpg'
import lanternFestivalImage from '../assets/inspiration-cases/lantern-festival.jpg'
import naturalHistoryFoodImage from '../assets/inspiration-cases/natural-history-food.jpg'
import profileInfographicImage from '../assets/inspiration-cases/profile-infographic.jpg'
import racingSpecPosterImage from '../assets/inspiration-cases/racing-spec-poster.jpg'
import ramenWatercolorImage from '../assets/inspiration-cases/ramen-watercolor.jpg'
import watercolorPictureBookImage from '../assets/inspiration-cases/watercolor-picture-book.jpg'
import neonStorePortraitImage from '../assets/inspiration-cases/neon-store-portrait.jpg'
import amalfiTravelPosterImage from '../assets/inspiration-cases/amalfi-travel-poster.jpg'
import fashionCampaignGridImage from '../assets/inspiration-cases/fashion-campaign-grid.jpg'
import cameraExplodedViewImage from '../assets/inspiration-cases/camera-exploded-view.jpg'
import streetFashionEditorialImage from '../assets/inspiration-cases/street-fashion-editorial.jpg'
import aiVideoAppUiImage from '../assets/inspiration-cases/ai-video-app-ui.jpg'
import glassyUiSystemImage from '../assets/inspiration-cases/glassy-ui-system.jpg'
import cityTravelGuideImage from '../assets/inspiration-cases/city-travel-guide.jpg'
import personaCharacterCardImage from '../assets/inspiration-cases/persona-character-card.jpg'
import goldSaintsCardGridImage from '../assets/inspiration-cases/gold-saints-card-grid.jpg'
import lanternPanoramaLongScrollImage from '../assets/inspiration-cases/lantern-panorama-long-scroll.jpg'
import douyinLiveCommerceImage from '../assets/inspiration-cases/douyin-live-commerce.jpg'

export const PROMPT_LIBRARY_SOURCE = {
  name: 'GPT Image 2 community prompt collections',
  license: 'Apache-2.0 / MIT / CC BY 4.0 attribution notes',
  url: 'https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts',
  sources: [
    'https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts',
    'https://github.com/Anil-matcha/Awesome-GPT-Image-2-API-Prompts'
  ]
}

// Inspired by EvoLinkAI/awesome-gpt-image-2-prompts (Apache-2.0).
// Prompts are adapted into reusable YUFENG Canvas workflow templates.
export const CANVAS_PROMPT_SUGGESTIONS = [
  '生成一张科普百科竖版信息图：主视觉、局部放大、圆角模块、评分卡、Top 5 清单，像可收藏的图鉴',
  '做一张赛车规格海报：运动中的主车、三视图线稿、性能参数表、材质细节、深色赛道背景',
  '儿童绘本水彩场景：两个孩子在柔和日光里对话，纸张纹理、留白、淡彩、安静温柔的情绪',
  '根据参考图生成角色设定表：正面、侧面、背面、表情差分、服装拆解、色板和世界观说明',
  '生成一套电商产品图：主图、场景图、材质特写、卖点模块、白底图，整体风格统一',
  '做一张城市三日旅行攻略信息图：地图、路线、餐饮、预算、注意事项，清爽杂志排版',
  '生成一张复古报纸头版：大标题、黑白照片、栏栅排版、旧纸质感，主题为未来城市新闻',
  '电影级概念海报：雨夜霓虹城市、俯视构图、强光影、人物剪影、9:16 竖版',
  '生成国潮长卷海报：元宵灯会、河道、古建筑、人群、灯笼海，细节密集但层次清楚',
  '美食水彩插画：一碗热气腾腾的拉面，柔和纸纹、淡彩边缘、适合菜单或生活方式海报',
  '自然历史博物馆风格图鉴：贝壳剖面、标注线、黑色背景、局部显微质感、中文说明',
  '个人品牌信息图：半身肖像、技能标签、时间轴、项目卡片、城市背景，适合社媒头像页',
  '生成多角度分镜：机器人管家整理书房，正面、近景、俯拍、特写、极近景，统一角色造型',
  '图生视频：让参考图里的城市夜景缓慢推进，霓虹反射流动，保持主体结构不变',
  '首尾帧视频：宇航员从荒原走进发光森林，镜头平稳推进，5 秒，电影感光线',
  '包装设计：玉兰花、山水纹样、温润纸质肌理，做成一套礼盒主视觉和局部细节',
  '生成一组短剧角色海报：同一演员 4 种情绪，服装统一，正脸清晰，背景极简',
  '产品发布会主视觉：透明耳机悬浮、冷蓝光、玻璃材质、高级灰背景、留出标题空间',
  '社媒九宫格：一个咖啡品牌的早晨故事，产品、人物、空间、细节、口号统一风格',
  '生成一张奇幻地图：漂浮岛屿、瀑布、手绘地名、路线标记、羊皮纸质感',
  '创作一张未来城市剖面图：地铁、空中交通、住宅、能源站、人物活动，信息清晰',
  '图生图：把参考照片重绘成高级商业海报，保持主体一致，增强光影、材质和构图张力',
  '文生视频：雨夜街角拉面店，热气升起，灯牌闪烁，镜头从街面低角度慢慢推进',
  '生成一张艺术展览海报：抽象雕塑、柔和阴影、极简排版、米白背景、大片留白',
  '做一张 AIGC 教程封面：节点画布、提示词卡片、图片结果、绿色高亮路径，专业但亲和',
  '生成宠物摄影套图：一只白色小狗在客厅、草地、车窗边、厨房四个场景，光线统一',
  '游戏道具设定图：魔法钥匙的外观、材料、发光效果、尺寸比例、拆解细节',
  '夏日饮品广告：冰块、水珠、柠檬片、透明玻璃杯、阳光折射，清爽商业摄影',
  '生成品牌视觉套装：Logo 占位、色卡、字体、应用物料、海报示例，整洁设计系统',
  '制作一张短视频分镜表：6 个镜头、每格有画面描述、运动方式、时长和转场建议'
]

export const HOME_CHAT_SUGGESTIONS = [
  '帮我把一个新茶饮品牌拆成 3 个视觉方向',
  '把这个中文提示词优化得更适合生图，但不要翻译成英文',
  '给我一个 6 镜头短视频分镜，包含首尾帧建议',
  '根据产品照片设计一套电商主图和详情页画面',
  '帮我把角色设定扩展成可直接图生图的提示词',
  '我想做一个公开工作流案例，帮我拆节点'
]

export const INSPIRATION_CASES = [
  {
    title: '角色设定表',
    category: '角色 / 图生图',
    prompt: '根据参考图生成角色设定表：正面、侧面、背面、6 个表情差分、服装道具拆解、色板和世界观说明，保持角色一致性。',
    image: characterSheetImage
  },
  {
    title: '城市美食地图',
    category: '信息图 / 地图',
    prompt: '生成一张城市美食地图信息图：手绘地图、代表菜品插画、路线编号、推荐理由、小贴士和清爽中文排版。',
    image: chengduFoodMapImage
  },
  {
    title: '未来城市海报',
    category: '海报 / 电影感',
    prompt: '生成一张未来城市电影海报：雨夜霓虹、俯视街区、强烈红蓝对比、人物剪影、标题留白，9:16 竖版。',
    image: futureCityPosterImage
  },
  {
    title: '产品套装摄影',
    category: '电商 / 产品',
    prompt: '生成一套清新护肤产品套装摄影：礼盒、瓶身、包装袋、植物光影、卖点图标和浅绿色高级商业质感。',
    image: greenTeaProductImage
  },
  {
    title: '国潮长卷灯会',
    category: '国风 / 长卷',
    prompt: '生成国潮长卷海报：元宵灯会、河道、古建筑、密集人群、满天灯笼，细节丰富、层次清晰、暖金色夜景。',
    image: lanternFestivalImage
  },
  {
    title: '自然图鉴剖面',
    category: '科普 / 图鉴',
    prompt: '自然历史博物馆风格图鉴：贝壳剖面、显微质感、标注线、黑色背景、中文注释，科学但有高级摄影质感。',
    image: naturalHistoryFoodImage
  },
  {
    title: '个人档案信息图',
    category: '社媒 / 信息图',
    prompt: '生成个人品牌信息图：半身肖像、技能卡片、兴趣标签、项目时间轴、城市背景，适合社媒主页展示。',
    image: profileInfographicImage
  },
  {
    title: '赛车规格海报',
    category: '产品 / 参数',
    prompt: '做一张赛车规格海报：运动中的主车、三视图线稿、性能参数表、材质细节、速度感光轨和深色赛道背景。',
    image: racingSpecPosterImage
  },
  {
    title: '水彩美食插画',
    category: '插画 / 美食',
    prompt: '美食水彩插画：一碗热气腾腾的拉面，柔和纸纹、淡彩晕染、温暖生活感，适合菜单封面或社媒海报。',
    image: ramenWatercolorImage
  },
  {
    title: '绘本温柔场景',
    category: '绘本 / 插画',
    prompt: '儿童绘本水彩场景：两个孩子在午后墙边对话，树影、纸张纹理、浅色留白、安静温柔的情绪。',
    image: watercolorPictureBookImage
  }
]

CANVAS_PROMPT_SUGGESTIONS.push(
  '便利店霓虹人像：35mm 胶片、冷白荧光灯混合粉蓝霓虹、玻璃反射、真实皮肤纹理、夜晚街头编辑大片感',
  '复古旅行海报：阿马尔菲海岸悬崖公路、白色老爷车、柠檬枝前景、丝网印刷纹理、1950 年代明亮配色',
  '机器拆解海报：相机或耳机爆炸视图、每个零件悬浮分层、编号标注、材质剖面、工业设计图纸质感',
  '六宫格时尚大片：同一模特、同一套服装，生成 6 个广告镜头，包含近景、全身、细节、环境和动作变化',
  '数据科学全景信息图：从数据采集到部署监控的完整流程，深色仪表盘风格，模块密集但层级清晰',
  'AI 视频 App 首页 UI：深色 iOS 界面、Hero 卡片、功能入口、最近创作列表、底部导航，真实产品截图感',
  '玻璃拟态设计系统：一套 app 组件库，包含按钮、卡片、图标、弹窗、色板、排版规范，浅色高端科技风',
  '城市旅行攻略卡：地图路线、交通、餐厅、预算、注意事项、三日行程，杂志信息图排版，中文可读',
  '角色介绍卡：动漫角色立绘、姓名、技能、属性、剧情简介、UI 边框和装饰元素，游戏设定集风格',
  '黄金卡牌合集：12 张幻想战士卡牌，统一金色边框、角色半身像、星座符号、中文标题，收藏卡视觉',
  '长卷夜景全景：古代城市元宵灯会、河道、宫殿、桥梁、密集人群、孔明灯，横向超宽卷轴构图',
  '直播带货截图：手机竖屏直播间，主播、商品卡片、弹幕、优惠券、成交提示、真实电商平台 UI',
  '日常手写笔记照片：打开的笔记本、黑色圆珠笔字迹、划线和涂改、窗边自然光、iPhone 俯拍质感',
  '游戏状态界面：RPG 角色属性页，装备槽、技能树、像素或赛博 UI，信息量大但布局清楚',
  '电影预告片缩略图：强情绪人物特写、标题留白、冲突场景、红蓝对比光，YouTube 封面质感',
  '产品详情页长图：卖点分屏、材质微距、场景图、参数表、包装展示、白底主图，适合电商详情页',
  '历史社交媒体截图：把历史人物做成现代社交平台主页，头像、动态、评论、热搜和时间线，幽默但精致',
  '自然纪录片海报：野生动物近景、环境纵深、金色晨光、纪录片标题区、真实摄影和高级调色'
)

HOME_CHAT_SUGGESTIONS.push(
  '帮我从“产品主图、详情页、短视频封面”三个方向拆一套电商工作流',
  '把这个想法改写成 5 个不同风格的 GPT Image 2 提示词：真实摄影、海报、信息图、UI、绘本',
  '根据我的产品/角色/场景，生成一组可直接放进节点画布的提示词链路',
  '帮我设计一个从参考图到首帧图，再到 5 秒视频的完整工作流',
  '我想做一个公共工作流模板，请帮我拆成输入节点、生成节点和结果节点'
)

INSPIRATION_CASES.push(
  {
    title: '便利店霓虹人像',
    category: '摄影 / 人像',
    prompt: '35mm 胶片夜景人像，便利店冷白荧光灯和街外粉蓝霓虹混合照明，玻璃门反射、轻微颗粒、高对比色偏。人物自然站在门口，真实皮肤纹理，杂志街拍编辑风格，无水印，无文字。',
    image: neonStorePortraitImage
  },
  {
    title: '复古海岸旅行海报',
    category: '海报 / 旅行',
    prompt: '复古旅行海报，阿马尔菲海岸悬崖公路，经典白色老爷车沿弯曲海边道路行驶，地中海蓝色海面、彩色山城、柠檬树枝前景，1950 年代丝网印刷质感，高饱和装饰插画。',
    image: amalfiTravelPosterImage
  },
  {
    title: '六宫格时尚广告',
    category: '摄影 / 品牌',
    prompt: '生成一套 6 宫格时尚广告大片，同一模特、同一套服装、同一品牌调性，分别包含全身、半身、特写、动作、环境、材质细节镜头，统一色调，适合服装品牌 campaign。',
    image: fashionCampaignGridImage
  },
  {
    title: '相机拆解信息图',
    category: '产品 / 拆解',
    prompt: '生成相机爆炸视图拆解海报，机身、镜头、传感器、电池、按钮和内部模块悬浮分层排列，带编号标注和简短说明，工业设计图纸风格，干净背景，高级科技感。',
    image: cameraExplodedViewImage
  },
  {
    title: '街头时尚编辑片',
    category: '摄影 / 写实',
    prompt: '真实街头时尚摄影，模特穿黑色皮夹克和长裙走过城市斑马线，背景有出租车和老建筑，阴天自然光，轻微运动感，35mm 镜头，杂志大片质感。',
    image: streetFashionEditorialImage
  },
  {
    title: 'AI 视频 App UI',
    category: 'UI / 产品',
    prompt: '设计一个专业的 iOS AI Video Generator App 首页，深色主题，包含 Hero 视频生成卡、文本转视频/图生视频/脚本转视频入口、最近创作列表、底部导航，真实可上线产品截图感。',
    image: aiVideoAppUiImage
  },
  {
    title: '玻璃拟态 UI 系统',
    category: 'UI / 组件库',
    prompt: '生成一套玻璃拟态 UI 设计系统展示图，包含按钮、卡片、弹窗、输入框、图标、色板、字体规范和组件状态，柔和透明材质，浅色背景，像真实设计稿。',
    image: glassyUiSystemImage
  },
  {
    title: '城市旅行攻略卡',
    category: '信息图 / 旅行',
    prompt: '制作城市旅行攻略信息图，包含路线地图、三日行程、交通方式、餐厅推荐、预算、注意事项和拍照点，杂志排版，中文标题清晰，适合收藏分享。',
    image: cityTravelGuideImage
  },
  {
    title: '游戏角色介绍卡',
    category: '角色 / 游戏',
    prompt: '生成游戏角色介绍页面，包含角色立绘、姓名、职业、技能、属性、背景故事和装饰 UI 边框，Persona 风格的强烈配色和排版，但不要复制具体 IP。',
    image: personaCharacterCardImage
  },
  {
    title: '黄金卡牌合集',
    category: '角色 / 卡牌',
    prompt: '生成 12 张幻想战士收藏卡牌合集，统一金色边框、星座符号、角色半身像、中文名称、华丽光效，每张角色不同但风格一致，横向合集展示。',
    image: goldSaintsCardGridImage
  },
  {
    title: '古城灯会长卷',
    category: '国风 / 全景',
    prompt: '横向超宽古代城市元宵灯会长卷，河道穿城而过，宫殿、桥梁、楼阁、船只和密集人群，天空有大量孔明灯，暖金夜景，细节极丰富，像可放大的历史画卷。',
    image: lanternPanoramaLongScrollImage
  },
  {
    title: '直播带货截图',
    category: '电商 / 社媒',
    prompt: '生成真实手机竖屏直播带货截图，主播在直播间展示商品，画面包含商品卡片、优惠券、弹幕、点赞、成交提示和购买按钮，中文 UI 清晰，平台感真实。',
    image: douyinLiveCommerceImage
  }
)

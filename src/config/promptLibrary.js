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

export const PROMPT_LIBRARY_SOURCE = {
  name: 'EvoLinkAI/awesome-gpt-image-2-prompts',
  license: 'Apache-2.0',
  url: 'https://github.com/EvoLinkAI/awesome-gpt-image-2-prompts'
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

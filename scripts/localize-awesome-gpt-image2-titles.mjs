import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  AWESOME_GPT_IMAGE_2_CASES,
  AWESOME_GPT_IMAGE_2_PROMPT_SUGGESTIONS,
  AWESOME_GPT_IMAGE_2_SOURCE
} = require('../src/config/awesomeGptImage2Library.js')

const exactTitleMap = new Map([
  ['Based on the video content and this current frame, use GPT to generate a YouT...', '基于当前视频帧生成 YouTube 缩略图'],
  ['Edit this image so that total amount changes to 244.5 baht. You can change th...', '修改票据金额为 244.5 泰铢'],
  ['Create the most realistic front page design of a vintage newspaper featuring ...', '复古报纸头版真实排版'],
  ['analyze this photo and give me a detailed JSON prompt that recreates it. brea...', '照片复刻 JSON 提示词分析'],
  ['CALMING GREEN TEA Film Kit displayed frontally, the open box shows soft sage-...', '静心绿茶胶片套装正面展示'],
  ['Ultra-realistic product photography of a rich strawberry soft-serve ice cream...', '草莓软冰淇淋超写实产品摄影'],
  ['A hyper-realistic UI/UX mockup displayed on a slim modern laptop placed on a ...', '笔记本电脑上的超写实 UI/UX 样机'],
  ['Ultra-realistic cinematic DSLR photograph of an 18-year-old handsome young ma...', '18 岁青年电影感 DSLR 人像'],
  ['A full-body outdoor shot captures a young Caucasian woman, possibly in her la...', '户外全身女性时装摄影'],
  ['A professional product photography shot of a cold sparkling water', '冷感气泡水专业产品摄影'],
  ['Soft poetic children\'s book illustration with watercolor and gouache textures...', '柔和诗意水彩儿童绘本插画'],
  ['Aspect Ratio: 9:16 Vertical', '9:16 竖版构图示例'],
  ['based on the generated character help me generate a screenshot of screenshot ...', '基于角色生成应用截图界面'],
  ['Create a landing page using this image as a reference for style and color gra...', '参考图片风格生成落地页设计'],
  ['Cloud shape doodle generation', '云朵形状涂鸦生成'],
  ['Dreamy Oriental female portrait prompt', '梦幻东方女性人像'],
  ['Premium product studio shot template', '高级产品棚拍模板'],
  ['Premium food photography template', '高级美食摄影模板'],
  ['generate an image of a racing car poster with its spec and pricing', '赛车规格与价格海报'],
  ['Blue Tears cocktail tutorial infographic poster', '蓝眼泪鸡尾酒教程信息图'],
  ['ASCII dengue infographic', 'ASCII 登革热科普信息图']
  ,['4-Panel Japanese Digital Ad Banner Grid', '日式数字广告四宫格横幅']
  ,['18-Panel Mascot Brand Identity Document', '18 面板吉祥物品牌识别文档']
  ,['Dark Mode Marketing Case Study UI', '深色模式营销案例 UI']
  ,['VR Headset Exploded View Poster', 'VR 头显爆炸视图海报']
  ,['Luxury Chronograph Watch Ad', '奢华计时腕表广告']
  ,['Pastel Jellyfish Room Goods Poster', '粉彩水母房间小物海报']
  ,['Urban fruit juice ad poster', '都市果汁广告海报']
  ,['Official Character Sheet (JP)', '日式官方角色设定表']
  ,['Surreal Japanese Futuristic City Illustration', '超现实日式未来城市插画']
  ,['Eastern Fantasy Female Half-Portrait', '东方幻想女性半身人像']
  ,['Vertical Artistic Portrait of a Young Eastern Woman', '年轻东方女性竖版艺术人像']
  ,['Autobots Assembled at Lunar Base', '月球基地汽车人集结']
  ,['Luxury poster for fictional AI ad printer', '虚构 AI 广告打印机奢华海报']
  ,['Persona5 Character Reference Card', 'Persona5 角色参考卡']
  ,['Character key visual poster with silhouette collage', '剪影拼贴角色主视觉海报']
  ,['Pixel game concept board from TV drama theme', '电视剧主题像素游戏概念板']
  ,['Counter-Strike x Terraria Screenshot Mashup', '反恐精英 x 泰拉瑞亚截图混搭']
  ,['Pre-war Japan Lab Minecraft Screenshot', '战前日本实验室 Minecraft 截图']
  ,['Multi-Concept Battle Poster Set', '多概念战斗海报套装']
  ,['Rust In-Game Screenshot', 'Rust 游戏内截图']
  ,['Among Us Realistic Screenshot', 'Among Us 写实截图']
  ,['14th-Dimension Projection Scene', '十四维投影场景']
  ,['Douyin Livestream Sales Screenshot', '抖音直播销售截图']
  ,['Lu Bu Boss Design Sheet', '吕布 Boss 设定表']
  ,['Su Daji Ancient-Style Glamour Portrait', '苏妲己古风魅惑人像']
  ,['China Aerospace Commemorative Stamp Sheet', '中国航天纪念邮票张']
  ,['Naturalist-Style Food Specimen Cross-Section', '自然博物风美食标本剖面']
  ,['Neon AI Thumbnail Comparison', '霓虹 AI 缩略图对比']
  ,['Tokyo DisneySea Front-Row Battle UI', '东京迪士尼海洋前排对战 UI']
  ,['E-commerce Live Stream UI Mockup', '电商直播 UI 样机']
  ,['E-commerce Main Image - Luxury Amber Perfume Ad', '电商主图：奢华琥珀香水广告']
  ,['E-commerce Main Image - Skincare Product Studio Shot', '电商主图：护肤品棚拍']
  ,['E-commerce Main Image - Tropical Citrus Soda Ad Poster', '电商主图：热带柑橘汽水广告海报']
  ,['E-commerce Main Image - Industrial Design Presentation Sheet', '电商主图：工业设计展示板']
  ,['E-commerce Main Image - Luxury Fur-Lined Loafer Lifestyle Photo', '电商主图：奢华毛绒乐福鞋生活方式摄影']
  ,['E-commerce Main Image - Luxury Perfume Ad on Marble Vanity', '电商主图：大理石梳妆台奢华香水广告']
  ,['E-commerce Main Image - Miniature Diorama Skincare Advertisement', '电商主图：微缩立体护肤品广告']
  ,['E-commerce Main Image - Traditional Chinese Art and Porcelain Vases', '电商主图：传统中国艺术与瓷瓶']
  ,['E-commerce Main Image - Premium Gaming Motherboard Studio Shot', '电商主图：高级游戏主板棚拍']
  ,['E-commerce Main Image - Premium Grain Powder Ad Board', '电商主图：高级谷物粉广告看板']
  ,['E-commerce Main Image - Earbuds E-commerce Infographic', '电商主图：耳机电商信息图']
  ,['E-commerce Main Image - Sustainable T-Shirt Plantable Tag Ad', '电商主图：可持续 T 恤可种植吊牌广告']
  ,['E-commerce Main Image - Elegant Cosmetic Poster Prompt', '电商主图：优雅化妆品海报']
  ,['E-commerce Main Image - Minimalist Product Ad: PURE CRUNCH', '电商主图：PURE CRUNCH 极简产品广告']
  ,['E-commerce Main Image - Pastel Blue Crocs Fashion Ad', '电商主图：浅蓝洞洞鞋时尚广告']
  ,['E-commerce Main Image - 9-Panel Product TVC Storyboard', '电商主图：九宫格产品 TVC 分镜']
  ,['Cinematic Minimal Portrait', '电影感极简人像']
  ,['9:16 Cosplayer Portrait Screenshot', '9:16 Cosplayer 人像截图']
  ,['Urban Turn-Back Street Portrait', '街头回眸人像']
  ,['AI Self-Perception Portrait', 'AI 自我感知人像']
  ,['Magazine Travel Guide Feature Article', '杂志旅行指南专题文章']
  ,['Cyberpunk Sci-Fi Side Profile Portrait', '赛博朋克科幻侧脸人像']
  ,['Restored Vintage Mother and Child Portrait', '修复感复古母子人像']
  ,['Blonde Maid in Warm Cafe', '暖色咖啡馆金发女仆']
  ,['Dark Gatorade-Style Portrait', '深色佳得乐风格人像']
  ,['Chinese Minimalist S-Shaped Poster', '新中式极简 S 形海报']
  ,['2026 Spring Guangzhou City Poster', '2026 春季广州城市海报']
  ,['Doodle Sketch AI Builder', '涂鸦草图 AI 生成器']
  ,['Ink-Curve Guangzhou Aesthetics Poster', '水墨曲线广州美学海报']
  ,['Spring Guangzhou City Poster', '春季广州城市海报']
  ,['AI Builder Doodle Sketch', 'AI 生成器涂鸦草图']
  ,['Fictional Anime Movie Poster', '虚构动漫电影海报']
  ,['Dark-Fantasy Guangzhou City Poster', '暗黑奇幻广州城市海报']
  ,['Refreshing Summer Udon Ad', '清爽夏日乌冬面广告']
  ,['Pilates Studio Ad Poster', '普拉提工作室广告海报']
  ,['6-Block Fashion Campaign Prompt Formula', '六宫格时尚广告提示词公式']
  ,['Chili Pork Cooking Flowchart', '辣椒猪肉烹饪流程图']
  ,['Cinematic Infographic Concept Poster', '电影感信息图概念海报']
  ,['Theme Science Encyclopedia Card', '主题科普百科卡片']
  ,['A Chinese Odyssey 90s Hong Kong Poster', '90 年代港风《大话西游》海报']
  ,['Charlie Chaplin Product Poster Redesign', '卓别林产品海报重绘']
  ,['Streetwear Fashion Campaign Asian Apparel Poster', '亚洲服饰街头潮流广告海报']
  ,['Epic Career Moments Cinematic Poster Template', '生涯高光时刻电影感海报模板']
  ,['Avant-Garde Basketball Sculpture Sports Fashion Ad', '先锋篮球雕塑运动时尚广告']
  ,['Avant-Garde Tennis Racket Sculpture Sports Fashion Ad', '先锋网球拍雕塑运动时尚广告']
  ,['Premium Food Recipe Poster Elegant Layout', '高级美食食谱优雅海报版式']
  ,['Surrealist Rolex Luxury Watch Fashion Poster', '超现实劳力士奢华腕表时尚海报']
  ,['SPLASH Fashion Brand Hyper-Realistic Campaign Poster', 'SPLASH 时尚品牌超写实广告大片海报']
  ,['Avant-Garde Guitar Sculpture Fashion Advertisement', '先锋吉他雕塑时尚广告']
  ,['Alishan One-Day Travel Poster', '阿里山一日游旅行海报']
  ,['Dance Movement Reference Sheet', '舞蹈动作参考表']
  ,['16-Pose Dance Combat Reference Sheet', '16 姿势舞蹈战斗参考表']
  ,['Soft Pastel Anime Girl Full Body', '柔和粉彩动漫少女全身像']
  ,['Amateur iPhone Keynote Snapshot', '业余 iPhone Keynote 随手拍']
  ,['Song Dynasty Social Media Feed', '宋代社媒信息流']
  ,['Multi-Platform Content Screenshots', '多平台内容截图']
  ,['Liu Yifei Douyin Livestream Screenshot', '刘亦菲抖音直播截图']
  ,['King Taejo Yi Seong-gye\'s X Page', '太祖李成桂 X 主页']
  ,['Museum-Style Hanfu Breakdown Infographic', '博物馆风汉服拆解信息图']
  ,['Palm Reading Diagnosis Report', '手相诊断报告']
  ,['Don Quijote Promo Pop Poster', '唐吉诃德促销 POP 海报']
  ,['Elon Musk Douyin Livestream Screenshot', '马斯克抖音直播截图']
  ,['Trump and Kim Livestream PK Screenshot', '特朗普与金正恩直播 PK 截图']
  ,['Li Jiaqi Lipstick Livestream Background', '李佳琦口红直播背景']
  ,['Apple Pods Pro 3 Headphone E-Commerce Infographic', 'Apple Pods Pro 3 耳机电商信息图']
  ,['Apple Pods Pro 3 Earbuds E-Commerce Infographic', 'Apple Pods Pro 3 耳塞电商信息图']
  ,['Beauty Product Commercial Marketing Photograph', '美妆产品商业营销摄影']
  ,['Anime Band Finale at Budokan', '动漫乐队武道馆终演']
  ,['Gothic Android Warrior Cathedral Key Art', '哥特大教堂安卓战士关键艺术']
  ,['Anime Characters in Real Izakaya Photo', '动漫角色真实居酒屋照片']
  ,['BMW Performance Social Poster', 'BMW 性能社媒海报']
  ,['Nostalgic 16-Photo Couple Grid', '怀旧 16 张情侣照片网格']
  ,['Multi-Panel Image Board Template', '多面板图像板式模板']
  ,['Miyazaki-style short film pipeline', '宫崎骏风格短片制作流程']
])

const phraseMap = [
  ['E-commerce Main Image', '电商主图'],
  ['E-commerce', '电商'],
  ['E-Commerce Infographic', '电商信息图'],
  ['Brand Identity', '品牌识别'],
  ['Case Study', '案例研究'],
  ['Exploded View Breakdown', '爆炸视图拆解'],
  ['Exploded View', '爆炸视图'],
  ['Reference Sheet', '参考设定表'],
  ['Character Sheet', '角色设定表'],
  ['Character Reference Card', '角色参考卡'],
  ['Character Introduction Page', '角色介绍页'],
  ['Character key visual poster', '角色主视觉海报'],
  ['Hidden Face Character Art', '隐藏面孔角色艺术'],
  ['Character Visual Vertical Poster', '角色竖版主视觉海报'],
  ['Character Relationship Map', '角色关系图'],
  ['Key Visual', '主视觉'],
  ['Design System', '设计系统'],
  ['Landing Page', '落地页'],
  ['Social Media Feed', '社媒信息流'],
  ['Social App', '社交 App'],
  ['Match Success Screen', '匹配成功界面'],
  ['Livestream Screenshot', '直播截图'],
  ['Live Stream UI Mockup', '直播 UI 样机'],
  ['Live Stream', '直播'],
  ['Product TVC Storyboard', '产品 TVC 分镜'],
  ['Ad Storyboard', '广告分镜'],
  ['Ad', '广告'],
  ['Campaign System', '广告战役系统'],
  ['Campaign Poster', '广告大片海报'],
  ['Campaign Prompt Formula', '广告提示词公式'],
  ['Campaign Portrait', '广告人像'],
  ['Advertisement', '广告'],
  ['Ad Creative Poster', '广告创意海报'],
  ['Ad Board', '广告看板'],
  ['Ad Poster', '广告海报'],
  ['Product Poster Redesign', '产品海报重绘'],
  ['Product Ad Redesign', '产品广告重绘'],
  ['Product Advertisement', '产品广告'],
  ['Product Ad', '产品广告'],
  ['Product Studio Shot', '产品棚拍'],
  ['Product Photography', '产品摄影'],
  ['Marketing Photograph', '营销摄影'],
  ['Commercial Marketing Photograph', '商业营销摄影'],
  ['Fashion Advertisement', '时尚广告'],
  ['Fashion Campaign', '时尚广告大片'],
  ['Fashion Cover', '时尚封面'],
  ['Fashion Magazine Cover', '时尚杂志封面'],
  ['Fashion Dress Collection', '时装裙装系列'],
  ['Fashion Ad', '时尚广告'],
  ['Streetwear Fashion', '街头潮流时装'],
  ['Sports Fashion Ad', '运动时尚广告'],
  ['Sportswear Basketball Athlete', '篮球运动服运动员'],
  ['Lifestyle Photo', '生活方式摄影'],
  ['Lifestyle Mustang Shot', '野马汽车生活方式大片'],
  ['Studio Outfit Transformation', '棚拍造型变装'],
  ['Studio Shot', '棚拍'],
  ['Editorial Portrait', '编辑部风格人像'],
  ['Editorial Perfume Shot on Moss', '苔藓上的香水编辑大片'],
  ['Editorial Osaka Six Sweatshirt Ad', '大阪 Six 卫衣编辑广告'],
  ['Flash Editorial Portrait', '闪光灯编辑人像'],
  ['Beauty Portrait', '美妆人像'],
  ['Glam Beauty Portrait', '魅惑美妆人像'],
  ['Cinematic Portrait', '电影感人像'],
  ['Cinematic DSLR Photograph', '电影感 DSLR 摄影'],
  ['Cinematic Poster', '电影感海报'],
  ['Cinematic City Explosion Chase', '城市爆炸追逐电影画面'],
  ['Cinematic Chicken Momos Ad Poster', '鸡肉饺子电影感广告海报'],
  ['Documentary Photo', '纪实摄影'],
  ['Candid Phone Snapshot', '手机抓拍'],
  ['Candid Bedroom Selfie', '卧室自然自拍'],
  ['Candid Bedroom Recording', '卧室录制抓拍'],
  ['Mirror Selfie Bedroom', '卧室镜面自拍'],
  ['Portrait Screenshot', '人像截图'],
  ['Portrait Photo', '人像照片'],
  ['Portrait', '人像'],
  ['Avatar', '头像'],
  ['Figure Workspace Photo', '手办工作台照片'],
  ['Collectible Figure', '收藏手办'],
  ['Cartoon Character Render', '卡通角色渲染'],
  ['Anime Snapshot Conversion', '动画截图转绘'],
  ['Anime Character', '动漫角色'],
  ['Anime Girl', '动漫少女'],
  ['Anime Friends', '动漫朋友'],
  ['Anime Band', '动漫乐队'],
  ['Anime Museum Background Conversion', '动画博物馆背景转绘'],
  ['Anime Event Scene', '动漫活动场景'],
  ['Anime Banner Illustration', '动漫横幅插画'],
  ['Anime Fantasy Travel Movie Poster', '动漫奇幻旅行电影海报'],
  ['Anime Music Bootcamp Promo Poster', '动漫音乐训练营宣传海报'],
  ['Anime VTuber Minecraft Stream Thumbnail', '动漫 VTuber 我的世界直播缩略图'],
  ['Anime BL Promo Thumbnail', '动漫 BL 宣传缩略图'],
  ['Anime Cinematic', '动漫电影感'],
  ['Anime Martial Arts Battle Illustration', '动漫武侠战斗插画'],
  ['Gal Game', '美少女游戏'],
  ['Pixel Game', '像素游戏'],
  ['Video Game Screenshot Concept Design', '电子游戏截图概念设计'],
  ['Browser Game', '网页游戏'],
  ['Gacha Game Screen', '抽卡游戏界面'],
  ['Game Dev Overview Slide', '游戏开发概览页'],
  ['RPG Map', 'RPG 地图'],
  ['AAA Video Game Screenshot Concept Design', 'AAA 游戏截图概念设计'],
  ['Mecha Girl', '机甲少女'],
  ['Catgirl', '猫娘'],
  ['Schoolgirl Scene', '女学生场景'],
  ['Classroom Long Hair Snapshot', '教室长发抓拍'],
  ['Maid in Warm Cafe', '暖色咖啡馆女仆'],
  ['Cosplayer', 'Cosplayer'],
  ['Korean Idol', '韩系偶像'],
  ['Japanese Classroom', '日式教室'],
  ['Japanese Onsen Ryokan', '日本温泉旅馆'],
  ['Japanese Digital', '日式数字'],
  ['Japanese Chinese Food Delivery Flyer', '日式中华料理外卖传单'],
  ['Japanese Supermarket Sale Flyer', '日本超市促销传单'],
  ['Japanese AI Game Dev Overview Slide Prompt', '日本 AI 游戏开发概览页'],
  ['Japanese AI Battle YouTube Thumbnail', '日本 AI 对战 YouTube 缩略图'],
  ['Japanese', '日式'],
  ['Chinese Minimalist', '新中式极简'],
  ['New Chinese Minimalist', '新中式极简'],
  ['Floral Illustration', '花卉插画'],
  ['New Chinese Ink Landscape', '新中式水墨山水'],
  ['Chinese Ink Landscape', '中国水墨山水'],
  ['Chinese Comic', '中国漫画'],
  ['Chinese Odyssey', '大话西游'],
  ['Chinese Art and Porcelain Vases', '中国艺术与瓷瓶'],
  ['Traditional Chinese Art', '传统中国艺术'],
  ['Chinese Food', '中餐'],
  ['Chinese', '中国风'],
  ['Oriental female', '东方女性'],
  ['Eastern Fantasy Female Half-Portrait', '东方幻想女性半身人像'],
  ['Young Eastern Woman', '年轻东方女性'],
  ['Tang Dynasty Chang\'an Lantern Festival Panorama', '唐代长安灯会全景'],
  ['Historical Yang Guifei Realistic Portrait', '历史杨贵妃写实人像'],
  ['Tushan Yaya Fantasy Glamour Portrait', '涂山雅雅幻想人像'],
  ['Su Daji Ancient-Style Glamour Portrait', '苏妲己古风魅惑人像'],
  ['Lu Xun Morning Flowers Illustration', '鲁迅《朝花夕拾》插画'],
  ['Lu Bu Boss Design Sheet', '吕布 Boss 设定表'],
  ['Nezha Dark Fantasy Novel Cover', '哪吒暗黑奇幻小说封面'],
  ['Dongfang Bubai Wuxia Character Poster', '东方不败武侠角色海报'],
  ['Journey to the West Daughter Kingdom Poster', '西游记女儿国海报'],
  ['Journey to the West', '西游记'],
  ['Royal Tramp Character Poster', '鹿鼎记角色海报'],
  ['Realistic Guanyin Portrait from Buddhist Texts', '佛经观音写实人像'],
  ['Taoist Three Souls Seven Po Poster', '道教三魂七魄海报'],
  ['Lion Camel Ridge Dark Myth Scene', '狮驼岭暗黑神话场景'],
  ['Wuxia Heroine', '武侠女侠'],
  ['Vertical Artistic Portrait', '竖版艺术人像'],
  ['Martial Arts Battle', '武术战斗'],
  ['Guangzhou City Poster', '广州城市海报'],
  ['Guangdong Super League Invitation Poster', '广东超级联赛邀请海报'],
  ['Guangzhou Promo Poster', '广州宣传海报'],
  ['Ink-Curve Guangzhou Aesthetics Poster', '水墨曲线广州美学海报'],
  ['Hangzhou West Lake Travel Poster', '杭州西湖旅行海报'],
  ['Alishan One-Day Travel Poster', '阿里山一日游海报'],
  ['Chengdu Food Map Illustration', '成都美食地图插画'],
  ['Illustrated City Food Map', '城市美食地图插画'],
  ['City Food Map', '城市美食地图'],
  ['Travel Guide Feature Article', '旅行指南专题文章'],
  ['Travel Poster', '旅行海报'],
  ['City Poster', '城市海报'],
  ['Promo Poster', '宣传海报'],
  ['Poster Template', '海报模板'],
  ['Concept Poster', '概念海报'],
  ['Movie Poster', '电影海报'],
  ['Novel Cover', '小说封面'],
  ['Magazine Cover', '杂志封面'],
  ['Infographic Poster', '信息图海报'],
  ['Infographic', '信息图'],
  ['Vertical Poster', '竖版海报'],
  ['Poster Style', '海报风格'],
  ['Poster', '海报'],
  ['Illustration', '插画'],
  ['Art Print', '艺术版画'],
  ['Comic', '漫画'],
  ['Cartoon', '卡通'],
  ['Doodle Sketch', '涂鸦草图'],
  ['Moodboard', '情绪板'],
  ['Concept Board', '概念板'],
  ['Brand Identity Document', '品牌识别文档'],
  ['Merch Board', '周边商品板'],
  ['Mascot', '吉祥物'],
  ['Board', '板式'],
  ['Grid', '网格'],
  ['Collage', '拼贴'],
  ['9-Panel', '九宫格'],
  ['Panel', '面板'],
  ['18-Panel', '18 面板'],
  ['6-Block', '六宫格'],
  ['16-Pose', '16 姿势'],
  ['3x3', '九宫格'],
  ['4-Panel', '四宫格'],
  ['Multi-Panel', '多面板'],
  ['Multi-Platform', '多平台'],
  ['Multi-Concept', '多概念'],
  ['4 equal quadrants', '四等分构图'],
  ['Thumbnail Comparison', '缩略图对比'],
  ['YouTube Thumbnail', 'YouTube 缩略图'],
  ['Promo Thumbnail', '宣传缩略图'],
  ['Thumbnail', '缩略图'],
  ['Front-Row Battle UI', '前排对战 UI'],
  ['UI/UX Mockup', 'UI/UX 样机'],
  ['UI Design Generation', 'UI 设计生成'],
  ['UI Design System', 'UI 设计系统'],
  ['UI Mockup', 'UI 样机'],
  ['UI', 'UI'],
  ['App', 'App'],
  ['X Page', 'X 主页'],
  ['Keynote Snapshot', 'Keynote 随手拍'],
  ['Notebook Photo', '笔记本照片'],
  ['Copybook Sheet', '字帖页'],
  ['Diagnosis Report', '诊断报告'],
  ['Reading Diagnosis Report', '手相诊断报告'],
  ['Explainer Slide', '解释型幻灯片'],
  ['Breakdown Infographic', '拆解信息图'],
  ['Breakdown', '拆解'],
  ['Overview Slide', '概览页'],
  ['Front Page Design', '头版设计'],
  ['Presentation Sheet', '展示板'],
  ['Reference Card', '参考卡'],
  ['Reference Sheet', '参考表'],
  ['Recipe Poster Elegant Layout', '优雅食谱海报版式'],
  ['Cooking Flowchart', '烹饪流程图'],
  ['Food Recipe', '美食食谱'],
  ['Food Photography', '美食摄影'],
  ['Food Specimen Cross-Section', '美食标本剖面'],
  ['Food Specimen', '美食标本'],
  ['Specimen', '标本'],
  ['Food Delivery Flyer', '外卖传单'],
  ['Food Map', '美食地图'],
  ['Fast Food Character', '快餐角色'],
  ['Burger Hero Image', '汉堡主视觉图'],
  ['Udon Ad', '乌冬面广告'],
  ['Chicken Momos', '鸡肉饺子'],
  ['Cocktail', '鸡尾酒'],
  ['Chocolate', '巧克力'],
  ['Fruit Juice', '果汁'],
  ['Citrus Soda', '柑橘汽水'],
  ['Strawberry Soft-Serve Ice Cream', '草莓软冰淇淋'],
  ['Sparkling Water', '气泡水'],
  ['Green Tea', '绿茶'],
  ['Grain Powder', '谷物粉'],
  ['Skincare Product', '护肤品'],
  ['Skincare', '护肤'],
  ['Cosmetic Poster', '化妆品海报'],
  ['Perfume Ad', '香水广告'],
  ['Perfume', '香水'],
  ['Amber', '琥珀'],
  ['Marble Vanity', '大理石梳妆台'],
  ['Fur-Lined Loafer', '毛绒乐福鞋'],
  ['Loafer', '乐福鞋'],
  ['Earbuds', '耳机'],
  ['Headphone', '耳机'],
  ['Motherboard', '主板'],
  ['Gaming Motherboard', '游戏主板'],
  ['T-Shirt Plantable Tag', 'T 恤可种植吊牌'],
  ['Crocs Fashion Ad', '洞洞鞋时尚广告'],
  ['Product', '产品'],
  ['Luxury', '奢华'],
  ['Premium', '高级'],
  ['Elegant', '优雅'],
  ['Minimalist', '极简'],
  ['Sustainable', '可持续'],
  ['Tropical', '热带'],
  ['Pastel Blue', '浅蓝色'],
  ['Pastel Jellyfish Room Goods', '粉彩水母房间小物'],
  ['Warm Cafe', '暖色咖啡馆'],
  ['Convenience Store Neon', '便利店霓虹'],
  ['Subway', '地铁'],
  ['Bodega Night', '夜晚杂货店'],
  ['Old Delhi Sweet Shop Storefront', '旧德里甜品店门面'],
  ['Rainy Bus Stop', '雨天公交站'],
  ['Skatepark Snapshot', '滑板公园抓拍'],
  ['Flower Market', '花市'],
  ['Shinjuku Bar Scene', '新宿酒吧场景'],
  ['Tokyo DisneySea', '东京迪士尼海洋'],
  ['Bangalore', '班加罗尔'],
  ['Dubai City Model', '迪拜城市模型'],
  ['New York across two centuries', '跨越两个世纪的纽约'],
  ['Silicon Valley 2026', '2026 硅谷'],
  ['Boston Spring 2026', '2026 波士顿春季'],
  ['Spring 2026', '2026 春季'],
  ['1900 Istiklal Street Panorama', '1900 年独立大街全景'],
  ['Istiklal Street Panorama', '独立大街全景'],
  ['Rooftop Plane', '屋顶飞机'],
  ['Stormy Tropical City', '风暴热带城市'],
  ['Shibuya Bubble Girl', '涩谷泡泡女孩'],
  ['Urban Alley Mural Artist', '城市小巷壁画艺术家'],
  ['Urban Fantasy Coexistence Crossing', '都市幻想共存路口'],
  ['Urban Turn-Back Street', '街头回眸'],
  ['Urban Fruit Juice', '都市果汁'],
  ['Rural Station', '乡村车站'],
  ['Greenhouse Bar', '温室酒吧'],
  ['Lunar Base', '月球基地'],
  ['Gas Giant Descent Storyboard', '气态巨行星下降分镜'],
  ['Skyray Aircraft', '蝠鲼仿生飞行器'],
  ['Biomimetic', '仿生'],
  ['Sci-Fi', '科幻'],
  ['Science Fiction', '科幻'],
  ['Science Encyclopedia', '科普百科'],
  ['Science Encyclopedia Card', '科普百科卡片'],
  ['Silhouette Universe Narrative', '剪影宇宙叙事'],
  ['Epic Silhouette World', '史诗剪影世界'],
  ['Dark-Fantasy', '暗黑奇幻'],
  ['Dark Fantasy', '暗黑奇幻'],
  ['Dark Epic', '暗黑史诗'],
  ['Surrealist', '超现实主义'],
  ['Surreal', '超现实'],
  ['Reality Fracture', '现实裂隙'],
  ['Baroque Painting', '巴洛克绘画'],
  ['Koi Nebula', '锦鲤星云'],
  ['Mandala', '曼陀罗'],
  ['Peacock Botanical Vintage Symmetrical', '孔雀植物复古对称'],
  ['Botanical Vintage Symmetrical', '植物复古对称'],
  ['Water Signs Zodiac Character', '水象星座角色'],
  ['Three Souls Seven Po', '三魂七魄'],
  ['Four Seasons', '四季'],
  ['Dreamy Underwater Woman With Translucent Fish', '梦幻水下女子与透明鱼'],
  ['Underwater Woman', '水下女子'],
  ['Translucent Fish', '透明鱼'],
  ['Crystal Anime Girl', '水晶动漫少女'],
  ['Fantasy Travel', '奇幻旅行'],
  ['Fantasy Coexistence', '幻想共存'],
  ['Fantasy Female', '幻想女性'],
  ['Fantasy', '幻想'],
  ['Dreamy', '梦幻'],
  ['Soft Airy', '柔和空气感'],
  ['Soft Black Mist', '柔焦黑雾'],
  ['Backlit', '逆光'],
  ['Monochrome', '黑白'],
  ['Black and White', '黑白'],
  ['Black-and-red', '黑红'],
  ['Dark Mode', '深色模式'],
  ['Dark Gatorade-Style', '深色佳得乐风格'],
  ['Cyberpunk Neon', '赛博朋克霓虹'],
  ['Cyberpunk Sci-Fi Side Profile', '赛博朋克科幻侧脸'],
  ['Cyberpunk 404 Witch Summoning', '赛博朋克 404 女巫召唤'],
  ['Cyber Crystal', '赛博水晶'],
  ['Retro Programming Museum', '复古编程博物馆'],
  ['Vintage Newspaper', '复古报纸'],
  ['Vintage Mother and Child', '复古母子'],
  ['Vintage Claude Shannon', '复古克劳德·香农'],
  ['Vintage PRS Guitar Lineage', '复古 PRS 吉他谱系'],
  ['Vintage Amalfi', '复古阿马尔菲'],
  ['Vintage', '复古'],
  ['Fujifilm Strawberry School', '富士草莓校园'],
  ['Fujifilm Couple', '富士情侣'],
  ['CCD Camera Flash', 'CCD 相机闪光灯'],
  ['CCD flash', 'CCD 闪光灯'],
  ['35mm Flash', '35mm 闪光灯'],
  ['35mm', '35mm'],
  ['DSLR', 'DSLR'],
  ['Polaroid Frame Breakout Scene', '拍立得破框场景'],
  ['Frame Breakout Scene', '破框场景'],
  ['Restaurant POV Change Comparison', '餐厅 POV 变化对比'],
  ['POV Change Comparison', 'POV 变化对比'],
  ['A/B Test Signed Output', 'A/B 测试签名输出'],
  ['Prompt Test', '提示词测试'],
  ['Detail Showcase', '细节展示'],
  ['Signed Output', '签名输出'],
  ['Most Significant Event', '重大事件'],
  ['Significant Event', '重大事件'],
  ['Drug Design', '药物设计'],
  ['LIME Drug Design', 'LIME 药物设计'],
  ['Commemorative Stamp Sheet', '纪念邮票张'],
  ['Aerospace', '航天'],
  ['Autobots Assembled', '汽车人集结'],
  ['Naturalist-Style', '自然博物风'],
  ['Cross-Section', '剖面'],
  ['BookShelf', '书架'],
  ['Bookshelf', '书架'],
  ['Wooden', '木质'],
  ['Forged Masterpiece', '锻造杰作'],
  ['Counter-Strike x Terraria Screenshot Mashup', '反恐精英 x 泰拉瑞亚截图混搭'],
  ['Counter-Strike', '反恐精英'],
  ['Terraria', '泰拉瑞亚'],
  ['Mashup', '混搭'],
  ['Pre-war Japan', '战前日本'],
  ['Pre-war Japan Lab Minecraft Screenshot', '战前日本实验室 Minecraft 截图'],
  ['Minecraft Stream', 'Minecraft 直播'],
  ['Minecraft Screenshot', 'Minecraft 截图'],
  ['Rust In-Game Screenshot', 'Rust 游戏内截图'],
  ['Among Us Realistic Screenshot', 'Among Us 写实截图'],
  ['Baseball Broadcast', '棒球转播'],
  ['Bear Selfie', '熊自拍'],
  ['Sam Altman', '萨姆·奥特曼'],
  ['Elon Musk', '马斯克'],
  ['Trump and Kim', '特朗普与金正恩'],
  ['Liu Yifei', '刘亦菲'],
  ['Li Jiaqi', '李佳琦'],
  ['King Taejo Yi Seong-gye', '太祖李成桂'],
  ['Don Quijote', '唐吉诃德'],
  ['Momotaro', '桃太郎'],
  ['Monika', '莫妮卡'],
  ['BMW Performance', 'BMW 性能'],
  ['Mustang', '野马'],
  ['Apple Pods Pro 3', 'Apple Pods Pro 3'],
  ['Sony A7', 'Sony A7'],
  ['Hermes-Inspired', '爱马仕灵感'],
  ['Rolex', '劳力士'],
  ['SPLASH', 'SPLASH'],
  ['PRS Guitar', 'PRS 吉他'],
  ['Saint Seiya Gold Saints', '圣斗士黄金圣斗士'],
  ['Persona5', 'Persona5'],
  ['GTA 6', 'GTA 6'],
  ['White Cat Project', '白猫 Project'],
  ['Eleanor', '艾莉诺'],
  ['Chaos Notes', '混沌笔记'],
  ['Miyazaki-style', '宫崎骏风格'],
  ['short film pipeline', '短片制作流程'],
  ['Magical Seed Packet', '魔法种子包装'],
  ['Seed Packet', '种子包装'],
  ['VR Headset', 'VR 头显'],
  ['Headset', '头显'],
  ['Japanese Digital Ad Banner Grid', '日式数字广告横幅网格'],
  ['Digital Ad Banner Grid', '数字广告横幅网格'],
  ['Anime Character Brand Identity', '动漫角色品牌识别'],
  ['Parody Luxury Product Advertisement', '戏仿奢侈品广告'],
  ['Luxury Miniature Dubai City Model', '奢华迪拜微缩城市模型'],
  ['Luxury chocolate campaign system', '奢华巧克力广告战役系统'],
  ['Movie', '电影'],
  ['Short Film', '短片'],
  ['Pipeline', '流程'],
  ['Front-Row', '前排'],
  ['Battle', '对战'],
  ['Date Photo Collage', '约会照片拼贴'],
  ['Eating Soba', '吃荞麦面'],
  ['Band Finale at Budokan', '武道馆乐队终演'],
  ['Android Warrior Cathedral Key Art', '大教堂安卓战士关键艺术'],
  ['Artist and Ethereal Muse at Night', '夜晚艺术家与空灵缪斯'],
  ['Izakaya Photo', '居酒屋照片'],
  ['Real Izakaya', '真实居酒屋'],
  ['Golden Cocktail', '金色鸡尾酒'],
  ['Parrot Pixel Mosaic', '鹦鹉像素马赛克'],
  ['Cozy Anime ASMR Ear Massage Girl', '温馨动漫 ASMR 掏耳少女'],
  ['Celebrity Livestream Concept', '明星直播概念'],
  ['Spanish GRWM Morning Beauty', '西语 GRWM 晨间美妆'],
  ['GRWM Morning Beauty', 'GRWM 晨间美妆'],
  ['Palm Reading', '手相'],
  ['Hanfu Breakdown', '汉服拆解'],
  ['Museum-Style', '博物馆风格'],
  ['Calligraphy', '书法'],
  ['Handwritten Medical Prescription Sheet', '手写医疗处方单'],
  ['Handwritten Realistic Letter', '手写真实信件'],
  ['Handwritten Notebook Photo', '手写笔记本照片'],
  ['Notebook', '笔记本'],
  ['Prescription Sheet', '处方单'],
  ['Letter', '信件'],
  ['S-Shaped', 'S 形'],
  ['Stone Staircase Evolution', '石阶演化'],
  ['Dance Movement', '舞蹈动作'],
  ['Dance Combat', '舞蹈战斗'],
  ['Movement Reference Sheet', '动作参考表'],
  ['Combat Reference Sheet', '战斗参考表'],
  ['Ethnographic Plate for Tibetan Ceremonial Hat', '藏族礼帽民族志图版'],
  ['Tibetan Ceremonial Hat', '藏族礼帽'],
  ['Ceremonial Hat', '礼帽'],
  ['Lineage Poster', '谱系海报'],
  ['Museum Background', '博物馆背景'],
  ['Mural Artist', '壁画艺术家'],
  ['Children\'s Book', '儿童绘本'],
  ['Picture Book', '绘本'],
  ['Watercolor', '水彩'],
  ['Gouache', '水粉'],
  ['Ink-Etched Family', '蚀刻水墨家庭'],
  ['Family Portrait', '家庭人像'],
  ['Mother and Child', '母子'],
  ['Toddler Crayon Scribble Art Style', '幼儿蜡笔涂鸦风'],
  ['Crayon Scribble', '蜡笔涂鸦'],
  ['Gentle Woman with Glasses', '戴眼镜的温柔女性'],
  ['Young Woman in Sequin Dress on Stairs', '楼梯上的亮片裙年轻女性'],
  ['Sequin Dress', '亮片裙'],
  ['Gentle Woman', '温柔女性'],
  ['Woman', '女性'],
  ['Girl', '少女'],
  ['Man', '男性'],
  ['Couple', '情侣'],
  ['Mother', '母亲'],
  ['Child', '孩子'],
  ['Frontally', '正面'],
  ['Full Body', '全身'],
  ['Full-Body', '全身'],
  ['Half-Portrait', '半身人像'],
  ['Long Hair Snapshot', '长发抓拍'],
  ['Side Profile', '侧脸'],
  ['Turn-Back Street', '街头回眸'],
  ['Room Goods', '房间小物'],
  ['Bedroom', '卧室'],
  ['Pajama Night', '睡衣夜景'],
  ['Night Portrait', '夜景人像'],
  ['Night Cinematic', '夜晚电影感'],
  ['Warm', '暖色'],
  ['Soft', '柔和'],
  ['Poetic', '诗意'],
  ['Hyper-Realistic', '超写实'],
  ['Ultra-realistic', '超写实'],
  ['Realistic', '写实'],
  ['Photorealistic', '照片级写实'],
  ['Naturalist-Style', '自然博物风格'],
  ['Avant-Garde', '先锋'],
  ['Futuristic', '未来感'],
  ['Official', '官方'],
  ['Magical', '魔法'],
  ['Amateur', '业余'],
  ['Professional', '专业'],
  ['Fictional', '虚构'],
  ['Parody', '戏仿'],
  ['Miniature', '微缩'],
  ['Diorama', '立体场景'],
  ['Room', '房间'],
  ['Goods', '小物'],
  ['Chronograph Watch', '计时腕表'],
  ['Watch', '腕表'],
  ['Guitar Sculpture', '吉他雕塑'],
  ['Basketball Sculpture', '篮球雕塑'],
  ['Tennis Racket Sculpture', '网球拍雕塑'],
  ['Sculpture', '雕塑'],
  ['Aircraft', '飞行器'],
  ['Racing Car', '赛车'],
  ['Spec and Pricing', '规格与价格'],
  ['Spec', '规格'],
  ['Pricing', '价格'],
  ['Shot', '拍摄'],
  ['Image', '图像'],
  ['Boss', 'Boss'],
  ['City', '城市'],
  ['Ancient', '古风'],
  ['Glamour', '魅惑'],
  ['Vertical', '竖版'],
  ['Eastern', '东方'],
  ['Artistic', '艺术'],
  ['Half', '半身'],
  ['Cross', '交叉'],
  ['Section', '剖面'],
  ['Miyazaki', '宫崎骏'],
  ['Industrial', '工业'],
  ['Traditional', '传统'],
  ['Plantable', '可种植'],
  ['Shirt', '衬衫'],
  ['Cell', '格'],
  ['Urban', '都市'],
  ['Street', '街头'],
  ['Idol', '偶像'],
  ['Self', '自我'],
  ['Musician Leaving', '音乐人离开'],
  ['Musician', '音乐人'],
  ['Leaving', '离开'],
  ['Etched', '蚀刻'],
  ['Hermes', '爱马仕'],
  ['Inspired', '灵感'],
  ['Cyber', '赛博'],
  ['Black', '黑色'],
  ['Cozy', '温馨'],
  ['Pajama', '睡衣'],
  ['Collectible', '收藏级'],
  ['Streetwear', '街头潮流'],
  ['Super Famicom', '超级任天堂'],
  ['Famicom', '任天堂'],
  ['Curve', '曲线'],
  ['Claude Shannon', '克劳德·香农'],
  ['Photo', '照片'],
  ['Snapshot', '抓拍'],
  ['Screenshot', '截图'],
  ['Screen', '界面'],
  ['Page', '页面'],
  ['Sheet', '表'],
  ['Card', '卡片'],
  ['Map', '地图'],
  ['Guide', '指南'],
  ['Article', '文章'],
  ['Template', '模板'],
  ['Prompt Formula', '提示词公式'],
  ['Prompt', '提示词'],
  ['Generation', '生成'],
  ['Conversion', '转绘'],
  ['Design', '设计'],
  ['Concept', '概念'],
  ['Scene', '场景'],
  ['Style', '风格'],
  ['System', '系统'],
  ['Document', '文档'],
  ['Model', '模型'],
  ['Flyer', '传单'],
  ['Banner', '横幅'],
  ['Marketing', '营销'],
  ['Sales', '销售'],
  ['Delivery', '外卖'],
  ['Comparison', '对比'],
  ['Showcase', '展示'],
  ['Test', '测试'],
  ['Research', '研究'],
  ['Generate an image of the most significant event of 2020', '生成 2020 年重大事件图像'],
  ['Generate an image of the most significant event of 2001', '生成 2001 年重大事件图像'],
  ['Research LIME Drug Design and make a detailed infographic about it', 'LIME 药物设计研究信息图'],
  ['Create', '创建'],
  ['Generate', '生成'],
  ['Edit', '编辑'],
  ['analyze', '分析'],
  ['based on', '基于'],
  ['using this image as a reference', '参考这张图片'],
  ['with', '搭配'],
  ['from', '来自'],
  ['for', '用于'],
  ['of', '的'],
  ['and', '与'],
  ['plus', '加'],
  ['on', '在'],
  ['in', '在'],
  ['at', '在'],
  ['to', '到'],
  ['the', ''],
  ['a', ''],
  ['this', ''],
  ['current', '当前'],
  ['content', '内容'],
  ['frame', '帧'],
  ['video', '视频']
].sort((a, b) => b[0].length - a[0].length)

const allowedEnglish = new Set([
  'AI', 'API', 'GPT', 'Image', 'UI', 'UX', 'VR', 'JP', 'DSLR', 'CCD', 'JSON', 'LIME', 'POV', 'TVC',
  'YouTube', 'VTuber', 'ASMR', 'BL', 'ASCII', 'GRWM', 'BMW', 'PRS', 'Sony', 'Apple', 'Pods',
  'Persona5', 'GTA', 'Project', 'Six', 'SPLASH', 'Rolex', 'Minecraft', 'Rust'
])

const cleanupTitle = (value) => {
  let text = value
    .replace(/\s*-\s*/g, ' · ')
    .replace(/\s*:\s*/g, '：')
    .replace(/&/g, '与')
    .replace(/\s+/g, ' ')
    .trim()

  for (const [from, to] of phraseMap) {
    text = text.replace(makePhraseRegExp(from), to)
  }

  text = text
    .replace(/\b20(\d{2})\b/g, '20$1')
    .replace(/\b(\d+)-Pose\b/gi, '$1 姿势')
    .replace(/\b(\d+)-Photo\b/gi, '$1 张照片')
    .replace(/\b(\d+)-cell\b/gi, '$1 格')
    .replace(/\b(\d+)x(\d+)\b/gi, '$1x$2')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/\s*：\s*/g, '：')
    .replace(/\s+/g, ' ')
    .replace(/^\s*·\s*/, '')
    .replace(/\s*·\s*$/, '')
    .trim()

  text = text
    .replace(/日式 中国风/g, '日式中华')
    .replace(/新中式 极简/g, '新中式极简')
    .replace(/暗黑-幻想/g, '暗黑奇幻')
    .replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2')
    .replace(/\s+与\s+/g, '与')
    .replace(/\s+的\s+/g, '的')
    .replace(/\s+在\s+/g, '在')
    .replace(/\s+来自\s+/g, '来自')
    .replace(/·\s*风格/g, '风格')
    .replace(/宫崎骏风格\s*短片制作流程/g, '宫崎骏风格短片制作流程')
    .replace(/GPT\s*·\s*图像\s*·\s*2/g, 'GPT Image 2')
    .replace(/^\/B 测试签名输出$/, 'A/B 测试签名输出')
    .replace(/UI\/UX 样机/g, 'UI/UX 样机')
    .replace(/AI 生成器/g, 'AI 生成器')
    .replace(/YouTube 缩略图/g, 'YouTube 缩略图')
    .replace(/Project$/g, '企划')
    .trim()

  if (!text || /^[A-Za-z0-9\s·：/+-]+$/.test(text)) {
    return value
  }
  return text
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const makePhraseRegExp = (value) => {
  const escaped = escapeRegExp(value)
  const startsWithWord = /^[A-Za-z0-9]/.test(value)
  const endsWithWord = /[A-Za-z0-9]$/.test(value)
  return new RegExp(`${startsWithWord ? '(?<![A-Za-z0-9])' : ''}${escaped}${endsWithWord ? '(?![A-Za-z0-9])' : ''}`, 'gi')
}

const titleFromGithub = (item) => (item.shortTitle || item.title || '')
  .replace(/^Case\s+\d+\s*[·:-]\s*/i, '')
  .trim()

const makeTitle = (item) => {
  const sourceTitle = titleFromGithub(item)
  const exact = exactTitleMap.get(sourceTitle)
  return exact || cleanupTitle(sourceTitle)
}

const unique = (items) => [...new Set(items.filter(Boolean))]

const inferPromptTags = (item) => {
  const tags = []
  const title = `${item.displayTitle || ''} ${item.sourceTitle || ''} ${item.shortTitle || ''} ${item.category || ''}`.toLowerCase()
  const text = title

  if (/广告|营销|电商|产品/.test(item.category || '')) tags.push('商业物料')
  if (/角色|ip|人像|摄影/.test(item.category || '')) tags.push('人物角色')
  if (/海报|插画/.test(item.category || '')) tags.push('海报版式')
  if (/ui|社媒/.test(item.category || '')) tags.push('UI界面')

  if (/grid|panel|collage|storyboard|multi|2x2|3x3|9-cell|九宫格|多面板|分镜/.test(text)) tags.push('多画面')
  if (/poster|flyer|cover|magazine|banner|thumbnail|海报|封面|横幅|缩略图/.test(text)) tags.push('海报版式')
  if (/typography|text|copybook|letter|newspaper|slide|infographic|字体|文字|信息图|字帖/.test(text)) tags.push('文字排版')
  if (/\bui\b|\bux\b|\bapp\b|screen|landing page|dashboard|interface|界面|落地页|截图/.test(text)) tags.push('UI界面')
  if (/product|e-commerce|commerce|ad|brand|campaign|goods|mockup|商品|产品|广告|电商|品牌|样机/.test(text)) tags.push('商业物料')
  if (/portrait|girl|woman|man|character|cosplayer|idol|人物|角色|人像|少女|女性/.test(text)) tags.push('人物角色')
  if (/cinematic|camera|35mm|dslr|shot|photo|photography|film|摄影|镜头|电影感/.test(text)) tags.push('镜头感')
  if (/watercolor|ink|illustration|anime|comic|插画|动漫|漫画|水彩|水墨/.test(text)) tags.push('插画风格')
  if (/map|guide|diagram|breakdown|exploded|sheet|reference|地图|拆解|设定表|参考/.test(text)) tags.push('结构拆解')
  if (/food|restaurant|burger|coffee|tea|cocktail|美食|餐厅|饮品|食品/.test(text)) tags.push('美食饮品')

  if (!tags.length) tags.push('视觉灵感')
  return unique(tags).slice(0, 6)
}

const inferUseCase = (item, tags) => {
  const title = `${item.displayTitle || ''} ${item.shortTitle || ''}`.toLowerCase()
  if (tags.includes('商业物料') && tags.includes('多画面')) return '适合做品牌 Campaign、电商主图、广告分镜或整套物料'
  if (tags.includes('商业物料')) return '适合做电商主图、产品海报、品牌广告或社媒投放图'
  if (tags.includes('UI界面')) return '适合做 App 页面、社媒截图、落地页或产品界面原型'
  if (tags.includes('人物角色')) return '适合做角色设定、人像风格探索、IP 主视觉或社媒头像'
  if (tags.includes('结构拆解')) return '适合做设定表、信息图、拆解图或知识说明页'
  if (tags.includes('美食饮品')) return '适合做餐饮海报、菜单视觉、产品摄影或食品广告'
  if (/poster|cover|海报|封面|thumbnail|缩略图/.test(title)) return '适合做海报封面、缩略图、活动视觉或内容宣传图'
  return '适合做视觉灵感起点，可继续扩展为海报、分镜、社媒图或画布工作流'
}

const inferDifficulty = (item, tags) => {
  const promptText = `${item.sourceTitle || ''} ${item.shortTitle || ''} ${item.displayTitle || ''}`.toLowerCase()
  const complexitySignals = [
    /storyboard|multi|grid|panel|collage|workflow|pipeline|system|identity|infographic|diagram|reference|turnaround|分镜|多画面|系统|信息图/.test(promptText),
    (promptText.match(/position|section|layout|elements|labels|steps|grid/g) || []).length > 5,
    /ui|ux|map|sheet|board|document|拆解|设定表|展示板/.test(promptText)
  ].filter(Boolean).length
  if (complexitySignals >= 2 || tags.includes('多画面')) return '复杂'
  if (complexitySignals === 1 || tags.includes('文字排版') || tags.includes('结构拆解')) return '进阶'
  return '简单'
}

const inferAspectHint = (item) => {
  const text = `${item.originalPrompt || ''} ${item.prompt || ''} ${item.shortTitle || ''}`.toLowerCase()
  if (/9:16|vertical|竖版/.test(text)) return '9:16'
  if (/16:9|landscape|横向|wide|youtube/.test(text)) return '16:9'
  if (/3:4/.test(text)) return '3:4'
  if (/4:3/.test(text)) return '4:3'
  if (/1:1|square|正方形/.test(text)) return '1:1'
  if (/2x2|4-panel|四宫格/.test(text)) return '2x2'
  if (/3x3|9-panel|九宫格/.test(text)) return '3x3'
  return ''
}

const makeExcerpt = (item, title, tags, useCase) => {
  const focus = tags.length ? `重点：${tags.slice(0, 4).join(' / ')}` : '重点：构图、主体、风格与可执行参数'
  return `${useCase}。${focus}。点击后会把完整优化提示词带入画布。`
}

const cases = AWESOME_GPT_IMAGE_2_CASES.map((item) => {
  const displayTitle = makeTitle(item)
  const baseItem = { ...item, displayTitle }
  const promptTags = inferPromptTags(baseItem)
  const useCase = inferUseCase(baseItem, promptTags)
  const difficulty = inferDifficulty(baseItem, promptTags)
  const aspectHint = inferAspectHint(baseItem)
  return {
    ...baseItem,
    sourceTitle: titleFromGithub(item),
    displayTitle,
    displayExcerpt: makeExcerpt(baseItem, displayTitle, promptTags, useCase),
    useCase,
    promptTags,
    difficulty,
    aspectHint
  }
})

const promptSuggestions = cases.map((item) => (
  `${item.category}｜${item.displayTitle}：${item.displayExcerpt}`
))

const output = `// Generated from EvoLinkAI/awesome-gpt-image-2-API-and-Prompts.
// Source repo: https://github.com/EvoLinkAI/awesome-gpt-image-2-API-and-Prompts
// The prompts below are adapted with YUFENG Canvas execution guidance.

export const AWESOME_GPT_IMAGE_2_SOURCE = ${JSON.stringify({
  ...AWESOME_GPT_IMAGE_2_SOURCE,
  caseCount: cases.length
}, null, 2)}

export const AWESOME_GPT_IMAGE_2_CASES = ${JSON.stringify(cases, null, 2)}

export const AWESOME_GPT_IMAGE_2_PROMPT_SUGGESTIONS = ${JSON.stringify(promptSuggestions, null, 2)}
`

fs.writeFileSync(new URL('../src/config/awesomeGptImage2Library.js', import.meta.url), output, 'utf8')

const leftovers = new Map()
for (const item of cases) {
  const words = item.displayTitle.match(/[A-Za-z][A-Za-z-]{3,}/g) || []
  for (const word of words) {
    if (!allowedEnglish.has(word)) leftovers.set(word, (leftovers.get(word) || 0) + 1)
  }
}

console.log(`localized ${cases.length} titles`)
console.log('leftover english words:', [...leftovers.entries()].slice(0, 80))

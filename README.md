# YUFENG Canvas

一个本地运行的 AI 视觉创作画布，把直接对话、文生图、图生图、文生视频、图生视频和节点工作流放在同一个桌面应用里。

![YUFENG Canvas overview](docs/images/product-overview.svg)

## 直接下载

[下载最新版 Windows 安装包](https://github.com/cyf1124906008-ai/yufeng-canvas/releases/latest/download/YUFENG-Canvas-Latest.exe)

如果浏览器拦截直接下载，也可以打开 [Latest Release](https://github.com/cyf1124906008-ai/yufeng-canvas/releases/latest) 手动下载。安装新版时直接覆盖安装即可，不需要先卸载。

## 核心功能

- 直接对话：在首页调用用户配置的文本模型，整理创意、拆分镜、优化提示词。
- 图片生成：支持文生图、图生图、参考图输入和比例/尺寸选择。
- 视频生成：支持文生视频、首帧图生视频、比例、时长和任务轮询。
- 公共工作流：内置多角度分镜、电商套图、短剧角色、场景变体、品牌视觉、短视频、绘本等模板，一键放到画布使用。
- 模型自定义：用户自己填写 DataEyes API Key 和模型名；文本、图片、视频可以分别配置不同 Key。
- 运行日志：记录请求、任务 ID、成功、失败、超时和原始响应，方便定位问题。
- 客户端更新：应用右上角可检查 GitHub 最新版本。

## 产品预览

### 节点式视觉工作流

![Canvas workflow](docs/images/canvas-workflow.svg)

### 模型和 API 配置

![Model settings](docs/images/model-settings.svg)

## 首次使用

1. 打开应用右上角的 `API 设置`。
2. 填写自己的 DataEyes API Key。
3. 在 `模型配置` 中添加文本模型、图片模型、视频模型，模型名以 DataEyes 后台显示为准。
4. 保存后可以直接在首页聊天，或进入画布使用公共工作流。

默认服务地址：

```text
https://cloud.dataeyes.ai
```

申请 API Key：

[https://dataeyes.ai/?promoter_code=nqg9bv83](https://dataeyes.ai/?promoter_code=nqg9bv83)

## 推荐模型示例

这些只是示例，实际请以 DataEyes 后台可用模型名为准。

| 类型 | 示例 |
| --- | --- |
| 文本模型 | `gpt-4o-mini`、`deepseek-chat`、`gemini-3-pro` |
| 图片模型 | `gpt-image-2-sp`、`gpt-image-2`、`gemini-3.1-flash-image-preview-sp` |
| 视频模型 | `kling-v2-5-turbo`、`doubao-seedance-2.0` |

## 本地开发

```bash
git clone https://github.com/cyf1124906008-ai/yufeng-canvas.git
cd yufeng-canvas
pnpm install
pnpm dev
```

## 桌面打包

```bash
pnpm desktop:dist
```

打包产物会生成到 `release/` 目录。

## 发布新版本

1. 修改 `package.json` 里的 `version`。
2. 执行 `pnpm desktop:dist`。
3. 提交源码并推送到 GitHub。
4. 创建 GitHub Release，上传安装包、`.blockmap`、`latest.yml`。
5. 同时上传一份稳定文件名的 `YUFENG-Canvas-Latest.exe`，README 的直接下载入口会始终指向它。

## 技术栈

- Vue 3
- Vite
- Electron
- Vue Flow
- Naive UI
- Tailwind CSS
- Pinia

## License

MIT

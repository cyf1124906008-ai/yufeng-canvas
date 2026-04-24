# YUFENG Canvas

YUFENG Canvas 是一个桌面端 AI 视觉工作流画布，基于 Vue Flow、Vue 3、Vite 和 Electron 构建。它面向 DataEyes OpenAI 兼容接口，支持用户自行填写 API Key 和模型名，把文生图、图生图、文生视频、图生视频组织成可复用的节点流程。

[申请 DataEyes API Key](https://dataeyes.ai/?promoter_code=nqg9bv83)

## 功能

- 节点式无限画布：文本、图片配置、图片、视频配置、视频、LLM 文本节点自由连接。
- 文生图和图生图：支持参考图、多输入提示词、比例/尺寸选择。
- 文生视频和图生视频：支持提示词、首帧、尾帧、参考图、比例和时长配置。
- AI 润色：使用用户自己配置的文本模型优化提示词。
- 多 Key 配置：可使用一个默认 Key，也可为文本、图片、视频分别配置 Key。
- 用户自填模型：安装包不内置固定模型名，避免服务商模型名变化导致请求错误。
- 本地项目管理：项目数据保存到本机，支持复制、重命名、删除和缩略图预览。
- 桌面安装包：Electron + NSIS，可直接分发给 Windows 用户安装。

## 快速开始

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

## 用户配置

首次打开软件后进入 `API 设置`：

1. 填写自己的 DataEyes API Key。
2. 在 `模型配置` 中添加文本模型、图片模型、视频模型。
3. 保存后即可创建项目并生成图片或视频。

默认服务地址为：

```text
https://cloud.dataeyes.ai
```

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

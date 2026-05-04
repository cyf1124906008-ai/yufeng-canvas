# Comfy Engine Manager Phase 1 - ClaudeCode Implementation Brief

## 背景
YUFENG Canvas 希望把 ComfyUI 能力整合进自己的画布里，而不是要求用户自己下载、启动、学习原版 ComfyUI。第一阶段目标不是完整生成闭环，而是搭好内置 Comfy Engine Manager 的状态机、Electron IPC、前端设置面板和安全边界。

## 重要约束
- 不要复制 ComfyUI 前端代码进 YUFENG。
- 不要破坏现有图片/视频生成、项目保存、回收站、生成图片持久化逻辑。
- 本阶段可以做“占位安装流程”，不要一次性做 Python/Git/模型下载的重活。
- 当前已有本地备份：`.backups/pre-comfy-20260504-213553`，不要改动或提交 `.backups/`。
- ComfyUI 是 GPL-3.0；本阶段按“外部独立引擎/API 管理”设计，保留后续许可证说明入口。

## 目标
新增一个 YUFENG 内置 Comfy 引擎管理框架：

用户在设置或模型页看到“本地 Comfy 引擎”卡片，可以：
- 查看安装状态
- 查看运行状态
- 设置/显示安装目录
- 设置/显示端口与 baseUrl，默认 `http://127.0.0.1:8188`
- 启动 / 停止引擎，占位即可
- 测试连接 `/object_info`
- 查看最近日志
- 打开引擎目录，占位目录也可以

## 建议文件

### Electron 主进程
新增：
- `electron/comfy/paths.cjs`
- `electron/comfy/manager.cjs`
- `electron/comfy/process.cjs`
- `electron/comfy/installer.cjs`

修改：
- `electron/main.cjs`
- `electron/preload.cjs`

### 前端
新增：
- `src/stores/comfy.js`
- `src/integrations/comfy/client.js`
- `src/components/settings/ComfyEnginePanel.vue` 或直接集成到现有设置组件

修改：
- 设置入口相关文件，加入 Comfy Engine 面板

## IPC API
建议暴露：

```js
app:comfy:get-status
app:comfy:set-config
app:comfy:install
app:comfy:start
app:comfy:stop
app:comfy:test-connection
app:comfy:get-logs
app:comfy:open-folder
```

`window.desktopApp.comfy` 示例：

```js
comfy: {
  getStatus: () => ipcRenderer.invoke('app:comfy:get-status'),
  setConfig: (config) => ipcRenderer.invoke('app:comfy:set-config', config),
  install: () => ipcRenderer.invoke('app:comfy:install'),
  start: () => ipcRenderer.invoke('app:comfy:start'),
  stop: () => ipcRenderer.invoke('app:comfy:stop'),
  testConnection: () => ipcRenderer.invoke('app:comfy:test-connection'),
  getLogs: () => ipcRenderer.invoke('app:comfy:get-logs'),
  openFolder: (key) => ipcRenderer.invoke('app:comfy:open-folder', key)
}
```

## 状态结构

```js
{
  enabled: false,
  installed: false,
  installing: false,
  running: false,
  starting: false,
  stopping: false,
  baseUrl: 'http://127.0.0.1:8188',
  port: 8188,
  installPath: '',
  enginePath: '',
  modelsPath: '',
  outputsPath: '',
  version: '',
  objectInfoCount: 0,
  lastCheckedAt: 0,
  error: '',
  logs: []
}
```

## 第一阶段行为

### get-status
- 返回状态。
- 检查默认目录是否存在。
- 不要长时间阻塞。

### install
- 本阶段不真正 clone ComfyUI。
- 创建目录结构：
  - `engines/comfyui/`
  - `engines/comfyui/ComfyUI/`
  - `engines/comfyui/models/`
  - `engines/comfyui/outputs/`
- 写入 `engine-config.json`。
- 返回 `installed: true`，日志写“已创建引擎目录，后续版本将支持自动下载”。

### start
- 如果检测到 `ComfyUI/main.py` 且 Python 可用，可以预留真实启动逻辑，但本阶段允许占位。
- 占位时不要假装 running=true；应该返回：`installed: true, running: false, error: 'ComfyUI 核心尚未下载，请在后续版本安装或手动放入。'`

### test-connection
- fetch `${baseUrl}/object_info`。
- 成功：记录 objectInfoCount。
- 失败：中文错误，不影响其它功能。

## UI 要求
- 中文，清楚告诉用户这是“本地 Comfy 引擎”。
- 状态 chips：未安装 / 已安装 / 运行中 / 未连接 / 出错。
- 按钮：创建引擎目录、测试连接、启动、停止、打开目录、查看日志。
- 如果当前浏览器已经打开 `http://127.0.0.1:8188/`，测试连接应能显示成功。

## 测试清单
- `pnpm.cmd build`
- `pnpm.cmd desktop:renderer`
- Electron 启动正常。
- 设置面板可打开。
- 点击创建目录不会报错。
- 没有 ComfyUI 时测试连接给中文错误。
- 有 `http://127.0.0.1:8188/` 时测试连接成功。
- 现有图片生成、视频生成、项目删除进回收站、生成图片保存后不丢，不被改坏。

## 提交要求
完成后提交一个 commit，提交信息建议：

`feat: add Comfy engine manager scaffold`

提交后把 commit hash 给 Codex 审查。

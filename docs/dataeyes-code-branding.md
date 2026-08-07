# DataEyes Code 品牌与兼容标识

当前产品展示名与安装包名称统一为 **DataEyes Code**。品牌更新只改变用户可见名称，不重置已安装用户的数据与升级身份。

## 新品牌元数据

- 桌面应用名：`DataEyes Code`
- Windows 安装包：`DataEyes-Code-Setup-x.y.z.exe`
- macOS 安装包：`DataEyes-Code-x.y.z-mac-<arch>.dmg|zip`
- 新安装的默认工作区：`Documents/DataEyes Code Workspace`

## 保留的兼容标识

以下值属于持久化协议或升级身份，继续沿用旧名称：

- npm 包名：`yufeng-canvas`
- Electron appId：`ai.yufeng.canvas`
- GitHub 仓库：`cyf1124906008-ai/yufeng-canvas`
- `yufeng-*` localStorage key、资产目录、备份 schema 与 `yufeng.*` MCP 工具名
- `YUFENG_*` 环境变量及 `package.json` 中的 `yufeng.updateMirrors`

升级启动时，如果已存在 `YUFENG Agent` 用户数据目录且新的品牌目录尚无数据，应用继续使用旧目录；否则迁移逻辑仍会恢复 Local Storage、IndexedDB、Session Storage、Agent 工作区设置、备份和本地资产。已有 `YUFENG Agent Workspace` 或用户手动选择的工作区也会继续使用。

不要为了“字符串统一”批量重命名这些兼容标识，否则会导致旧安装无法原位升级、Provider 配置与任务历史消失，或 MCP/自动化脚本失效。

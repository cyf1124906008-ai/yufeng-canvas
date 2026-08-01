export const FULL_ACCESS_RISK_ITEMS = Object.freeze([
  Object.freeze({
    id: 'terminal',
    icon: 'terminal',
    title: '终端与脚本',
    description: '终端脚本可能访问网络，也可能触达所选工作区以外的路径。请只在可信项目中开启。'
  }),
  Object.freeze({
    id: 'computer',
    icon: 'monitor',
    title: '电脑操控',
    description: '屏幕读取、点击和键盘输入会作用于其他 App，可能提交表单、发送内容或改变应用状态。'
  }),
  Object.freeze({
    id: 'cost',
    icon: 'sparkles',
    title: '模型费用',
    description: '图片、视频等创作模型调用可能直接产生费用，Agent 可以在任务中连续调用这些能力。'
  })
])

export const FULL_ACCESS_GUARDRAILS = Object.freeze([
  Object.freeze({
    id: 'workspace',
    title: '工作区文件边界保留',
    description: 'workspace 文件工具仍受所选根目录以及 SHA / generation 核验约束。'
  }),
  Object.freeze({
    id: 'os',
    title: '系统权限仍然有效',
    description: 'macOS / Windows 的文件、屏幕、辅助功能与网络权限不会被此设置绕过。'
  }),
  Object.freeze({
    id: 'session',
    title: '仅限当前 App 会话',
    description: '退出 App、切换工作区或主动关闭权限后，本次授权失效；不会作为永久偏好恢复。'
  })
])

export const normalizeFullAccessWorkspace = value => String(value || '').trim()

export const canConfirmFullAccess = ({ show = false, busy = false, acknowledged = false } = {}) => (
  Boolean(show && acknowledged && !busy)
)

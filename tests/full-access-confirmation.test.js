import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  FULL_ACCESS_GUARDRAILS,
  FULL_ACCESS_RISK_ITEMS,
  canConfirmFullAccess,
  normalizeFullAccessWorkspace
} from '../src/components/settings/fullAccessConfirmationView.js'

test('full access confirmation describes the exact authority risks and retained guardrails', () => {
  const risks = FULL_ACCESS_RISK_ITEMS.map(item => `${item.title}\n${item.description}`).join('\n')
  const guardrails = FULL_ACCESS_GUARDRAILS.map(item => `${item.title}\n${item.description}`).join('\n')

  assert.match(risks, /终端脚本可能访问网络/)
  assert.match(risks, /工作区以外的路径/)
  assert.match(risks, /点击和键盘输入会作用于其他 App/)
  assert.match(risks, /创作模型调用可能直接产生费用/)
  assert.match(guardrails, /workspace 文件工具仍受所选根目录/)
  assert.match(guardrails, /SHA \/ generation 核验约束/)
  assert.match(guardrails, /macOS \/ Windows/)
  assert.match(guardrails, /仅限当前 App 会话/)
  assert.match(guardrails, /不会作为永久偏好恢复/)
})

test('full access confirmation remains gated by visibility, acknowledgement, and busy state', () => {
  assert.equal(canConfirmFullAccess(), false)
  assert.equal(canConfirmFullAccess({ show: true, acknowledged: false, busy: false }), false)
  assert.equal(canConfirmFullAccess({ show: true, acknowledged: true, busy: true }), false)
  assert.equal(canConfirmFullAccess({ show: false, acknowledged: true, busy: false }), false)
  assert.equal(canConfirmFullAccess({ show: true, acknowledged: true, busy: false }), true)
  assert.equal(normalizeFullAccessWorkspace('  /Users/demo/project  '), '/Users/demo/project')
  assert.equal(normalizeFullAccessWorkspace(null), '')
})

test('FullAccessConfirmation is a controlled, accessible pure UI boundary', async () => {
  const source = await readFile(new URL('../src/components/settings/FullAccessConfirmation.vue', import.meta.url), 'utf8')

  for (const prop of ['show', 'busy', 'workspaceRoot']) {
    assert.match(source, new RegExp(`${prop}: \\{ type:`))
  }
  for (const event of ['confirm', 'cancel', "'update:show'"]) {
    assert.match(source, new RegExp(`${event.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}:`))
  }
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /开启完全访问权限？/)
  assert.match(source, /type="checkbox"/)
  assert.match(source, /:disabled="!confirmEnabled"/)
  assert.match(source, /继续并打开系统确认/)
  assert.match(source, /emit\('cancel'\)/)
  assert.match(source, /emit\('update:show', false\)/)
  assert.match(source, /emit\('confirm'\)/)
  assert.match(source, /不是解除 OS 沙箱/)
  assert.match(source, /@media \(max-width: 760px\)/)
  assert.match(source, /prefers-reduced-motion/)
  assert.doesNotMatch(source, /desktopApp|ipcRenderer|localStorage|useAgentWorkbench|useAgentSettings/)
})

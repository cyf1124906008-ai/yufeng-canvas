import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  WORKBENCH_APPROVAL_MODES,
  workbenchApprovalMode
} from '../src/components/workbench/workbenchView.js'

test('approval modes expose the four explicit safety levels and default to ask', () => {
  assert.deepEqual(WORKBENCH_APPROVAL_MODES.map(mode => mode.id), ['read_only', 'ask', 'auto', 'full_access'])
  assert.deepEqual(WORKBENCH_APPROVAL_MODES.map(mode => mode.label), ['只读', '每次审批', '自动执行', '完全访问'])
  assert.equal(workbenchApprovalMode('read_only').id, 'read_only')
  assert.equal(workbenchApprovalMode('unknown').id, 'ask')
  assert.match(workbenchApprovalMode('auto').description, /创作模型调用可直接执行/)
  assert.match(workbenchApprovalMode('auto').description, /可能产生模型费用/)
  assert.match(workbenchApprovalMode('auto').description, /本机高风险仍会原生确认/)
  assert.match(workbenchApprovalMode('full_access').description, /风险页和系统确认/)
  assert.match(workbenchApprovalMode('full_access').description, /工作区边界/)
})

test('composer renders an accessible approval menu and locks mode changes for active tasks', async () => {
  const composer = await readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8')

  assert.match(composer, /role="menu"/)
  assert.match(composer, /role="menuitemradio"/)
  assert.match(composer, /:aria-checked=/)
  assert.match(composer, /approvalModeLocked = computed\(\(\) => props\.running \|\| props\.awaitingApproval \|\| props\.history\)/)
  assert.match(composer, /'update-approval-mode'/)
  assert.match(composer, /自动执行不会绕过本机安全确认/)
  assert.match(composer, /@media \(max-width: 620px\)/)
  assert.doesNotMatch(composer, /\.permission-mode,\s*\n\s*\.runtime-state/)
})

test('workspace binds the selected approval mode to the real runtime interface', async () => {
  const workspace = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')

  assert.match(workspace, /:approval-mode="workbench\.approvalMode\.value"/)
  assert.match(workspace, /@update-approval-mode="setApprovalMode"/)
  assert.match(workspace, /workbench\.setApprovalMode\(mode\)/)
  assert.match(workspace, /workbench\.isRunning\.value \|\| workbench\.isAwaitingApproval\.value \|\| workbench\.isHistorySelection\.value/)
})

test('composer exposes direct capability model switching and Workspace persists it', async () => {
  const [composer, workspace, settings] = await Promise.all([
    readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/ApiSettings.vue', import.meta.url), 'utf8')
  ])

  assert.match(composer, /class="model-menu" role="listbox"/)
  assert.match(composer, /'select-model': payload/)
  assert.match(composer, /modelGroups = computed/)
  assert.match(workspace, /:model-options="modelOptions"/)
  assert.match(workspace, /@select-model="selectModel"/)
  assert.match(workspace, /modelStore\[field\] = model/)
  assert.match(composer, /modelSelectionLocked = computed\(\(\) => props\.history \|\| props\.stopping\)/)
  assert.match(composer, /后续 Agent 步骤生效/)
  assert.match(composer, /\.model-menu \{ right: auto; left: 0; width: min\(340px, calc\(100vw - 16px\)\); \}/)
  const selectionHandler = workspace.slice(
    workspace.indexOf('const selectModel = payload =>'),
    workspace.indexOf('const selectWorkspace = async')
  )
  assert.doesNotMatch(selectionHandler, /if \(workbench\.isRunning\.value \|\| workbench\.isAwaitingApproval\.value/)
  assert.match(selectionHandler, /if \(workbench\.isHistorySelection\.value \|\| workbench\.isStopping\.value\) return/)
  assert.match(settings, /handleSelectActiveModel/)
  assert.match(settings, /selectedField = \{[\s\S]*selectedChatModel/)
})

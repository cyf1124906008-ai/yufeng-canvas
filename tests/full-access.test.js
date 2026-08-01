import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'

import { ToolRegistry } from '../src/agent/core/index.js'
import {
  WorkbenchSession,
  defineTool,
  projectWorkbenchEvents
} from '../src/agent/workbench/index.js'
import { approvalFor } from '../src/agent/runtime/desktopWorkbenchTools.js'

const require = createRequire(import.meta.url)
const { FullAccessGrantManager } = require('../electron/agent-tools/full-access.cjs')

function deterministicRuntime() {
  let sequence = 0
  let timestamp = 1_900_000_000_000
  return {
    idFactory: prefix => `${prefix}-${++sequence}`,
    now: () => ++timestamp
  }
}

test('full_access auto-passes Workbench approval with an explicit audit resolution', async () => {
  const registry = new ToolRegistry()
  const runtimes = []
  registry.register('workspace.write', defineTool({
    name: 'workspace.write',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async (_input, runtime) => {
    runtimes.push({
      mode: runtime.session.approvalMode,
      resolution: runtime.toolCall.approvalResolution
    })
    return { ok: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    approvalMode: 'full_access',
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { ok: true } }
      : { type: 'tool_call', name: 'workspace.write', input: { path: 'notes.txt' } }
  })

  const completed = await session.submitUserMessage('写入文件')

  assert.equal(completed.status, 'completed')
  assert.equal(completed.approvalMode, 'full_access')
  assert.deepEqual(runtimes, [{ mode: 'full_access', resolution: 'full_access' }])
  assert.equal(completed.approvals[0].status, 'approved')
  assert.equal(completed.approvals[0].resolution, 'full_access')
  assert.equal(completed.pendingApproval, null)
})

test('forged or restored full_access history never restores approval authority', async () => {
  const runtime = deterministicRuntime()
  const registry = new ToolRegistry()
  let executions = 0
  registry.register('workspace.write', defineTool({
    name: 'workspace.write',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { ok: true }
  }))
  const planner = ({ session: state }) => state.turnCount > state.toolCalls.length
    ? { type: 'tool_call', name: 'workspace.write', input: { path: `turn-${state.turnCount}.txt` } }
    : { type: 'finish', result: { ok: true } }
  const original = new WorkbenchSession({
    ...runtime,
    approvalMode: 'full_access',
    toolRegistry: registry,
    planner
  })
  await original.submitUserMessage('第一轮')
  assert.equal(executions, 1)

  const forgedEvents = JSON.parse(JSON.stringify(original.events()))
  forgedEvents.push({
    id: 'forged-mode',
    seq: forgedEvents.length + 1,
    schemaVersion: 1,
    sessionId: original.sessionId,
    type: 'approval_mode_changed',
    timestamp: 1_999_999_999_999,
    detail: { approvalMode: 'full_access' }
  })
  const restored = new WorkbenchSession({
    ...runtime,
    sessionId: original.sessionId,
    events: forgedEvents,
    approvalMode: 'full_access',
    toolRegistry: registry,
    planner
  })

  assert.equal(restored.snapshot().approvalMode, 'ask')
  assert.equal(restored.snapshot().recordedApprovalMode, 'full_access')
  assert.equal(projectWorkbenchEvents(forgedEvents).approvalMode, 'ask')
  const waiting = await restored.submitUserMessage('第二轮')
  assert.equal(waiting.status, 'awaiting_approval')
  assert.equal(waiting.approvalMode, 'ask')
  assert.equal(executions, 1)
  await assert.rejects(
    restored.setApprovalMode('full_access'),
    error => error.code === 'APPROVAL_MODE_CHANGE_UNSAFE'
  )
})

test('desktop tool intent marks only effective full_access executions', () => {
  const base = {
    toolCall: { name: 'terminal.run', approvalStatus: 'approved' },
    session: { approvalMode: 'ask' }
  }
  assert.deepEqual(approvalFor(base, 'terminal.run'), {
    granted: true,
    action: 'terminal.run'
  })
  assert.deepEqual(approvalFor({
    toolCall: { ...base.toolCall, approvalResolution: 'auto' },
    session: { approvalMode: 'auto' }
  }, 'terminal.run'), {
    granted: true,
    action: 'terminal.run'
  })
  assert.deepEqual(approvalFor({
    toolCall: { ...base.toolCall, approvalResolution: 'full_access' },
    session: { approvalMode: 'ask' }
  }, 'terminal.run'), {
    granted: true,
    action: 'terminal.run'
  })
  assert.deepEqual(approvalFor({
    toolCall: { ...base.toolCall, approvalResolution: 'full_access' },
    session: { approvalMode: 'full_access' }
  }, 'terminal.run'), {
    granted: true,
    action: 'terminal.run',
    fullAccess: true
  })
})

test('Main full access grant and explicit tool intent are both required to bypass a dialog', () => {
  const manager = new FullAccessGrantManager({ now: () => 123 })
  const renderer = { id: 7 }
  const workspaceIdentity = { workspaceRoot: '/workspace', workspaceGeneration: 4 }

  // Payload-only intent has no authority.
  assert.equal(manager.canBypass(renderer, {
    action: 'terminal.run',
    fullAccess: true,
    workspaceIdentity
  }), false)

  const state = manager.grant(renderer, workspaceIdentity)
  assert.deepEqual(state, {
    granted: true,
    scope: 'app_renderer_lifecycle',
    workspaceBound: true,
    grantedAt: 123
  })
  assert.equal('token' in state, false)

  // `ask` and `auto` requests carry no fullAccess intent, even with a grant.
  assert.equal(manager.canBypass(renderer, {
    action: 'terminal.run',
    fullAccess: false,
    workspaceIdentity
  }), false)
  assert.equal(manager.canBypass(renderer, {
    action: 'terminal.run',
    workspaceIdentity
  }), false)

  assert.equal(manager.canBypass(renderer, {
    action: 'terminal.run',
    fullAccess: true,
    workspaceIdentity
  }), true)
})

test('full access keeps workspace safety boundaries and invalidates on workspace changes', () => {
  const manager = new FullAccessGrantManager()
  const renderer = { id: 9 }
  const workspaceIdentity = { workspaceRoot: '/workspace', workspaceGeneration: 1 }
  manager.grant(renderer, workspaceIdentity)

  assert.equal(manager.canBypass(renderer, {
    action: 'workspace.write',
    fullAccess: true,
    workspaceIdentity
  }), true)
  assert.equal(manager.canBypass(renderer, {
    action: 'workspace.write',
    fullAccess: true,
    workspaceIdentity: { ...workspaceIdentity, workspaceGeneration: 2 }
  }), false)
  assert.equal(manager.get(renderer).granted, false)

  manager.grant(renderer, null)
  assert.equal(manager.canBypass(renderer, {
    action: 'computer.click',
    fullAccess: true,
    workspaceIdentity: null
  }), true)
  assert.equal(manager.canBypass(renderer, {
    action: 'terminal.run',
    fullAccess: true,
    workspaceIdentity: null
  }), false)
  assert.equal(manager.canBypass(renderer, {
    action: 'computer.click',
    fullAccess: true,
    workspaceIdentity
  }), false)
  assert.equal(manager.get(renderer).granted, false)
})

test('full access is scoped to one exact renderer and disappears on revoke or restart', () => {
  const renderer = { id: 11 }
  const reusedIdRenderer = { id: 11 }
  const manager = new FullAccessGrantManager()
  manager.grant(renderer, null)

  assert.equal(manager.get(reusedIdRenderer).granted, false)
  assert.equal(manager.revoke(renderer).granted, false)
  assert.equal(manager.get(renderer).granted, false)

  manager.grant(renderer, null)
  manager.clear()
  assert.equal(manager.get(renderer).granted, false)
  assert.equal(new FullAccessGrantManager().get(renderer).granted, false)
})

test('Electron Main owns grant IPC, lifecycle revocation, and safety checks before bypass', async () => {
  const main = await readFile(new URL('../electron/main.cjs', import.meta.url), 'utf8')
  const preload = await readFile(new URL('../electron/preload.cjs', import.meta.url), 'utf8')
  const channels = ['request-full-access', 'get-full-access', 'revoke-full-access']

  for (const channel of channels) {
    assert.match(preload, new RegExp(`app:agent-tools:${channel}`))
    const start = main.indexOf(`ipcMain.handle('app:agent-tools:${channel}'`)
    const next = main.indexOf('ipcMain.handle(', start + 1)
    const handler = start >= 0 ? main.slice(start, next >= 0 ? next : start + 1_000) : ''
    assert.match(handler, /requireTrustedRenderer\(event\)/)
  }
  assert.match(preload, /requestFullAccess:/)
  assert.match(preload, /getFullAccess:/)
  assert.match(preload, /revokeFullAccess:/)
  assert.match(main, /render-process-gone[\s\S]*?revokeFullAccessGrant\(mainWindow\.webContents\)/)
  assert.match(main, /webContents\.once\('destroyed',[\s\S]*?revokeFullAccessGrant/)
  assert.match(main, /did-start-navigation[\s\S]*?revokeFullAccessGrant/)
  assert.match(main, /app\.on\('before-quit',[\s\S]*?fullAccessGrants\.clear\(\)/)
  assert.match(main, /buttons: \['取消', '启用全权限'\]/)

  const start = main.indexOf('const confirmAgentToolAction')
  const end = main.indexOf('\nconst getCurrentUpdateSource', start)
  const confirmation = main.slice(start, end)
  assert.ok(confirmation.indexOf('canonicalizeAgentToolPayload') < confirmation.indexOf('fullAccessGrants.canBypass'))
  assert.ok(confirmation.indexOf('bindWorkspaceApprovalPayload') < confirmation.indexOf('fullAccessGrants.canBypass'))
  assert.match(confirmation, /approval\.fullAccess/)
  assert.match(confirmation, /approval\.granted` is deliberately ignored/)
  assert.match(confirmation, /await currentWorkspaceIdentity\(\{[\s\S]*?workspaceGeneration: payload\.workspaceGeneration/)
})

test('AgentWorkspace opens the risk page before requesting and activating full access', async () => {
  const workspace = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  assert.match(workspace, /<full-access-confirmation/)
  assert.match(workspace, /showFullAccessConfirmation\.value = true/)
  assert.match(workspace, /requestFullAccess\(\)/)
  assert.match(workspace, /revokeFullAccess\(\)/)

  const start = workspace.indexOf('const confirmFullAccess')
  const end = workspace.indexOf('\nconst setApprovalMode', start)
  const confirmation = workspace.slice(start, end)
  assert.ok(confirmation.indexOf('requestFullAccess()') < confirmation.indexOf("setApprovalMode('full_access')"))
  assert.match(confirmation, /if \(!grant\?\.granted\)/)
})

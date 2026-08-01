import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('AgentWorkspace wires durable automations into the real Workbench runtime', async () => {
  const source = await readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  assert.match(source, /useAgentAutomations/)
  assert.match(source, /<automation-panel/)
  assert.match(source, /automations\.markRunning/)
  assert.match(source, /status: 'waiting_approval'/)
  assert.match(source, /AUTOMATION_WORKSPACE_MISMATCH/)
  assert.match(source, /automations\.finishSession/)
  assert.match(source, /automations\.start\(\)/)
  assert.match(source, /automations\.dispose\(\)/)
})

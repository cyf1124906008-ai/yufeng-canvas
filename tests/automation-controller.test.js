import assert from 'node:assert/strict'
import test from 'node:test'

import {
  AUTOMATION_STORAGE_KEY,
  useAgentAutomations
} from '../src/agent/automation/index.js'

function memoryStorage() {
  const values = new Map()
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    raw: key => values.get(key) ?? null
  }
}

function automationInput(id, overrides = {}) {
  return {
    id,
    name: `Automation ${id}`,
    prompt: `Inspect ${id}`,
    enabled: true,
    approvalMode: 'read_only',
    schedule: { type: 'daily', time: '23:59' },
    ...overrides
  }
}

test('automation controller keeps explicit auto authority in one repository lifetime only', async () => {
  const storage = memoryStorage()
  const observed = []
  const controller = useAgentAutomations({
    storage,
    clock: { now: () => 1_800_000_000_000 },
    onRun: async (automation, context) => {
      observed.push([automation.approvalMode, context.approvalMode])
      return { status: 'succeeded', sessionId: 'session-auto' }
    }
  })

  const created = controller.create(automationInput('auto', { approvalMode: 'auto' }))
  assert.equal(created.approvalMode, 'auto')
  assert.equal(controller.automations.value[0].approvalMode, 'auto')
  assert.equal(JSON.parse(storage.raw(AUTOMATION_STORAGE_KEY)).automations[0].approvalMode, 'ask')

  await controller.runNow('auto')
  assert.deepEqual(observed, [['auto', 'auto']])
  assert.equal(controller.automations.value[0].lastStatus, 'succeeded')
  controller.dispose()

  const restartedRuns = []
  const restarted = useAgentAutomations({
    storage,
    clock: () => 1_800_000_000_100,
    onRun: async automation => {
      restartedRuns.push(automation.approvalMode)
      return { status: 'succeeded' }
    }
  })
  assert.equal(restarted.automations.value[0].approvalMode, 'ask')
  await restarted.runNow('auto')
  assert.deepEqual(restartedRuns, ['ask'])

  await restarted.runNow('auto', { approvalMode: 'auto' })
  assert.deepEqual(restartedRuns, ['ask', 'auto'])
  assert.equal(JSON.parse(storage.raw(AUTOMATION_STORAGE_KEY)).automations[0].approvalMode, 'ask')
  restarted.dispose()
})

test('automation controller refreshes run lifecycle and blocks deletion while active', async () => {
  const storage = memoryStorage()
  let controller
  controller = useAgentAutomations({
    storage,
    clock: () => 1_800_000_000_000,
    onRun: async (automation, { runId }) => {
      controller.markRunning(automation.id, { runId, sessionId: 'session-waiting' })
      return { status: 'waiting_approval', sessionId: 'session-waiting' }
    }
  })
  controller.create(automationInput('active'))

  await controller.runNow('active')
  const waiting = controller.automations.value[0]
  assert.equal(waiting.lastStatus, 'waiting_approval')
  assert.equal(Boolean(waiting.activeRunId), true)
  assert.throws(
    () => controller.delete('active'),
    error => error.code === 'AUTOMATION_ACTIVE_RUN'
  )
  assert.throws(
    () => controller.finishSession('active', { session: { status: 'running' } }),
    error => error.code === 'AUTOMATION_SESSION_NOT_TERMINAL'
  )

  const completed = controller.finishSession('active', {
    session: { sessionId: 'session-waiting', status: 'completed' }
  })
  assert.equal(completed.lastStatus, 'succeeded')
  assert.equal(completed.activeRunId, '')
  assert.equal(controller.automations.value[0].runCount, 1)
  assert.equal(controller.delete('active'), true)
  assert.deepEqual(controller.automations.value, [])
  controller.dispose()
})

test('automation controller wraps CRUD, toggles, timers, and explicit refresh', () => {
  const storage = memoryStorage()
  const timerState = { scheduled: null, cleared: null }
  const timers = {
    setInterval(callback, ms) {
      timerState.scheduled = { callback, ms, id: 17 }
      return 17
    },
    clearInterval(id) {
      timerState.cleared = id
    }
  }
  const controller = useAgentAutomations({
    storage,
    clock: () => 1_800_000_000_000,
    timers,
    tickMs: 2_000,
    onRun: async () => ({ deferred: true })
  })

  controller.create(automationInput('crud'))
  controller.update('crud', { name: 'Updated' })
  assert.equal(controller.automations.value[0].name, 'Updated')
  controller.toggle('crud', false)
  assert.equal(controller.automations.value[0].enabled, false)
  controller.toggle('crud')
  assert.equal(controller.automations.value[0].enabled, true)

  controller.repository.update('crud', { name: 'External update' })
  assert.equal(controller.automations.value[0].name, 'Updated')
  controller.refresh()
  assert.equal(controller.automations.value[0].name, 'External update')

  assert.equal(controller.start(), true)
  assert.equal(controller.start(), false)
  assert.equal(timerState.scheduled.ms, 2_000)
  assert.equal(controller.stop(), true)
  assert.equal(timerState.cleared, 17)
  assert.equal(controller.stop(), false)
  assert.equal(controller.dispose(), true)
  assert.equal(controller.dispose(), false)
})

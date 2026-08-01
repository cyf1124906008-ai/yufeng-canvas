import test from 'node:test'
import assert from 'node:assert/strict'

import {
  AUTOMATION_SCHEMA_VERSION,
  AUTOMATION_STORAGE_KEY,
  AutomationRepository,
  AutomationScheduler,
  automationScheduleLabel,
  nextAutomationOccurrence,
  normalizeAutomationSchedule
} from '../src/agent/automation/index.js'

const MINUTE = 60_000

function memoryStorage(initialValue = null) {
  const values = new Map()
  if (initialValue != null) values.set(AUTOMATION_STORAGE_KEY, String(initialValue))
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    raw: key => values.get(key) ?? null
  }
}

function automationValue(id, overrides = {}) {
  return {
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    id,
    name: `Automation ${id}`,
    prompt: `Inspect ${id}`,
    enabled: true,
    schedule: { type: 'daily', time: '09:00' },
    approvalMode: 'read_only',
    createdAt: new Date(2026, 0, 5, 8, 0, 0, 0).getTime(),
    updatedAt: new Date(2026, 0, 5, 8, 0, 0, 0).getTime(),
    nextRunAt: new Date(2026, 0, 5, 9, 0, 0, 0).getTime(),
    lastStatus: 'never',
    runs: [],
    ...overrides
  }
}

test('daily and weekly schedules use local calendar time while interval schedules keep their anchor', () => {
  const mondayMorning = new Date(2026, 0, 5, 8, 30, 0, 0)
  assert.equal(mondayMorning.getDay(), 1)

  const daily = nextAutomationOccurrence({ type: 'daily', time: '09:15' }, mondayMorning.getTime())
  const dailyDate = new Date(daily)
  assert.deepEqual(
    [dailyDate.getFullYear(), dailyDate.getMonth(), dailyDate.getDate(), dailyDate.getHours(), dailyDate.getMinutes()],
    [2026, 0, 5, 9, 15]
  )

  const exactDaily = new Date(2026, 0, 5, 9, 15, 0, 0)
  const followingDaily = new Date(nextAutomationOccurrence({ type: 'daily', time: '09:15' }, exactDaily.getTime()))
  assert.deepEqual(
    [followingDaily.getDate(), followingDaily.getHours(), followingDaily.getMinutes()],
    [6, 9, 15]
  )

  const mondayAfterRun = new Date(2026, 0, 5, 10, 0, 0, 0)
  const weekly = new Date(nextAutomationOccurrence({ type: 'weekly', time: '09:00', days: [1, 3] }, mondayAfterRun.getTime()))
  assert.deepEqual([weekly.getDay(), weekly.getDate(), weekly.getHours(), weekly.getMinutes()], [3, 7, 9, 0])

  const anchor = mondayMorning.getTime()
  assert.equal(
    nextAutomationOccurrence({ type: 'interval', intervalMinutes: 30, anchorAt: anchor }, anchor + 91 * MINUTE),
    anchor + 120 * MINUTE
  )
  assert.equal(automationScheduleLabel({ type: 'weekly', time: '09:00', days: [1, 3] }), '周一、周三 09:00')
  assert.throws(() => normalizeAutomationSchedule({ type: 'interval', intervalMinutes: 4 }), /5/)
  assert.throws(() => normalizeAutomationSchedule({ type: 'weekly', time: '09:00', days: [] }), /至少需要选择一天/)
})

test('malformed localStorage records and runs are isolated without consuming valid entry capacity', () => {
  const now = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  const validA = automationValue('a', {
    approvalMode: 'auto',
    runs: [
      { id: 'bad-run', status: 'unknown' },
      {
        id: 'good-run',
        status: 'failed',
        scheduledFor: now,
        startedAt: now,
        finishedAt: now,
        error: {
          name: 'ProviderError',
          code: 'UPSTREAM_FAILED',
          message: `DATABASE_PASSWORD=hunter2 sk-12345678901234567890 ${'x'.repeat(5_000)}`
        }
      }
    ]
  })
  const storage = memoryStorage(JSON.stringify({
    schemaVersion: AUTOMATION_SCHEMA_VERSION,
    automations: [
      { schemaVersion: AUTOMATION_SCHEMA_VERSION, id: 'broken' },
      validA,
      automationValue('a', { prompt: 'duplicate must be ignored' }),
      automationValue('b')
    ]
  }))
  const repository = new AutomationRepository({ storage, maxEntries: 2, now: () => now })

  const records = repository.list()
  assert.deepEqual(records.map(record => record.id), ['a', 'b'])
  assert.equal(records[0].approvalMode, 'ask')
  assert.deepEqual(records[0].runs.map(run => run.id), ['good-run'])
  assert.equal(records[0].runs[0].error.message.length <= 4_000, true)
  assert.doesNotMatch(JSON.stringify(records), /hunter2|sk-12345678901234567890/)

  storage.setItem(AUTOMATION_STORAGE_KEY, '{not-json')
  assert.deepEqual(repository.list(), [])
})

test('auto is an explicit per-record in-memory grant and never trusted from persisted storage', () => {
  let now = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  const storage = memoryStorage()
  const repository = new AutomationRepository({ storage, now: () => now })
  const automatic = repository.create({
    id: 'auto-one',
    name: 'Explicit auto',
    prompt: 'Generate one report',
    approvalMode: 'auto',
    schedule: { type: 'daily', time: '09:00' }
  })
  const safeDefault = repository.create({
    id: 'safe-default',
    name: 'Default mode',
    prompt: 'Inspect one report',
    schedule: { type: 'daily', time: '10:00' }
  })

  assert.equal(automatic.approvalMode, 'auto')
  assert.equal(repository.get('auto-one').approvalMode, 'auto')
  assert.equal(safeDefault.approvalMode, 'read_only')
  assert.equal(repository.get('safe-default').approvalMode, 'read_only')
  const persisted = JSON.parse(storage.raw(AUTOMATION_STORAGE_KEY))
  assert.equal(persisted.automations.find(record => record.id === 'auto-one').approvalMode, 'ask')

  const restarted = new AutomationRepository({ storage, now: () => now })
  assert.equal(restarted.get('auto-one').approvalMode, 'ask')
  assert.equal(restarted.get('safe-default').approvalMode, 'read_only')

  const tampered = JSON.parse(storage.raw(AUTOMATION_STORAGE_KEY))
  const target = tampered.automations.find(record => record.id === 'auto-one')
  target.approvalMode = 'auto'
  target.prompt = 'Tampered paid task'
  storage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(tampered))
  assert.equal(repository.get('auto-one').approvalMode, 'ask')
  assert.equal(restarted.get('auto-one').approvalMode, 'ask')
})

test('full access is never accepted or restored for unattended automations', () => {
  const storage = memoryStorage()
  const repository = new AutomationRepository({ storage, now: () => 1_800_000_000_000 })
  const record = repository.create({
    id: 'no-full-access',
    name: 'No full access',
    prompt: 'Inspect safely',
    approvalMode: 'full_access',
    schedule: { type: 'daily', time: '09:00' }
  })

  assert.equal(record.approvalMode, 'ask')
  const persisted = JSON.parse(storage.raw(AUTOMATION_STORAGE_KEY))
  assert.equal(persisted.automations[0].approvalMode, 'ask')

  persisted.automations[0].approvalMode = 'full_access'
  storage.setItem(AUTOMATION_STORAGE_KEY, JSON.stringify(persisted))
  const restarted = new AutomationRepository({ storage, now: () => 1_800_000_000_100 })
  assert.equal(restarted.get('no-full-access').approvalMode, 'ask')
})

test('a missed interval occurrence is caught up once and advances beyond the current time', async () => {
  const base = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  let now = base
  const repository = new AutomationRepository({ storage: memoryStorage(), now: () => now })
  repository.create({
    id: 'catch-up',
    name: 'Catch up once',
    prompt: 'Run health check',
    schedule: { type: 'interval', intervalMinutes: 5, anchorAt: base }
  })
  const firstScheduledFor = repository.get('catch-up').nextRunAt
  now = base + 31 * MINUTE
  const calls = []
  const scheduler = new AutomationScheduler({
    repository,
    now: () => now,
    onRun: async automation => {
      calls.push(automation.runs[0].scheduledFor)
      return { status: 'succeeded', sessionId: 'session-catch-up' }
    }
  })

  await scheduler.tick()
  await scheduler.tick()

  const record = repository.get('catch-up')
  assert.deepEqual(calls, [firstScheduledFor])
  assert.equal(record.runCount, 1)
  assert.equal(record.nextRunAt > now, true)
})

test('queue claims are idempotent and do not append duplicate runs', () => {
  const now = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  const repository = new AutomationRepository({ storage: memoryStorage(), now: () => now })
  repository.create({
    id: 'dedupe',
    name: 'Dedupe',
    prompt: 'Inspect queue',
    schedule: { type: 'daily', time: '09:00' }
  })

  const first = repository.queue('dedupe', { scheduledFor: now, runId: 'run-one' })
  const second = repository.queue('dedupe', { scheduledFor: now, runId: 'run-two' })

  assert.equal(first.activeRunId, 'run-one')
  assert.equal(second.activeRunId, 'run-one')
  assert.deepEqual(repository.get('dedupe').runs.map(run => run.id), ['run-one'])
})

test('busy deferred restores the same run to the durable queue even after an optimistic running mark', async () => {
  const now = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  const repository = new AutomationRepository({ storage: memoryStorage(), now: () => now })
  repository.create({
    id: 'deferred',
    name: 'Deferred',
    prompt: 'Wait for interactive task',
    schedule: { type: 'daily', time: '09:00' }
  })
  let calls = 0
  const scheduler = new AutomationScheduler({
    repository,
    now: () => now,
    onRun: async (automation, { runId }) => {
      calls += 1
      repository.markRunning(automation.id, { runId, sessionId: `session-${calls}` })
      if (calls === 1) return { deferred: true }
      return { status: 'succeeded', sessionId: 'session-final' }
    }
  })

  await scheduler.runNow('deferred')
  const deferred = repository.get('deferred')
  assert.equal(deferred.lastStatus, 'queued')
  assert.equal(deferred.activeRunId.length > 0, true)
  assert.equal(deferred.runs.length, 1)

  await scheduler.drain()
  const completed = repository.get('deferred')
  assert.equal(calls, 2)
  assert.equal(completed.lastStatus, 'succeeded')
  assert.equal(completed.activeRunId, '')
  assert.equal(completed.runCount, 1)
  assert.equal(completed.runs.length, 1)
})

test('disabled automations neither become due nor run manually', async () => {
  const base = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  let now = base
  const repository = new AutomationRepository({ storage: memoryStorage(), now: () => now })
  repository.create({
    id: 'paused',
    name: 'Paused',
    prompt: 'Must not run',
    schedule: { type: 'interval', intervalMinutes: 5, anchorAt: base }
  })
  repository.update('paused', { enabled: false })
  now = base + 20 * MINUTE
  let calls = 0
  const scheduler = new AutomationScheduler({ repository, now: () => now, onRun: async () => { calls += 1 } })

  await scheduler.tick()

  assert.equal(calls, 0)
  assert.deepEqual(repository.due(now), [])
  await assert.rejects(scheduler.runNow('paused'), error => error.code === 'AUTOMATION_DISABLED')
})

test('restart fails running and waiting-approval runs without replay while preserving the next schedule', () => {
  const base = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  let now = base
  const storage = memoryStorage()
  const repository = new AutomationRepository({ storage, now: () => now })
  for (const id of ['running', 'waiting', 'queued']) {
    repository.create({
      id,
      name: id,
      prompt: `Task ${id}`,
      schedule: { type: 'interval', intervalMinutes: 5, anchorAt: base }
    })
    repository.queue(id, { scheduledFor: base + 5 * MINUTE, runId: `run-${id}` })
  }
  repository.markRunning('running', { runId: 'run-running', sessionId: 'session-running' })
  repository.markWaitingApproval('waiting', { runId: 'run-waiting', sessionId: 'session-waiting' })
  const nextRuns = Object.fromEntries(repository.list().map(record => [record.id, record.nextRunAt]))
  now = base + 2 * MINUTE

  const restarted = new AutomationRepository({ storage, now: () => now })
  restarted.recoverInterrupted()

  for (const id of ['running', 'waiting']) {
    const record = restarted.get(id)
    assert.equal(record.lastStatus, 'failed')
    assert.equal(record.activeRunId, '')
    assert.equal(record.runCount, 1)
    assert.equal(record.nextRunAt, nextRuns[id])
    assert.equal(record.runs[0].status, 'failed')
    assert.equal(record.runs[0].error.code, 'AUTOMATION_INTERRUPTED')
  }
  const queued = restarted.get('queued')
  assert.equal(queued.lastStatus, 'queued')
  assert.equal(queued.activeRunId, 'run-queued')
  assert.deepEqual(restarted.queued().map(record => record.id), ['queued'])
})

test('scheduler failures persist only bounded redacted error details', async () => {
  const base = new Date(2026, 0, 5, 8, 0, 0, 0).getTime()
  let now = base
  const storage = memoryStorage()
  const repository = new AutomationRepository({ storage, now: () => now })
  repository.create({
    id: 'failure',
    name: 'Failure',
    prompt: 'Fail safely',
    schedule: { type: 'interval', intervalMinutes: 5, anchorAt: base }
  })
  now += 6 * MINUTE
  const scheduler = new AutomationScheduler({
    repository,
    now: () => now,
    onRun: async () => {
      const error = new Error(`API_KEY=sk-12345678901234567890 ${'z'.repeat(8_000)}`)
      error.code = 'PROVIDER_FAILED'
      throw error
    }
  })

  await scheduler.tick()

  const record = repository.get('failure')
  assert.equal(record.lastStatus, 'failed')
  assert.equal(record.runs[0].error.code, 'PROVIDER_FAILED')
  assert.equal(record.runs[0].error.message.length <= 4_000, true)
  assert.doesNotMatch(JSON.stringify(record), /sk-12345678901234567890/)
  assert.doesNotMatch(storage.raw(AUTOMATION_STORAGE_KEY), /sk-12345678901234567890/)
})

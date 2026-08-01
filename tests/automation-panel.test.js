import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  automationApprovalLabel,
  automationDraftFromRecord,
  automationIsActive,
  automationPayloadFromDraft,
  automationScheduleView,
  automationStatusView,
  automationWorkspaceLabel,
  createAutomationDraft,
  formatAutomationDateTime,
  validateAutomationDraft
} from '../src/components/settings/automationPanelView.js'

test('automation panel drafts validate every schedule type and produce repository-ready payloads', () => {
  const daily = createAutomationDraft('/projects/yufeng')
  daily.name = 'Daily review'
  daily.prompt = 'Run tests and summarize failures'
  assert.equal(validateAutomationDraft(daily).valid, true)
  assert.deepEqual(automationPayloadFromDraft(daily), {
    name: 'Daily review',
    prompt: 'Run tests and summarize failures',
    schedule: { type: 'daily', time: '09:00' },
    approvalMode: 'read_only',
    workspaceRoot: '/projects/yufeng',
    enabled: true
  })

  const interval = { ...daily, scheduleType: 'interval', intervalMinutes: 4 }
  assert.match(validateAutomationDraft(interval).errors.schedule, /5/)
  interval.intervalMinutes = 15
  assert.deepEqual(automationPayloadFromDraft(interval).schedule, { type: 'interval', intervalMinutes: 15 })

  const weekly = { ...daily, scheduleType: 'weekly', time: '7:05', days: [] }
  assert.match(validateAutomationDraft(weekly).errors.schedule, /至少选择一天/)
  weekly.days = [5, 1, 5]
  assert.deepEqual(automationPayloadFromDraft(weekly).schedule, {
    type: 'weekly',
    time: '07:05',
    days: [1, 5]
  })
})

test('editing preserves schedule, approval and bound workspace without mutating the record', () => {
  const record = {
    id: 'automation-1',
    name: 'Weekly report',
    prompt: 'Create report',
    enabled: false,
    schedule: { type: 'weekly', time: '18:30', days: [1, 3] },
    approvalMode: 'auto',
    workspaceRoot: '/old/project'
  }
  const draft = automationDraftFromRecord(record, '/current/project')

  assert.equal(draft.scheduleType, 'weekly')
  assert.deepEqual(draft.days, [1, 3])
  assert.equal(draft.approvalMode, 'auto')
  assert.equal(draft.workspaceRoot, '/old/project')
  assert.equal(draft.enabled, false)
  draft.days.push(5)
  assert.deepEqual(record.schedule.days, [1, 3])
})

test('automation panel view helpers expose truthful schedules, status, authority and active state', () => {
  assert.equal(automationScheduleView({ type: 'interval', intervalMinutes: 120 }), '每 2 小时')
  assert.equal(automationScheduleView({ type: 'daily', time: '09:15' }), '每天 09:15')
  assert.equal(automationScheduleView({ type: 'weekly', time: '10:00', days: [1, 3] }), '周一、周三 10:00')
  assert.equal(automationStatusView('waiting_approval').label, '等待审批')
  assert.equal(automationApprovalLabel('auto'), '自动执行')
  assert.equal(automationWorkspaceLabel('/Users/test/project/'), 'project')
  assert.equal(automationIsActive({ lastStatus: 'failed', activeRunId: 'run-1' }), true)
  assert.equal(automationIsActive({ lastStatus: 'succeeded', activeRunId: '' }), false)
  assert.equal(formatAutomationDateTime(0), '未安排')
})

test('AutomationPanel is controlled exclusively by the required props and emits', async () => {
  const source = await readFile(new URL('../src/components/settings/AutomationPanel.vue', import.meta.url), 'utf8')

  for (const prop of ['automations', 'workspaceRoot', 'busy', 'desktopReady']) {
    assert.match(source, new RegExp(`${prop}: \\{ type:`))
  }
  for (const event of ['create', 'update', 'delete', 'toggle', "'run-now'"]) {
    assert.match(source, new RegExp(`${event.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`))
  }
  assert.match(source, /scheduleType === 'interval'/)
  assert.match(source, /scheduleType === 'weekly'/)
  assert.match(source, /draft\.days\.includes/)
  assert.match(source, /仅在本次 App 启动期间有效/)
  assert.match(source, /可能直接产生创作模型费用/)
  assert.match(source, /Electron 原生确认/)
  assert.match(source, /automation\.active \|\| !desktopReady/)
  assert.match(source, /最近运行记录/)
  assert.match(source, /@media \(max-width: 620px\)/)
  assert.doesNotMatch(source, /localStorage|AutomationRepository|AutomationScheduler|useAgentWorkbench/)
})

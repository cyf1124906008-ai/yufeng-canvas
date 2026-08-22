import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  buildWorkbenchActivities,
  buildWorkbenchInspector,
  buildWorkbenchPlan,
  normalizeWorkbenchArtifacts,
  workbenchStatus
} from '../src/components/workbench/workbenchView.js'

test('workbench activity feed is empty until a real or injected event exists', () => {
  assert.deepEqual(buildWorkbenchActivities({ goal: 'A poster', status: 'idle' }), [])

  const activities = buildWorkbenchActivities({
    status: 'running',
    timeline: [
      { type: 'planning', step: 0, timestamp: 100 },
      { type: 'action', action: 'generate_image', step: 1, timestamp: 200 },
      { type: 'tool_started', action: 'generate_image', step: 1, timestamp: 300 }
    ]
  })

  assert.equal(activities.length, 3)
  assert.equal(activities[0].kind, 'plan')
  assert.equal(activities[1].title, '已选择：生成图片')
  assert.equal(activities[2].status, 'running')
  assert.equal(activities.some(item => item.status === 'completed'), false)
})

test('dynamic plan marks a tool complete only after tool_succeeded', () => {
  const before = buildWorkbenchActivities({
    timeline: [{ type: 'action', action: 'analyze_image', step: 2 }]
  })
  assert.deepEqual(buildWorkbenchPlan({}, before).map(item => item.status), ['planned'])

  const after = buildWorkbenchActivities({
    timeline: [
      { type: 'action', action: 'analyze_image', step: 2 },
      { type: 'tool_started', action: 'analyze_image', step: 2 },
      { type: 'tool_succeeded', action: 'analyze_image', step: 2 }
    ]
  })
  assert.deepEqual(buildWorkbenchPlan({}, after).map(item => item.status), ['completed'])
})

test('runtime-projected task plan takes precedence over inferred tool history', () => {
  const inferred = buildWorkbenchActivities({}, [
    { id: 'old-call', type: 'tool_call', name: 'workspace.read', status: 'succeeded' }
  ])
  const plan = buildWorkbenchPlan({
    plan: {
      explanation: '先审计，再修改',
      steps: [
        { id: 'audit', step: '审计代码', status: 'completed' },
        { id: 'change', step: '应用修改', status: 'in_progress' },
        { id: 'verify', step: '验证结果', status: 'pending' }
      ]
    }
  }, inferred)

  assert.deepEqual(plan.map(item => item.label), ['审计代码', '应用修改', '验证结果'])
  assert.deepEqual(plan.map(item => item.status), ['completed', 'running', 'planned'])
})

test('tool progress is rendered from projected phases without fabricating completion', () => {
  const activities = buildWorkbenchActivities({}, [
    { eventId: 'event-1', type: 'tool_progress', toolCallId: 'call-1', toolName: 'terminal.run', phase: 'started', timestamp: 100 },
    { eventId: 'event-2', type: 'tool_progress', toolCallId: 'call-1', toolName: 'terminal.run', phase: 'completed', stdoutDelta: 'ok\n', timestamp: 200 }
  ])

  assert.deepEqual(activities.map(item => item.kind), ['terminal', 'terminal'])
  assert.deepEqual(activities.map(item => item.status), ['running', 'completed'])
  assert.equal(activities[1].output, 'ok')
})

test('approval, terminal, and computer cards require explicit injected events', () => {
  const activities = buildWorkbenchActivities({}, [
    { id: 'approval-1', type: 'approval_required', message: 'Allow publish?' },
    { id: 'terminal-1', type: 'terminal_result', command: 'npm test', output: 'ok' },
    { id: 'computer-1', type: 'computer_result', output: 'Window inspected' }
  ])

  assert.deepEqual(activities.map(item => item.kind), ['approval', 'terminal', 'computer'])
  assert.equal(activities[0].status, 'pending_approval')
  assert.equal(activities[1].command, 'npm test')
  assert.equal(activities[2].output, 'Window inspected')
})

test('Workbench activities are ordered by actual timestamps instead of data group', () => {
  const activities = buildWorkbenchActivities({}, [
    { id: 'message-1', role: 'assistant', content: '最后回复', createdAt: 300 },
    { id: 'call-1', type: 'tool_call', name: 'workspace.read', status: 'running', createdAt: 100 },
    { id: 'observation-1', type: 'observation', toolCallId: 'call-1', toolName: 'workspace.read', status: 'succeeded', completedAt: 200 }
  ])
  assert.deepEqual(activities.map(item => item.id), ['call-1', 'observation-1', 'message-1'])
})

test('generic Workbench projection messages, tool calls, and observations map without adapter mocks', () => {
  const activities = buildWorkbenchActivities({}, [
    { id: 'message-1', role: 'user', content: 'Inspect this workspace\n<attachment>internal</attachment>', displayContent: 'Inspect this workspace', createdAt: 100 },
    { id: 'call-1', type: 'tool_call', name: 'terminal.exec', status: 'running', input: { command: 'npm test' } },
    { id: 'observation-1', type: 'observation', toolCallId: 'call-1', toolName: 'terminal.exec', status: 'succeeded', output: { stdout: 'ok' } }
  ])

  assert.equal(activities[0].kind, 'message')
  assert.equal(activities[0].message, 'Inspect this workspace')
  assert.equal(activities[1].kind, 'terminal')
  assert.equal(activities[1].command, 'npm test')
  assert.equal(activities[2].status, 'completed')
  assert.match(activities[2].output, /"stdout": "ok"/)
  assert.deepEqual(buildWorkbenchPlan({}, activities).map(item => item.status), ['completed'])
})

test('inspector leaves usage and file changes unreported instead of fabricating values', () => {
  const inspector = buildWorkbenchInspector({
    snapshot: { runId: 'run-1', status: 'running', stepCount: 2 },
    context: { provider: 'DataEyes' }
  })

  assert.equal(inspector.run.statusLabel, '执行中')
  assert.equal(inspector.run.stepCount, 2)
  assert.deepEqual(inspector.files, [])
  assert.equal(inspector.usage.inputTokens, null)
  assert.equal(inspector.usage.outputTokens, null)
  assert.equal(inspector.usage.cost, null)
})

test('inspector preserves structured workspace diffs and calculates line counts', () => {
  const inspector = buildWorkbenchInspector({
    fileChanges: [{
      id: 'diff-1',
      path: 'src/config.js',
      operation: 'apply',
      hunks: [{ startLine: 4, oldLines: ['old'], newLines: ['new', 'extra'] }],
      rollback: { state: 'conditional' }
    }]
  })

  assert.equal(inspector.files[0].additions, 2)
  assert.equal(inspector.files[0].deletions, 1)
  assert.equal(inspector.files[0].hunks[0].startLine, 4)
  assert.equal(inspector.files[0].rollback.state, 'conditional')
})

test('artifact view uses only real artifact data and preserves final selection', () => {
  const artifacts = normalizeWorkbenchArtifacts([
    { id: 'image-1', kind: 'image', source: 'https://media.example/poster.png' },
    { id: 'video-1', kind: 'video', source: 'javascript:alert(1)' }
  ], { final: { artifactId: 'image-1' } })

  assert.equal(artifacts[0].url, 'https://media.example/poster.png')
  assert.equal(artifacts[0].isFinal, true)
  assert.equal(artifacts[1].url, '')
  assert.equal(workbenchStatus('interrupted').label, '已中断')
})

test('workbench components are controlled and Workspace uses the real Workbench runtime', async () => {
  const [sidebar, composer, activity, inspector, workspace] = await Promise.all([
    readFile(new URL('../src/components/workbench/WorkbenchSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchActivityFeed.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchInspector.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  ])

  for (const source of [sidebar, composer, activity, inspector]) {
    assert.doesNotMatch(source, /useHeadlessCreativeAgent|useCreativeAgent|stores\/pinia|stores\/canvas|@vue-flow/)
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|desktopApp/)
    assert.match(source, /defineProps/)
    assert.match(source, /defineEmits/)
  }

  assert.match(workspace, /useAgentWorkbench/)
  assert.match(workspace, /workbench\.messages\.value/)
  assert.match(workspace, /workbench\.toolCalls\.value/)
  assert.match(workspace, /workbench\.pendingApproval\.value/)
  assert.match(workspace, /const submit = async/)
  assert.match(workspace, /const approve = async/)
  assert.match(workspace, /const reject = async/)
  assert.match(workspace, /defineExpose/)
  assert.doesNotMatch(workspace, /useHeadlessCreativeAgent/)
  assert.doesNotMatch(workspace, /AgentRunPanel|agent-hero|GOAL IN/)
})

test('workbench visual contract keeps professional desktop rails, compact composer, and mobile drawers', async () => {
  const [activity, composer, inspector, sidebar, icon, workspace] = await Promise.all([
    readFile(new URL('../src/components/workbench/WorkbenchActivityFeed.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchComposer.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchInspector.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchSidebar.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/workbench/WorkbenchIcon.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/views/AgentWorkspace.vue', import.meta.url), 'utf8')
  ])

  assert.match(workspace, /grid-template-columns: 224px minmax\(0,1fr\) 320px/)
  assert.match(workspace, /grid-template-rows: minmax\(0,1fr\) auto/)
  assert.match(workspace, /@media \(max-width: 1439px\)/)
  assert.match(workspace, /@media \(max-width: 860px\)/)
  assert.match(sidebar, /position: fixed/)
  assert.match(sidebar, /task-search/)
  assert.match(sidebar, /project-list/)
  assert.match(sidebar, /onSearchShortcut/)
  assert.match(inspector, /position: fixed/)
  assert.match(inspector, /inspector-panel-terminal/)
  assert.match(inspector, /v-model:active-tab|update:activeTab/)
  assert.match(composer, /composer-shell/)
  assert.match(composer, /command-menu/)
  assert.match(composer, /files-selected/)
  assert.match(composer, /font: 14px/)
  assert.match(activity, /approval-card/)
  assert.match(activity, /terminal-output/)
  assert.match(activity, /welcome-state/)
  assert.match(activity, /font-size: 14px/)
  assert.match(icon, /viewBox="0 0 24 24"/)
  assert.match(workspace, /attachmentContext/)
  assert.match(workspace, /MAX_ATTACHMENT_BYTES = 8 \* 1024/)
  assert.match(workspace, /MAX_TOTAL_ATTACHMENT_BYTES = 16 \* 1024/)
  assert.match(workspace, /MAX_SUBMISSION_CONTEXT_BYTES = WORKBENCH_MESSAGE_CONTEXT_CHARACTERS/)
  assert.match(workspace, /utf8Bytes\(submitted\) > MAX_SUBMISSION_CONTEXT_BYTES/)
  assert.match(workspace, /任务与附件总计不能超过 24 KB/)
  assert.match(workspace, /@files-selected="addAttachments"/)
  assert.match(workspace, /workbench\.toolProgress\.value/)
  assert.match(workspace, /workbench\.workspaceDiffs\.value/)
  assert.match(inspector, /planExplanation/)
  assert.match(inspector, /diff-hunks/)
})

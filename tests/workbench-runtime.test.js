import test from 'node:test'
import assert from 'node:assert/strict'

import { WorkbenchSession } from '../src/agent/workbench/index.js'
import { WorkbenchSessionRepository } from '../src/agent/memory/WorkbenchSessionRepository.js'
import {
  createDesktopWorkbenchToolRegistry,
  setWorkbenchToolGroupEnabled,
  waitForCommand
} from '../src/agent/runtime/desktopWorkbenchTools.js'
import {
  compactSession,
  createWorkbenchPlanner,
  parseAction,
  WORKBENCH_MESSAGE_CONTEXT_CHARACTERS
} from '../src/agent/runtime/workbenchPlanner.js'
import { resolveMaxActionsPerTurn, useAgentWorkbench } from '../src/agent/runtime/useAgentWorkbench.js'

test('Workbench planner accepts strict JSON actions and preserves ordinary replies', async () => {
  assert.deepEqual(parseAction('```json\n{"type":"tool_call","name":"workspace.read","input":{"path":"README.md"}}\n```'), {
    type: 'tool_call',
    name: 'workspace.read',
    input: { path: 'README.md' }
  })
  assert.deepEqual(parseAction('请先选择一个工作区。'), {
    type: 'message',
    content: '请先选择一个工作区。'
  })

  let captured = ''
  const planner = createWorkbenchPlanner({
    modelStore: { selectedChatModel: 'test-model' },
    sendChat: async (prompt) => {
      captured = prompt
      return '{"type":"finish","result":{"content":"完成"}}'
    }
  })
  const action = await planner.nextAction({
    session: { status: 'running', messages: [{ role: 'user', content: '检查项目' }] },
    tools: [{ name: 'workspace.read', riskLevel: 'safe', approvalPolicy: 'never' }]
  })
  assert.equal(action.type, 'finish')
  assert.equal(action.result.content, '完成')
  assert.match(captured, /workspace\.read/)
  assert.match(captured, /检查项目/)
  assert.match(captured, /审批保护模式：ask/)
  assert.doesNotMatch(captured, /function|execute/)
})

test('Workbench planner hot-switches chat model only for the next request', async () => {
  const selectedChatModel = { value: 'chat-a' }
  const requests = []
  let finishFirst
  const planner = createWorkbenchPlanner({
    modelStore: { selectedChatModel },
    sendChat: async (_prompt, _stream, options) => {
      requests.push(options.model)
      if (requests.length === 1) {
        await new Promise(resolve => { finishFirst = resolve })
      }
      return '{"type":"finish","result":{"content":"done"}}'
    }
  })

  const inFlight = planner.nextAction({ session: {}, tools: [] })
  await Promise.resolve()
  assert.deepEqual(requests, ['chat-a'])
  selectedChatModel.value = 'chat-b'
  assert.deepEqual(requests, ['chat-a'], 'an in-flight request keeps its captured model')
  finishFirst()
  await inFlight
  await planner.nextAction({ session: {}, tools: [] })
  assert.deepEqual(requests, ['chat-a', 'chat-b'])
})

test('Workbench planner exposes approval mode and read_only retry guidance', async () => {
  let captured = ''
  const planner = createWorkbenchPlanner({
    modelStore: { selectedChatModel: 'test-model' },
    sendChat: async prompt => {
      captured = prompt
      return '{"type":"finish","result":{"content":"只读检查完成"}}'
    }
  })

  await planner.nextAction({
    session: {
      status: 'running',
      approvalMode: 'read_only',
      observations: [{
        toolCallId: 'call-1',
        toolName: 'terminal.run',
        status: 'rejected',
        error: { code: 'TOOL_BLOCKED_BY_APPROVAL_MODE' }
      }]
    },
    tools: [{ name: 'terminal.run', riskLevel: 'dangerous', approvalPolicy: 'always' }]
  })

  assert.match(captured, /审批保护模式：read_only/)
  assert.match(captured, /riskLevel=safe/)
  assert.match(captured, /不要原样重试/)
  assert.match(captured, /TOOL_BLOCKED_BY_APPROVAL_MODE/)
  assert.equal(compactSession({ approvalMode: 'auto' }).approvalMode, 'auto')
})

test('Workbench planner compacts large tool observations before the next model call', () => {
  const compacted = compactSession({
    observations: [{ toolCallId: 'call-1', toolName: 'workspace.read', status: 'succeeded', output: { content: 'x'.repeat(50_000) } }]
  })
  assert.ok(compacted.observations[0].output.content.length < 21_000)
  assert.match(compacted.observations[0].output.content, /已截断/)
})

test('Workbench planner preserves every character within the composer context budget', () => {
  const content = 'normal context with spaces\n'
    .repeat(WORKBENCH_MESSAGE_CONTEXT_CHARACTERS)
    .slice(0, WORKBENCH_MESSAGE_CONTEXT_CHARACTERS)
  const compacted = compactSession({
    messages: [{ role: 'user', content }]
  })

  assert.equal(compacted.messages[0].content, content)
})

test('terminal tool cannot execute before approval and receives an exact approval grant', async () => {
  const calls = []
  const api = {
    startCommand: async input => {
      calls.push(input)
      return { ok: true, jobId: 'job-1', status: 'running' }
    },
    getCommand: async () => ({
      ok: true,
      jobId: 'job-1',
      status: 'completed',
      stdout: 'DATABASE_PASSWORD=hunter2\n',
      stderr: '',
      exitCode: 0,
      truncated: false
    })
  }
  const registry = createDesktopWorkbenchToolRegistry({ desktopAgentTools: api })
  const planner = {
    nextAction: ({ session }) => session.observations.length
      ? { type: 'finish', result: { content: '命令完成' } }
      : { type: 'tool_call', name: 'terminal.run', input: { command: 'git', args: ['status'] } }
  }
  const session = new WorkbenchSession({ planner, toolRegistry: registry })

  const pending = await session.submitUserMessage('检查 Git 状态')
  assert.equal(pending.status, 'awaiting_approval')
  assert.equal(calls.length, 0)

  const completed = await session.resolveApproval(pending.pendingApproval.id, 'approved')
  assert.equal(completed.status, 'completed')
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].approval, { granted: true, action: 'terminal.run' })
  assert.equal(calls[0].maxOutputBytes, 128 * 1024)
  assert.equal(completed.observations[0].output.stdout, 'DATABASE_PASSWORD=[redacted]\n')
  assert.deepEqual(completed.toolProgress.map(item => item.phase), ['starting', 'started', 'completed'])
  assert.equal(completed.toolCalls[0].latestProgress.exitCode, 0)
  assert.equal('stdoutDelta' in completed.toolCalls[0].latestProgress, false)
  assert.doesNotMatch(JSON.stringify(session.events()), /hunter2/)
})

test('auto mode still sends the native terminal approval payload', async () => {
  const calls = []
  const registry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: {
      startCommand: async input => {
        calls.push(input)
        return { ok: true, jobId: 'job-auto', status: 'running' }
      },
      getCommand: async () => ({
        ok: true,
        jobId: 'job-auto',
        status: 'completed',
        stdout: 'clean\n',
        stderr: '',
        exitCode: 0
      })
    }
  })
  const session = new WorkbenchSession({
    approvalMode: 'auto',
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { content: '完成' } }
      : { type: 'tool_call', name: 'terminal.run', input: { command: 'git', args: ['status'] } }
  })

  const completed = await session.submitUserMessage('自动检查 Git')

  assert.equal(completed.status, 'completed')
  assert.deepEqual(calls[0].approval, { granted: true, action: 'terminal.run' })
  assert.equal(completed.approvals[0].resolution, 'auto')
})

test('terminal progress never persists raw text that can be split across polling deltas', async () => {
  let poll = 0
  const progress = []
  const result = await waitForCommand({
    getCommand: async () => {
      poll += 1
      return poll === 1
        ? {
            jobId: 'job-secret',
            status: 'running',
            stdout: 'DATABASE_PASSWORD=',
            stderr: '',
            outputBytes: 18,
            maxOutputBytes: 1024
          }
        : {
            jobId: 'job-secret',
            status: 'completed',
            stdout: 'DATABASE_PASSWORD=hunter2',
            stderr: '',
            outputBytes: 25,
            maxOutputBytes: 1024,
            exitCode: 0
          }
    }
  }, 'job-secret', null, {
    reportProgress: value => progress.push(value)
  })

  assert.equal(result.stdout, 'DATABASE_PASSWORD=hunter2')
  assert.equal(progress.length, 2)
  assert.equal(progress.every(item => !('stdoutDelta' in item) && !('stderrDelta' in item)), true)
  assert.doesNotMatch(JSON.stringify(progress), /DATABASE_PASSWORD|hunter2/)
  assert.deepEqual(progress.map(item => item.stdoutLength), [18, 25])
})

test('terminal wrapper fails closed when process termination cannot be confirmed', async () => {
  await assert.rejects(waitForCommand({
    getCommand: async () => ({
      jobId: 'job-unconfirmed',
      status: 'termination_unconfirmed',
      termination: { guarantee: 'best_effort', descendantsGuaranteed: false, unconfirmed: true }
    })
  }, 'job-unconfirmed'), error => error.code === 'TERMINAL_TERMINATION_UNCONFIRMED')
})

test('workspace.write executes approved source without applying history redaction to it', async () => {
  const writes = []
  const content = [
    'const secret = process.env.APP_SECRET',
    'const password = config.password',
    'export const docs = "https://example.com/guide"'
  ].join('\n')
  const registry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: {
      writeFile: async input => {
        writes.push(input)
        return { ok: true, path: input.path }
      }
    }
  })
  const session = new WorkbenchSession({
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { content: '写入完成' } }
      : { type: 'tool_call', name: 'workspace.write', input: { path: 'src/config.js', content } }
  })

  const pending = await session.submitUserMessage('更新配置代码')
  assert.equal(writes.length, 0)
  await session.resolveApproval(pending.pendingApproval.id, 'approved')

  assert.equal(writes.length, 1)
  assert.equal(writes[0].content, content)
  assert.deepEqual(writes[0].approval, { granted: true, action: 'workspace.write' })
})

test('workspace.patch keeps raw approved hunks ephemeral and emits a sanitized structured diff', async () => {
  const applied = []
  const beforeSha256 = 'a'.repeat(64)
  const afterSha256 = 'b'.repeat(64)
  const rawSecret = 'API_KEY=sk-super-secret-value-1234567890'
  const registry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: {
      applyPatch: async input => {
        applied.push(input)
        return {
          ok: true,
          path: input.path,
          beforeSha256,
          afterSha256,
          diff: {
            rollbackId: 'rollback-1',
            path: input.path,
            beforeSha256,
            afterSha256,
            hunks: input.hunks,
            finalNewlineBefore: true,
            finalNewlineAfter: true
          }
        }
      }
    }
  })
  const session = new WorkbenchSession({
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { content: '补丁完成' } }
      : {
          type: 'tool_call',
          name: 'workspace.patch',
          input: {
            path: 'src/config.js',
            beforeSha256,
            hunks: [{ startLine: 1, oldLines: ['API_KEY=old'], newLines: [rawSecret] }]
          }
        }
  })

  const pending = await session.submitUserMessage('更新配置')
  assert.equal(applied.length, 0)
  const completed = await session.resolveApproval(pending.pendingApproval.id, 'approved')
  assert.equal(applied[0].hunks[0].newLines[0], rawSecret)
  assert.deepEqual(applied[0].approval, { granted: true, action: 'workspace.patch' })
  assert.equal(completed.workspaceDiffs.length, 1)
  assert.equal(completed.workspaceDiffs[0].path, 'src/config.js')
  assert.equal(completed.workspaceDiffs[0].operation, 'apply')
  assert.deepEqual(completed.workspaceDiffs[0].rollback, {
    state: 'conditional',
    rollbackId: 'rollback-1',
    requires: ['ephemeral_record_present', 'current_sha256_matches_after'],
    expires: 'app_session',
    expectedCurrentSha256: afterSha256
  })
  assert.equal(completed.toolCalls[0].workspaceDiffId, completed.workspaceDiffs[0].id)
  assert.equal(completed.observations[0].output.diffId, completed.workspaceDiffs[0].id)
  assert.doesNotMatch(JSON.stringify(session.events()), /super-secret|sk-super/)
  assert.match(completed.workspaceDiffs[0].hunks[0].newLines[0], /redacted/)
})

test('workspace.revert_patch remains approval-gated and links the inverse diff', async () => {
  const calls = []
  const originalSha = 'a'.repeat(64)
  const currentSha = 'b'.repeat(64)
  const registry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: {
      revertPatch: async input => {
        calls.push(input)
        return {
          ok: true,
          path: 'src/file.js',
          beforeSha256: currentSha,
          afterSha256: originalSha,
          diff: {
            operation: 'revert',
            rollbackId: 'rollback-redo',
            revertsDiffId: input.revertsDiffId,
            path: 'src/file.js',
            beforeSha256: currentSha,
            afterSha256: originalSha,
            hunks: [{ startLine: 2, oldLines: ['new'], newLines: ['old'] }],
            finalNewlineBefore: true,
            finalNewlineAfter: true
          }
        }
      }
    }
  })
  const session = new WorkbenchSession({
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { content: '已回滚' } }
      : {
          type: 'tool_call',
          name: 'workspace.revert_patch',
          input: {
            rollbackId: 'rollback-original',
            revertsDiffId: 'diff-original'
          }
        }
  })

  const pending = await session.submitUserMessage('回滚文件')
  assert.equal(calls.length, 0)
  const completed = await session.resolveApproval(pending.pendingApproval.id, 'approved')
  assert.deepEqual(calls[0].approval, { granted: true, action: 'workspace.revert_patch' })
  assert.equal(calls[0].rollbackId, 'rollback-original')
  assert.equal(completed.workspaceDiffs[0].operation, 'revert')
  assert.equal(completed.workspaceDiffs[0].revertsDiffId, 'diff-original')
})

test('task.update_plan projects stable step status and revision into the session', async () => {
  const registry = createDesktopWorkbenchToolRegistry({ desktopAgentTools: null })
  const session = new WorkbenchSession({
    toolRegistry: registry,
    planner: ({ session: state }) => state.plan
      ? { type: 'finish', result: { content: '计划已建立' } }
      : {
          type: 'tool_call',
          name: 'task.update_plan',
          input: {
            explanation: '先审计，再修改',
            steps: [
              { id: 'audit', step: '审计代码', status: 'in_progress' },
              { id: 'change', step: '应用修改', status: 'pending' }
            ]
          }
        }
  })

  const completed = await session.submitUserMessage('处理项目')
  assert.equal(completed.status, 'completed')
  assert.equal(completed.plan.status, 'in_progress')
  assert.equal(completed.plan.revision, 1)
  assert.deepEqual(completed.plan.steps.map(step => [step.id, step.status]), [
    ['audit', 'in_progress'],
    ['change', 'pending']
  ])
  assert.equal(session.events().filter(event => event.type === 'plan_updated').length, 1)
})

test('screen inspection keeps raw screenshots outside the serializable observation', async () => {
  const captured = []
  const registry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: {
      captureScreen: async input => {
        assert.deepEqual(input, {
          application: 'Preview',
          instruction: '查看设置',
          approval: { granted: true, action: 'computer.capture_screen' }
        })
        return { ok: true, dataUrl: 'data:image/png;base64,AAAA', mimeType: 'image/png', size: 3 }
      }
    },
    sendChat: async (_prompt, _stream, options) => {
      assert.equal(options.images[0], 'data:image/png;base64,AAAA')
      return '屏幕上显示一个设置窗口。'
    },
    onScreenshot: screenshot => captured.push(screenshot)
  })
  const planner = {
    nextAction: ({ session }) => session.observations.length
      ? { type: 'finish', result: { content: '已检查' } }
      : { type: 'tool_call', name: 'computer.inspect_screen', input: { application: 'Preview', instruction: '查看设置' } }
  }
  const session = new WorkbenchSession({ planner, toolRegistry: registry })
  const pending = await session.submitUserMessage('看看屏幕')
  const completed = await session.resolveApproval(pending.pendingApproval.id, 'approved')

  assert.equal(captured.length, 1)
  assert.match(captured[0].dataUrl, /^data:image/)
  assert.equal(completed.observations[0].output.analysis, '屏幕上显示一个设置窗口。')
  assert.doesNotMatch(JSON.stringify(completed), /data:image/)
})

test('Workbench history persists bounded event streams without media bytes', () => {
  const storage = new Map()
  const repository = new WorkbenchSessionRepository({ storage, now: () => 123 })
  repository.upsert({
    sessionId: 'session-1',
    events: [
      {
        schemaVersion: 1,
        sessionId: 'session-1',
        seq: 1,
        id: 'event-1',
        type: 'user_message',
        timestamp: 100,
        detail: {
          message: { id: 'message-1', role: 'user', content: '分析这个项目' },
          screenshot: 'data:image/png;base64,AAAA'
        }
      }
    ]
  })

  assert.equal(repository.list()[0].title, '分析这个项目')
  const restored = repository.get('session-1')
  assert.equal(restored.events[0].detail.screenshot, '[media-reference-hidden]')
  assert.doesNotMatch(storage.get('yufeng-agent-workbench-history-v1'), /data:image/)
})

test('Workbench repository rejects mismatched session events', () => {
  const repository = new WorkbenchSessionRepository({ storage: new Map() })
  assert.throws(() => repository.upsert({
    sessionId: 'session-a',
    events: [{ schemaVersion: 1, sessionId: 'session-b', seq: 1, id: 'event-1', type: 'session_created', timestamp: 1, detail: {} }]
  }), error => error.code === 'WORKBENCH_HISTORY_EVENT_INVALID')
})

test('Workbench cancellation reaches the Creative Agent signal', async () => {
  let receivedSignal = null
  const creativeAgent = {
    artifacts: { value: [] },
    run: async (_goal, options) => {
      receivedSignal = options.signal
      return { status: 'completed' }
    }
  }
  const registry = createDesktopWorkbenchToolRegistry({ creativeAgent })
  const session = new WorkbenchSession({
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { content: '完成' } }
      : { type: 'tool_call', name: 'creative.generate', input: { goal: '海报', targetType: 'image' } }
  })
  const pending = await session.submitUserMessage('生成海报')
  await session.resolveApproval(pending.pendingApproval.id, 'approved')
  assert.ok(receivedSignal instanceof AbortSignal)
})

test('deleting a pending current Workbench task cannot resurrect its history record', async () => {
  const repository = new WorkbenchSessionRepository({ storage: new Map() })
  const creativeAgent = { runtimeLogs: { value: [] }, dispose: () => {}, artifacts: { value: [] } }
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent,
    desktopAgentTools: null,
    historyRepository: repository,
    sendChat: async () => '{"type":"tool_call","name":"terminal.run","input":{"command":"git","args":["status"]}}'
  })
  const pending = await workbench.submit('检查 Git')
  const sessionId = pending.sessionId
  assert.ok(repository.get(sessionId))
  assert.equal(workbench.deleteSession(sessionId), true)
  assert.equal(repository.get(sessionId), null)
  workbench.dispose()
})

test('useAgentWorkbench changes approval mode dynamically and new tasks inherit it', async () => {
  const repository = new WorkbenchSessionRepository({ storage: new Map() })
  const creativeAgent = { runtimeLogs: { value: [] }, dispose: () => {}, artifacts: { value: [] } }
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent,
    desktopAgentTools: null,
    historyRepository: repository,
    sendChat: async () => '{"type":"finish","result":{"content":"完成"}}'
  })

  await workbench.setApprovalMode('read_only')
  assert.equal(workbench.approvalMode.value, 'read_only')
  const firstSessionId = workbench.session.value.sessionId
  workbench.newTask()
  assert.notEqual(workbench.session.value.sessionId, firstSessionId)
  assert.equal(workbench.session.value.snapshot().approvalMode, 'read_only')

  await workbench.submit('只读检查项目')
  const record = repository.list()[0]
  assert.equal(record.approvalMode, 'ask')
  assert.equal(record.recordedApprovalMode, 'read_only')

  workbench.newTask()
  assert.equal(workbench.approvalMode.value, 'read_only')
  assert.equal(workbench.projection.value.approvalMode, 'read_only')

  workbench.selectSession(record.sessionId)
  assert.equal(workbench.isHistorySelection.value, true)
  assert.equal(workbench.approvalMode.value, 'ask')
  assert.equal(workbench.projection.value.recordedApprovalMode, 'read_only')
  await assert.rejects(
    workbench.setApprovalMode('auto'),
    error => error.code === 'APPROVAL_MODE_HISTORY_READ_ONLY'
  )
  assert.equal(workbench.approvalMode.value, 'ask')

  workbench.newTask()
  assert.equal(workbench.approvalMode.value, 'ask')
  workbench.dispose()
})

test('useAgentWorkbench exposes live guidance and replans after an in-flight model response', async () => {
  let releasePlanner
  let markPlannerStarted
  const plannerStarted = new Promise(resolve => { markPlannerStarted = resolve })
  const plannerGate = new Promise(resolve => { releasePlanner = resolve })
  let plannerCalls = 0
  const creativeAgent = { runtimeLogs: { value: [] }, dispose: () => {}, artifacts: { value: [] } }
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent,
    desktopAgentTools: null,
    historyRepository: null,
    sendChat: async prompt => {
      plannerCalls += 1
      if (plannerCalls === 1) {
        markPlannerStarted()
        await plannerGate
        return '{"type":"finish","result":{"content":"旧计划"}}'
      }
      assert.match(prompt, /最新引导/)
      return '{"type":"finish","result":{"content":"新计划"}}'
    }
  })

  const running = workbench.submit('开始任务')
  await plannerStarted
  const guided = await workbench.guide('最新引导')
  assert.equal(guided.guidancePending, true)
  assert.equal(workbench.guidancePending.value, true)
  assert.equal(workbench.lastGuidance.value.content, '最新引导')
  releasePlanner()
  const completed = await running

  assert.equal(completed.status, 'completed')
  assert.equal(completed.final.content, '新计划')
  assert.equal(workbench.guidancePending.value, false)
  assert.equal(plannerCalls, 2)
  workbench.dispose()
})

test('useAgentWorkbench resumes a failed task in the same session', async () => {
  let plannerCalls = 0
  const creativeAgent = { runtimeLogs: { value: [] }, dispose: () => {}, artifacts: { value: [] } }
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent,
    desktopAgentTools: null,
    historyRepository: null,
    sendChat: async () => {
      plannerCalls += 1
      if (plannerCalls === 1) {
        const error = new Error('planner offline')
        error.code = 'PLANNER_OFFLINE'
        throw error
      }
      return '{"type":"finish","result":{"content":"恢复完成"}}'
    }
  })
  const sessionId = workbench.session.value.sessionId

  await assert.rejects(
    workbench.submit('执行任务'),
    error => error.code === 'PLANNER_OFFLINE'
  )
  assert.equal(workbench.status.value, 'failed')
  assert.equal(workbench.canResume.value, true)
  const completed = await workbench.resume()

  assert.equal(completed.sessionId, sessionId)
  assert.equal(workbench.session.value.sessionId, sessionId)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.resumeCount, 1)
  assert.equal(completed.final.content, '恢复完成')
  assert.equal(workbench.canResume.value, false)
  workbench.dispose()
})

test('tool groups hide capabilities and execute rechecks a mid-plan disable', async () => {
  let reads = 0
  const registry = createDesktopWorkbenchToolRegistry({
    desktopAgentTools: {
      readFile: async () => {
        reads += 1
        return { ok: true, content: 'unsafe stale plan' }
      }
    }
  })
  let releasePlanner
  let markPlannerStarted
  const plannerStarted = new Promise(resolve => { markPlannerStarted = resolve })
  const plannerGate = new Promise(resolve => { releasePlanner = resolve })
  const session = new WorkbenchSession({
    toolRegistry: registry,
    planner: async ({ session: state }) => {
      if (state.observations.length) return { type: 'finish', result: { content: '已阻止' } }
      markPlannerStarted()
      await plannerGate
      return { type: 'tool_call', name: 'workspace.read', input: { path: 'README.md' } }
    }
  })

  const running = session.submitUserMessage('读取项目')
  await plannerStarted
  setWorkbenchToolGroupEnabled(registry, 'workspaceRead', false)
  assert.equal(registry.list().some(tool => tool.name === 'workspace.read'), false)
  assert.equal(registry.list().some(tool => tool.name === 'task.update_plan'), true)
  releasePlanner()
  const completed = await running

  assert.equal(reads, 0)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.observations[0].status, 'failed')
  assert.equal(completed.observations[0].error.code, 'TOOL_DISABLED')
  assert.throws(
    () => setWorkbenchToolGroupEnabled(registry, 'unknown', false),
    error => error.code === 'WORKBENCH_TOOL_GROUP_NOT_FOUND'
  )
})

test('useAgentWorkbench exposes tool group state and reads bounded action limits per new session', () => {
  const maxActions = { value: 2 }
  const creativeAgent = { runtimeLogs: { value: [] }, dispose: () => {}, artifacts: { value: [] } }
  const workbench = useAgentWorkbench({
    modelStore: { selectedChatModel: '' },
    creativeAgent,
    desktopAgentTools: null,
    historyRepository: null,
    maxActionsPerTurn: maxActions,
    toolGroups: { computer: false },
    sendChat: async () => '{"type":"finish","result":{"content":"完成"}}'
  })

  assert.equal(workbench.session.value.maxActionsPerTurn, 4)
  assert.equal(workbench.toolGroups.value.computer, false)
  assert.equal(workbench.toolRegistry.list().some(tool => tool.name.startsWith('computer.')), false)
  assert.equal(workbench.toolRegistry.list().some(tool => tool.name === 'task.update_plan'), true)

  assert.equal(workbench.setToolGroupEnabled('terminal', false), false)
  assert.equal(workbench.toolGroups.value.terminal, false)
  assert.equal(workbench.toolRegistry.list().some(tool => tool.name === 'terminal.run'), false)

  maxActions.value = 100
  workbench.newTask()
  assert.equal(workbench.session.value.maxActionsPerTurn, 64)
  assert.equal(resolveMaxActionsPerTurn(() => 12), 12)
  assert.equal(resolveMaxActionsPerTurn(() => { throw new Error('bad setting') }), 24)
  workbench.dispose()
})

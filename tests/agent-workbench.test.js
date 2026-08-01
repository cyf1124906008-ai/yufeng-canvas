import test from 'node:test'
import assert from 'node:assert/strict'

import { ToolRegistry } from '../src/agent/core/index.js'
import {
  WorkbenchSession,
  WORKBENCH_GUIDANCE_MAX_CHARACTERS,
  WORKBENCH_GUIDANCE_MAX_PER_TURN,
  defineTool,
  projectWorkbenchEvents,
  sanitizeWorkbenchValue
} from '../src/agent/workbench/index.js'

function deterministicRuntime() {
  let sequence = 0
  let timestamp = 1_800_000_000_000
  return {
    idFactory: prefix => `${prefix}-${++sequence}`,
    now: () => ++timestamp
  }
}

test('WorkbenchSession supports generic tools and multiple user turns', async () => {
  const runtime = deterministicRuntime()
  const registry = new ToolRegistry()
  const calls = []
  registry.register('read_workspace', defineTool({
    name: 'read_workspace',
    description: 'Read a workspace text file',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path']
    },
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async input => {
    calls.push(input)
    return {
      text: 'package name: yufeng',
      apiKey: 'must-not-persist',
      url: 'https://private.example/result'
    }
  }))

  let plannerCalls = 0
  let visibleTools
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: async ({ session: state, tools }) => {
      plannerCalls += 1
      visibleTools = tools
      if (state.turnCount === 1 && state.observations.length === 0) {
        return { type: 'tool_call', name: 'read_workspace', input: { path: 'package.json' } }
      }
      if (state.turnCount === 1) {
        return { type: 'message', content: '项目名称已经找到，还需要我继续吗？' }
      }
      return { type: 'finish', result: { summary: '检查结束', apiKey: 'also-secret' } }
    }
  })

  const firstTurn = await session.submitUserMessage('检查这个项目')

  assert.equal(firstTurn.status, 'awaiting_user')
  assert.equal(firstTurn.turnCount, 1)
  assert.deepEqual(calls, [{ path: 'package.json' }])
  assert.equal(firstTurn.observations[0].status, 'succeeded')
  assert.equal(firstTurn.observations[0].output.apiKey, '[redacted]')
  assert.equal(firstTurn.observations[0].output.url, '[media-reference-hidden]')
  assert.equal(visibleTools[0].name, 'read_workspace')
  assert.equal('execute' in visibleTools[0], false)
  assert.equal(JSON.stringify(visibleTools).includes('execute'), false)

  const completed = await session.submitUserMessage('不用了，结束任务')

  assert.equal(completed.status, 'completed')
  assert.equal(completed.turnCount, 2)
  assert.equal(completed.final.apiKey, '[redacted]')
  assert.equal(plannerCalls, 3)

  const serializedEvents = JSON.stringify(session.events())
  assert.doesNotMatch(serializedEvents, /must-not-persist|also-secret|private\.example/)
  const restoredProjection = projectWorkbenchEvents(JSON.parse(serializedEvents))
  assert.deepEqual(restoredProjection, session.snapshot())
})

test('a completed Workbench task can continue in the same session with separate display content', async () => {
  const runtime = deterministicRuntime()
  const plannerMessages = []
  const session = new WorkbenchSession({
    ...runtime,
    planner: ({ session: state }) => {
      plannerMessages.push(state.messages.map(message => ({
        role: message.role,
        content: message.content
      })))
      return {
        type: 'finish',
        result: { content: `第 ${state.turnCount} 轮完成` }
      }
    }
  })

  const first = await session.submitUserMessage(
    '分析附件\n\n<attachment name="notes.txt">内部正文</attachment>',
    { displayContent: '分析附件' }
  )
  assert.equal(first.status, 'completed')
  assert.equal(first.messages[0].displayContent, '分析附件')
  assert.equal(first.messages.length, 2)
  assert.deepEqual(first.messages.map(message => message.role), ['user', 'assistant'])
  assert.equal(first.messages[1].content, '第 1 轮完成')
  assert.equal(first.messages[1].final, true)
  assert.equal(first.final.content, '第 1 轮完成')

  const second = await session.submitUserMessage('继续检查结果')
  assert.equal(second.status, 'completed')
  assert.equal(second.turnCount, 2)
  assert.equal(second.messages.length, 4)
  assert.deepEqual(second.messages.map(message => message.role), ['user', 'assistant', 'user', 'assistant'])
  assert.deepEqual(second.messages.filter(message => message.final).map(message => message.content), [
    '第 1 轮完成',
    '第 2 轮完成'
  ])
  assert.equal(second.final.content, '第 2 轮完成')
  assert.equal(second.completedAt > first.completedAt, true)
  assert.deepEqual(plannerMessages[1], [
    { role: 'user', content: '分析附件\n\n<attachment name="notes.txt">内部正文</attachment>' },
    { role: 'assistant', content: '第 1 轮完成' },
    { role: 'user', content: '继续检查结果' }
  ])
  assert.deepEqual(projectWorkbenchEvents(session.events()).messages, second.messages)
})

test('dangerous tools pause for approval and execute only after approval', async () => {
  const runtime = deterministicRuntime()
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('delete_file', defineTool({
    name: 'delete_file',
    description: 'Delete one file',
    riskLevel: 'dangerous',
    approvalPolicy: 'on_danger'
  }, async input => {
    executions += 1
    return { deleted: input.path }
  }))
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length === 0
      ? { type: 'tool_call', name: 'delete_file', input: { path: 'tmp.txt' } }
      : { type: 'finish', result: { deleted: true } }
  })

  const waiting = await session.submitUserMessage('删除临时文件')

  assert.equal(waiting.status, 'awaiting_approval')
  assert.equal(waiting.toolCalls[0].riskLevel, 'dangerous')
  assert.equal(waiting.toolCalls[0].approvalStatus, 'pending')
  assert.equal(waiting.approvals[0].status, 'pending')
  assert.equal(executions, 0)

  const completed = await session.resolveApproval(waiting.pendingApproval.id, {
    status: 'approved',
    reason: '用户确认仅删除 tmp.txt'
  })

  assert.equal(executions, 1)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.approvals[0].status, 'approved')
  assert.equal(completed.observations[0].status, 'succeeded')
})

test('read_only mode executes only safe tools that never require approval', async () => {
  const registry = new ToolRegistry()
  const executions = []
  registry.register('read_file', defineTool({
    name: 'read_file',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    executions.push('read_file')
    return { content: 'ok' }
  }))
  registry.register('network_probe', defineTool({
    name: 'network_probe',
    riskLevel: 'caution',
    approvalPolicy: 'never'
  }, async () => {
    executions.push('network_probe')
    return { ok: true }
  }))
  registry.register('write_file', defineTool({
    name: 'write_file',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions.push('write_file')
    return { ok: true }
  }))
  const actions = ['read_file', 'network_probe', 'write_file']
  const plannerModes = []
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    approvalMode: 'read_only',
    toolRegistry: registry,
    planner: ({ session: state }) => {
      plannerModes.push(state.approvalMode)
      const name = actions[state.toolCalls.length]
      return name ? { type: 'tool_call', name } : { type: 'finish', result: { ok: true } }
    }
  })

  const completed = await session.submitUserMessage('只读检查')

  assert.equal(completed.status, 'completed')
  assert.equal(completed.approvalMode, 'read_only')
  assert.deepEqual(executions, ['read_file'])
  assert.deepEqual(completed.observations.map(item => item.status), ['succeeded', 'rejected', 'rejected'])
  assert.deepEqual(completed.observations.slice(1).map(item => item.error.code), [
    'TOOL_BLOCKED_BY_APPROVAL_MODE',
    'TOOL_BLOCKED_BY_APPROVAL_MODE'
  ])
  assert.deepEqual(completed.toolCalls.map(item => item.approvalStatus), [
    'not_required',
    'rejected',
    'rejected'
  ])
  assert.equal(completed.pendingApproval, null)
  assert.equal(plannerModes.every(mode => mode === 'read_only'), true)
})

test('auto mode approves the Workbench gate without bypassing the tool runtime', async () => {
  const registry = new ToolRegistry()
  const runtimeApprovals = []
  registry.register('write_file', defineTool({
    name: 'write_file',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async (_input, runtime) => {
    runtimeApprovals.push(runtime.toolCall.approvalStatus)
    return { ok: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    approvalMode: 'auto',
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { ok: true } }
      : { type: 'tool_call', name: 'write_file', input: { path: 'notes.txt' } }
  })

  const completed = await session.submitUserMessage('自动更新文件')

  assert.equal(completed.status, 'completed')
  assert.deepEqual(runtimeApprovals, ['approved'])
  assert.equal(completed.approvals[0].status, 'approved')
  assert.equal(completed.approvals[0].resolution, 'auto')
  assert.equal(completed.pendingApproval, null)
  assert.equal(session.events().some(event => event.type === 'approval_requested'), true)
})

test('restoring auto-mode history resets effective authority to ask', async () => {
  const runtime = deterministicRuntime()
  const registry = new ToolRegistry()
  let executions = 0
  registry.register('write_file', defineTool({
    name: 'write_file',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { ok: true }
  }))
  const planner = ({ session: state }) => state.turnCount > state.toolCalls.length
    ? { type: 'tool_call', name: 'write_file', input: { path: `turn-${state.turnCount}.txt` } }
    : { type: 'finish', result: { ok: true } }
  const original = new WorkbenchSession({
    ...runtime,
    approvalMode: 'auto',
    toolRegistry: registry,
    planner
  })
  await original.submitUserMessage('第一轮')
  assert.equal(executions, 1)

  const restored = new WorkbenchSession({
    ...runtime,
    sessionId: original.sessionId,
    events: JSON.parse(JSON.stringify(original.events())),
    approvalMode: 'auto',
    toolRegistry: registry,
    planner
  })

  assert.equal(restored.snapshot().approvalMode, 'ask')
  assert.equal(restored.snapshot().recordedApprovalMode, 'auto')
  assert.equal(projectWorkbenchEvents(restored.events()).approvalMode, 'ask')
  assert.equal(projectWorkbenchEvents(restored.events()).recordedApprovalMode, 'auto')

  const pending = await restored.submitUserMessage('第二轮')
  assert.equal(pending.status, 'awaiting_approval')
  assert.equal(pending.approvalMode, 'ask')
  assert.equal(executions, 1)
})

test('approval mode cannot change while an approval is pending', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  registry.register('publish', defineTool({
    name: 'publish',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { ok: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { content: '只读模式未发布' } }
      : { type: 'tool_call', name: 'publish' }
  })

  const pending = await session.submitUserMessage('发布')
  assert.equal(pending.status, 'awaiting_approval')
  await assert.rejects(
    session.setApprovalMode('read_only'),
    error => error.code === 'APPROVAL_MODE_CHANGE_UNSAFE'
  )

  assert.equal(executions, 0)
  assert.equal(session.snapshot().status, 'awaiting_approval')
  assert.equal(session.snapshot().approvalMode, 'ask')
  assert.equal(session.snapshot().observations.length, 0)
})

test('approval mode cannot race a planner that is already running', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  registry.register('publish', defineTool({
    name: 'publish',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { ok: true }
  }))
  let releasePlanner
  let markPlannerStarted
  const plannerStarted = new Promise(resolve => { markPlannerStarted = resolve })
  const plannerGate = new Promise(resolve => { releasePlanner = resolve })
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: async () => {
      markPlannerStarted()
      await plannerGate
      return { type: 'tool_call', name: 'publish' }
    }
  })

  const running = session.submitUserMessage('发布')
  await plannerStarted
  await assert.rejects(
    session.setApprovalMode('auto'),
    error => error.code === 'APPROVAL_MODE_CHANGE_UNSAFE'
  )
  releasePlanner()
  const pending = await running

  assert.equal(pending.status, 'awaiting_approval')
  assert.equal(pending.approvalMode, 'ask')
  assert.equal(executions, 0)
})

test('rejected approval becomes an observation and lets the planner explain or reroute', async () => {
  const runtime = deterministicRuntime()
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('publish_release', defineTool({
    name: 'publish_release',
    description: 'Publish a release externally',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { published: true }
  }))
  const plannerObservations = []
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: ({ session: state }) => {
      plannerObservations.push(state.observations)
      if (state.observations.length === 0) return { type: 'tool_call', name: 'publish_release' }
      return { type: 'message', content: '已取消发布，现有本地内容没有改变。' }
    }
  })

  const waiting = await session.submitUserMessage('发布这个版本')
  const resumed = await session.resolveApproval(waiting.pendingApproval.id, {
    status: 'rejected',
    reason: '先不要发到外部'
  })

  assert.equal(executions, 0)
  assert.equal(resumed.status, 'awaiting_user')
  assert.equal(resumed.approvals[0].status, 'rejected')
  assert.equal(resumed.observations[0].status, 'rejected')
  assert.equal(resumed.observations[0].error.code, 'TOOL_APPROVAL_REJECTED')
  assert.equal(plannerObservations.at(-1)[0].status, 'rejected')
  assert.match(resumed.messages.at(-1).content, /取消发布/)
})

test('a serialized pending approval cannot replay a side effect without raw in-memory input', async () => {
  const runtime = deterministicRuntime()
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('write_config', defineTool({
    name: 'write_config',
    riskLevel: 'dangerous',
    approvalPolicy: 'on_danger'
  }, async () => {
    executions += 1
    return { written: true }
  }))
  const planner = ({ session: state }) => state.observations.length === 0
    ? { type: 'tool_call', name: 'write_config', input: { path: 'app.json' } }
    : { type: 'finish', result: { ok: true } }
  const original = new WorkbenchSession({ ...runtime, toolRegistry: registry, planner })
  const waiting = await original.submitUserMessage('修改配置')
  const persisted = JSON.parse(JSON.stringify(original.events()))

  const restored = new WorkbenchSession({
    ...runtime,
    sessionId: original.sessionId,
    events: persisted,
    toolRegistry: registry,
    planner
  })
  await assert.rejects(
    restored.resolveApproval(waiting.pendingApproval.id, 'approved'),
    error => error.code === 'WORKBENCH_RAW_TOOL_INPUT_UNAVAILABLE'
  )
  await assert.rejects(
    restored.setApprovalMode('auto'),
    error => error.code === 'APPROVAL_MODE_CHANGE_UNSAFE'
  )
  assert.equal(executions, 0)
  assert.equal(restored.snapshot().status, 'awaiting_approval')
  assert.equal(restored.snapshot().approvalMode, 'ask')

  const result = await restored.resolveApproval(waiting.pendingApproval.id, 'rejected')

  assert.equal(executions, 0)
  assert.equal(result.status, 'completed')
  assert.equal(result.eventCount, persisted.length + 4)
  assert.deepEqual(projectWorkbenchEvents(restored.events()), result)
})

test('guidance supersedes an in-flight planner action before a stale tool can execute', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  registry.register('stale_write', defineTool({
    name: 'stale_write',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    executions += 1
    return { ok: true }
  }))
  let releasePlanner
  let markPlannerStarted
  const plannerStarted = new Promise(resolve => { markPlannerStarted = resolve })
  const plannerGate = new Promise(resolve => { releasePlanner = resolve })
  let plannerCalls = 0
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: async ({ session: state }) => {
      plannerCalls += 1
      if (plannerCalls === 1) {
        markPlannerStarted()
        await plannerGate
        return { type: 'tool_call', name: 'stale_write', input: { value: '旧计划' } }
      }
      assert.equal(state.lastGuidance.content, '不要执行旧写入，直接结束')
      assert.equal(state.messages.at(-1).guidance, true)
      return { type: 'finish', result: { content: '已按最新引导结束' } }
    }
  })

  const running = session.submitUserMessage('开始处理')
  await plannerStarted
  const guided = await session.submitGuidance('不要执行旧写入，直接结束')
  assert.equal(guided.guidancePending, true)
  assert.equal(guided.turnCount, 1)
  releasePlanner()
  const completed = await running

  assert.equal(completed.status, 'completed')
  assert.equal(completed.turnCount, 1)
  assert.equal(completed.guidancePending, false)
  assert.equal(completed.guidanceCount, 1)
  assert.equal(executions, 0)
  assert.equal(completed.toolCalls.length, 0)
  assert.equal(plannerCalls, 2)
  assert.equal(session.events().filter(event => event.type === 'planning_superseded').length, 1)
})

test('guidance received during a tool run is checkpointed for the next planner step', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  let releaseTool
  let markToolStarted
  const toolStarted = new Promise(resolve => { markToolStarted = resolve })
  const toolGate = new Promise(resolve => { releaseTool = resolve })
  registry.register('long_read', defineTool({
    name: 'long_read',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    executions += 1
    markToolStarted()
    await toolGate
    return { content: '读取完成' }
  }))
  const plannerSnapshots = []
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: ({ session: state }) => {
      plannerSnapshots.push(state)
      return state.observations.length === 0
        ? { type: 'tool_call', name: 'long_read' }
        : { type: 'finish', result: { content: '已结合新引导完成' } }
    }
  })

  const running = session.submitUserMessage('读取项目')
  await toolStarted
  const guided = await session.submitGuidance('读取完成后只总结，不要再调用工具')
  assert.equal(guided.guidancePending, true)
  assert.equal(executions, 1)
  releaseTool()
  const completed = await running

  assert.equal(completed.status, 'completed')
  assert.equal(executions, 1)
  assert.equal(plannerSnapshots.length, 2)
  assert.equal(plannerSnapshots[1].lastGuidance.content, '读取完成后只总结，不要再调用工具')
  assert.equal(plannerSnapshots[1].observations[0].status, 'succeeded')
  const guidanceEvent = session.events().find(event => event.type === 'user_guidance')
  const observationEvent = session.events().find(event => event.type === 'observation')
  assert.ok(guidanceEvent.seq < observationEvent.seq)
})

test('guidance rejects a pending approval and never executes or replays its raw input', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  const rawSecret = 'Bearer secret-token-value-1234567890'
  registry.register('publish_secret', defineTool({
    name: 'publish_secret',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { published: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length === 0
      ? {
          type: 'tool_call',
          name: 'publish_secret',
          input: { authorization: rawSecret, destination: 'production' }
        }
      : { type: 'finish', result: { content: '已废弃旧发布，改用只读方案' } }
  })

  const waiting = await session.submitUserMessage('发布到生产环境')
  assert.equal(waiting.status, 'awaiting_approval')
  const completed = await session.submitGuidance('不要发布，改用只读检查')

  assert.equal(completed.status, 'completed')
  assert.equal(executions, 0)
  assert.equal(completed.pendingApproval, null)
  assert.equal(completed.approvals[0].status, 'rejected')
  assert.equal(completed.approvals[0].resolution, 'policy')
  assert.equal(completed.toolCalls[0].status, 'rejected')
  assert.equal(completed.toolCalls[0].approvalStatus, 'rejected')
  assert.equal(completed.observations[0].status, 'rejected')
  assert.equal(completed.observations[0].error.name, 'UserGuidanceRejected')
  assert.equal(completed.observations[0].error.code, 'TOOL_SUPERSEDED_BY_GUIDANCE')
  assert.equal(completed.lastGuidance.content, '不要发布，改用只读检查')
  assert.doesNotMatch(JSON.stringify(session.events()), /secret-token-value/)
})

test('cancel must settle before resume and an unfinished tool is abandoned without replay', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  let releaseTool
  let markToolStarted
  const toolStarted = new Promise(resolve => { markToolStarted = resolve })
  const toolGate = new Promise(resolve => { releaseTool = resolve })
  let plannerCalls = 0
  registry.register('slow_tool', defineTool({
    name: 'slow_tool',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    executions += 1
    markToolStarted()
    await toolGate
    return { ok: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: ({ session: state }) => {
      plannerCalls += 1
      return state.resumeCount > 0
        ? { type: 'finish', result: { content: '恢复后重新规划完成' } }
        : { type: 'tool_call', name: 'slow_tool' }
    }
  })
  const sessionId = session.sessionId

  const running = session.submitUserMessage('执行慢任务')
  await toolStarted
  assert.equal(session.cancel('用户停止'), true)
  let runningSettled = false
  void running.then(
    () => { runningSettled = true },
    () => { runningSettled = true }
  )
  const cancelledRun = assert.rejects(
    running,
    error => error.code === 'WORKBENCH_CANCELLED'
  )
  await new Promise(resolve => setImmediate(resolve))

  assert.equal(session.snapshot().status, 'cancelled')
  assert.equal(runningSettled, false)
  await assert.rejects(
    session.resume(),
    error => error.code === 'WORKBENCH_RESUME_BUSY'
  )
  assert.equal(plannerCalls, 1)
  assert.equal(session.events().filter(event => event.type === 'resumed').length, 0)

  releaseTool()
  await cancelledRun
  assert.equal(runningSettled, true)
  const completed = await session.resume()

  assert.equal(completed.sessionId, sessionId)
  assert.equal(completed.status, 'completed')
  assert.equal(completed.resumeCount, 1)
  assert.equal(completed.error, null)
  assert.equal(executions, 1)
  assert.equal(completed.toolCalls.length, 1)
  assert.equal(completed.toolCalls[0].status, 'abandoned')
  assert.equal(plannerCalls, 2)
  assert.equal(session.events().filter(event => event.type === 'tool_call').length, 1)
  assert.equal(session.events().filter(event => event.type === 'resumed').length, 1)
})

test('a new user turn clears prior live guidance while preserving its audit message', async () => {
  let releasePlanner
  let markPlannerStarted
  const plannerStarted = new Promise(resolve => { markPlannerStarted = resolve })
  const plannerGate = new Promise(resolve => { releasePlanner = resolve })
  const plannerSnapshots = []
  let plannerCalls = 0
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    planner: async ({ session: state }) => {
      plannerCalls += 1
      plannerSnapshots.push(state)
      if (plannerCalls === 1) {
        markPlannerStarted()
        await plannerGate
        return { type: 'message', content: '过期回复' }
      }
      if (plannerCalls === 2) {
        assert.equal(state.lastGuidance.content, '第一轮只做总结')
        return { type: 'message', content: '第一轮完成' }
      }
      assert.equal(state.lastGuidance, null)
      assert.equal(state.turnGuidanceCount, 0)
      return { type: 'finish', result: { content: '第二轮完成' } }
    }
  })

  const firstRunning = session.submitUserMessage('开始第一轮')
  await plannerStarted
  await session.submitGuidance('第一轮只做总结')
  releasePlanner()
  const first = await firstRunning
  assert.equal(first.status, 'awaiting_user')
  assert.equal(first.lastGuidance.content, '第一轮只做总结')

  const second = await session.submitUserMessage('开始新的第二轮，不沿用旧引导')

  assert.equal(second.status, 'completed')
  assert.equal(second.lastGuidance, null)
  assert.equal(plannerSnapshots[2].lastGuidance, null)
  assert.equal(second.messages.some(message => message.guidance && message.content === '第一轮只做总结'), true)
})

test('restored cancelled history resumes in ask mode and abandons raw pending tools', async () => {
  const registry = new ToolRegistry()
  let executions = 0
  const rawSecret = 'sk-history-secret-value-1234567890'
  registry.register('dangerous_write', defineTool({
    name: 'dangerous_write',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async () => {
    executions += 1
    return { ok: true }
  }))
  const runtime = deterministicRuntime()
  const original = new WorkbenchSession({
    ...runtime,
    approvalMode: 'ask',
    toolRegistry: registry,
    planner: () => ({
      type: 'tool_call',
      name: 'dangerous_write',
      input: { path: 'old.txt', apiKey: rawSecret }
    })
  })
  const waiting = await original.submitUserMessage('写入旧内容')
  assert.equal(waiting.status, 'awaiting_approval')
  assert.equal(original.cancel('稍后继续'), true)
  const persisted = JSON.parse(JSON.stringify(original.events()))
  assert.doesNotMatch(JSON.stringify(persisted), /history-secret-value/)

  const restored = new WorkbenchSession({
    ...runtime,
    sessionId: original.sessionId,
    events: persisted,
    approvalMode: 'full_access',
    toolRegistry: registry,
    planner: ({ session: state }) => state.resumeCount > 0 && state.toolCalls.length === 1
      ? { type: 'tool_call', name: 'dangerous_write', input: { path: 'new.txt' } }
      : { type: 'finish', result: { content: '完成' } }
  })

  assert.equal(restored.snapshot().status, 'cancelled')
  assert.equal(restored.snapshot().approvalMode, 'ask')
  const resumed = await restored.resume()

  assert.equal(resumed.status, 'awaiting_approval')
  assert.equal(resumed.approvalMode, 'ask')
  assert.equal(resumed.resumeCount, 1)
  assert.equal(executions, 0)
  assert.equal(resumed.toolCalls.length, 2)
  assert.equal(resumed.toolCalls[0].status, 'abandoned')
  assert.equal(resumed.toolCalls[0].approvalStatus, 'rejected')
  assert.equal(resumed.approvals[0].status, 'rejected')
  assert.equal(resumed.approvals[0].resolution, 'policy')
  assert.equal(resumed.toolCalls[1].status, 'awaiting_approval')
  assert.equal(resumed.toolCalls[1].approvalStatus, 'pending')
  assert.equal(restored.cancel('测试结束'), true)
})

test('guidance is bounded per turn and serialized with credential redaction', async () => {
  let releasePlanner
  let markPlannerStarted
  const plannerStarted = new Promise(resolve => { markPlannerStarted = resolve })
  const plannerGate = new Promise(resolve => { releasePlanner = resolve })
  let plannerCalls = 0
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    planner: async () => {
      plannerCalls += 1
      if (plannerCalls === 1) {
        markPlannerStarted()
        await plannerGate
      }
      return { type: 'finish', result: { content: '完成' } }
    }
  })

  const running = session.submitUserMessage('开始')
  await plannerStarted
  await assert.rejects(
    session.submitGuidance('x'.repeat(WORKBENCH_GUIDANCE_MAX_CHARACTERS + 1)),
    error => error.code === 'WORKBENCH_GUIDANCE_TOO_LONG'
  )
  const guidanceSecret = 'API_KEY=sk-guidance-secret-value-1234567890'
  await session.submitGuidance(guidanceSecret)
  for (let index = 1; index < WORKBENCH_GUIDANCE_MAX_PER_TURN; index += 1) {
    await session.submitGuidance(`补充引导 ${index}`)
  }
  await assert.rejects(
    session.submitGuidance('超过本轮频率限制'),
    error => error.code === 'WORKBENCH_GUIDANCE_RATE_LIMITED'
  )
  assert.equal(session.snapshot().turnGuidanceCount, WORKBENCH_GUIDANCE_MAX_PER_TURN)
  assert.doesNotMatch(JSON.stringify(session.events()), /guidance-secret-value/)
  releasePlanner()
  const completed = await running

  assert.equal(completed.status, 'completed')
  assert.equal(completed.guidanceCount, WORKBENCH_GUIDANCE_MAX_PER_TURN)
  assert.equal(plannerCalls, 2)
})

test('tool failures are observations so the planner can recover within the same turn', async () => {
  const runtime = deterministicRuntime()
  const registry = new ToolRegistry()
  registry.register('run_check', defineTool({
    name: 'run_check',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    const error = new Error('command failed')
    error.code = 'COMMAND_FAILED'
    throw error
  }))
  const session = new WorkbenchSession({
    ...runtime,
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length === 0
      ? { type: 'tool_call', name: 'run_check' }
      : { type: 'message', content: '检查命令失败，我可以换一种方式继续。' }
  })

  const result = await session.submitUserMessage('运行项目检查')

  assert.equal(result.status, 'awaiting_user')
  assert.equal(result.observations[0].status, 'failed')
  assert.equal(result.observations[0].error.code, 'COMMAND_FAILED')
  assert.equal(result.error, null)
})

test('invalid or endless planner actions fail the session with serializable events', async () => {
  const invalid = new WorkbenchSession({
    ...deterministicRuntime(),
    planner: () => ({ type: 'unsupported' })
  })
  await assert.rejects(
    invalid.submitUserMessage('开始'),
    error => error.code === 'INVALID_NEXT_ACTION'
  )
  assert.equal(invalid.snapshot().status, 'failed')

  const endless = new WorkbenchSession({
    ...deterministicRuntime(),
    maxActionsPerTurn: 2,
    planner: () => ({ type: 'tool_call', name: 'missing_tool' })
  })
  await assert.rejects(
    endless.submitUserMessage('继续调用'),
    error => error.code === 'MAX_ACTIONS_EXCEEDED'
  )
  assert.equal(endless.snapshot().observations.length, 2)
  assert.equal(endless.snapshot().status, 'failed')
  assert.doesNotThrow(() => JSON.stringify(endless.snapshot()))
  assert.doesNotThrow(() => JSON.stringify(endless.events()))
})

test('a session paused for approval can be cancelled without executing the tool', async () => {
  let executions = 0
  const registry = new ToolRegistry()
  registry.register('external_write', defineTool({
    name: 'external_write',
    riskLevel: 'dangerous',
    approvalPolicy: 'on_danger'
  }, async () => { executions += 1 }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: () => ({ type: 'tool_call', name: 'external_write' })
  })

  await session.submitUserMessage('写入外部系统')
  assert.equal(session.cancel('用户取消任务'), true)
  assert.equal(session.snapshot().status, 'cancelled')
  assert.equal(executions, 0)
  assert.equal(session.cancel(), false)
})

test('Workbench keeps ordinary URL tool inputs intact but redacts embedded credentials', async () => {
  const calls = []
  const source = [
    'const secret = process.env.APP_SECRET',
    'const password = config.password',
    'const hardcodedToken = "ghp_1234567890abcdefghijklmnop"',
    'Docs: https://example.com/guide'
  ].join('\n')
  const registry = new ToolRegistry()
  registry.register('write_text', defineTool({
    name: 'write_text',
    riskLevel: 'dangerous',
    approvalPolicy: 'always'
  }, async input => {
    calls.push(input)
    return { content: 'OPENAI_API_KEY=sk-super-secret-value-1234567890', saved: true }
  }))
  const session = new WorkbenchSession({
    ...deterministicRuntime(),
    toolRegistry: registry,
    planner: ({ session: state }) => state.observations.length
      ? { type: 'finish', result: { ok: true } }
      : { type: 'tool_call', name: 'write_text', input: { content: source } }
  })

  const pending = await session.submitUserMessage('写入文档链接')
  await session.resolveApproval(pending.pendingApproval.id, 'approved')

  assert.equal(calls[0].content, source)
  assert.match(pending.toolCalls[0].input.content, /process\.env\.APP_SECRET/)
  assert.match(pending.toolCalls[0].input.content, /config\.password/)
  assert.doesNotMatch(pending.toolCalls[0].input.content, /ghp_1234567890/)
  assert.doesNotMatch(JSON.stringify(session.snapshot()), /super-secret|sk-super/)
  assert.match(session.snapshot().observations[0].output.content, /\[redacted\]|\[credential-redacted\]/)
})

test('Workbench text sanitizer redacts generic assignments and URI userinfo', () => {
  const sanitized = sanitizeWorkbenchValue({
    content: [
      'AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      'DATABASE_URL=postgres://admin:database-password@db.example/app',
      'https://user:basic-password@example.com/private',
      '{"password":"hunter2","client_secret":"plainsecret"}'
    ].join('\n'),
    AWS_SECRET_ACCESS_KEY: 'raw-aws-secret',
    databasePassword: 'raw-database-password',
    nested: {
      client_secret: 'raw-client-secret',
      nonsecretSetting: 'visible'
    }
  })
  const serialized = JSON.stringify(sanitized)

  assert.doesNotMatch(serialized, /wJalr|database-password|basic-password|hunter2|plainsecret|raw-aws-secret|raw-client-secret/)
  assert.match(sanitized.content, /AWS_SECRET_ACCESS_KEY=\[redacted\]/)
  assert.match(sanitized.content, /postgres:\/\/admin:\[redacted\]@/)
  assert.match(sanitized.content, /https:\/\/user:\[redacted\]@/)
  assert.match(sanitized.content, /"password":"\[redacted\]"/)
  assert.match(sanitized.content, /"client_secret":"\[redacted\]"/)
  assert.equal(sanitized.AWS_SECRET_ACCESS_KEY, '[redacted]')
  assert.equal(sanitized.databasePassword, '[redacted]')
  assert.equal(sanitized.nested.client_secret, '[redacted]')
  assert.equal(sanitized.nested.nonsecretSetting, 'visible')
})

test('Workbench rejects registered tools without an explicit ToolDefinition', () => {
  const registry = new ToolRegistry({ unsafe: async () => ({ ok: true }) })
  assert.throws(
    () => new WorkbenchSession({ planner: () => ({ type: 'finish' }), toolRegistry: registry }),
    error => error.code === 'WORKBENCH_TOOL_DEFINITION_REQUIRED'
  )
})

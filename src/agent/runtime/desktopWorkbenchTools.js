import { ToolRegistry } from '../core/ToolRegistry.js'
import { defineTool } from '../workbench/index.js'

const TERMINAL_DONE = new Set(['completed', 'failed', 'cancelled', 'timed_out', 'termination_unconfirmed'])

function desktopUnavailable(capability) {
  const error = new Error(`${capability} 只在 YUFENG Desktop App 中可用`)
  error.code = 'DESKTOP_TOOL_UNAVAILABLE'
  throw error
}

function desktopApi(injected) {
  if (injected !== undefined) return injected
  try {
    return globalThis.window?.desktopApp?.agentTools || null
  } catch {
    return null
  }
}

function requireMethod(api, method, capability = method) {
  if (typeof api?.[method] !== 'function') desktopUnavailable(capability)
  return api[method].bind(api)
}

function approvalFor(runtime, action) {
  if (runtime?.toolCall?.approvalStatus !== 'approved') {
    const error = new Error(`工具 ${runtime?.toolCall?.name || action} 尚未获得用户批准`)
    error.code = 'WORKBENCH_TOOL_NOT_APPROVED'
    throw error
  }
  return { granted: true, action }
}

function delay(ms, signal) {
  if (signal?.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      callback(value)
    }
    const timer = setTimeout(() => finish(resolve), ms)
    const onAbort = () => {
      finish(reject, signal.reason || new DOMException('Cancelled', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

async function waitForCommand(api, jobId, signal) {
  const getCommand = requireMethod(api, 'getCommand', 'terminal.run')
  const cancelCommand = typeof api?.cancelCommand === 'function' ? api.cancelCommand.bind(api) : null
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError')
      const job = await getCommand({ jobId })
      if (job?.status === 'termination_unconfirmed') {
        const error = new Error('终端进程未确认完全退出；可能仍有脱离受控进程组的后台后代')
        error.code = 'TERMINAL_TERMINATION_UNCONFIRMED'
        throw error
      }
      if (TERMINAL_DONE.has(job?.status)) return job
      await delay(180, signal)
    }
  } catch (error) {
    if (signal?.aborted && cancelCommand) await cancelCommand({ jobId }).catch(() => null)
    throw error
  }
}

function jsonSchema(properties, required = []) {
  return { type: 'object', properties, ...(required.length ? { required } : {}) }
}

export function createDesktopWorkbenchToolRegistry({
  desktopAgentTools: injectedDesktopAgentTools,
  creativeAgent = null,
  sendChat = null,
  onScreenshot = null,
  onCreativeArtifacts = null
} = {}) {
  const api = desktopApi(injectedDesktopAgentTools)
  const registry = new ToolRegistry()

  registry.register('workspace.get', defineTool({
    name: 'workspace.get',
    description: '读取用户已选择的本地工作区根目录和桌面工具能力。',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, async () => {
    const getWorkspaceRoot = requireMethod(api, 'getWorkspaceRoot', 'workspace.get')
    const getCapabilities = typeof api?.getCapabilities === 'function' ? api.getCapabilities.bind(api) : null
    const [workspace, capabilities] = await Promise.all([
      getWorkspaceRoot(),
      getCapabilities ? getCapabilities() : null
    ])
    return { ...workspace, capabilities }
  }))

  registry.register('workspace.list', defineTool({
    name: 'workspace.list',
    description: '列出工作区内一个目录的直接子项。只能访问用户选择的 workspace root。',
    riskLevel: 'safe',
    approvalPolicy: 'never',
    inputSchema: jsonSchema({
      path: { type: 'string', description: '相对工作区路径，默认 .' },
      maxEntries: { type: 'integer', minimum: 1, maximum: 500 }
    })
  }, input => requireMethod(api, 'listFiles', 'workspace.list')(input)))

  registry.register('workspace.read', defineTool({
    name: 'workspace.read',
    description: '读取工作区内文本文件。拒绝二进制、路径逃逸和超大文件。',
    riskLevel: 'safe',
    approvalPolicy: 'never',
    inputSchema: jsonSchema({ path: { type: 'string' } }, ['path'])
  }, input => requireMethod(api, 'readFile', 'workspace.read')(input)))

  registry.register('workspace.search', defineTool({
    name: 'workspace.search',
    description: '在工作区文本文件中搜索字符串，返回文件、行号和有限摘要。',
    riskLevel: 'safe',
    approvalPolicy: 'never',
    inputSchema: jsonSchema({
      query: { type: 'string' },
      path: { type: 'string', description: '相对目录，默认 .' },
      maxResults: { type: 'integer', minimum: 1, maximum: 200 }
    }, ['query'])
  }, input => requireMethod(api, 'searchFiles', 'workspace.search')(input)))

  registry.register('workspace.write', defineTool({
    name: 'workspace.write',
    description: '创建或完整替换工作区内一个文本文件。执行前必须让用户审核路径和内容。',
    riskLevel: 'dangerous',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({
      path: { type: 'string' },
      content: { type: 'string' },
      create: { type: 'boolean' }
    }, ['path', 'content'])
  }, (input, runtime) => requireMethod(api, 'writeFile', 'workspace.write')({
    ...input,
    approval: approvalFor(runtime, 'workspace.write')
  })))

  registry.register('terminal.run', defineTool({
    name: 'terminal.run',
    description: '在工作区目录内运行一个 executable 与参数数组；不使用 shell 拼接。执行前必须批准。',
    riskLevel: 'dangerous',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({
      command: { type: 'string', description: '例如 git、node、pnpm；不能包含路径分隔符' },
      args: { type: 'array', items: { type: 'string' } },
      cwd: { type: 'string', description: '工作区相对目录，默认 .' },
      timeoutMs: { type: 'integer', minimum: 100, maximum: 300000 }
    }, ['command'])
  }, async (input, runtime) => {
    const startCommand = requireMethod(api, 'startCommand', 'terminal.run')
    const started = await startCommand({
      ...input,
      approval: approvalFor(runtime, 'terminal.run')
    })
    if (!started?.jobId) return started
    return waitForCommand(api, started.jobId, runtime.signal)
  }))

  registry.register('computer.permissions', defineTool({
    name: 'computer.permissions',
    description: '检查 macOS 屏幕录制与辅助功能权限，不会请求或修改权限。',
    riskLevel: 'safe',
    approvalPolicy: 'never'
  }, () => requireMethod(api, 'getPermissions', 'computer.permissions')()))

  registry.register('computer.inspect_screen', defineTool({
    name: 'computer.inspect_screen',
    description: '截取当前屏幕并用视觉模型分析界面。截图只保存在当前内存，不写入任务历史。',
    riskLevel: 'dangerous',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({
      instruction: { type: 'string' },
      application: { type: 'string', description: '可选；截图前先激活的 macOS 应用名称' }
    })
  }, async (input, runtime) => {
    const captureScreen = requireMethod(api, 'captureScreen', 'computer.inspect_screen')
    const screenshot = await captureScreen({
      ...(input?.application ? { application: input.application } : {}),
      ...(input?.instruction ? { instruction: input.instruction } : {}),
      approval: approvalFor(runtime, 'computer.capture_screen')
    })
    if (!screenshot?.ok || !screenshot.dataUrl) return screenshot
    const screenshotId = `screen_${Date.now()}`
    onScreenshot?.({
      id: screenshotId,
      dataUrl: screenshot.dataUrl,
      mimeType: screenshot.mimeType,
      size: screenshot.size,
      createdAt: Date.now()
    })

    let analysis = ''
    let analysisError = null
    if (typeof sendChat === 'function') {
      try {
        analysis = await sendChat(
          [
            '分析这张当前桌面截图。',
            input?.instruction ? `用户当前意图：${input.instruction}` : '',
            '描述可见应用、关键控件和完成意图所需的下一步。若建议点击，给出相对可靠的屏幕坐标。',
            '不要猜测截图中不可见的信息。'
          ].filter(Boolean).join('\n'),
          false,
          { images: [screenshot.dataUrl], isolated: true, signal: runtime.signal }
        )
      } catch (error) {
        analysisError = { code: error?.code || 'SCREEN_ANALYSIS_FAILED', message: error?.message || String(error) }
      }
    }
    return {
      ok: true,
      screenshotId,
      mimeType: screenshot.mimeType,
      size: screenshot.size,
      analysis,
      ...(analysisError ? { analysisError } : {})
    }
  }))

  registry.register('computer.open_application', defineTool({
    name: 'computer.open_application',
    description: '在 macOS 打开指定应用。执行前必须批准。',
    riskLevel: 'dangerous',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({ application: { type: 'string' } }, ['application'])
  }, (input, runtime) => requireMethod(api, 'openApplication', 'computer.open_application')({
    ...input,
    approval: approvalFor(runtime, 'computer.open_application')
  })))

  registry.register('computer.click', defineTool({
    name: 'computer.click',
    description: '在 macOS 当前屏幕坐标执行一次点击。执行前必须批准，并应先检查屏幕。',
    riskLevel: 'dangerous',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({
      application: { type: 'string', description: '点击前要激活的 macOS 应用名称' },
      x: { type: 'integer' },
      y: { type: 'integer' }
    }, ['application', 'x', 'y'])
  }, (input, runtime) => requireMethod(api, 'click', 'computer.click')({
    ...input,
    approval: approvalFor(runtime, 'computer.click')
  })))

  registry.register('computer.type_text', defineTool({
    name: 'computer.type_text',
    description: '向 macOS 当前焦点控件输入文本。执行前必须批准，不能用于输入密码或密钥。',
    riskLevel: 'dangerous',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({
      application: { type: 'string', description: '输入前要激活的 macOS 应用名称' },
      text: { type: 'string' }
    }, ['application', 'text'])
  }, (input, runtime) => requireMethod(api, 'typeText', 'computer.type_text')({
    ...input,
    approval: approvalFor(runtime, 'computer.type_text')
  })))

  registry.register('creative.generate', defineTool({
    name: 'creative.generate',
    description: '调用现有 Creative Agent 自主生成并检查图片或视频。可能产生模型费用，执行前必须批准。',
    riskLevel: 'caution',
    approvalPolicy: 'always',
    inputSchema: jsonSchema({
      goal: { type: 'string' },
      targetType: { type: 'string', enum: ['image', 'video'] }
    }, ['goal'])
  }, async (input, runtime) => {
    approvalFor(runtime, 'creative.generate')
    if (typeof creativeAgent?.run !== 'function') desktopUnavailable('creative.generate')
    const result = await creativeAgent.run(input.goal, { targetType: input.targetType, signal: runtime.signal })
    const artifacts = Array.isArray(creativeAgent.artifacts?.value)
      ? creativeAgent.artifacts.value.map(item => ({ ...item }))
      : []
    onCreativeArtifacts?.(artifacts)
    return {
      ok: true,
      status: result?.status || 'completed',
      stepCount: result?.stepCount || 0,
      artifacts: artifacts.map(item => ({
        id: item.id,
        type: item.type || item.kind,
        label: item.label,
        status: item.status,
        model: item.model
      }))
    }
  }))

  return registry
}

export { approvalFor, desktopApi, waitForCommand }

export default createDesktopWorkbenchToolRegistry

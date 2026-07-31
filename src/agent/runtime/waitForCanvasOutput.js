import { watch } from 'vue'
import { nodes, edges } from '@/stores/canvas'

function abortError() {
  const error = new Error('Agent 任务已取消')
  error.name = 'AbortError'
  return error
}

function waitForNodeState(check, {
  timeoutMs = 5 * 60 * 1000,
  signal,
  timeoutMessage = '等待节点执行超时'
} = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stopWatcher = null

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      stopWatcher?.()
      signal?.removeEventListener?.('abort', onAbort)
      callback(value)
    }

    const inspect = () => {
      try {
        const result = check(nodes.value)
        if (result?.error) finish(reject, result.error)
        else if (result?.ready) finish(resolve, result.value)
      } catch (error) {
        finish(reject, error)
      }
    }

    const onAbort = () => finish(reject, abortError())
    const timer = setTimeout(() => finish(reject, new Error(timeoutMessage)), timeoutMs)

    if (signal?.aborted) {
      finish(reject, abortError())
      return
    }

    signal?.addEventListener?.('abort', onAbort, { once: true })
    inspect()
    if (settled) return

    stopWatcher = watch([nodes, edges], inspect, { deep: true })
  })
}

export function waitForConfigOutput(configNodeId, options = {}) {
  return waitForNodeState((allNodes) => {
    const configNode = allNodes.find((node) => node.id === configNodeId)
    if (!configNode) return { ready: false }
    if (configNode.data?.error) {
      return { error: new Error(configNode.data.error) }
    }
    if (configNode.data?.outputNodeId) {
      return { ready: true, value: configNode.data.outputNodeId }
    }

    // ImageConfig persists outputNodeId immediately, while VideoConfig writes it
    // after the provider accepts a task. Both create the output edge up front,
    // so following that edge avoids hiding an immediate provider error behind a
    // long config timeout.
    const outputEdge = edges.value.find((edge) => edge.source === configNodeId)
    const outputNode = outputEdge
      ? allNodes.find((node) => node.id === outputEdge.target && ['image', 'video'].includes(node.type))
      : null
    if (outputNode) return { ready: true, value: outputNode.id }
    return { ready: false }
  }, {
    ...options,
    timeoutMessage: options.timeoutMessage || '等待生成节点启动超时'
  })
}

export function waitForMediaOutput(outputNodeId, mediaType, options = {}) {
  return waitForNodeState((allNodes) => {
    const outputNode = allNodes.find((node) => node.id === outputNodeId)
    if (!outputNode) return { ready: false }
    if (outputNode.data?.error) {
      return { error: new Error(outputNode.data.error) }
    }
    if (outputNode.data?.url && outputNode.data?.loading !== true) {
      return {
        ready: true,
        value: {
          outputNodeId,
          mediaType,
          status: 'completed'
        }
      }
    }
    return { ready: false }
  }, {
    ...options,
    timeoutMessage: options.timeoutMessage || `等待${mediaType === 'image' ? '图片' : '视频'}结果超时`
  })
}

export async function waitForGeneratedMedia(configNodeId, mediaType, options = {}) {
  const outputNodeId = await waitForConfigOutput(configNodeId, options)
  return waitForMediaOutput(outputNodeId, mediaType, options)
}

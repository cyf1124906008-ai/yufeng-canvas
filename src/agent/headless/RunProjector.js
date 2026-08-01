import { RunViewState, sanitizeRunValue } from './RunViewState.js'

const IMAGE_ACTIONS = new Set(['generate_image', 'edit_image', 'upscale_image'])

function artifactType(action, output) {
  if (output?.type) return output.type
  if (IMAGE_ACTIONS.has(action)) return 'image'
  if (action === 'generate_video') return 'video'
  return 'file'
}

function artifactId({ type, step, action, value }) {
  const explicit = value?.artifactId || value?.outputNodeId || value?.id
  return explicit ? String(explicit) : `${type}:${step ?? 'unknown'}:${action || 'output'}`
}

function projectArtifact(output, fallbackAction = '', fallbackStep = null) {
  if (!output) return null
  const action = output.action || fallbackAction
  const step = output.step ?? fallbackStep
  const type = artifactType(action, output)
  const value = sanitizeRunValue(output.value ?? output.result ?? output)
  return {
    id: artifactId({ type, step, action, value }),
    type,
    action: action || null,
    step,
    value,
    createdAt: output.timestamp || null
  }
}

function actionSummary(action, step) {
  if (!action) return null
  return sanitizeRunValue({
    name: action.name || null,
    reason: action.reason || '',
    source: action.source || null,
    step: step ?? null,
    // Inputs are useful to a headless client, but pass through the media and
    // credential scrubber before entering view state.
    input: action.input || {}
  })
}

function errorSummary(error) {
  if (!error) return null
  const safe = sanitizeRunValue(error)
  if (typeof safe === 'string') return { name: 'Error', message: safe }
  const providerCode = error?.lastError?.code || error?.cause?.code || null
  const acceptedByProvider = error?.acceptedByProvider === true ||
    error?.backgroundPending === true ||
    error?.lastError?.acceptedByProvider === true
  return {
    name: safe.name || error.name || 'Error',
    message: safe.message || String(error.message || error),
    ...(safe.code == null ? {} : { code: safe.code }),
    ...(providerCode == null ? {} : { providerCode: String(providerCode) }),
    ...(acceptedByProvider ? { acceptedByProvider: true } : {}),
    ...(error?.taskId || error?.lastError?.taskId
      ? { taskId: String(error.taskId || error.lastError.taskId) }
      : {})
  }
}

function timelineMessage(type, actionName) {
  const action = actionName ? ` ${actionName}` : ''
  return ({
    started: 'Run started',
    planning: 'Planning the next action',
    action: `Selected${action}`,
    tool_started: `Started${action}`,
    tool_succeeded: `Completed${action}`,
    finish_blocked: 'Finish was blocked by verification',
    completed: 'Run completed',
    failed: 'Run failed',
    cancelled: 'Run cancelled'
  })[type] || type
}

function timelineStatus(type, action) {
  if (type === 'completed') return 'completed'
  if (type === 'failed') return 'failed'
  if (type === 'cancelled') return 'cancelled'
  if (type === 'tool_succeeded') return 'completed'
  if (type === 'finish_blocked') return 'retrying'
  if (type === 'planning') return 'planning'
  if (Number(action?.input?.revision || action?.input?.attempt) > 1) return 'retrying'
  return 'running'
}

function finalArtifactId(state = {}) {
  const outputs = Array.isArray(state.outputs) ? state.outputs : []
  if (state.targetType === 'video') {
    const video = [...outputs].reverse().find(output => output?.type === 'video')
    const id = video?.value?.artifactId || video?.value?.id || video?.value?.outputNodeId
    if (id) return String(id)
  }

  const observations = Array.isArray(state.observations) ? state.observations : []
  const acceptedReview = [...observations].reverse().find(observation =>
    observation?.action === 'analyze_image' &&
    (observation?.result?.accepted === true || observation?.result?.decision === 'accept'))
  const reviewedId = acceptedReview?.result?.artifactId ||
    acceptedReview?.result?.imageArtifactId ||
    acceptedReview?.result?.outputNodeId ||
    acceptedReview?.result?.imageNodeId
  if (reviewedId) return String(reviewedId)

  const latest = [...outputs].reverse().find(output => ['image', 'video', 'file'].includes(output?.type))
  const fallbackId = latest?.value?.artifactId || latest?.value?.id || latest?.value?.outputNodeId
  return fallbackId ? String(fallbackId) : null
}

/**
 * Subscribe to AgentRunner lifecycle events and expose a Canvas-free view.
 */
export class RunProjector {
  constructor({ runner = null, maxTimelineEntries = 500, onListenerError = null } = {}) {
    this.view = new RunViewState()
    this.maxTimelineEntries = maxTimelineEntries
    this.onListenerError = onListenerError
    this.listeners = new Set()
    this.runner = null
    this.detachRunner = null
    if (runner) this.attach(runner)
  }

  attach(runner) {
    if (!runner || typeof runner.subscribe !== 'function') {
      throw new TypeError('RunProjector.attach requires an AgentRunner-compatible subscribe()')
    }
    this.detach()
    this.runner = runner
    this.detachRunner = runner.subscribe(event => {
      try {
        this.project(event)
      } catch (error) {
        this.#reportError(error)
      }
    })
    return () => this.detach()
  }

  detach() {
    this.detachRunner?.()
    this.detachRunner = null
    this.runner = null
  }

  subscribe(listener, { emitCurrent = false } = {}) {
    if (typeof listener !== 'function') throw new TypeError('RunProjector listener must be a function')
    this.listeners.add(listener)
    if (emitCurrent) this.#notifyOne(listener, { type: 'snapshot' })
    return () => this.listeners.delete(listener)
  }

  reset(values = {}) {
    this.view.reset(values)
    this.#notify({ type: 'reset' })
    return this.snapshot()
  }

  project(event = {}) {
    if (!event || typeof event !== 'object') throw new TypeError('Run event must be an object')
    const type = String(event.type || 'event')
    const state = event.state && typeof event.state === 'object' ? event.state : {}
    const timestamp = event.timestamp || Date.now()
    const action = event.action || (type === 'action' ? event.action : null)
    const actionName = action?.name || null

    // A projector can remain attached while a runner is reused. A new run id
    // starts a fresh view so artifacts and final state never bleed across runs.
    if (type === 'started' && this.view.runId && state.id && state.id !== this.view.runId) {
      this.view.reset()
    }

    this.view.patch({
      runId: state.id ?? this.view.runId,
      goal: state.goal ?? this.view.goal,
      targetType: state.targetType ?? this.view.targetType,
      status: state.status ?? this.view.status,
      stepCount: state.stepCount ?? this.view.stepCount,
      startedAt: state.startedAt ?? this.view.startedAt,
      completedAt: state.completedAt ?? this.view.completedAt,
      updatedAt: timestamp
    })

    if (type === 'started') {
      this.view.patch({
        status: state.status || 'running',
        currentAction: null,
        final: null,
        error: null,
        startedAt: state.startedAt || timestamp,
        completedAt: null
      })
    } else if (['action', 'tool_started'].includes(type)) {
      this.view.patch({ currentAction: actionSummary(action, state.stepCount) })
    } else if (['tool_succeeded', 'finish_blocked', 'planning'].includes(type)) {
      this.view.patch({ currentAction: null })
    }

    this.#ingestStateOutputs(state.outputs)
    if (type === 'tool_succeeded' && actionName) {
      const stateAlreadyContainsResult = Array.isArray(state.outputs) && state.outputs.some(output =>
        output?.action === actionName && output?.step === state.stepCount)
      const artifact = projectArtifact({
        action: actionName,
        step: state.stepCount,
        value: event.result,
        timestamp
      })
      if (!stateAlreadyContainsResult && artifact &&
          ['image', 'video', 'file'].includes(artifact.type) && actionName !== 'analyze_image') {
        this.view.upsertArtifact(artifact)
      }
    }

    if (type === 'completed') {
      const adoptedArtifactId = finalArtifactId(state)
      this.view.patch({
        status: 'completed',
        currentAction: null,
        error: null,
        completedAt: state.completedAt || timestamp,
        final: {
          status: 'completed',
          stepCount: state.stepCount ?? this.view.stepCount,
          artifactId: adoptedArtifactId,
          artifactIds: this.view.artifacts.map(artifact => artifact.id),
          artifacts: this.view.artifacts
        }
      })
    } else if (type === 'failed' || type === 'cancelled') {
      this.view.patch({
        status: type,
        currentAction: null,
        final: null,
        error: errorSummary(event.error || state.errors?.at?.(-1)),
        completedAt: state.completedAt || timestamp
      })
    }

    this.view.addTimeline({
      type,
      step: state.stepCount ?? this.view.stepCount,
      action: actionName,
      status: timelineStatus(type, action),
      message: timelineMessage(type, actionName),
      timestamp,
      attempt: Number(action?.input?.revision || action?.input?.attempt) || 0,
      artifactRef: event.result?.artifactRef || event.result?.artifactId || action?.input?.artifactRef || null,
      ...(type === 'finish_blocked' ? { verdict: sanitizeRunValue(event.verdict) } : {}),
      ...(['failed', 'cancelled'].includes(type) ? { error: this.view.error } : {})
    }, this.maxTimelineEntries)

    this.#notify(event)
    return this.snapshot()
  }

  snapshot() {
    return this.view.snapshot()
  }

  #ingestStateOutputs(outputs) {
    if (!Array.isArray(outputs)) return
    for (const output of outputs) {
      const artifact = projectArtifact(output)
      if (artifact) this.view.upsertArtifact(artifact)
    }
  }

  #notify(event) {
    for (const listener of this.listeners) this.#notifyOne(listener, event)
  }

  #notifyOne(listener, event) {
    try {
      listener(this.snapshot(), sanitizeRunValue({ type: event.type, timestamp: event.timestamp }))
    } catch (error) {
      this.#reportError(error)
    }
  }

  #reportError(error) {
    try {
      this.onListenerError?.(error)
    } catch {
      // Projection observers must never be able to fail the Agent run.
    }
  }
}

export { projectArtifact }

export default RunProjector

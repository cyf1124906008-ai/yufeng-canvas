/**
 * @typedef {'safe'|'caution'|'dangerous'} ToolRiskLevel
 * @typedef {'never'|'on_danger'|'always'} ToolApprovalPolicy
 * @typedef {'pending'|'approved'|'rejected'} ApprovalStatus
 * @typedef {'succeeded'|'failed'|'rejected'} ObservationStatus
 *
 * @typedef {Object} ToolDefinition
 * @property {string} name
 * @property {string} description
 * @property {Object} inputSchema
 * @property {ToolRiskLevel} riskLevel
 * @property {ToolApprovalPolicy} approvalPolicy
 * @property {Object=} metadata
 *
 * @typedef {Object} ToolCall
 * @property {string} id
 * @property {'tool_call'} type
 * @property {string} name
 * @property {Object} input
 * @property {ToolRiskLevel} riskLevel
 * @property {'not_required'|'pending'|'approved'|'rejected'} approvalStatus
 *
 * @typedef {Object} Approval
 * @property {string} id
 * @property {string} toolCallId
 * @property {ApprovalStatus} status
 * @property {number} requestedAt
 * @property {number=} resolvedAt
 * @property {string=} reason
 *
 * @typedef {Object} Observation
 * @property {string} id
 * @property {'observation'} type
 * @property {string} toolCallId
 * @property {string} toolName
 * @property {ObservationStatus} status
 * @property {*=} output
 * @property {Object=} error
 *
 * @typedef {{type:'message', content:string} |
 *   {type:'tool_call', id?:string, name:string, input?:Object} |
 *   {type:'finish', result?:*}} NextAction
 */

export const WORKBENCH_SCHEMA_VERSION = 1
export const TOOL_RISK_LEVELS = Object.freeze(['safe', 'caution', 'dangerous'])
export const TOOL_APPROVAL_POLICIES = Object.freeze(['never', 'on_danger', 'always'])
export const APPROVAL_STATUSES = Object.freeze(['pending', 'approved', 'rejected'])
export const OBSERVATION_STATUSES = Object.freeze(['succeeded', 'failed', 'rejected'])
export const NEXT_ACTION_TYPES = Object.freeze(['message', 'tool_call', 'finish'])

const TOOL_RISK_LEVEL_SET = new Set(TOOL_RISK_LEVELS)
const TOOL_APPROVAL_POLICY_SET = new Set(TOOL_APPROVAL_POLICIES)
const APPROVAL_STATUS_SET = new Set(APPROVAL_STATUSES)
const TOOL_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]{0,127}$/
const SENSITIVE_KEY_PATTERN = /(?:^|[_.-])(?:api[_-]?keys?|authorization|auth(?:entication)?(?:[_-]?(?:token|header|secret|key|credentials?))?|tokens?|secrets?|credentials?|client[_-]?secrets?|access[_-]?(?:tokens?|keys?)|refresh[_-]?tokens?|session[_-]?(?:tokens?|keys?)|(?:set[_-]?)?cookies?|private[_-]?keys?|passwords?|passwd|asset[_-]?path)(?:$|[_.-])/i
const MEDIA_KEY_PATTERN = /^(?:url|uri|source|preview[_-]?url|media[_-]?(?:url|source)|data[_-]?url|base64|b64[_-]?json|image[_-]?data|video[_-]?data|media[_-]?data)$/i
const MEDIA_VALUE_PATTERN = /^(?:data:|blob:|file:)/i
const LIKELY_BARE_BASE64 = /^[a-z0-9+/]+={0,2}$/i

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isCredentialReference(value) {
  return /^(?:${|<[^>]+>$|process\.env(?:\.|\[)|import\.meta\.env\.|Deno\.env\.get\(|Bun\.env\.|(?:config|settings|env|secrets?|credentials?)\.)/i.test(
    String(value || '').trim()
  )
}

function isSensitiveKey(value) {
  const normalized = String(value || '').replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  return SENSITIVE_KEY_PATTERN.test(normalized)
}

function redactSensitiveAssignment(_match, prefix, quote, value) {
  if (isCredentialReference(value)) return `${prefix}${quote}${value}${quote}`
  return `${prefix}${quote}[redacted]${quote}`
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[private-key-redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{12,}|AKIA[A-Z0-9]{16})\b/g, '[credential-redacted]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[jwt-redacted]')
    .replace(
      /((?:["'])?[A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|password|passwd|credentials?|authorization|auth|cookie|private[_-]?key)[A-Za-z0-9_.-]*(?:["'])?\s*[:=]\s*)(["']?)([^\s,;"']+)\2/gi,
      redactSensitiveAssignment
    )
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)([^/\s:@]+):([^@\s/]+)@/gi, '$1$2:[redacted]@')
    .replace(/([?&](?:api[_-]?key|token|access[_-]?token|auth|authorization|signature|sig|secret)=)[^&#\s]+/gi, '$1[redacted]')
}

function isLikelyBareBase64(value) {
  if (typeof value !== 'string' || value.length < 128) return false
  const normalized = value.trim().replace(/[\r\n]/g, '')
  return normalized.length >= 128 && normalized.length % 4 === 0 && LIKELY_BARE_BASE64.test(normalized)
}

function jsonSafe(value, seen = new WeakSet(), inArray = false, key = '', redact = true) {
  if (typeof value === 'string') {
    if (!redact) return value
    if (isSensitiveKey(key)) return '[redacted]'
    if (MEDIA_KEY_PATTERN.test(key) || MEDIA_VALUE_PATTERN.test(value.trim()) || isLikelyBareBase64(value)) {
      return '[media-reference-hidden]'
    }
    return redactSensitiveText(value)
  }
  if (value == null || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return String(value)
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return inArray ? null : undefined
  }
  if (seen.has(value)) return '[circular]'
  seen.add(value)

  if (Array.isArray(value)) {
    const result = value.map(item => jsonSafe(item, seen, true, key, redact))
    seen.delete(value)
    return result
  }

  const result = {}
  for (const [key, item] of Object.entries(value)) {
    const normalized = jsonSafe(item, seen, false, key, redact)
    if (normalized !== undefined) result[key] = normalized
  }
  seen.delete(value)
  return result
}

/** Strictly redact context values, then make the result JSON-safe and isolated. */
export function sanitizeWorkbenchValue(value) {
  return jsonSafe(value, new WeakSet(), false, '', true)
}

/** Isolated JSON-safe clone for ephemeral execution values. Never persist it. */
function cloneWorkbenchExecutionValue(value) {
  return jsonSafe(value, new WeakSet(), false, '', false)
}

export function serializeWorkbenchError(error, fallbackCode = 'WORKBENCH_ERROR') {
  return sanitizeWorkbenchValue({
    name: error?.name || 'Error',
    message: error?.message || String(error || 'Unknown Workbench error'),
    code: error?.code || fallbackCode
  })
}

export function normalizeToolDefinition(value = {}) {
  if (!isRecord(value)) throw new TypeError('ToolDefinition must be an object')
  const name = String(value.name || '').trim()
  if (!TOOL_NAME_PATTERN.test(name)) {
    throw new TypeError('ToolDefinition.name must be a stable tool identifier')
  }

  const riskLevel = value.riskLevel || 'dangerous'
  if (!TOOL_RISK_LEVEL_SET.has(riskLevel)) {
    throw new TypeError(`Unknown tool risk level: ${riskLevel}`)
  }
  const approvalPolicy = value.approvalPolicy || 'always'
  if (!TOOL_APPROVAL_POLICY_SET.has(approvalPolicy)) {
    throw new TypeError(`Unknown tool approval policy: ${approvalPolicy}`)
  }

  const definition = {
    name,
    description: String(value.description || '').trim(),
    inputSchema: isRecord(value.inputSchema)
      ? sanitizeWorkbenchValue(value.inputSchema)
      : { type: 'object', properties: {} },
    riskLevel,
    approvalPolicy
  }
  if (value.metadata !== undefined) definition.metadata = sanitizeWorkbenchValue(value.metadata)
  return definition
}

export function toolRequiresApproval(definition) {
  const normalized = normalizeToolDefinition(definition)
  return normalized.approvalPolicy === 'always' || (
    normalized.approvalPolicy === 'on_danger' && normalized.riskLevel === 'dangerous'
  )
}

/** Build a handler object accepted by the existing ToolRegistry. */
export function defineTool(definition, execute) {
  if (typeof execute !== 'function') throw new TypeError('ToolDefinition requires an execute function')
  const normalized = normalizeToolDefinition(definition)
  return {
    execute,
    metadata: {
      description: normalized.description,
      inputSchema: normalized.inputSchema,
      riskLevel: normalized.riskLevel,
      approvalPolicy: normalized.approvalPolicy,
      ...(normalized.metadata === undefined ? {} : { metadata: normalized.metadata }),
      workbenchDefinition: normalized
    }
  }
}

export function toolDefinitionsFromRegistry(registry) {
  if (!registry || typeof registry.list !== 'function') return []
  return registry.list().map((entry) => {
    if (!entry?.workbenchDefinition) {
      const error = new Error(`Tool ${entry?.name || '(unknown)'} 缺少 Workbench ToolDefinition`)
      error.code = 'WORKBENCH_TOOL_DEFINITION_REQUIRED'
      throw error
    }
    return normalizeToolDefinition(entry.workbenchDefinition)
  })
}

export function normalizeNextAction(value) {
  if (!isRecord(value)) throw new TypeError('Planner next action must be an object')
  const type = String(value.type || '').trim()
  if (!NEXT_ACTION_TYPES.includes(type)) {
    const error = new TypeError(`Unknown Workbench next action: ${type || '(empty)'}`)
    error.code = 'INVALID_NEXT_ACTION'
    throw error
  }

  if (type === 'message') {
    const content = String(value.content || '').trim()
    if (!content) throw new TypeError('message action requires content')
    return { type, content }
  }
  if (type === 'finish') {
    return {
      type,
      ...(value.result === undefined ? {} : { result: cloneWorkbenchExecutionValue(value.result) })
    }
  }

  const name = String(value.name || '').trim()
  if (!TOOL_NAME_PATTERN.test(name)) throw new TypeError('tool_call action requires a valid tool name')
  return {
    type,
    ...(value.id ? { id: String(value.id) } : {}),
    name,
    input: isRecord(value.input) ? cloneWorkbenchExecutionValue(value.input) : {}
  }
}

export function createToolCall(action, definition, { id, now = Date.now } = {}) {
  const normalizedAction = normalizeNextAction(action)
  if (normalizedAction.type !== 'tool_call') throw new TypeError('createToolCall requires a tool_call action')
  const normalizedDefinition = normalizeToolDefinition(definition)
  const approvalStatus = toolRequiresApproval(normalizedDefinition) ? 'pending' : 'not_required'
  return {
    id: String(normalizedAction.id || id || ''),
    type: 'tool_call',
    name: normalizedAction.name,
    input: normalizedAction.input,
    riskLevel: normalizedDefinition.riskLevel,
    approvalStatus,
    status: approvalStatus === 'pending' ? 'awaiting_approval' : 'pending',
    createdAt: now()
  }
}

export function createApproval(toolCall, { id, now = Date.now } = {}) {
  return {
    id: String(id || ''),
    toolCallId: String(toolCall?.id || ''),
    status: 'pending',
    requestedAt: now()
  }
}

export function createObservation(toolCall, status, value = {}, { id, now = Date.now } = {}) {
  if (!OBSERVATION_STATUSES.includes(status)) {
    throw new TypeError(`Unknown observation status: ${status}`)
  }
  const observation = {
    id: String(id || ''),
    type: 'observation',
    toolCallId: String(toolCall?.id || ''),
    toolName: String(toolCall?.name || ''),
    status,
    startedAt: Number(value.startedAt || now()),
    completedAt: Number(value.completedAt || now())
  }
  if (value.output !== undefined) observation.output = sanitizeWorkbenchValue(value.output)
  if (value.error !== undefined) observation.error = sanitizeWorkbenchValue(value.error)
  return observation
}

export function normalizeApprovalDecision(value) {
  const status = typeof value === 'string' ? value : value?.status
  if (!APPROVAL_STATUS_SET.has(status) || status === 'pending') {
    throw new TypeError('Approval decision must be approved or rejected')
  }
  return {
    status,
    reason: String(typeof value === 'object' ? value?.reason || '' : '').trim()
  }
}

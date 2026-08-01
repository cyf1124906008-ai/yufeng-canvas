const ARTIFACT_MANIFEST_KIND = 'yufeng-agent.artifacts'
const ARTIFACT_MANIFEST_VERSION = 1
const DATA_URL_PATTERN = /^data:[^;,]+(?:;[^,]*)?;base64,/i
const BLOB_URL_PATTERN = /^blob:/i
const FILE_URL_PATTERN = /^file:/i
const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:[\\/]/
const BARE_BASE64_PATTERN = /^[a-zA-Z0-9+/]+={0,2}$/
const MAX_METADATA_STRING = 4_000
const ASSET_PROOF_PATTERN = /^[a-f0-9]{64}$/i
const AGENT_RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/

const PERSISTED_FIELDS = [
  'id',
  'kind',
  'mediaType',
  'status',
  'prompt',
  'revisedPrompt',
  'model',
  'provider',
  'protocol',
  'taskId',
  'sourceArtifactId',
  'outputIndex',
  'createdAt',
  'pollAttempts',
  'ratio',
  'duration',
  'resolution',
  'mimeType',
  'label'
]

function cleanString(value, maxLength = MAX_METADATA_STRING) {
  return String(value || '').trim().slice(0, maxLength)
}

function persistenceError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function isBareBase64(value) {
  if (typeof value !== 'string') return false
  const compact = value.replace(/\s/g, '')
  return compact.length >= 128 && compact.length % 4 === 0 && BARE_BASE64_PATTERN.test(compact)
}

function safeMetadataValue(value) {
  if (typeof value === 'string') {
    if (DATA_URL_PATTERN.test(value) || isBareBase64(value)) return '[media-data-omitted]'
    return cleanString(value)
  }
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
  return undefined
}

function normalizeAssetRef(value) {
  const ref = cleanString(value, 1_000).replaceAll('\\', '/')
  if (!ref || ref.startsWith('/') || WINDOWS_PATH_PATTERN.test(ref) || FILE_URL_PATTERN.test(ref)) {
    throw persistenceError('INVALID_ASSET_REF', '本地资产引用必须是 assets 根目录下的相对引用')
  }
  const parts = ref.split('/').filter(Boolean)
  const unsafePart = parts.some((part) => {
    let decoded
    try {
      decoded = decodeURIComponent(part)
    } catch {
      return true
    }
    return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')
  })
  if (!parts.length || unsafePart) {
    throw persistenceError('INVALID_ASSET_REF', '本地资产引用不能包含路径穿越片段')
  }
  return parts.join('/')
}

function normalizeAssetProof(value) {
  const proof = cleanString(value, 128)
  if (!proof) return ''
  if (!ASSET_PROOF_PATTERN.test(proof)) {
    throw persistenceError('INVALID_ASSET_TOKEN', '本地资产授权标记无效')
  }
  return proof.toLowerCase()
}

function normalizeAgentRunId(value) {
  const runId = cleanString(value, 129)
  if (!AGENT_RUN_ID_PATTERN.test(runId)) {
    throw persistenceError('INVALID_AGENT_RUN_ID', 'Agent 资产必须绑定有效 runId')
  }
  return runId
}

function normalizeAgentAssetBinding(assetRef, assetProof, runId) {
  const normalizedRunId = normalizeAgentRunId(runId)
  const ref = normalizeAssetRef(assetRef)
  const proof = normalizeAssetProof(assetProof)
  if (!proof) throw persistenceError('ASSET_PROOF_REQUIRED', 'Agent 本地资产缺少 runId 绑定的授权证明')
  if (!ref.startsWith(`agent-${normalizedRunId}/`)) {
    throw persistenceError('ASSET_RUN_MISMATCH', 'Agent 本地资产不属于当前 runId 命名空间')
  }
  return { ref, proof, runId: normalizedRunId }
}

function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') ||
      host.endsWith('.internal') || host.endsWith('.lan') || host.endsWith('.home.arpa')) return true
  if (host === '::' || host === '::1' || host === '0.0.0.0' || host.startsWith('fc') ||
      host.startsWith('fd') || /^fe[89ab][0-9a-f]:/.test(host) || host.startsWith('ff') ||
      host.startsWith('::ffff:')) return true
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return false
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
}

function normalizeRemoteUrl(value) {
  let url
  try {
    url = new URL(value)
  } catch {
    throw persistenceError('INVALID_REMOTE_URL', '远程作品地址不是有效 URL')
  }
  if (url.protocol !== 'https:') {
    throw persistenceError('INVALID_REMOTE_URL', '只允许持久化 HTTPS 公开作品地址')
  }
  if (url.username || url.password) {
    throw persistenceError('REMOTE_URL_CREDENTIALS_FORBIDDEN', '远程作品地址不能包含用户名或密码')
  }
  if (url.search || url.hash) {
    throw persistenceError('REMOTE_URL_CREDENTIALS_FORBIDDEN', '带查询参数或片段的远程作品地址不会进入历史')
  }
  if (isPrivateHostname(url.hostname)) {
    throw persistenceError('PRIVATE_REMOTE_URL_FORBIDDEN', '本机或私网作品地址不会进入历史')
  }
  return url.toString()
}

function looksLikeLocalPath(value) {
  const source = cleanString(value, 1_000)
  return source.startsWith('/') || WINDOWS_PATH_PATTERN.test(source) || FILE_URL_PATTERN.test(source)
}

async function localMediaDescriptor(record, toAssetRef, runId) {
  const explicitRef = record.assetRef
  if (explicitRef) {
    const binding = normalizeAgentAssetBinding(explicitRef, record.assetProof, runId)
    return {
      kind: 'local_asset',
      ref: binding.ref,
      proof: binding.proof
    }
  }

  const assetPath = cleanString(record.assetPath, 4_000)
  if (!assetPath || typeof toAssetRef !== 'function') {
    throw persistenceError(
      'LOCAL_ASSET_REF_REQUIRED',
      '绝对本地路径不能直接进入持久化清单；请先转换为受控 assets 相对引用'
    )
  }
  const ref = await toAssetRef(assetPath, record)
  const binding = normalizeAgentAssetBinding(ref, record.assetProof, runId)
  return {
    kind: 'local_asset',
    ref: binding.ref,
    proof: binding.proof
  }
}

async function serializeMedia(record, options) {
  if (record.assetRef || record.assetPath) {
    return localMediaDescriptor(record, options.toAssetRef, options.runId)
  }

  const source = cleanString(record.source || record.url, 100_000)
  if (!source) return { kind: 'unavailable' }
  if (DATA_URL_PATTERN.test(source) || isBareBase64(source)) {
    throw persistenceError(
      'MEDIA_EXTERNALIZATION_REQUIRED',
      'data URL/base64 必须先通过桌面资产 IPC 落盘，不能写入持久化清单或 localStorage'
    )
  }
  if (BLOB_URL_PATTERN.test(source)) {
    throw persistenceError(
      'EPHEMERAL_MEDIA_SOURCE',
      'blob URL 在重启后失效，必须先落盘为本地资产'
    )
  }
  if (looksLikeLocalPath(source)) {
    return localMediaDescriptor({ ...record, assetPath: source }, options.toAssetRef, options.runId)
  }
  return { kind: 'remote_url', url: normalizeRemoteUrl(source) }
}

function persistedMetadata(record) {
  const result = {}
  for (const field of PERSISTED_FIELDS) {
    const value = safeMetadataValue(record[field])
    if (value !== undefined && value !== '') result[field] = value
  }
  if (!result.id) throw persistenceError('ARTIFACT_ID_REQUIRED', '持久化作品必须包含稳定 artifact id')
  return result
}

function recordsFrom(value) {
  if (Array.isArray(value)) return value
  if (typeof value?.list === 'function') return value.list()
  throw new TypeError('serializeArtifactManifest 需要 artifact 数组或支持 list() 的 ArtifactStore')
}

/**
 * Produce a JSON-safe manifest. It does not write localStorage or files.
 * The host owns storage and must externalize in-memory media before calling it.
 */
export async function serializeArtifactManifest(value, {
  runId = '',
  projectId = '',
  toAssetRef
} = {}) {
  const records = recordsFrom(value)
  const artifacts = []
  for (const record of records) {
    if (!record || typeof record !== 'object') continue
    artifacts.push({
      ...persistedMetadata(record),
      media: await serializeMedia(record, { toAssetRef, runId })
    })
  }
  return {
    kind: ARTIFACT_MANIFEST_KIND,
    version: ARTIFACT_MANIFEST_VERSION,
    savedAt: new Date().toISOString(),
    ...(cleanString(runId, 256) ? { runId: cleanString(runId, 256) } : {}),
    ...(cleanString(projectId, 256) ? { projectId: cleanString(projectId, 256) } : {}),
    artifacts
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw persistenceError('INVALID_ARTIFACT_MANIFEST', 'Artifact manifest 必须是对象')
  }
  if (manifest.kind !== ARTIFACT_MANIFEST_KIND || manifest.version !== ARTIFACT_MANIFEST_VERSION) {
    throw persistenceError('UNSUPPORTED_ARTIFACT_MANIFEST', 'Artifact manifest 类型或版本不受支持')
  }
  if (!Array.isArray(manifest.artifacts)) {
    throw persistenceError('INVALID_ARTIFACT_MANIFEST', 'Artifact manifest 缺少 artifacts 数组')
  }
}

async function resolveLocalAsset(media, artifact, resolveAssetRef, runId) {
  const binding = normalizeAgentAssetBinding(media.ref, media.proof, runId)
  const assetRef = binding.ref
  if (typeof resolveAssetRef !== 'function') {
    return { assetRef, source: '', mediaState: 'needs_resolution' }
  }
  const resolved = await resolveAssetRef(assetRef, artifact, binding.proof, binding.runId)
  if (!resolved) return { assetRef, source: '', mediaState: 'missing' }
  if (typeof resolved === 'string') {
    return { assetRef, source: resolved, mediaState: 'resolved' }
  }
  if (typeof resolved === 'object') {
    const source = resolved.source || resolved.dataUrl || resolved.url || ''
    return {
      assetRef,
      source,
      ...(resolved.assetPath ? { assetPath: resolved.assetPath } : {}),
      mediaState: source ? 'resolved' : 'missing'
    }
  }
  return { assetRef, source: '', mediaState: 'missing' }
}

async function hydrateArtifact(entry, options) {
  if (!entry || typeof entry !== 'object') {
    throw persistenceError('INVALID_ARTIFACT_ENTRY', 'Artifact manifest 包含非法作品记录')
  }
  const artifact = persistedMetadata(entry)
  const media = entry.media || { kind: 'unavailable' }
  if (media.kind === 'remote_url') {
    artifact.source = normalizeRemoteUrl(media.url)
    artifact.mediaState = 'remote'
  } else if (media.kind === 'local_asset') {
    Object.assign(artifact, await resolveLocalAsset(media, artifact, options.resolveAssetRef, options.runId))
  } else if (media.kind === 'unavailable') {
    artifact.source = ''
    artifact.mediaState = 'unavailable'
  } else {
    throw persistenceError('INVALID_MEDIA_DESCRIPTOR', `不支持的作品媒体描述: ${media.kind || '(empty)'}`)
  }
  return artifact
}

/** Hydrate records into memory. No network or filesystem access is performed. */
export async function hydrateArtifactManifest(manifest, { resolveAssetRef } = {}) {
  validateManifest(manifest)
  const runId = cleanString(manifest.runId, 129)
  const artifacts = []
  for (const entry of manifest.artifacts) {
    artifacts.push(await hydrateArtifact(entry, { resolveAssetRef, runId }))
  }
  return {
    runId: cleanString(manifest.runId, 256),
    projectId: cleanString(manifest.projectId, 256),
    savedAt: cleanString(manifest.savedAt, 100),
    artifacts
  }
}

/** Restore stable ids into a store that explicitly supports restore() or set(). */
export async function hydrateArtifactStore(manifest, artifactStore, options = {}) {
  if (!artifactStore) throw new TypeError('hydrateArtifactStore 需要 ArtifactStore')
  const hydrated = await hydrateArtifactManifest(manifest, options)
  for (const artifact of hydrated.artifacts) {
    if (typeof artifactStore.restore === 'function') artifactStore.restore(artifact)
    else if (typeof artifactStore.set === 'function') artifactStore.set(artifact.id, artifact)
    else throw new TypeError('目标 ArtifactStore 必须支持 restore(record) 或 set(id, record)')
  }
  return hydrated
}

export {
  ARTIFACT_MANIFEST_KIND,
  ARTIFACT_MANIFEST_VERSION,
  normalizeAssetRef,
  normalizeAssetProof,
  normalizeAgentRunId,
  normalizeRemoteUrl
}

export default serializeArtifactManifest

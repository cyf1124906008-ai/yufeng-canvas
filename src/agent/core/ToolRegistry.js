export class ToolRegistry {
  constructor(tools = {}) {
    this.tools = new Map()
    for (const [name, tool] of Object.entries(tools)) this.register(name, tool)
  }

  register(name, handler, metadata = {}) {
    if (!name || typeof name !== 'string') throw new TypeError('Tool name must be a string')

    let execute = handler
    let toolMetadata = metadata
    if (handler && typeof handler === 'object') {
      execute = handler.execute
      toolMetadata = { ...handler.metadata, ...metadata }
    }
    if (typeof execute !== 'function') {
      throw new TypeError(`Tool "${name}" must provide an execute function`)
    }

    this.tools.set(name, { name, execute, metadata: toolMetadata, enabled: true })
    return this
  }

  unregister(name) {
    return this.tools.delete(name)
  }

  has(name) {
    return Boolean(this.tools.get(name)?.enabled)
  }

  isEnabled(name) {
    return Boolean(this.tools.get(name)?.enabled)
  }

  setEnabled(name, enabled) {
    const tool = this.tools.get(name)
    if (!tool) {
      const error = new Error(`Unknown tool: ${name}`)
      error.code = 'TOOL_NOT_FOUND'
      throw error
    }
    tool.enabled = Boolean(enabled)
    return tool.enabled
  }

  list() {
    return [...this.tools.values()]
      .filter(tool => tool.enabled)
      .map(({ name, metadata }) => ({ name, ...metadata }))
  }

  async execute(name, input = {}, runtime = {}) {
    const tool = this.tools.get(name)
    if (!tool) {
      const error = new Error(`Unknown tool: ${name}`)
      error.code = 'TOOL_NOT_FOUND'
      throw error
    }
    if (!tool.enabled) {
      const error = new Error(`Tool is disabled: ${name}`)
      error.code = 'TOOL_DISABLED'
      throw error
    }
    if (runtime.signal?.aborted) throw runtime.signal.reason || new DOMException('Cancelled', 'AbortError')
    return tool.execute(input, runtime)
  }
}

export default ToolRegistry

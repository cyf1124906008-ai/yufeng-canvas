export class RunPolicyError extends Error {
  constructor(message, code, details = {}) {
    super(message)
    this.name = 'RunPolicyError'
    this.code = code
    Object.assign(this, details)
  }
}

function normalizedCost(value) {
  const cost = value && typeof value === 'object' && Object.hasOwn(value, 'cost')
    ? value.cost
    : value
  if (cost == null) return null
  if (typeof cost !== 'object' || Array.isArray(cost)) {
    throw new RunPolicyError('Cost must be an object', 'COST_INVALID')
  }
  if (!Number.isFinite(cost.amount) || cost.amount < 0) {
    throw new RunPolicyError('Cost amount must be a non-negative number', 'COST_INVALID')
  }
  if (typeof cost.currency !== 'string' || !cost.currency.trim()) {
    throw new RunPolicyError('Cost currency is required', 'COST_INVALID')
  }
  return { amount: cost.amount, currency: cost.currency.trim().toUpperCase() }
}

export class RunPolicy {
  constructor({ maxQualityRetries = 2, budget = null } = {}) {
    if (!Number.isInteger(maxQualityRetries) || maxQualityRetries < 0) {
      throw new TypeError('maxQualityRetries must be a non-negative integer')
    }
    this.maxQualityRetries = maxQualityRetries
    this.budget = normalizedCost(budget)
    this.retryCount = 0
    this.spent = 0
    this.unmeteredCalls = 0
    this.analyzedArtifacts = new Set()
  }

  assertCanAnalyze(artifactRef) {
    if (typeof artifactRef !== 'string' || !artifactRef.trim()) {
      throw new RunPolicyError('artifactRef is required', 'ARTIFACT_REF_REQUIRED')
    }
    if (this.analyzedArtifacts.has(artifactRef)) {
      throw new RunPolicyError(
        `Artifact ${artifactRef} has already been analyzed`,
        'IMAGE_ALREADY_ANALYZED',
        { artifactRef }
      )
    }
    return true
  }

  markAnalyzed(artifactRef) {
    this.assertCanAnalyze(artifactRef)
    this.analyzedArtifacts.add(artifactRef)
    return this
  }

  assertBudget(estimatedCost) {
    if (!this.budget || estimatedCost == null) return true
    const cost = normalizedCost(estimatedCost)
    if (cost.currency !== this.budget.currency) {
      throw new RunPolicyError(
        `Cost currency ${cost.currency} does not match budget ${this.budget.currency}`,
        'COST_CURRENCY_MISMATCH'
      )
    }
    if (this.spent + cost.amount > this.budget.amount) {
      throw new RunPolicyError(
        `Estimated cost would exceed the ${this.budget.amount} ${this.budget.currency} budget`,
        'AGENT_BUDGET_EXCEEDED',
        { spent: this.spent, estimated: cost.amount, budget: this.budget.amount }
      )
    }
    return true
  }

  assertCanRetry({ estimatedCost = null } = {}) {
    if (this.retryCount >= this.maxQualityRetries) {
      throw new RunPolicyError(
        `Quality retry limit of ${this.maxQualityRetries} reached`,
        'QUALITY_RETRIES_EXHAUSTED',
        { retryCount: this.retryCount, maxQualityRetries: this.maxQualityRetries }
      )
    }
    this.assertBudget(estimatedCost)
    return true
  }

  markRetry(options = {}) {
    this.assertCanRetry(options)
    this.retryCount += 1
    return this.retryCount
  }

  recordUsage(usage) {
    const rawCost = usage && typeof usage === 'object' && Object.hasOwn(usage, 'cost')
      ? usage.cost
      : usage
    if (rawCost == null) {
      this.unmeteredCalls += 1
      return this.snapshot()
    }
    const cost = normalizedCost(rawCost)
    if (this.budget && cost.currency !== this.budget.currency) {
      throw new RunPolicyError(
        `Cost currency ${cost.currency} does not match budget ${this.budget.currency}`,
        'COST_CURRENCY_MISMATCH'
      )
    }
    if (!this.budget && this.currency && cost.currency !== this.currency) {
      throw new RunPolicyError('Cannot total costs with different currencies', 'COST_CURRENCY_MISMATCH')
    }
    this.currency = this.budget?.currency || this.currency || cost.currency
    this.spent += cost.amount
    return this.snapshot()
  }

  snapshot() {
    return {
      maxQualityRetries: this.maxQualityRetries,
      retryCount: this.retryCount,
      retriesRemaining: Math.max(0, this.maxQualityRetries - this.retryCount),
      budget: this.budget ? { ...this.budget } : null,
      spent: this.spent,
      currency: this.budget?.currency || this.currency || null,
      unmeteredCalls: this.unmeteredCalls,
      analyzedArtifacts: [...this.analyzedArtifacts]
    }
  }
}

export default RunPolicy

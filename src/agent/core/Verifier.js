export class Verifier {
  verifyFinish(state) {
    if (!state) return { ok: false, reason: 'Agent state is missing.' }
    const requiredType = state.targetType === 'video' ? 'video' : 'image'
    if (!state.hasOutput(requiredType)) {
      return {
        ok: false,
        requiredType,
        reason: `Cannot finish before a ${requiredType} result has been produced.`
      }
    }
    return { ok: true, requiredType }
  }

  verify(state) {
    return this.verifyFinish(state)
  }
}

export default Verifier

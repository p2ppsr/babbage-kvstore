const bsv = require('babbage-bsv')
const pushdrop = require('pushdrop')

/**
 * Interprets the history of a token BRC-8 envelope
 */
class Historian {
  constructor (correctOwnerKey, correctSigningKey, validate) {
    this.correctOwnerKey = correctOwnerKey
    this.correctSigningKey = correctSigningKey
    if (validate) {
      this.validate = validate
    } else {
      this.validate = (value) => { return true }
    }
  }

  async interpret (currentEnvelope, currentDepth) {
    // Make sure the inputs are given as a string...?
    if (typeof currentEnvelope.inputs === 'string') {
      currentEnvelope.inputs = JSON.parse(currentEnvelope.inputs)
    }

    let valueHistory = []

    // Handle the current value first
    if (currentDepth === 0) {
      const tokenValue = await this.decodeTokenValue(currentEnvelope)
      if (tokenValue && this.isValid(tokenValue)) {
        valueHistory.push(tokenValue)
      }
    }

    // If there are no more inputs for this branch, return no value history
    if (currentEnvelope.inputs === undefined || Object.keys(currentEnvelope.inputs).length === 0) {
      return []
    }

    if (currentEnvelope.inputs && typeof currentEnvelope.inputs === 'object') {
      for (const inputEnvelope of Object.values(currentEnvelope.inputs)) {
        const tokenValue = await this.decodeTokenValue(inputEnvelope)
        if (tokenValue && this.validate(tokenValue)) {
          valueHistory.push(tokenValue)
        }
        const previousHistory = await this.interpret(inputEnvelope, currentDepth + 1, this.correctOwnerKey, this.correctSigningKey)
        if (previousHistory && previousHistory.length > 0) {
          valueHistory = [...valueHistory, ...previousHistory]
        }
      }
    }

    // Return the history and apply a filter
    return valueHistory.flat()
  }

  async decodeTokenValue (inputEnvelope) {
    try {
      // Decode the data from the current output
      const decoded = await pushdrop.decode({
        script: inputEnvelope.outputScript,
        fieldFormat: 'buffer'
      })
      if (decoded.lockingPublicKey !== this.correctOwnerKey) {
        const e = new Error('Token is not from correct key')
        e.code = 'ERR_INVALID_TOKEN'
        throw e
      }
      // Use ECDSA to verify signature
      const hasValidSignature = bsv.crypto.ECDSA.verify(
        bsv.crypto.Hash.sha256(Buffer.concat(decoded.fields)),
        bsv.crypto.Signature.fromString(decoded.signature),
        bsv.PublicKey.fromString(this.correctSigningKey)
      )
      if (!hasValidSignature) {
        const e = new Error('Invalid Signature')
        e.code = 'ERR_INVALID_SIGNATURE'
        throw e
      }
      return decoded.fields[1].toString()
    } catch (error) {
    }
  }
}
module.exports = { Historian }

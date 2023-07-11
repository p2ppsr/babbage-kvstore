const { Authrite } = require('authrite-js')
const SDK = require('@babbage/sdk')
const pushdrop = require('pushdrop')
const { getPaymentAddress } = require('sendover')
const bsv = require('babbage-bsv')

const defaultConfig = {
  confederacyHost: 'https://confederacy.babbage.systems',
  protocolID: [0, 'kvstore'],
  tokenAmount: 1000,
  topics: ['kvstore'],
  authriteConfig: undefined,
  counterparty: undefined,
  receiveFromCounterparty: false,
  sendToCounterparty: false,
  viewpoint: 'localToSelf'
}

const computeInvoiceNumber = (protocolID, key) => `${typeof protocolID === 'string' ? '2' : protocolID[0]}-${typeof protocolID === 'string' ? protocolID : protocolID[1]}-${key}`

const findFromOverlay = async (protectedKey, key, config) => {
  const client = new Authrite(config.authriteConfig)
  const result = await client.request(`${config.confederacyHost}/lookup`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      provider: 'kvstore',
      query: {
        protectedKey: Buffer.from(protectedKey).toString('base64')
      }
    })
  })
  const envelope = await result.json()
  let correctOwnerKey, correctSigningKey
  if (config.viewpoint === 'localToSelf') {
    correctOwnerKey = await SDK.getPublicKey({
      protocolID: config.protocolID,
      keyID: key,
      counterparty: config.sendToCounterparty ? 'self' : config.counterparty,
      forSelf: true
    })
    correctSigningKey = await SDK.getPublicKey({
      protocolID: config.protocolID,
      keyID: key,
      counterparty: config.sendToCounterparty ? 'self' : config.counterparty,
      forSelf: false
    })
  } else {
    correctOwnerKey = getPaymentAddress({
      senderPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
      recipientPublicKey: config.viewpoint,
      invoiceNumber: computeInvoiceNumber(config.protocolID, key),
      returnType: 'publicKey'
    })
    correctSigningKey = correctOwnerKey
  }
  const valueHistory = []
  // Current UTXO transaction
  const tx = new bsv.Transaction(envelope[0].rawTx) // There shouldn't be more than one result, right?
  // Decode the current value from the output which should have a vout of 0
  for (const output of tx.outputs) {
    try {
      const decoded = await pushdrop.decode({
        script: output.script.toHex(),
        fieldFormat: 'buffer'
      })
      if (decoded.lockingPublicKey !== correctOwnerKey) {
        const e = new Error('Token is not from correct key')
        e.code = 'ERR_INVALID_TOKEN'
        throw e
      }
      // Use ECDSA to verify signature
      const hasValidSignature = bsv.crypto.ECDSA.verify(
        bsv.crypto.Hash.sha256(Buffer.concat(decoded.fields)),
        bsv.crypto.Signature.fromString(decoded.signature),
        bsv.PublicKey.fromString(correctSigningKey)
      )
      if (!hasValidSignature) {
        const e = new Error('Invalid Signature')
        e.code = 'ERR_INVALID_SIGNATURE'
        throw e
      }
      valueHistory.push(decoded.fields[1].toString('utf8'))
    } catch (e) {
      continue
    }
  }

  // For the current utxo, iterate through each input and decode the outputScript on each tx
  const inputs = envelope[0].inputs
  let currentInput = inputs
  while (Object.keys(currentInput) !== [] && typeof currentInput !== 'string') {
    try {
      const data = Object.values(currentInput)[0]
      // Parse the transaction for the current input
      const tx = new bsv.Transaction(data.rawTx)
      // Decode the data from output 0
      const decoded = await pushdrop.decode({
        script: tx.outputs[0].script.toHex(), // always zero?
        fieldFormat: 'buffer'
      })
      if (decoded.lockingPublicKey !== correctOwnerKey) {
        const e = new Error('Token is not from correct key')
        e.code = 'ERR_INVALID_TOKEN'
        throw e
      }
      // Use ECDSA to verify signature
      const hasValidSignature = bsv.crypto.ECDSA.verify(
        bsv.crypto.Hash.sha256(Buffer.concat(decoded.fields)),
        bsv.crypto.Signature.fromString(decoded.signature),
        bsv.PublicKey.fromString(correctSigningKey)
      )
      if (!hasValidSignature) {
        const e = new Error('Invalid Signature')
        e.code = 'ERR_INVALID_SIGNATURE'
        throw e
      }
      valueHistory.push(decoded.fields[1].toString('utf8'))
      currentInput = Object.values(currentInput)[0].inputs
    } catch (e) {
      continue
    }
  }
  return {
    envelope,
    valueHistory
  }
}

const submitToOverlay = async (tx, config) => {
  const client = new Authrite(config.authriteConfig)
  const result = await client.request(`${config.confederacyHost}/submit`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...tx,
      topics: config.topics
    })
  })
  return await result.json()
}

/*
context can be "searching" (looking for the token on the overlay), or "creating" (putting a new token on the overlay)
*/
const getProtectedKey = async (key, context = 'searching', config) => {
  if (config.viewpoint === 'localToSelf') {
    let counterparty = config.counterparty
    // counterparty should flip to self when:
    // - context is searching and sendToCounterparty is true
    // - context is creating and receiveFromCounterparty is true
    if (
      (context === 'searching' && config.sendToCounterparty) ||
      (context === 'creating' && config.receiveFromCounterparty)
    ) {
      counterparty = 'self'
    }
    return await SDK.createHmac({
      data: key,
      protocolID: config.protocolID,
      keyID: key,
      counterparty
    })
  } else {
    const invoiceNumber = computeInvoiceNumber(config.protocolID, key)
    return bsv.crypto.Hash.sha256hmac(
      bsv.crypto.Hash.sha256(Buffer.from(config.viewpoint, 'hex')),
      Buffer.from(invoiceNumber, 'utf8')
    ).toString('base64')
  }
}

/**
 * Gets a value from the store.
 *
 * @param {String} key The key for the value to get
 * @param {String} defaultValue The value returned when no token is found
 * @param {Object} config The config object (see the config section)
 *
 * @returns {Promise<String>} The value from the store
 */
const get = async (key, defaultValue = undefined, config = {}) => {
  config = { ...defaultConfig, ...config }
  const protectedKey = await getProtectedKey(key, 'searching', config)
  const utxos = await findFromOverlay(protectedKey, key, config)
  if (utxos.length === 0) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    return undefined
  }
  return utxos[0].value
}

/**
 * Gets a value from the store with history of token
 *
 * @param {String} key The key for the value to get
 * @param {String} defaultValue The value returned when no token is found
 * @param {object} config The config object (see the config section)
 *
 * @returns {Promise<object>} The value from the store and history of the token
 */
const getWithHistory = async (key, defaultValue = undefined, config = {}) => {
  config = { ...defaultConfig, ...config }
  const protectedKey = await getProtectedKey(key, 'searching', config)
  const results = await findFromOverlay(protectedKey, key, config, 'all')
  if (!results) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    return undefined
  }
  // Return the utxo value history and SPV envelope information
  return results
}

/**
 * Sets a new value in the store, overwriting any existing value.
 *
 * @param {String} key The key for the value to set
 * @param {String} value The value to store
 * @param {Object} config The config object (see the config section)
 *
 * @returns {Promise} Promise that resolves when the value has been stored
 */
const set = async (key, value, config = {}) => {
  config = { ...defaultConfig, ...config }
  if (config.sendToCounterparty && config.receiveFromCounterparty) {
    const e = new Error('sendToCounterparty and receiveFromCounterparty cannot both be true at the same time.')
    e.code = 'ERR_NO_SEND_AND_RECEIVE_AT_SAME_TIME'
    throw e
  }
  const protectedKey = await getProtectedKey(key, 'searching', config)
  const existingTokens = await findFromOverlay(protectedKey, key, config)

  let action
  if (existingTokens.length > 0) {
    // Get the latest unspent token in case spent outputs are returned
    const kvstoreToken = existingTokens[existingTokens.length - 1]
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.txid,
      outputIndex: kvstoreToken.vout,
      lockingScript: kvstoreToken.outputScript,
      outputAmount: kvstoreToken.satoshis,
      protocolID: config.protocolID,
      keyID: key,
      counterparty: config.sendToCounterparty ? 'self' : config.counterparty
    })

    action = await SDK.createAction({
      description: `Update the value for ${key}`,
      inputs: {
        [kvstoreToken.txid]: {
          ...kvstoreToken,
          inputs: typeof kvstoreToken.inputs === 'string'
            ? JSON.parse(kvstoreToken.inputs)
            : kvstoreToken.inputs,
          mapiResponses: typeof kvstoreToken.mapiResponses === 'string'
            ? JSON.parse(kvstoreToken.mapiResponses)
            : kvstoreToken.mapiResponses,
          proof: typeof kvstoreToken.proof === 'string'
            ? JSON.parse(kvstoreToken.proof)
            : kvstoreToken.proof,
          outputsToRedeem: [{
            index: kvstoreToken.vout,
            unlockingScript
          }]
        }
      },
      outputs: [{
        satoshis: config.tokenAmount,
        script: await pushdrop.create({
          fields: [
            await getProtectedKey(key, 'creating', config),
            value
          ],
          protocolID: config.protocolID,
          keyID: key,
          counterparty: config.receiveFromCounterparty ? 'self' : config.counterparty,
          counterpartyCanVerifyMyOwnership: config.viewpoint !== 'localToSelf'
        })
      }]
    })
  } else {
    if (config.receiveFromCountarparty) {
      const e = new Error('There is no token to receive from this counterparty')
      e.code = 'ERR_NO_TOKEN_FROM_COUNTERPARTY'
      throw e
    }
    action = await SDK.createAction({
      description: `Set a value for ${key}`,
      outputs: [{
        satoshis: config.tokenAmount,
        script: await pushdrop.create({
          fields: [
            await getProtectedKey(key, 'creating', config),
            value
          ],
          protocolID: config.protocolID,
          keyID: key,
          counterparty: config.receiveFromCounterparty ? 'self' : config.counterparty,
          ownedByCreator: config.viewpoint !== 'localToSelf'
        })
      }]
    })
  }
  return await submitToOverlay(action, config)
}

/**
 * Deletes a value from the store.
 *
 * @param {String} key The key for the value to remove
 * @param {Object} config The config object (see the config section)
 *
 * @returns {Promise} Promise that resolves when the value has been deleted
 */
const remove = async (key, config = {}) => {
  config = { ...defaultConfig, ...config }
  const protectedKey = await getProtectedKey(key, 'searching', config)
  const existingTokens = await findFromOverlay(protectedKey, key, config)
  if (existingTokens.length === 0) {
    const e = new Error('The item did not exist, no item was deleted.')
    e.code = 'ERR_NO_TOKEN'
    throw e
  }
  const kvstoreToken = existingTokens[0]
  const unlockingScript = await pushdrop.redeem({
    prevTxId: kvstoreToken.txid,
    outputIndex: kvstoreToken.vout,
    lockingScript: kvstoreToken.outputScript,
    outputAmount: kvstoreToken.satoshis,
    protocolID: config.protocolID,
    keyID: key,
    counterparty: config.counterparty
  })
  const action = await SDK.createAction({
    description: `Delete the value for ${key}`,
    inputs: {
      [kvstoreToken.txid]: {
        ...kvstoreToken,
        inputs: typeof kvstoreToken.inputs === 'string'
          ? JSON.parse(kvstoreToken.inputs)
          : kvstoreToken.inputs,
        mapiResponses: typeof kvstoreToken.mapiResponses === 'string'
          ? JSON.parse(kvstoreToken.mapiResponses)
          : kvstoreToken.mapiResponses,
        proof: typeof kvstoreToken.proof === 'string'
          ? JSON.parse(kvstoreToken.proof)
          : kvstoreToken.proof,
        outputsToRedeem: [{
          index: kvstoreToken.vout,
          unlockingScript
        }]
      }
    }
  })
  return await submitToOverlay(action, config)
}

module.exports = { get, getWithHistory, set, remove }

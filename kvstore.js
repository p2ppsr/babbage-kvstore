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
  moveToSelf: false,
  moveFromSelf: false,
  viewpoint: 'localToSelf'
}

const computeInvoiceNumber = (protocolID, key) => `${typeof protocolID === 'string' ? '2' : protocolID[0]}-${typeof protocolID === 'string' ? protocolID : protocolID[1]}-${key}`

const findFromOverlay = async (protectedKey, config) => {
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
  return await result.json()
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

const getProtectedKey = async (key, config) => {
  if (config.viewpoint === 'localToSelf') {
    return await SDK.createHmac({
      data: key,
      protocolID: config.protocolID,
      keyID: key,
      counterparty: config.counterparty
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
 *
 * @returns {Promise<String>} The value from the store
 */
const get = async (key, defaultValue = undefined, config = {}) => {
  config = { ...defaultConfig, ...config }
  const protectedKey = await getProtectedKey(key, config)
  const utxos = await findFromOverlay(protectedKey, config)
  if (utxos.length === 0) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    return undefined
  }
  let correctKey
  if (config.viewpoint === 'localToSelf') {
    correctKey = await SDK.getPublicKey({
      protocolID: config.protocolID,
      keyID: key,
      counterparty: config.counterparty,
      forSelf: true
    })
  } else {
    correctKey = getPaymentAddress({
      senderPrivateKey: '0000000000000000000000000000000000000000000000000000000000000001',
      recipientPublicKey: config.viewpoint,
      invoiceNumber: computeInvoiceNumber(config.protocolID, key),
      returnType: 'publicKey'
    })
  }
  for (const utxo of utxos) {
    try {
      const decoded = await pushdrop.decode({
        script: utxo.outputScript,
        fieldFormat: 'utf8'
      })
      if (decoded.lockingPublicKey !== correctKey) {
        throw new Error('Token is not from correct key.')
      }
      return decoded.fields[1]
    } catch (e) {
      continue
    }
  }
  if (defaultValue !== undefined) {
    return defaultValue
  }
  return undefined
}

/**
 * Sets a new value in the store, overwriting any existing value.
 *
 * @param {String} key The key for the value to set
 * @param {String} value The value to store
 *
 * @returns {Promise} Promise that resolves when the value has been stored
 */
const set = async (key, value, config = {}) => {
  config = { ...defaultConfig, ...config }
  if (config.moveFromSelf && config.moveToSelf) {
    throw new Error('moveFromSelf and moveToSelf cannot both be true at the same time.')
  }
  const protectedKey = await getProtectedKey(key, config)
  const existingTokens = await findFromOverlay(protectedKey, config)

  let action
  if (existingTokens.length > 0) {
    const decoded = await pushdrop.decode({
      script: existingTokens[0].outputScript,
      fieldFormat: 'utf8'
    })

    const kvstoreToken = existingTokens[0]
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.txid,
      outputIndex: kvstoreToken.vout,
      lockingScript: kvstoreToken.outputScript,
      outputAmount: kvstoreToken.satoshis,
      protocolID: config.protocolID,
      keyID: key,
      counterparty: config.moveFromSelf ? 'self' : config.counterparty
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
            Buffer.from(protectedKey),
            value
          ],
          protocolID: config.protocolID,
          keyID: key,
          counterparty: config.moveToSelf ? 'self' : config.counterparty,
          counterpartyCanVerifyMyOwnership: config.viewpoint !== 'localToSelf'
        })
      }]
    })
  } else {
    action = await SDK.createAction({
      description: `Set a value for ${key}`,
      outputs: [{
        satoshis: config.tokenAmount,
        script: await pushdrop.create({
          fields: [
            Buffer.from(protectedKey),
            value
          ],
          protocolID: config.protocolID,
          keyID: key,
          counterparty: config.moveToSelf ? 'self' : config.counterparty,
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
 *
 * @returns {Promise} Promise that resolves when the value has been deleted
 */
const remove = async (key, config = {}) => {
  config = { ...defaultConfig, ...config }
  const protectedKey = await getProtectedKey(key, config)
  const existingTokens = await findFromOverlay(protectedKey, config)
  if (existingTokens.length === 0) {
    throw new Error('The item did not exist, no item was deleted.')
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

module.exports = { get, set, remove }

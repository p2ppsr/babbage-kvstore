const { Authrite } = require('authrite-js')
const SDK = require('@babbage/sdk')
const pushdrop = require('pushdrop')

const defaultConfig = {
  confederacyHost: 'https://confederacy.babbage.systems',
  protocolID: [0, 'kvstore'],
  tokenAmount: 1000,
  topic: 'kvstore',
  authriteConfig: undefined
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
  const client = new Authrite(config.authriteConfig)
  const protectedKey = await SDK.createHmac({
    data: key,
    protocolID: config.protocolID,
    keyID: key
  })
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
  const utxos = await result.json()
  if (utxos.length === 0) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    return undefined
  }
  const decoded = await pushdrop.decode({
    script: utxos[0].outputScript,
    fieldFormat: 'utf8'
  })
  return decoded.fields[1]
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
  const client = new Authrite(config.authriteConfig)
  const protectedKey = await SDK.createHmac({
    data: Uint8Array.from(Buffer.from(key)),
    protocolID: config.protocolID,
    keyID: key
  })

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
  const existingTokens = await result.json()

  let action
  if (existingTokens.length > 0) {
    const decoded = await pushdrop.decode({
      script: existingTokens[0].outputScript,
      fieldFormat: 'utf8'
    })
    if (decoded.fields[1] === value) return
    const kvstoreToken = existingTokens[0]
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.txid,
      outputIndex: kvstoreToken.vout,
      lockingScript: kvstoreToken.outputScript,
      outputAmount: kvstoreToken.satoshis,
      protocolID: config.protocolID,
      keyID: key
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
        satoshis: 500,
        script: await pushdrop.create({
          fields: [
            Buffer.from(protectedKey),
            value
          ],
          protocolID: config.protocolID,
          keyID: key
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
          keyID: key
        })
      }]
    })
  }
  await client.request(`${config.confederacyHost}/submit`, {
    method: 'post',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ...action,
      topics: [config.topic]
    })
  })
}

/**
 * Deletes a value from the store.
 *
 * @param {String} key The key for the value to set
 * @param {String} value The value to store
 *
 * @returns {Promise} Promise that resolves when the value has been deleted
 */
const remove = async (key, config = {}) => {
  config = { ...defaultConfig, ...config }
  const client = new Authrite(config.authriteConfig)
  const protectedKey = await SDK.createHmac({
    data: Uint8Array.from(Buffer.from(key)),
    protocolID: config.protocolID,
    keyID: key
  })

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
  const existingTokens = await result.json()

  if (existingTokens.length > 0) {
    const kvstoreToken = existingTokens[0]
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.txid,
      outputIndex: kvstoreToken.vout,
      lockingScript: kvstoreToken.outputScript,
      outputAmount: kvstoreToken.satoshis,
      protocolID: config.protocolID,
      keyID: key
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
    await client.request(`${config.confederacyHost}/submit`, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...action,
        topics: [config.topic]
      })
    })
  }
}

module.exports = { get, set, remove }

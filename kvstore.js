const parapet = require('parapet-js')
const SDK = require('@babbage/sdk')
const pushdrop = require('pushdrop')

const defaultConfig = {
  resolvers: undefined,
  protocolID: [0, 'kvstore'],
  tokenAmount: 1000
}

const KVSTORE_PROTOCOL_ADDRESS = '13vGYFqfJsFYaA3mheYgPKuishLG7sYDaE'

/**
 * Gets a value from the store.
 *
 * @param {String} key The key for the value to get
 *
 * @returns {Promise<String>} The value from the store
 */
const get = async (key, defaultValue=undefined, config=defaultConfig) => {
  const protectedKey = await SDK.createHmac({
    data: key,
    protocolID: config.protocolID,
    keyID: key
  })
  const result = await parapet({
    bridge: KVSTORE_PROTOCOL_ADDRESS,
    request: {
      type: 'json-query',
      query: {
        v: 3,
        q: {
          collection: 'kvstore',
          find: {
            protectedKey: Buffer.from(protectedKey).toString('base64')
          },
          limit: 1
        }
      }
    },
    resolvers: config.resolvers
  })
  if (result.length === 0) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    return undefined
  }
  return result[0].value
}

/**
 * Sets a new value in the store, overwriting any existing value.
 *
 * @param {String} key The key for the value to set
 * @param {String} value The value to store
 *
 * @returns {Promise} Promise that resolves when the value has been stored
 */
const set = async (key, value, config=defaultConfig) => {
  const protectedKey = await SDK.createHmac({
    data: Uint8Array.from(Buffer.from(key)),
    protocolID: config.protocolID,
    keyID: key
  })

  const existing_tokens = await parapet({
    bridge: KVSTORE_PROTOCOL_ADDRESS,
    request: {
      type: 'json-query',
      query: {
        v: 3,
        q: {
          collection: 'kvstore',
          find: {
            protectedKey: Buffer.from(protectedKey).toString('base64')
          },
          limit: 1
        }
      }
    },
    resolvers: config.resolvers
  })

  if (existing_tokens.length > 0 && existing_tokens[0].value != value) {
    const kvstoreToken = existing_tokens[0]
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.token.txid,
      outputIndex: kvstoreToken.token.outputIndex,
      lockingScript: kvstoreToken.token.lockingScript,
      outputAmount: kvstoreToken.token.outputAmount,
      protocolID: config.protocolID,
      keyID: key
    })

    await SDK.createAction({
      description: `Update the value for ${key}`,
      inputs: {
        [kvstoreToken.token.txid]: {
          ...kvstoreToken.token,
          outputsToRedeem: [{
            index: kvstoreToken.token.outputIndex,
            unlockingScript
          }]
        }
      },
      outputs: [{
        satoshis: 500,
        script: await pushdrop.create({
          fields: [
            KVSTORE_PROTOCOL_ADDRESS,
            Buffer.from(protectedKey),
            value
          ],
          protocolID: [0, 'kvstore'],
          keyID: key
        })
      }],
      bridges: [KVSTORE_PROTOCOL_ADDRESS]
    })
  } else {
    await SDK.createAction({
      description: `Set a value for ${key}`,
      outputs: [{
        satoshis: config.tokenAmount,
        script: await pushdrop.create({
          fields: [
            KVSTORE_PROTOCOL_ADDRESS,
            Buffer.from(protectedKey),
            value
          ],
          protocolID: config.protocolID,
          keyID: key
        })
      }],
      bridges: [KVSTORE_PROTOCOL_ADDRESS]
    })
  }
}

/**
 * Deletes a value from the store.
 *
 * @param {String} key The key for the value to set
 * @param {String} value The value to store
 *
 * @returns {Promise} Promise that resolves when the value has been deleted
 */
const remove = async (key, config=defaultConfig) => {
  const protectedKey = await SDK.createHmac({
    data: Uint8Array.from(Buffer.from(key)),
    protocolID: config.protocolID,
    keyID: key
  })

  const existing_tokens = await parapet({
    bridge: KVSTORE_PROTOCOL_ADDRESS,
    request: {
      type: 'json-query',
      query: {
        v: 3,
        q: {
          collection: 'kvstore',
          find: {
            protectedKey: Buffer.from(protectedKey).toString('base64')
          },
          limit: 1
        }
      }
    },
    resolvers: config.resolvers
  })

  if (existing_tokens.length > 0) {
    const kvstoreToken = existing_tokens[0]
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.token.txid,
      outputIndex: kvstoreToken.token.outputIndex,
      lockingScript: kvstoreToken.token.lockingScript,
      outputAmount: kvstoreToken.token.outputAmount,
      protocolID: config.protocolID,
      keyID: key
    })

    await SDK.createAction({
      description: `Delete the value for ${key}`,
      inputs: {
        [kvstoreToken.token.txid]: {
          ...kvstoreToken.token,
          outputsToRedeem: [{
            index: kvstoreToken.token.outputIndex,
            unlockingScript
          }]
        }
      },
      bridges: [KVSTORE_PROTOCOL_ADDRESS]
    })
  }
}

module.exports = { get, set, remove }

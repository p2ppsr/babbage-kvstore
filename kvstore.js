const parapet = require('parapet-js')
const SDK = require('@babbage/sdk')
const pushdrop = require('pushdrop')

const KVSTORE_PROTOCOL_ADDRESS = '13vGYFqfJsFYaA3mheYgPKuishLG7sYDaE'

/**
 * Gets a value from the store.
 *
 * @param {String} key The key for the value to get
 *
 * @returns {Promise<String>} The value from the store
 */
const get = async (key, defaultValue=undefined) => {
  const protectedKey = await SDK.createHmac({
    data: key,
    protocolID: [0, 'kvstore'],
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
    resolvers: ['http://localhost:3103']
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
const set = async (key, value) => {
  const protectedKey = await SDK.createHmac({
    data: Uint8Array.from(Buffer.from(key)),
    protocolID: [0, 'kvstore'],
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
    resolvers: ['http://localhost:3103']
  })

  if (existing_tokens.length > 0 && existing_tokens[0].value != value) {
    const kvstoreToken = existing_tokens[0]
    console.log(kvstoreToken)
    debugger
    const unlockingScript = await pushdrop.redeem({
      prevTxId: kvstoreToken.token.txid,
      outputIndex: kvstoreToken.token.outputIndex,
      lockingScript: kvstoreToken.token.lockingScript,
      outputAmount: kvstoreToken.token.outputAmount,
      protocolID: [0, 'kvstore'],
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
  }
}

// TODO: delete

module.exports = { get, set }

const parapet = require('parapet-js')
const SDK = require('@babbage/sdk')
const pushdrop = require('pushdrop')

const KVSTORE_PROTOCOL_ADDRESS = 'KVStore'

/**
 * Gets a value from the store.
 *
 * @param {String} key The key for the value to get
 *
 * @returns {Promise<String>} The value from the store
 */
const get = async key => {
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
            _id: Buffer.from(protectedKey).toString('hex')
          },
          limit: 1
        }
      }
    }
  })
  if (result.length === 0) {
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
const set = async ({ key, value }) => {
  const protectedKey = await SDK.createHmac({
    data: key,
    protocolID: [0, 'kvstore'],
    keyID: key
  })

  // TODO: Search for any existing token with this protected key

  // TODO: If an existing token is found, append to that token

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

// TODO: delete

module.exports = { get, set }

const { deriveKey } = require('sendover')
const crypto = require('crypto').webcrypto

/**
 * Creates a SHA-256 HMAC with a key belonging to the user.
 * @param {Object} obj - all params given in an object
 * @param {String || Buffer} obj.key - the private key of the sender given has a 32 byte hex string, or as a Buffer
 * @param {String} obj.data The data to HMAC. If given as a string, it should be in base64 format.
 * @param {String} obj.protocolID Specify an identifier for the protocol under which this operation is being performed.
 * @param {String} obj.keyID An identifier for the message. During verification, the same message ID will be required. This can be used to prevent key re-use, even when the same user is using the same protocol to HMAC multiple messages.
 * @param {String} [obj.counterparty] - the recipient this hmac is intended for (defaults to self).
 * @returns
 */
const createHmac = async ({
  key,
  data,
  protocolID,
  keyID,
  counterparty = 'self'
}) => {
  // Validate params
  if (typeof key === 'string') {
    key = Buffer.from(key, 'hex')
  }
  // Derive a key to use to generate the hmac
  const derivedKey = await deriveKey({
    key,
    data,
    protocolID,
    keyID,
    counterparty,
    sharedSymmetricKey: true
  })

  // Create an hmac crypto key from the derived key
  const hmacCryptoKey = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(Buffer.from(derivedKey)),
    { name: 'HMAC', hash: { name: 'SHA-256' } },
    false,
    ['sign']
  )

  // Sign the data and return the hmac
  const hmac = await crypto.subtle.sign(
    { name: 'HMAC' },
    hmacCryptoKey,
    data
  )

  return hmac
}
module.exports = createHmac

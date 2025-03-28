import { CreateActionInput, LockingScript, PushDrop, SecurityLevel, Transaction, WalletClient } from "@bsv/sdk"

/**
 * Updates a KV token. Any previous token is consumed, and if a new locking script
 * is provided, it replaces what (if anything) was there before.
 *
 * @param newLockingScript - Optional locking script for replacing the KV token.
 * @returns {Promise<boolean>} - True if operation succeeded,
 *                                false if requested item wasn't found,
 *                                throws an error otherwise.
 */
export default async function updateToken(
  wallet: WalletClient,
  basket: string,
  key: string,
  tokenAmount: number,
  protocol: [SecurityLevel, string],
  newLockingScript?: LockingScript
): Promise<boolean> {

  const pushdrop = new PushDrop(wallet)

  // 1. List the existing token UTXO(s) for the key.
  const existingUtxos = await wallet.listOutputs({
    basket: basket,
    tags: [key],
    include: 'entire transactions',
    limit: 1 // TODO this again?
  })

  // This is the "create a new token" path — no signAction, just a new locking script.
  if (!existingUtxos.outputs.length) {

    // The intention was to clear the token, but no token was found to clear.
    // And, no script was provided to create a new one.
    if (!newLockingScript) {
      // Thus, we are done.
      // Return false to indicate that the requested item wasn't found.
      return false
    }

    // Since there is a new script provided, we want to add it to the blockchain
    await wallet.createAction({
      description: `KVStore update/create ${key}`,
      outputs: [
        {
          satoshis: tokenAmount,
          lockingScript: newLockingScript.toHex(),
          outputDescription: `${key}`,
          basket: basket,
          tags: [key]
        }
      ],
      options: {
        randomizeOutputs: false
      }
    })
    return true
  }

  // 2. Prepare the token UTXO for consumption.
  const tokenOutput = existingUtxos.outputs[0]
  const inputToConsume: CreateActionInput = {
    outpoint: tokenOutput.outpoint,
    unlockingScriptLength: 73,
    inputDescription: `Consume old version of ${key}`
  }

  // 3. Build the outputs array: if a new locking script is provided, add an output.
  const outputs = newLockingScript
    ? [
        {
          satoshis: tokenAmount,
          lockingScript: newLockingScript.toHex(),
          outputDescription: `Create/Update ${key}`,
          basket: basket,
          tags: [key]
        }
      ]
    : []

  // 4. Create a signable transaction action using the inputs and (optionally) outputs.
  const { signableTransaction } = await wallet.createAction({
    description: `${newLockingScript ? 'Update' : 'Delete'} a user settings token`,
    inputBEEF: existingUtxos.BEEF!,
    inputs: [inputToConsume], // input index 0
    outputs,
    options: {
      randomizeOutputs: false
    }
  })
  const tx = Transaction.fromBEEF(signableTransaction!.tx)

  // 5. Build and sign the unlocking script for the token being consumed.
  const unlocker = pushdrop.unlock(protocol, key, 'self')
  const unlockingScript = await unlocker.sign(tx, 0)

  // 6. Sign the transaction using our unlocking script.
  await wallet.signAction({
    reference: signableTransaction!.reference,
    spends: {
      0: {
        unlockingScript: unlockingScript.toHex()
      }
    }
  })

  return true
}
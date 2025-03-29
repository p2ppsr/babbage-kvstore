import { LockingScript, PushDrop, Utils, WalletInterface, WalletClient, OutpointString, CreateActionInput, SignActionSpend, Transaction } from "@bsv/sdk";

export default class localKVStore {
  private readonly wallet: WalletInterface
  private readonly context: string
  private readonly encrypt: boolean

  constructor(
    wallet: WalletInterface = new WalletClient(),
    context = 'kvstore-default',
    encrypt = true
  ) {
    if (!context) {
      throw new Error('A context in which to operate is required.')
    }
    this.wallet = wallet
    this.context = context
    this.encrypt = encrypt
  }

  async get(key: string, defaultValue: string | undefined = undefined): Promise<string | undefined> {
    const results = await this.wallet.listOutputs({
      basket: this.context,
      tags: [key],
      include: 'locking scripts'
    })
    if (results.outputs.length === 0) {
      return defaultValue
    } else if (results.outputs.length > 1) {
      throw new Error('Multiple tokens found for this key. You need to call set to collapse this ambiguous state before you can get this value again.')
    }
    let fields: number[][]
    try {
      const decoded = PushDrop.decode(LockingScript.fromHex(results.outputs[0].lockingScript!))
      if (decoded.fields.length !== 1) {
        throw new Error('Invalid token.')
      }
      fields = decoded.fields
    } catch (_) {
      throw new Error(`Invalid value found. You need to call set to collapse the corrupted state (or relinquish the corrupted ${results.outputs[0].outpoint} output from the ${this.context} basket) before you can get this value again.`)
    }
    if (!this.encrypt) {
      return Utils.toUTF8(fields[0])
    } else {
      const { plaintext } = await this.wallet.decrypt({
        protocolID: [2, this.context],
        keyID: key,
        ciphertext: fields[0]
      })
      return Utils.toUTF8(plaintext)
    }
  }

  async set(key: string, value: string): Promise<OutpointString> {
    let valueAsArray = Utils.toArray(value, 'utf8')
    if (this.encrypt) {
      const { ciphertext } = await this.wallet.encrypt({
        plaintext: valueAsArray,
        protocolID: [2, this.context],
        keyID: key
      })
      valueAsArray = ciphertext
    }
    const pushdrop = new PushDrop(this.wallet)
    const lockingScript = await pushdrop.lock(
      [valueAsArray],
      [2, this.context],
      key,
      'self'
    )
    const results = await this.wallet.listOutputs({
      basket: this.context,
      tags: [key],
      include: 'entire transactions'
    })
    if (results.totalOutputs !== 0) {
      try {
        const inputs: CreateActionInput[] = []
        for (let i = 0; i < results.outputs.length; i++) {
          inputs.push({
            outpoint: results.outputs[i].outpoint,
            unlockingScriptLength: 74,
            inputDescription: 'Previous key-value token'
          })
        }
        const { signableTransaction } = await this.wallet.createAction({
          description: `Update ${key} in ${this.context}`,
          inputBEEF: results.BEEF,
          inputs,
          outputs: [{
            lockingScript: lockingScript.toHex(),
            satoshis: 1,
            outputDescription: 'Key-value token'
          }],
          options: {
            acceptDelayedBroadcast: false,
            randomizeOutputs: false
          }
        })
        const tx = Transaction.fromAtomicBEEF(signableTransaction.tx)
        const spends: Record<number, SignActionSpend> = {}
        for (let i = 0; i < results.outputs.length; i++) {
          const unlocker = pushdrop.unlock(
            [2, this.context],
            key,
            'self'
          )
          const unlockingScript = await unlocker.sign(tx, i)
          spends[i] = {
            unlockingScript: unlockingScript.toHex()
          }
        }
        const { txid } = await this.wallet.signAction({
          reference: signableTransaction.reference,
          spends
        })
        return `${txid}.0`
      } catch (_) {
        for (let i = 0; i < results.outputs.length; i++) {
          await this.wallet.relinquishOutput({
            output: results.outputs[i].outpoint,
            basket: this.context
          })
        }
      }
    }
    const { txid } = await this.wallet.createAction({
      description: `Set ${key} in ${this.context}`,
      outputs: [{
        lockingScript: lockingScript.toHex(),
        satoshis: 1,
        outputDescription: 'Key-value token'
      }],
      options: {
        acceptDelayedBroadcast: false,
        randomizeOutputs: false
      }
    })
    return `${txid}.0`
  }

  async remove(key: string): Promise<OutpointString | void> {
    const results = await this.wallet.listOutputs({
      basket: this.context,
      tags: [key],
      include: 'entire transactions'
    })
    if (results.totalOutputs === 0) {
      return
    }
    const pushdrop = new PushDrop(this.wallet)
    try {
      const inputs: CreateActionInput[] = []
      for (let i = 0; i < results.outputs.length; i++) {
        inputs.push({
          outpoint: results.outputs[i].outpoint,
          unlockingScriptLength: 74,
          inputDescription: 'Previous key-value token'
        })
      }
      const { signableTransaction } = await this.wallet.createAction({
        description: `Update ${key} in ${this.context}`,
        inputBEEF: results.BEEF,
        inputs,
        options: {
          acceptDelayedBroadcast: false,
          randomizeOutputs: false
        }
      })
      const tx = Transaction.fromAtomicBEEF(signableTransaction.tx)
      const spends: Record<number, SignActionSpend> = {}
      for (let i = 0; i < results.outputs.length; i++) {
        const unlocker = pushdrop.unlock(
          [2, this.context],
          key,
          'self'
        )
        const unlockingScript = await unlocker.sign(tx, i)
        spends[i] = {
          unlockingScript: unlockingScript.toHex()
        }
      }
      const { txid } = await this.wallet.signAction({
        reference: signableTransaction.reference,
        spends
      })
      return `${txid}.0`
    } catch (_) {
      for (let i = 0; i < results.outputs.length; i++) {
        await this.wallet.relinquishOutput({
          output: results.outputs[i].outpoint,
          basket: this.context
        })
      }
    }
  }
}
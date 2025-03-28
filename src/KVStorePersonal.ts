import { LockingScript, PushDrop, Utils, WalletClient } from "@bsv/sdk";
import updateToken from "./UpdateToken";

export interface KVStorePersonalConfig {
  basket?: string
  tokenAmount?: number
}

export default class KVStorePersonal {

  private readonly wallet: WalletClient
  private readonly config: KVStorePersonalConfig

  constructor(
    wallet: WalletClient,
    config: KVStorePersonalConfig = {
      basket: 'kvstore-default',
      tokenAmount: 1
    }) {
    this.wallet = wallet

    const defaultConfig = {
      basket: 'kvstore-default',
      tokenAmount: 1
    }
    this.config = { ...defaultConfig, ...config }
  }

  async get(key: string, defaultValue: string | undefined = undefined): Promise<string | undefined> {

    if (!this.config.basket) {
      throw new Error('No basket to search. An invalid name given in the constructor overwrote the default basket name.')
    }

    // List outputs in the basket
    const results = await this.wallet.listOutputs({
      basket: this.config.basket,
      tags: [key],
      include: 'locking scripts',
      limit: 1 // There should only be one settings token TODO what should i do about this?
    })

    // Return defaults if no settings token is found
    if (!results.outputs.length) {
      return defaultValue
    }

    const { fields } = PushDrop.decode(LockingScript.fromHex(results.outputs[0].lockingScript!))

    return Utils.toUTF8(fields[0])
  }

  async set(key: string, value: string): Promise<boolean> {

    const pushdrop = new PushDrop(this.wallet)

    // Build the new locking script with the updated value.
    const lockingScript = await pushdrop.lock(
      [Utils.toArray(value, 'utf8')],
      [1, 'kvstore'], // TODO check if this is right
      key,  // TODO check this too
      'self'
    )

    // Consume any existing token and create a new one with the new locking script.
    return await updateToken(this.wallet, this.config.basket!, key, this.config.tokenAmount!, [1, 'kvstore'], lockingScript)

  }

  async remove(key: string): Promise<boolean> {

    // Search for the given key. If it exists:
    // Consume it and return true.
    // If it doesn't:
    // Return false
    return await updateToken(this.wallet, this.config.basket!, key, this.config.tokenAmount!, [1, 'kvstore'])

  }
}
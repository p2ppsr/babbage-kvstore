import { LockingScript, PushDrop, Utils, WalletClient } from "@bsv/sdk";

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

  async get(
    key: string,
    defaultValue: string | undefined = undefined,
  ): Promise<string | undefined> {

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

  
}
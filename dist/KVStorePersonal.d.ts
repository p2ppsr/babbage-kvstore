import { WalletClient } from "@bsv/sdk";
export interface KVStorePersonalConfig {
    basket?: string;
    tokenAmount?: number;
}
export default class KVStorePersonal {
    private readonly wallet;
    private readonly config;
    constructor(wallet: WalletClient, config?: KVStorePersonalConfig);
    get(key: string, defaultValue?: string | undefined): Promise<string | undefined>;
    getWithHistory(): Promise<object | undefined>;
}

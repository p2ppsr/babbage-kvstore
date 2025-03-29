# `babbage-kvstore`

Blockchain-based key-value storage for local and global use

## API

<!--#region ts2md-api-merged-here-->

Links: [API](#api), [Classes](#classes)

### Classes

#### Class: localKVStore

```ts
export default class localKVStore {
    constructor(wallet: WalletInterface = new WalletClient(), context = "kvstore-default", encrypt = true) 
    async get(key: string, defaultValue: string | undefined = undefined): Promise<string | undefined> 
    async set(key: string, value: string): Promise<OutpointString> 
    async remove(key: string): Promise<OutpointString | void> 
}
```

Links: [API](#api), [Classes](#classes)

---

<!--#endregion ts2md-api-merged-here-->

## License

The license for the code in this repository is the Open BSV License.
# `babbage-kvstore`

Blockchain-based key-value storage for local and global use

## API

<!--#region ts2md-api-merged-here-->

Links: [API](#api), [Classes](#classes)

### Classes

#### Class: localKVStore

Implements a key-value storage system backed by transaction outputs managed by a wallet.
Each key-value pair is represented by a PushDrop token output in a specific context (basket).
Allows setting, getting, and removing key-value pairs, with optional encryption.

```ts
export default class localKVStore {
    constructor(wallet: WalletInterface = new WalletClient(), context = "kvstore-default", encrypt = true) 
    async get(key: string, defaultValue: string | undefined = undefined): Promise<string | undefined> 
    async set(key: string, value: string): Promise<OutpointString> 
    async remove(key: string): Promise<OutpointString | void> 
}
```

<details>

<summary>Class localKVStore Details</summary>

##### Constructor

Creates an instance of the localKVStore.

```ts
constructor(wallet: WalletInterface = new WalletClient(), context = "kvstore-default", encrypt = true) 
```

Argument Details

+ **wallet**
  + The wallet interface to use. Defaults to a new WalletClient instance.
+ **context**
  + The context (basket) for namespacing keys. Defaults to 'kvstore-default'.
+ **encrypt**
  + Whether to encrypt values. Defaults to true.

Throws

If the context is missing or empty.

##### Method get

Retrieves the value associated with a given key.

```ts
async get(key: string, defaultValue: string | undefined = undefined): Promise<string | undefined> 
```

Returns

A promise that resolves to the value as a string,
the defaultValue if the key is not found, or undefined if no defaultValue is provided.

Argument Details

+ **key**
  + The key to retrieve the value for.
+ **defaultValue**
  + The value to return if the key is not found.

Throws

If multiple outputs are found for the key (ambiguous state).

If the found output's locking script cannot be decoded or represents an invalid token format.

##### Method remove

Removes the key-value pair associated with the given key.
It finds the existing output(s) for the key and spends them without creating a new output.
If multiple outputs exist, they are all spent in the same transaction.
If the key does not exist, it does nothing.
If signing the removal transaction fails, it relinquishes the original outputs instead of spending.

```ts
async remove(key: string): Promise<OutpointString | void> 
```

Returns

A promise that resolves to the txid of the removal transaction if successful.

Argument Details

+ **key**
  + The key to remove.

##### Method set

Sets or updates the value associated with a given key.
If the key already exists (one or more outputs found), it spends the existing output(s)
and creates a new one with the updated value. If multiple outputs exist for the key,
they are collapsed into a single new output.
If the key does not exist, it creates a new output.
Handles encryption if enabled.
If signing the update/collapse transaction fails, it relinquishes the original outputs and starts over with a new chain.

```ts
async set(key: string, value: string): Promise<OutpointString> 
```

Returns

A promise that resolves to the outpoint string (txid.vout) of the new or updated token output.

Argument Details

+ **key**
  + The key to set or update.
+ **value**
  + The value to associate with the key.

</details>

Links: [API](#api), [Classes](#classes)

---

<!--#endregion ts2md-api-merged-here-->

## License

The license for the code in this repository is the Open BSV License.
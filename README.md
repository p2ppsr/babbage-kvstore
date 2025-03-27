
A flexible and decentralized Key-Value storage and retrieval system for personal and shared contexts, designed and engineered around the feature-rich and versatile Bitcoin SV (BSV).

## Table Of Contents

*   [Introduction](#introduction)
*   [Installation](#installation)
*   [Usage](#usage)
    *   [Setting and Getting values](#setting-and-getting-values)
    *   [Removing a Value](#removing-a-value)
    *   [Retrieving Previous Values](#retrieving-previous-values)
*   [Configuration](#configuration)
*   [Applications and Use Cases](#applications-and-use-cases)
*   [API](#api)
*   [License](#license)

## Introduction

Babbage KVStore provides robust key-value storage functionality for your applications that leverages the power of Bitcoin SV's blockchain technology. By treating Bitcoin transactions (specifically UTXOs or Unspent Transaction Outputs) as your value store, you can create highly-distributed and verifiably-secure data storage for your application. KVStore comes in two flavors: Personal and Shared, .
#### Personal
Key-value pairs are stored 'locally,' meaning in an individual user's BSV Wallet. The data is local to the person, but can be accessed by any device authenticated into that user's wallet. Related data can be grouped together into a namespace called a 'basket.'

#### Shared
Key-value pairs are tracked by an Overlay Service, allowing multiple authorized users to create, read, update, and delete the same data, still in a decentralized system. Changes will propagate to all data hosts and the history of a key's value can be retrieved. By default, there is only one namespace for all data using the Shared KVStore system: a topic called 'kvstore.' Custom topics can be created, but this requires the creation and deployment of advanced infrastructure.

#### Methods
Create, Read, Update, and Delete (CRUD) functionality is provided through a similar interface for both flavors of KVStore with three functions: get (read), set (create and update), and remove (delete).

## Installation

Simply use npm to include Babbage KVStore in your project:

```sh
npm install babbage-kvstore
```

## Usage

### Step 1: Set-Up

First, choose a flavor: Personal or Shared.

Each flavor has configuration settings to change. Each parameter is optional and defers to a default value if no alternative is provided. Any parameters that are given will become the new default for this KVStore object instance. This is useful if, for example, if you want to create one instance responsible for managing application appearance settings. The basket name or overlay URL would most likely not change between calls, and would be repetitive to add each time. Each get, set, and delete call can deviate from the default configuration with optional parameters.

#### Personal

```js
import { KVStorePersonal } from 'babbage-kvstore'

const personalStore = new KVStorePersonal({
	basket?: string = 'kvstore-default',
	tokenAmount?: number = 1,
})
```

#### Shared

```js
import { KVStoreShared } from 'babbage-kvstore'

const sharedStore = new KVStoreShared({
	networkPreset?: 'mainnet' | 'testnet' | 'local' = 'mainnet',
	topics?: string[] = ['kvstore'],
	tokenAmount?: number = 1,
	counterparty?: string = 'self',
	doubleSpendMaxAttempts?: number = 5
})
```

### Step 2: Setting and Getting values

The `set` method takes in a key and a value, which are both strings. If the key-value pair doesn't exist in the storage system yet, it will be created. If it does exist, the storage will update its value with the provided one. The `get` method retrieves the value associated with a key, if it exists. Optionally, a default value can be provided so that an expected value is returned if the key-value pari is not found. Here is an example:

```js
import { KVStorePersonal } from 'babbage-kvstore'

// Step 1: Create an instance
const personalStore = new KVStorePersonal()

// Set a value
await personalStore.set('Hello', 'World')
// Retrieve a value
console.log(await personalStore.get('Hello')) // Outputs: 'World'

// Update the value
await personalStore.set('Hello', 'Mom')
// See the update
console.log(await personalStore.get('Hello')) // Outputs: 'Mom'

// Check for a value that hasn't been set
console.log(await personalStore.get('foo')) // Outputs: An empty string ''
// Check for a value that hasn't been set, giving a default
console.log(await personalStore.get('foo', 'bar')) // Outputs: 'bar'

```

### Removing a Value

The `remove` method is used to delete a value in your KV store. All you need is the key:

```js
import { KVStoreShared } from 'babbage-kvstore'

const sharedStore = new KVStoreShared()

// Set a value
await sharedStore.set('Hello', 'World')

// Remove the value
await sharedStore.remove('Hello')

// Get the deleted value
console.log(await sharedStore.get('Hello')) // Outputs: An empty string ''
```

### Retrieving Previous Values

`getWithHistory` lets you view previous versions of a value, allowing for an auditable log. This can be very powerful in several auditing and data tracking scenarios. This feature is only available in KVStoreShared. Calling it on a KVStorePersonal instance will throw an error.

```js
import { KVStoreShared } from 'babbage-kvstore'

const sharedStore = new KVStoreShared()

// Set a value
sharedStore.set('Hello', 'World')
sharedStore.set('Hello', 'Mom')

// Retrieve a value with history
console.log(await sharedStorage.getWithHistory('Hello'))
/* Outputs: entire history of 'Hello'
   What this looks like?
*/
```

## Applications and Use Cases

Due to its distributed, secure, and robust nature, Babbage KVStore can be used in various scenarios. A few key examples include:

*   Decentralized applications:
    *   Enhanced user security
    *   Non-fungible tokens (NFTs)
    *   On-chain social media
    *   Data provenance tracking
*   Auditing systems: With the use of the `getWithHistory` function, you can implement auditable logging and tracking systems.
*   Secure system settings: Store secure system environment settings.
*   Gaming: Keep track of game states and history.

## Config

Config objects, either Personal or Shared, are used by the constructor of a KVStore instance to set the defaults for that instance. Config objects are used again in get(), set(), remove(), and getWithHistory() calls to override the default parameters set for for the called upon KVStore instance.

### KVStorePersonalConfig

```js
interface KVStorePersonalConfig {
	basket?: string = 'kvstore-default',
	tokenAmount?: number = 1,
}
```

### KVStoreSharedConfig

```js
interface KVStoreSharedConfig {
	networkPreset?: 'mainnet' | 'testnet' | 'local' = 'mainnet',
	topics?: string[] = ['kvstore'],
	tokenAmount?: number = 1,
	counterparty?: string = 'self',
	doubleSpendMaxAttempts?: number = 5
}
```

## API

<!-- Generated by documentation.js. Update this documentation by updating the source code. -->

#### Table of Contents

*   [get](#get)
    *   [Parameters](#parameters)
*   [getWithHistory](#getwithhistory)
    *   [Parameters](#parameters-1)
*   [set](#set)
    *   [Parameters](#parameters-2)
*   [remove](#remove)
    *   [Parameters](#parameters-3)

### get

Gets a value from the store corresponding to the `key`. If the value can't be found, `defaultValue` is returned, if provided, or `undefined`

#### Parameters

*   `key: string` The key for the value to get
*   `defaultValue?: string`  The value returned when the given key cannot be found (optional, default `undefined`)
*   `config: KVStorePersonalConfig | KVStoreSharedConfig`  The config object (see the config section) (optional, default `{}`)

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[string](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String)>** The value from the store

### getWithHistory

Gets a value from the store with its history. Only available for KVStoreShared.

#### Parameters

*   `key: string` The key for the value to get
*   `defaultValue: string` The value returned when no token is found (optional, default `undefined`)
*   `config: KVStoreSharedConfig` The config object (see the config section) (optional, default `{}`)

Returns **[Promise](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Promise)<[object](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Object)>** The value from the store and history of the token

### set

Sets a new `value` in the store, overwriting any existing value corresponding to that `key`.

#### Parameters

*   `key: string` The key for the value to set
*   `value: string` The value to store
*   `config: KVStorePersonalConfig | KVStoreSharedConfig` The config object (see the config section) (optional, default `{}`)

Returns Promise that resolves to true when the value has been stored, false if it fails, with an exception thrown.

### remove

Deletes a value from the store.

#### Parameters

*   `key: string` The key for the value to remove
*   `config: KVStorePersonalConfig | KVStoreSharedConfig` The config object (see the config section) (optional, default `{}`)

Returns Promise that resolves to true when the value has been deleted or false if it couldn't be found

## Project Roadmap

#### Current version: 1.2.36

#### Goals for version 1.3

- [ ] Create an empty new project
- [ ] Implement the local (KVStorePersonal) class
#### Goals for Version 2.0

- [ ] Bring in version 1.2.36 code as shared (KVStoreShared) class
- [ ] Update it to typescript
- [ ] Update it to use @bsv/sdk
- [ ] Update the topic manager for @bsv/sdk
- [ ] Update the lookup service for @bsv/sdk

## License

The license for the code in this repository is the Open BSV License.
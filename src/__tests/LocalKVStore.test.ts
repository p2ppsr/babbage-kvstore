/** eslint-env jest */
import localKVStore from '../LocalKVStore';
import {
    LockingScript,
    PushDrop,
    Utils,
    WalletInterface,
    Transaction,
    ListOutputsResult,
    WalletDecryptResult,
    WalletEncryptResult,
    CreateActionResult,
    SignActionResult
} from '@bsv/sdk';

// --- Constants for Mock Values ---
const testLockingScriptHex = 'mockLockingScriptHex';
const testUnlockingScriptHex = 'mockUnlockingScriptHex';
const testEncryptedValue = Buffer.from('encryptedData'); // Use Buffer for ciphertext
const testRawValue = 'myTestDataValue';
const testRawValueBuffer = Buffer.from(testRawValue); // Buffer for raw value

// Mock the entire @bsv/sdk module
jest.mock('@bsv/sdk', () => {
    // --- Define the mock instances/values returned by methods ---
    const mockLockingScriptInstance = {
        toHex: jest.fn(() => testLockingScriptHex), // Default value
    };
    const mockUnlockerInstance = {
        // Default sign behavior returns an object with a toHex mock
        sign: jest.fn().mockResolvedValue({ toHex: jest.fn(() => testUnlockingScriptHex) }),
    };
    // --- Define the mock instance returned by the PushDrop constructor ---
    const mockPushDropInstance = {
        // Default lock behavior returns the mock script
        lock: jest.fn().mockResolvedValue(mockLockingScriptInstance),
        // Default unlock behavior returns the mock unlocker
        unlock: jest.fn().mockReturnValue(mockUnlockerInstance),
        // Add a mock for the static decode method directly here if needed,
        // or manage it separately as done below.
    };

    // --- Define the mock for the static decode method ---
    // It needs to be separate because it's static, not on the instance.
    const mockPushDropDecode = jest.fn();

    // --- Return the structure for the mocked module ---
    return {
        // --- Mocked Classes ---
        LockingScript: {
            fromHex: jest.fn(() => mockLockingScriptInstance), // Static method returns mock instance
        },
        // The PushDrop constructor *always* returns the pre-configured mock instance
        PushDrop: Object.assign(
            jest.fn(() => mockPushDropInstance), // Constructor mock
            { decode: mockPushDropDecode }        // Static method mock
        ),
        WalletClient: jest.fn(), // Mock constructor (if needed for default wallet)
        Transaction: {
            // Static method returns a minimal mock object
            fromAtomicBEEF: jest.fn(() => ({ /* mock tx object if needed */ })),
        },
        // --- Mocked Functions/Objects ---
        Utils: {
            // Ensure toArray returns Array<number> or Uint8Array
            toArray: jest.fn((str: string, encoding = 'utf8') => Array.from(Buffer.from(str, encoding as BufferEncoding))),
            toUTF8: jest.fn((arr: number[] | Uint8Array) => Buffer.from(arr).toString('utf8')),
        },
        // --- Re-export Types (Good practice, Jest often handles this) ---
        // Add any specific types needed if Jest doesn't automatically handle them
    };
});

// --- Typed Mocks for SDK Components ---
const MockedLockingScript = LockingScript as jest.Mocked<typeof LockingScript>;
// Use MockedClass for the constructor and add static methods separately
const MockedPushDrop = PushDrop as jest.MockedClass<typeof PushDrop> & {
    decode: jest.Mock<any, any>;
};
// Access the static mock assigned during jest.mock
const MockedPushDropDecode = MockedPushDrop.decode;
const MockedUtils = Utils as jest.Mocked<typeof Utils>;
const MockedTransaction = Transaction as jest.Mocked<typeof Transaction>;

// --- Mock Wallet Setup ---
const createMockWallet = (): jest.Mocked<WalletInterface> => ({
    listOutputs: jest.fn(),
    encrypt: jest.fn(),
    decrypt: jest.fn(),
    createAction: jest.fn(),
    signAction: jest.fn(),
    relinquishOutput: jest.fn(),
} as unknown as jest.Mocked<WalletInterface>);

describe('localKVStore', () => {
    let mockWallet: jest.Mocked<WalletInterface>;
    let kvStore: localKVStore;
    const testContext = 'test-kv-context';
    const testKey = 'myTestKey';
    const testValue = 'myTestDataValue'; // Raw value string used in tests
    // Use the constants defined above for mock results
    // const testEncryptedValue = Buffer.from('encryptedData'); // Defined above
    const testOutpoint = 'txid123.0';
    // const testLockingScriptHex = 'mockLockingScriptHex'; // Defined above
    // const testUnlockingScriptHex = 'mockUnlockingScriptHex'; // Defined above

    beforeEach(() => {
        // Reset mocks before each test (clears calls and resets implementations)
        jest.clearAllMocks();

        // Create a fresh mock wallet for each test
        mockWallet = createMockWallet();

        // Create a kvStore instance with the mock wallet
        // Default encrypt=true unless specified otherwise in a test block
        kvStore = new localKVStore(mockWallet, testContext, true);

        // Reset specific mock implementations if needed after clearAllMocks
        // (e.g., if a test overrides a default implementation)
        MockedPushDropDecode.mockClear(); // Clear calls/results for static decode

        // NOTE: No need to set default mock behaviors for lock/unlock here anymore.
        // They are now defined directly within the jest.mock factory function.
    });

    // --- Constructor Tests ---
    describe('constructor', () => {
        it('should create an instance with default wallet and encrypt=true', () => {
            // We need to mock the default WalletClient if the SUT uses it
            const MockedWalletClient = require('@bsv/sdk').WalletClient;
            const store = new localKVStore(undefined, 'default-context');
            expect(store).toBeInstanceOf(localKVStore);
            expect(MockedWalletClient).toHaveBeenCalledTimes(1); // Verify default was created
            expect((store as any).context).toEqual('default-context');
            expect((store as any).encrypt).toBe(true);
        });

        it('should create an instance with provided wallet, context, and encrypt=false', () => {
            const customWallet = createMockWallet();
            const store = new localKVStore(customWallet, 'custom-context', false);
            expect(store).toBeInstanceOf(localKVStore);
            expect((store as any).wallet).toBe(customWallet);
            expect((store as any).context).toEqual('custom-context');
            expect((store as any).encrypt).toBe(false);
        });

        it('should throw an error if context is missing or empty', () => {
            expect(() => new localKVStore(mockWallet, '')).toThrow('A context in which to operate is required.');
            expect(() => new localKVStore(mockWallet, null as any)).toThrow('A context in which to operate is required.');
        });
    });

    // --- Get Method Tests ---
    describe('get', () => {
        it('should return defaultValue if no output is found', async () => {
            mockWallet.listOutputs.mockResolvedValue({ outputs: [], totalOutputs: 0, BEEF: undefined });
            const defaultValue = 'default';
            const result = await kvStore.get(testKey, defaultValue);

            expect(result).toBe(defaultValue);
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({
                basket: testContext,
                tags: [testKey],
                include: 'locking scripts' // Check include value
            });
        });

        it('should return undefined if no output is found and no defaultValue provided', async () => {
            mockWallet.listOutputs.mockResolvedValue({ outputs: [], totalOutputs: 0, BEEF: undefined });
            const result = await kvStore.get(testKey);

            expect(result).toBeUndefined();
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({
                basket: testContext,
                tags: [testKey],
                include: 'locking scripts' // Check include value
            });
        });

        it('should throw an error if multiple outputs are found', async () => {
            mockWallet.listOutputs.mockResolvedValue({
                outputs: [
                    { outpoint: 'txid1.0', lockingScript: 'script1' },
                    { outpoint: 'txid2.0', lockingScript: 'script2' },
                ],
                totalOutputs: 2,
                BEEF: undefined
            } as unknown as ListOutputsResult);

            await expect(kvStore.get(testKey)).rejects.toThrow(
                'Multiple tokens found for this key. You need to call set to collapse this ambiguous state before you can get this value again.'
            );
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({
                basket: testContext,
                tags: [testKey],
                include: 'locking scripts' // Check include value
            });
        });

        it('should throw an error if PushDrop.decode fails', async () => {
            const mockOutput = { outpoint: testOutpoint, lockingScript: testLockingScriptHex };
            mockWallet.listOutputs.mockResolvedValue({ outputs: [mockOutput], totalOutputs: 1, BEEF: undefined } as any);
            // LockingScript.fromHex is called internally by PushDrop.decode in the real implementation,
            // but we mock decode directly here. We still need fromHex mocked if the SUT calls it elsewhere.
            // MockedLockingScript.fromHex is already mocked globally to return mockLockingScriptInstance

            // Make the *static* decode method throw
            MockedPushDropDecode.mockImplementation(() => { throw new Error('Decode failed'); });

            await expect(kvStore.get(testKey)).rejects.toThrow(
                // Match the error message precisely
                `Invalid value found. You need to call set to collapse the corrupted state (or relinquish the corrupted ${testOutpoint} output from the ${testContext} basket) before you can get this value again.`
            );
            expect(MockedLockingScript.fromHex).toHaveBeenCalledWith(testLockingScriptHex);
            expect(MockedPushDropDecode).toHaveBeenCalledWith(expect.objectContaining({ // Check arg for decode
                toHex: expect.any(Function) // Check it got the script obj
            }));
        });

        it('should throw an error if decoded fields length is not 1', async () => {
            const mockOutput = { outpoint: testOutpoint, lockingScript: testLockingScriptHex };
            mockWallet.listOutputs.mockResolvedValue({ outputs: [mockOutput], totalOutputs: 1, BEEF: undefined } as any);
            // MockedLockingScript.fromHex is implicitly called by PushDrop.decode

            // Mock the *static* decode to return multiple fields
            MockedPushDropDecode.mockReturnValue({ fields: [Buffer.from([1, 2]), Buffer.from([3, 4])] });

            await expect(kvStore.get(testKey)).rejects.toThrow('Invalid value found. You need to call set to collapse the corrupted state (or relinquish the corrupted txid123.0 output from the test-kv-context basket) before you can get this value again.');
            expect(MockedLockingScript.fromHex).toHaveBeenCalledWith(testLockingScriptHex);
            expect(MockedPushDropDecode).toHaveBeenCalled();
        });


        it('should get, decrypt and return the value when encrypt=true', async () => {
            const mockOutput = { outpoint: testOutpoint, lockingScript: testLockingScriptHex };
            mockWallet.listOutputs.mockResolvedValue({ outputs: [mockOutput], totalOutputs: 1, BEEF: undefined } as any);
            // MockedLockingScript.fromHex is implicitly called by PushDrop.decode

            // Mock the *static* decode to return the encrypted value buffer
            MockedPushDropDecode.mockReturnValue({ fields: [testEncryptedValue] });

            // Mock decrypt to return the plain text Array<number>
            mockWallet.decrypt.mockResolvedValue({ plaintext: Array.from(testRawValueBuffer) } as WalletDecryptResult);

            // Mock Utils.toUTF8 to perform the final conversion
            MockedUtils.toUTF8.mockReturnValue(testValue); // Mock based on testValue string

            const result = await kvStore.get(testKey);

            expect(result).toBe(testValue);
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({ basket: testContext, tags: [testKey], include: 'locking scripts' });
            expect(MockedLockingScript.fromHex).toHaveBeenCalledWith(testLockingScriptHex);
            expect(MockedPushDropDecode).toHaveBeenCalled();
            expect(mockWallet.decrypt).toHaveBeenCalledWith({
                protocolID: [2, testContext],
                keyID: testKey,
                // Ensure ciphertext is passed as Uint8Array or Buffer (Buffer should work)
                ciphertext: testEncryptedValue,
            });
            // Ensure toUTF8 is called with the *decrypted* buffer data (as Array<number> or Uint8Array)
            expect(MockedUtils.toUTF8).toHaveBeenCalledWith(Array.from(testRawValueBuffer));
        });

        it('should get and return the value without decryption when encrypt=false', async () => {
            kvStore = new localKVStore(mockWallet, testContext, false); // Recreate store with encrypt=false

            const mockOutput = { outpoint: testOutpoint, lockingScript: testLockingScriptHex };
            mockWallet.listOutputs.mockResolvedValue({ outputs: [mockOutput], totalOutputs: 1, BEEF: undefined } as any);
            // MockedLockingScript.fromHex implicitly called by PushDrop.decode

            // Mock the *static* decode to return the raw value buffer
            MockedPushDropDecode.mockReturnValue({ fields: [testRawValueBuffer] });

            // Mock Utils.toUTF8 for final conversion
            MockedUtils.toUTF8.mockReturnValue(testValue);

            const result = await kvStore.get(testKey);

            expect(result).toBe(testValue);
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({ basket: testContext, tags: [testKey], include: 'locking scripts' });
            expect(MockedLockingScript.fromHex).toHaveBeenCalledWith(testLockingScriptHex);
            expect(MockedPushDropDecode).toHaveBeenCalled();
            expect(mockWallet.decrypt).not.toHaveBeenCalled(); // Ensure decrypt was NOT called
            expect(MockedUtils.toUTF8).toHaveBeenCalledWith(testRawValueBuffer); // Called with the raw buffer
        });
    });

    // --- Set Method Tests ---
    describe('set', () => {
        let pushDropInstance: PushDrop; // To access the instance methods

        beforeEach(() => {
            // Get the mock instance that will be created by `new PushDrop()`
            pushDropInstance = new (PushDrop as any)();
        })

        it('should create a new encrypted output if none exists', async () => {
            const valueArray = Array.from(testRawValueBuffer);
            const encryptedArray = Array.from(testEncryptedValue);
            MockedUtils.toArray.mockReturnValue(valueArray); // Mock toArray -> Array<number>
            mockWallet.encrypt.mockResolvedValue({ ciphertext: encryptedArray } as WalletEncryptResult); // Encrypt returns Array<number>
            mockWallet.listOutputs.mockResolvedValue({ outputs: [], totalOutputs: 0, BEEF: undefined });
            mockWallet.createAction.mockResolvedValue({ txid: 'newTxId' } as CreateActionResult);

            // Get the mock instance returned by the constructor
            const mockPDInstance = new MockedPushDrop(mockWallet);

            const result = await kvStore.set(testKey, testValue);

            expect(result).toBe('newTxId.0');
            expect(MockedUtils.toArray).toHaveBeenCalledWith(testValue, 'utf8');
            expect(mockWallet.encrypt).toHaveBeenCalledWith({
                plaintext: valueArray, // Should be Array<number>
                protocolID: [2, testContext],
                keyID: testKey,
            });
            // Check the mock instance's lock method
            expect(mockPDInstance.lock).toHaveBeenCalledWith(
                // The lock function expects Array<number[] | Uint8Array>
                // Ensure the encrypted value is passed correctly (as Uint8Array or Array<number>)
                [(encryptedArray)], // Pass buffer derived from encrypted array
                [2, testContext],
                testKey,
                'self'
            );
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({
                basket: testContext,
                tags: [testKey],
                include: 'entire transactions'
            });
            // Verify createAction for NEW output
            expect(mockWallet.createAction).toHaveBeenCalledWith({
                description: `Set ${testKey} in ${testContext}`,
                outputs: [{
                    lockingScript: testLockingScriptHex, // From the mock lock result
                    satoshis: 1,
                    outputDescription: 'Key-value token'
                }],
                options: {
                    acceptDelayedBroadcast: false,
                    randomizeOutputs: false
                }
            });
            expect(mockWallet.signAction).not.toHaveBeenCalled();
            expect(mockWallet.relinquishOutput).not.toHaveBeenCalled();
        });

        it('should create a new non-encrypted output if none exists and encrypt=false', async () => {
            kvStore = new localKVStore(mockWallet, testContext, false); // encrypt=false
            const valueArray = Array.from(testRawValueBuffer);
            MockedUtils.toArray.mockReturnValue(valueArray);
            mockWallet.listOutputs.mockResolvedValue({ outputs: [], totalOutputs: 0, BEEF: undefined });
            mockWallet.createAction.mockResolvedValue({ txid: 'newTxIdNonEnc' } as CreateActionResult);

            // Get the mock instance returned by the constructor
            const mockPDInstance = new MockedPushDrop(mockWallet);

            const result = await kvStore.set(testKey, testValue);

            expect(result).toBe('newTxIdNonEnc.0');
            expect(MockedUtils.toArray).toHaveBeenCalledWith(testValue, 'utf8');
            expect(mockWallet.encrypt).not.toHaveBeenCalled();
            // Check the mock instance's lock method
            expect(mockPDInstance.lock).toHaveBeenCalledWith(
                [(valueArray)], // Pass raw value buffer
                [2, testContext],
                testKey,
                'self'
            );
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({
                basket: testContext,
                tags: [testKey],
                include: 'entire transactions'
            });
            expect(mockWallet.createAction).toHaveBeenCalledWith({
                description: `Set ${testKey} in ${testContext}`,
                outputs: [{
                    lockingScript: testLockingScriptHex, // From mock lock
                    satoshis: 1,
                    outputDescription: 'Key-value token'
                }],
                options: {
                    acceptDelayedBroadcast: false,
                    randomizeOutputs: false
                }
            });
            expect(mockWallet.signAction).not.toHaveBeenCalled();
            expect(mockWallet.relinquishOutput).not.toHaveBeenCalled();
        });

        it('should update an existing output (spend and create)', async () => {
            const existingOutpoint = 'oldTxId.0';
            const existingOutput = { outpoint: existingOutpoint, txid: 'oldTxId', vout: 0, lockingScript: 'oldScriptHex' }; // Added script
            const mockBEEF = Array.from(Buffer.from('mockBEEFData'));
            const signableRef = 'signableTxRef123';
            const signableTx = []
            const updatedTxId = 'updatedTxId';

            const valueArray = Array.from(testRawValueBuffer);
            const encryptedArray = Array.from(testEncryptedValue);

            MockedUtils.toArray.mockReturnValue(valueArray);
            mockWallet.encrypt.mockResolvedValue({ ciphertext: encryptedArray } as WalletEncryptResult);
            mockWallet.listOutputs.mockResolvedValue({ outputs: [existingOutput], totalOutputs: 1, BEEF: mockBEEF } as any);

            // Mock createAction to return a signable transaction structure
            mockWallet.createAction.mockResolvedValue({
                signableTransaction: { reference: signableRef, tx: signableTx }
            } as CreateActionResult);

            // Mock Transaction.fromAtomicBEEF to return a mock TX object
            const mockTxObject = { /* Can add mock properties/methods if SUT uses them */ };
            MockedTransaction.fromAtomicBEEF.mockReturnValue(mockTxObject as any);

            mockWallet.signAction.mockResolvedValue({ txid: updatedTxId } as SignActionResult);

            // Get the mock instance returned by the constructor
            const mockPDInstance = new MockedPushDrop(mockWallet);

            const result = await kvStore.set(testKey, testValue);

            expect(result).toBe(`${updatedTxId}.0`); // Assuming output 0 is the new KV token
            expect(mockWallet.encrypt).toHaveBeenCalled();
            expect(mockPDInstance.lock).toHaveBeenCalledWith([(encryptedArray)], [2, testContext], testKey, 'self');
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({ basket: testContext, tags: [testKey], include: 'entire transactions' });

            // Verify createAction for UPDATE
            expect(mockWallet.createAction).toHaveBeenCalledWith(expect.objectContaining({ // Use objectContaining for flexibility
                description: `Update ${testKey} in ${testContext}`,
                inputBEEF: mockBEEF,
                inputs: expect.arrayContaining([ // Check inputs array
                    expect.objectContaining({ outpoint: existingOutpoint }) // Check specific input
                ]),
                outputs: expect.arrayContaining([ // Check outputs array
                    expect.objectContaining({ lockingScript: testLockingScriptHex }) // Check the new output script
                ]),
            }));

            // Verify signing steps
            expect(MockedTransaction.fromAtomicBEEF).toHaveBeenCalledWith(signableTx);
            // Check unlock was called on the instance
            expect(mockPDInstance.unlock).toHaveBeenCalledWith([2, testContext], testKey, 'self');

            // Get the unlocker returned by the mock unlock method
            const mockUnlocker = (mockPDInstance.unlock as jest.Mock).mock.results[0].value;
            expect(mockUnlocker.sign).toHaveBeenCalledWith(mockTxObject, 0); // Check sign args

            // Verify signAction call
            expect(mockWallet.signAction).toHaveBeenCalledWith({
                reference: signableRef,
                spends: {
                    0: { unlockingScript: testUnlockingScriptHex } // Check unlocking script from mock sign result
                }
            });
            expect(mockWallet.relinquishOutput).not.toHaveBeenCalled();
        });

        it('should collapse multiple existing outputs into one', async () => {
            const existingOutpoint1 = 'oldTxId1.0';
            const existingOutpoint2 = 'oldTxId2.1';
            const existingOutput1 = { outpoint: existingOutpoint1, txid: 'oldTxId1', vout: 0, lockingScript: 's1' };
            const existingOutput2 = { outpoint: existingOutpoint2, txid: 'oldTxId2', vout: 1, lockingScript: 's2' };
            const mockBEEF = Buffer.from('mockBEEFDataMulti');
            const signableRef = 'signableTxRefMulti';
            const signableTx = []
            const updatedTxId = 'updatedTxIdMulti';
            const mockTxObject = {}; // Dummy TX object

            const valueArray = Array.from(testRawValueBuffer);
            const encryptedArray = Array.from(testEncryptedValue);

            MockedUtils.toArray.mockReturnValue(valueArray);
            mockWallet.encrypt.mockResolvedValue({ ciphertext: encryptedArray } as WalletEncryptResult);
            mockWallet.listOutputs.mockResolvedValue({ outputs: [existingOutput1, existingOutput2], totalOutputs: 2, BEEF: mockBEEF } as any);
            mockWallet.createAction.mockResolvedValue({
                signableTransaction: { reference: signableRef, tx: signableTx }
            } as CreateActionResult);
            MockedTransaction.fromAtomicBEEF.mockReturnValue(mockTxObject as any);
            mockWallet.signAction.mockResolvedValue({ txid: updatedTxId } as SignActionResult);

            // Get the mock instance
            const mockPDInstance = new MockedPushDrop(mockWallet);

            const result = await kvStore.set(testKey, testValue);

            expect(result).toBe(`${updatedTxId}.0`);
            expect(mockWallet.encrypt).toHaveBeenCalled();
            expect(mockPDInstance.lock).toHaveBeenCalled();
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({ basket: testContext, tags: [testKey], include: 'entire transactions' });

            // Verify createAction with multiple inputs
            expect(mockWallet.createAction).toHaveBeenCalledWith(expect.objectContaining({
                inputBEEF: mockBEEF,
                inputs: expect.arrayContaining([
                    expect.objectContaining({ outpoint: existingOutpoint1 }),
                    expect.objectContaining({ outpoint: existingOutpoint2 })
                ]),
                outputs: expect.arrayContaining([
                    expect.objectContaining({ lockingScript: testLockingScriptHex })
                ]),
            }));

            // Verify signing loop
            expect(MockedTransaction.fromAtomicBEEF).toHaveBeenCalledWith(signableTx);
            expect(mockPDInstance.unlock).toHaveBeenCalledTimes(2); // Called for each input
            expect(mockPDInstance.unlock).toHaveBeenNthCalledWith(1, [2, testContext], testKey, 'self');
            expect(mockPDInstance.unlock).toHaveBeenNthCalledWith(2, [2, testContext], testKey, 'self');

            // Get the *same* mock unlocker instance (since unlock is mocked to always return it)
            const mockUnlocker = (mockPDInstance.unlock as jest.Mock).mock.results[0].value;
            expect(mockUnlocker.sign).toHaveBeenCalledTimes(2);
            expect(mockUnlocker.sign).toHaveBeenNthCalledWith(1, mockTxObject, 0); // Input index 0
            expect(mockUnlocker.sign).toHaveBeenNthCalledWith(2, mockTxObject, 1); // Input index 1

            // Verify signAction call with multiple spends
            expect(mockWallet.signAction).toHaveBeenCalledWith({
                reference: signableRef,
                spends: {
                    0: { unlockingScript: testUnlockingScriptHex }, // Same mock script for both
                    1: { unlockingScript: testUnlockingScriptHex }
                }
            });
            expect(mockWallet.relinquishOutput).not.toHaveBeenCalled();
        });


        it('should relinquish outputs if signing fails during update', async () => {
            const existingOutpoint1 = 'failTxId1.0';
            const existingOutpoint2 = 'failTxId2.1';
            const existingOutput1 = { outpoint: existingOutpoint1, txid: 'failTxId1', vout: 0, lockingScript: 's1' };
            const existingOutput2 = { outpoint: existingOutpoint2, txid: 'failTxId2', vout: 1, lockingScript: 's2' };
            const mockBEEF = Buffer.from('mockBEEFFail');
            const signableRef = 'signableTxRefFail';
            const signableTx = []
            const mockTxObject = {};

            const valueArray = Array.from(testRawValueBuffer);
            const encryptedArray = Array.from(testEncryptedValue);

            MockedUtils.toArray.mockReturnValue(valueArray);
            mockWallet.encrypt.mockResolvedValue({ ciphertext: encryptedArray } as WalletEncryptResult);
            mockWallet.listOutputs.mockResolvedValue({ outputs: [existingOutput1, existingOutput2], totalOutputs: 2, BEEF: mockBEEF } as any);
            mockWallet.createAction.mockResolvedValue({
                signableTransaction: { reference: signableRef, tx: signableTx },
                txid: 'fallback'
            } as CreateActionResult);
            MockedTransaction.fromAtomicBEEF.mockReturnValue(mockTxObject as any);
            mockWallet.signAction.mockRejectedValue(new Error("Signature failed")); // Make signAction fail
            mockWallet.relinquishOutput.mockResolvedValue(undefined); // Mock relinquish success

            // Get the mock instance
            const mockPDInstance = new MockedPushDrop(mockWallet);

            // Expect the error to be caught, and the method to complete and returns the fallback outpoint.
            await expect(kvStore.set(testKey, testValue)).resolves.toEqual('fallback.0');

            // Verify setup calls happened
            expect(mockWallet.encrypt).toHaveBeenCalled();
            expect(mockPDInstance.lock).toHaveBeenCalled();
            expect(mockWallet.listOutputs).toHaveBeenCalled();
            expect(mockWallet.createAction).toHaveBeenCalled();
            expect(MockedTransaction.fromAtomicBEEF).toHaveBeenCalled();
            expect(mockPDInstance.unlock).toHaveBeenCalledTimes(2); // Unlock was still called
            const mockUnlocker = (mockPDInstance.unlock as jest.Mock).mock.results[0].value;
            expect(mockUnlocker.sign).toHaveBeenCalledTimes(2); // Sign was still called
            expect(mockWallet.signAction).toHaveBeenCalled(); // It was called, but failed

            // Crucially, verify relinquish was called for each input
            expect(mockWallet.relinquishOutput).toHaveBeenCalledTimes(2);
            expect(mockWallet.relinquishOutput).toHaveBeenNthCalledWith(1, {
                output: existingOutpoint1,
                basket: testContext
            });
            expect(mockWallet.relinquishOutput).toHaveBeenNthCalledWith(2, {
                output: existingOutpoint2,
                basket: testContext
            });
        });
    });

    // --- Remove Method Tests ---
    describe('remove', () => {
        let pushDropInstance: PushDrop; // To access the instance methods

        beforeEach(() => {
            // Get the mock instance that will be created by `new PushDrop()`
            pushDropInstance = new (PushDrop as any)();
        })

        it('should do nothing and return void if key does not exist', async () => {
            mockWallet.listOutputs.mockResolvedValue({ outputs: [], totalOutputs: 0, BEEF: undefined });

            const result = await kvStore.remove(testKey);

            expect(result).toBeUndefined();
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({
                basket: testContext,
                tags: [testKey],
                include: 'entire transactions' // remove checks for entire transactions
            });
            expect(mockWallet.createAction).not.toHaveBeenCalled();
            expect(mockWallet.signAction).not.toHaveBeenCalled();
            expect(mockWallet.relinquishOutput).not.toHaveBeenCalled();
        });

        it('should remove an existing key by spending its output(s)', async () => {
            const existingOutpoint1 = 'removeTxId1.0';
            const existingOutpoint2 = 'removeTxId2.1';
            const existingOutput1 = { outpoint: existingOutpoint1, txid: 'removeTxId1', vout: 0, lockingScript: 's1' };
            const existingOutput2 = { outpoint: existingOutpoint2, txid: 'removeTxId2', vout: 1, lockingScript: 's2' };
            const mockBEEF = Buffer.from('mockBEEFRemove');
            const signableRef = 'signableTxRefRemove';
            const signableTx = []
            const removalTxId = 'removalTxId';
            const mockTxObject = {};

            mockWallet.listOutputs.mockResolvedValue({ outputs: [existingOutput1, existingOutput2], totalOutputs: 2, BEEF: mockBEEF } as any);
            mockWallet.createAction.mockResolvedValue({
                signableTransaction: { reference: signableRef, tx: signableTx }
            } as CreateActionResult); // Note: removal tx has NO outputs field in result
            MockedTransaction.fromAtomicBEEF.mockReturnValue(mockTxObject as any);
            mockWallet.signAction.mockResolvedValue({ txid: removalTxId } as SignActionResult);

            // Get the mock instance
            const mockPDInstance = new MockedPushDrop(mockWallet);

            const result = await kvStore.remove(testKey);

            expect(result).toBe(removalTxId);
            expect(mockWallet.listOutputs).toHaveBeenCalledWith({ basket: testContext, tags: [testKey], include: 'entire transactions' });

            // Verify createAction for REMOVE (no outputs in the action)
            expect(mockWallet.createAction).toHaveBeenCalledWith({
                // The description might still say "Update" depending on implementation reuse
                // description: `Remove ${testKey} from ${testContext}`, // Ideal description
                description: expect.stringContaining(testKey), // More general check
                inputBEEF: mockBEEF,
                inputs: expect.arrayContaining([
                    expect.objectContaining({ outpoint: existingOutpoint1 }),
                    expect.objectContaining({ outpoint: existingOutpoint2 })
                ]),
                // IMPORTANT: No 'outputs' key should be present for removal action
                outputs: undefined, // Or check that the key is not present
                options: {
                    acceptDelayedBroadcast: false,
                    randomizeOutputs: false
                }
            });
            // Check that outputs key is absent
            expect(mockWallet.createAction.mock.calls[0][0]).not.toHaveProperty('outputs');


            // Verify signing
            expect(MockedTransaction.fromAtomicBEEF).toHaveBeenCalledWith(signableTx);
            expect(mockPDInstance.unlock).toHaveBeenCalledTimes(2);
            expect(mockPDInstance.unlock).toHaveBeenNthCalledWith(1, [2, testContext], testKey, 'self');
            expect(mockPDInstance.unlock).toHaveBeenNthCalledWith(2, [2, testContext], testKey, 'self');
            const mockUnlocker = (mockPDInstance.unlock as jest.Mock).mock.results[0].value;
            expect(mockUnlocker.sign).toHaveBeenCalledTimes(2);
            expect(mockUnlocker.sign).toHaveBeenNthCalledWith(1, mockTxObject, 0);
            expect(mockUnlocker.sign).toHaveBeenNthCalledWith(2, mockTxObject, 1);

            // Verify signAction call
            expect(mockWallet.signAction).toHaveBeenCalledWith({
                reference: signableRef,
                spends: {
                    0: { unlockingScript: testUnlockingScriptHex },
                    1: { unlockingScript: testUnlockingScriptHex }
                }
            });
            expect(mockWallet.relinquishOutput).not.toHaveBeenCalled();
        });

        it('should relinquish outputs if signing fails during removal', async () => {
            const existingOutpoint1 = 'failRemoveTxId1.0';
            const existingOutput1 = { outpoint: existingOutpoint1, txid: 'failRemoveTxId1', vout: 0, lockingScript: 's1' };
            const mockBEEF = Buffer.from('mockBEEFFailRemove');
            const signableRef = 'signableTxRefFailRemove';
            const signableTx = []
            const mockTxObject = {};

            mockWallet.listOutputs.mockResolvedValue({ outputs: [existingOutput1], totalOutputs: 1, BEEF: mockBEEF } as any);
            mockWallet.createAction.mockResolvedValue({
                signableTransaction: { reference: signableRef, tx: signableTx }
            } as CreateActionResult);
            MockedTransaction.fromAtomicBEEF.mockReturnValue(mockTxObject as any);
            mockWallet.signAction.mockRejectedValue(new Error("Signature failed remove")); // Make signAction fail
            mockWallet.relinquishOutput.mockResolvedValue(undefined);

            // Get the mock instance
            const mockPDInstance = new MockedPushDrop(mockWallet);

            // Expect the error to be caught, method completes returning undefined/void
            await expect(kvStore.remove(testKey)).resolves.toBeUndefined();

            // Verify setup calls
            expect(mockWallet.listOutputs).toHaveBeenCalled();
            expect(mockWallet.createAction).toHaveBeenCalled(); // createAction called for removal attempt
            expect(MockedTransaction.fromAtomicBEEF).toHaveBeenCalled();
            expect(mockPDInstance.unlock).toHaveBeenCalledTimes(1); // unlock was called
            const mockUnlocker = (mockPDInstance.unlock as jest.Mock).mock.results[0].value;
            expect(mockUnlocker.sign).toHaveBeenCalledTimes(1); // sign was called
            expect(mockWallet.signAction).toHaveBeenCalled(); // Called but failed

            // Verify relinquish was called
            expect(mockWallet.relinquishOutput).toHaveBeenCalledTimes(1);
            expect(mockWallet.relinquishOutput).toHaveBeenCalledWith({
                output: existingOutpoint1,
                basket: testContext
            });
        });
    });
});
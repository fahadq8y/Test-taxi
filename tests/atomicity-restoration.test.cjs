const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadActualRestoreFunction(db) {
    const page = fs.readFileSync(path.join(__dirname, '..', 'edit-history.html'), 'utf8');
    const start = page.indexOf('          function isRestorable(item)');
    const end = page.indexOf('          window.restoreRecord = async function', start);
    assert.notEqual(start, -1, 'isRestorable must remain present in the page');
    assert.notEqual(end, -1, 'restoreRecord must remain present in the page');
    const source = page.slice(start, end) +
        '\nglobalThis.commitDeletedRecordRestoreForTest = commitDeletedRecordRestore;';
    const context = {
        db,
        firebase: {
            firestore: {
                FieldValue: {
                    serverTimestamp: () => ({ __serverTimestamp: true })
                }
            }
        }
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const restore = context.commitDeletedRecordRestoreForTest;
    restore.isRestorable = context.isRestorable;
    return restore;
}

function makeDb(initialEntries, failWrite) {
    const state = new Map(initialEntries);
    let nextId = 1;
    let queue = Promise.resolve();
    const ref = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
    const db = {
        collection(collection) {
            return {
                doc(id) {
                    return ref(collection, id || `auto${nextId++}`);
                }
            };
        },
        runTransaction(callback) {
            const run = queue.then(async () => {
                const draft = new Map([...state].map(([key, value]) => [key, structuredClone(value)]));
                const transaction = {
                    async get(documentRef) {
                        const value = draft.get(documentRef.key);
                        return {
                            id: documentRef.id,
                            exists: value !== undefined,
                            data: () => structuredClone(value)
                        };
                    },
                    set(documentRef, value) {
                        if (failWrite?.('set', documentRef, value)) throw new Error('synthetic write failure');
                        draft.set(documentRef.key, structuredClone(value));
                    },
                    update(documentRef, patch) {
                        if (failWrite?.('update', documentRef, patch)) throw new Error('synthetic write failure');
                        if (!draft.has(documentRef.key)) throw new Error('missing update target');
                        draft.set(documentRef.key, { ...draft.get(documentRef.key), ...structuredClone(patch) });
                    }
                };
                const result = await callback(transaction);
                state.clear();
                for (const [key, value] of draft) state.set(key, value);
                return result;
            });
            queue = run.catch(() => {});
            return run;
        }
    };
    return { db, state };
}

function deletedRevenue() {
    return {
        action: 'delete',
        recordType: 'revenue',
        recordId: 'deleted-revenue',
        fullSnapshot: { amount: 12.5, description: 'fare' }
    };
}

test('actual page restore commits target, marker, and detail audit atomically', async () => {
    const fake = makeDb([['editHistory/delete-event', deletedRevenue()]]);
    const restore = loadActualRestoreFunction(fake.db);

    const restoredId = await restore('delete-event', 'revenues', { uid: 'owner' }, 'Owner', 'admin');

    assert.equal(restoredId, 'deleted-revenue');
    assert.equal(fake.state.get('revenues/deleted-revenue').restoredFromHistoryId, 'delete-event');
    assert.equal(fake.state.get('editHistory/delete-event').restoredToId, 'deleted-revenue');
    const detail = fake.state.get('editHistory/auto1');
    assert.equal(detail.action, 'restore');
    assert.equal(detail.restoredFromHistoryId, 'delete-event');
    assert.equal(detail.recordId, 'deleted-revenue');
});

test('actual page restore permits only one concurrent/repeated restoration', async () => {
    const fake = makeDb([['editHistory/delete-event', deletedRevenue()]]);
    const restore = loadActualRestoreFunction(fake.db);
    const args = ['delete-event', 'revenues', { uid: 'owner' }, 'Owner', 'admin'];

    const results = await Promise.allSettled([restore(...args), restore(...args)]);

    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('revenues/')).length, 1);
    assert.equal([...fake.state.values()].filter(value => value.action === 'restore').length, 1);
    await assert.rejects(() => restore(...args), /مسبقاً/);
});

test('actual page restore leaves no partial target or marker when audit write fails', async () => {
    const fake = makeDb(
        [['editHistory/delete-event', deletedRevenue()]],
        (operation, documentRef, value) =>
            operation === 'set' && documentRef.collection === 'editHistory' && value.action === 'restore'
    );
    const restore = loadActualRestoreFunction(fake.db);

    await assert.rejects(
        () => restore('delete-event', 'revenues', { uid: 'owner' }, 'Owner', 'admin'),
        /synthetic write failure/
    );

    assert.equal([...fake.state.keys()].filter(key => key.startsWith('revenues/')).length, 0);
    assert.equal(fake.state.get('editHistory/delete-event').restoredAt, undefined);
    assert.equal([...fake.state.values()].filter(value => value.action === 'restore').length, 0);
});

test('distinct legacy delete events for the same record cannot restore duplicate financial records', async () => {
    const fake = makeDb([
        ['editHistory/delete-first', deletedRevenue()],
        ['editHistory/delete-retry', deletedRevenue()]
    ]);
    const restore = loadActualRestoreFunction(fake.db);
    const results = await Promise.allSettled(['delete-first', 'delete-retry'].map(id =>
        restore(id, 'revenues', { uid: 'owner' }, 'Owner', 'admin')));
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('revenues/')).length, 1);
    assert.equal([...fake.state.values()].filter(value => value.action === 'restore').length, 1);
    assert.equal([...fake.state.values()].filter(value => value.action === 'delete' && value.restoredAt).length, 1);
    assert.ok(fake.state.has('revenues/deleted-revenue'));
});

for (const marker of ['allocationKind', 'obligationId', 'contractId', 'allocations']) {
    test(`preview and transaction reject allocated payment marker ${marker} alone`, async () => {
        const event = {
            action: 'delete', recordType: 'driverPayment', recordId: 'synthetic-payment',
            fullSnapshot: { amount: 12.5, [marker]: marker === 'allocations' ? [{ amount: 12.5 }] : 'synthetic' }
        };
        const fake = makeDb([['editHistory/allocated-delete', event]]);
        const restore = loadActualRestoreFunction(fake.db);
        assert.equal(restore.isRestorable(event), false);
        await assert.rejects(() =>
            restore('allocated-delete', 'driverPayments', { uid: 'owner' }, 'Owner', 'admin'),
        /غير قابل للاستعادة/);
        assert.equal(fake.state.size, 1);
        assert.equal(fake.state.get('editHistory/allocated-delete').restoredAt, undefined);
    });
}

test('an existing original destination is never overwritten', async () => {
    const original = { amount: 90, description: 'newer live record' };
    const fake = makeDb([
        ['editHistory/delete-event', deletedRevenue()],
        ['revenues/deleted-revenue', original]
    ]);
    const restore = loadActualRestoreFunction(fake.db);
    await assert.rejects(() => restore('delete-event', 'revenues', { uid: 'owner' }, 'Owner', 'admin'), /موجود بالفعل/);
    assert.deepEqual(fake.state.get('revenues/deleted-revenue'), original);
    assert.equal(fake.state.size, 2);
});
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadActualUserFunctions(db, options = {}) {
    const page = fs.readFileSync(path.join(__dirname, '..', 'user-management.html'), 'utf8');
    const start = page.indexOf('        function userAuditData(entry)');
    const end = page.indexOf("        document.getElementById('addUserForm')", start);
    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const names = [
        'updateUserAtomic', 'setUserStatusAtomic', 'deleteUserAtomic',
        'changeUserPasswordAtomic', 'syncDriverUserAtomic', 'provisionUserWithAudit'
    ];
    const expose = names.map(name => `globalThis.${name}ForTest = ${name};`).join('\n');
    const authUser = {
        uid: 'new-auth-user',
        delete: options.authDelete || (async () => {})
    };
    const provisioningAuth = {
        setPersistence: async () => {},
        createUserWithEmailAndPassword: async () => ({ user: authUser }),
        signOut: async () => {}
    };
    const context = {
        db,
        provisioningAuth,
        currentUserRole: 'admin',
        currentUserId: 'owner-id',
        auth: { currentUser: { uid: 'owner-id', email: 'owner@example.com' } },
        localStorage: { getItem: () => null },
        canModifyUser: () => true,
        console: { error() {}, log() {} },
        firebase: {
            auth: { Auth: { Persistence: { NONE: 'none' } } },
            firestore: { FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) } }
        }
    };
    vm.createContext(context);
    vm.runInContext(page.slice(start, end) + '\n' + expose, context);
    return Object.fromEntries(names.map(name => [name, context[`${name}ForTest`]]));
}

function makeDb(initialEntries, failWrite) {
    const state = new Map(initialEntries);
    let nextId = 1;
    let queue = Promise.resolve();
    const ref = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
    const db = {
        collection(collection) {
            return { doc: id => ref(collection, id || `audit${nextId++}`) };
        },
        runTransaction(callback) {
            const run = queue.then(async () => {
                const draft = new Map([...state].map(([key, value]) => [key, structuredClone(value)]));
                const check = (operation, documentRef, value) => {
                    if (failWrite?.(operation, documentRef, value)) throw new Error('synthetic audit failure');
                };
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
                        check('set', documentRef, value);
                        draft.set(documentRef.key, structuredClone(value));
                    },
                    update(documentRef, value) {
                        check('update', documentRef, value);
                        draft.set(documentRef.key, { ...draft.get(documentRef.key), ...structuredClone(value) });
                    },
                    delete(documentRef) {
                        check('delete', documentRef);
                        draft.delete(documentRef.key);
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

function failAudit(operation, documentRef) {
    return operation === 'set' && documentRef.collection === 'editHistory';
}

for (const scenario of [
    {
        label: 'edit',
        invoke: functions => functions.updateUserAtomic('u1', 'Changed', 'driver')
    },
    {
        label: 'status',
        invoke: functions => functions.setUserStatusAtomic('u1', false)
    },
    {
        label: 'delete',
        invoke: functions => functions.deleteUserAtomic('u1')
    },
    {
        label: 'password',
        invoke: functions => functions.changeUserPasswordAtomic('u1', 'new-secret')
    }
]) {
    test(`actual ${scenario.label} callback rolls back business data when audit fails`, async () => {
        const original = { name: 'Driver', role: 'driver', isActive: true, password: 'old-secret' };
        const fake = makeDb([['users/u1', original]], failAudit);
        const functions = loadActualUserFunctions(fake.db);

        await assert.rejects(() => scenario.invoke(functions), /synthetic audit failure/);

        assert.deepEqual(fake.state.get('users/u1'), original);
        assert.equal([...fake.state.keys()].filter(key => key.startsWith('editHistory/')).length, 0);
    });
}

test('actual driver sync callback creates one user and audit under concurrency', async () => {
    const fake = makeDb([]);
    const functions = loadActualUserFunctions(fake.db);
    const driver = { id: 'd1', name: 'Driver One' };
    const userData = {
        name: driver.name, role: 'driver', password: '123',
        driverId: driver.id, isActive: true
    };

    const results = await Promise.all([
        functions.syncDriverUserAtomic(driver, userData),
        functions.syncDriverUserAtomic(driver, userData)
    ]);

    assert.equal(results.filter(result => result.created).length, 1);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('users/')).length, 1);
    assert.equal([...fake.state.values()].filter(value => value.action === 'addUser').length, 1);
});

test('actual provisioning callback explicitly reports failed Auth compensation', async () => {
    const fake = makeDb([], failAudit);
    let deleteAttempts = 0;
    const functions = loadActualUserFunctions(fake.db, {
        authDelete: async () => {
            deleteAttempts++;
            throw new Error('synthetic auth cleanup failure');
        }
    });

    await assert.rejects(
        () => functions.provisionUserWithAudit('Admin', 'admin@example.com', 'secret1', 'admin'),
        error => {
            assert.equal(error.authCleanupFailed, true);
            assert.match(error.message, /تنظيفه يدوياً/);
            return true;
        }
    );

    assert.equal(deleteAttempts, 1);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('users/')).length, 0);
});
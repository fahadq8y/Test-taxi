const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const page = fs.readFileSync(path.join(__dirname, '..', 'drivers.html'), 'utf8');

function between(startMarker, endMarker) {
    const start = page.indexOf(startMarker);
    assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
    const end = page.indexOf(endMarker, start + startMarker.length);
    assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
    return page.slice(start, end);
}

function clone(value) {
    return structuredClone(value);
}

function makeFirestore(initialEntries, options = {}) {
    const state = new Map(initialEntries.map(([key, value]) => [key, clone(value)]));
    let autoId = 0;
    let queue = Promise.resolve();

    const collection = (_db, name) => ({ name });
    const doc = (first, second, third) => {
        if (first && first.__db) return { collection: second, id: third, key: `${second}/${third}` };
        const id = second || `auto${++autoId}`;
        return { collection: first.name, id, key: `${first.name}/${id}` };
    };
    const where = (field, operator, value) => ({ field, operator, value });
    const query = (collectionRef, condition) => ({ collectionRef, condition });
    const getDocs = async queryRef => {
        const { name } = queryRef.collectionRef || queryRef;
        const condition = queryRef.condition;
        const supplied = options.querySnapshots?.[name];
        const rows = supplied
            ? supplied.map(row => [row.id, clone(row.data)])
            : [...state]
                .filter(([key, value]) => key.startsWith(`${name}/`) &&
                    (!condition || value[condition.field] === condition.value))
                .map(([key, value]) => [key.slice(name.length + 1), clone(value)]);
        return {
            empty: rows.length === 0,
            forEach(callback) {
                rows.forEach(([id, value]) => callback({ id, data: () => clone(value) }));
            }
        };
    };
    const runTransaction = (_db, callback) => {
        const run = queue.then(async () => {
            const draft = new Map([...state].map(([key, value]) => [key, clone(value)]));
            const tx = {
                async get(ref) {
                    const value = draft.get(ref.key);
                    return {
                        id: ref.id,
                        exists: () => value !== undefined,
                        data: () => clone(value)
                    };
                },
                set(ref, value) {
                    if (options.failWrite?.('set', ref, value)) throw new Error('synthetic commit failure');
                    draft.set(ref.key, clone(value));
                },
                update(ref, patch) {
                    if (options.failWrite?.('update', ref, patch)) throw new Error('synthetic commit failure');
                    if (!draft.has(ref.key)) throw new Error(`missing update target ${ref.key}`);
                    draft.set(ref.key, { ...draft.get(ref.key), ...clone(patch) });
                },
                delete(ref) {
                    if (options.failWrite?.('delete', ref)) throw new Error('synthetic commit failure');
                    draft.delete(ref.key);
                }
            };
            await callback(tx);
            state.clear();
            for (const [key, value] of draft) state.set(key, value);
        });
        queue = run.catch(() => {});
        return run;
    };

    return {
        state,
        api: {
            db: { __db: true },
            collection,
            doc,
            where,
            query,
            getDocs,
            runTransaction,
            serverTimestamp: () => ({ __serverTimestamp: true })
        }
    };
}

function baseContext(fake, overrides = {}) {
    const alerts = [];
    const context = {
        ...fake.api,
        TextEncoder,
        structuredClone,
        console: { log() {}, error() {}, warn() {} },
        alert: message => alerts.push(String(message)),
        confirm: () => true,
        localStorage: { getItem: () => null },
        auth: { currentUser: { uid: 'admin-1' } },
        currentUser: { uid: 'admin-1', name: 'Admin', email: 'admin@example.test', role: 'admin' },
        allDrivers: [],
        loadDrivers: async () => {},
        displayDrivers: () => {},
        closeModal: () => {},
        closeEditOldDebtsModal: () => {},
        window: {},
        ...overrides
    };
    context.globalThis = context;
    context.alerts = alerts;
    vm.createContext(context);
    vm.runInContext(
        between('          function editHistoryData(payload)', '          window.updateCarRegistrationExpiry'),
        context
    );
    return context;
}

function loadDeleteDriver(fake, driver, overrides = {}) {
    const context = baseContext(fake, { allDrivers: [clone(driver)], ...overrides });
    vm.runInContext(
        between('        window.deleteDriver = async (driverId) => {', '        // Form submission'),
        context
    );
    return { callback: context.window.deleteDriver, context };
}

function formDocument(values, capture) {
    return {
        getElementById(id) {
            if (id === 'driverForm') {
                return { addEventListener: (_event, callback) => { capture.callback = callback; } };
            }
            return {
                value: values[id] ?? '',
                focus() {},
                style: {}
            };
        }
    };
}

function loadCreateDriver(fake) {
    const capture = {};
    const values = {
        contractType: 'daily',
        driverName: 'New Driver',
        driverPhone: '555',
        employeeNumber: 'DRV100',
        driverNationality: 'KW',
        driverAddress: 'Address',
        assignedCar: '',
        dailyRent: '10',
        monthlyPayment: '',
        contractDurationMonths: '0',
        contractDurationDays: '0',
        oldDebts: '0',
        driverNotes: ''
    };
    const context = baseContext(fake, {
        document: formDocument(values, capture),
        editingDriverId: null
    });
    vm.runInContext(
        between("        document.getElementById('driverForm').addEventListener('submit'", '        // ===== دوال عقد جديد ====='),
        context
    );
    assert.equal(typeof capture.callback, 'function');
    return { callback: capture.callback, context };
}

function loadOldDebtEdit(fake, driver) {
    const fields = {
        newOldDebtsValue: { value: '7' },
        oldDebtsEditNote: { value: 'synthetic correction', focus() {} }
    };
    const context = baseContext(fake, {
        allDrivers: [clone(driver)],
        document: { getElementById: id => fields[id] },
        editOldDebtsDriverId: driver.id
    });
    vm.runInContext(
        between('        window.saveOldDebtsEdit = async () => {', '        // إغلاق النوافذ عند الضغط خارجها'),
        context
    );
    return { callback: context.window.saveOldDebtsEdit, context };
}

function loadEndContract(fake, driver) {
    const actualEndDate = new Date('2025-02-01T00:00:00.000Z');
    const fingerprint = JSON.stringify({
        currentContractId: driver.currentContractId || null,
        start: new Date(driver.contractStartDate).toISOString(),
        end: actualEndDate.toISOString(),
        type: driver.contractType || 'daily',
        dailyRent: Number(driver.dailyRent || driver.dailyWage || 0),
        monthlyPayment: Number(driver.monthlyPayment || 0)
    });
    const fields = {
        endContractReason: { value: 'completed' },
        endContractNote: { value: 'synthetic close' }
    };
    const context = baseContext(fake, {
        allDrivers: [clone(driver)],
        document: { getElementById: id => fields[id] },
        endContractDriverId: driver.id,
        endContractCalculation: {
            actualEndDate,
            carryOver: 2,
            oldDebtsCurrent: 0,
            oldDebtsNew: 2,
            expectedRent: 10,
            paidRent: 8,
            debtAllocationRevision: 0,
            paymentIds: [],
            paymentFingerprint: '[]',
            contractFingerprint: fingerprint
        },
        closeEndContractModal: () => {}
    });
    vm.runInContext(
        between('          window.saveEndContract = async () => {', '        window.saveOldDebtsEdit = async () => {'),
        context
    );
    return { callback: context.window.saveEndContract, context };
}

function sampleDriver() {
    return {
        id: 'DRV001',
        employeeNumber: 'DRV001',
        driverId: 'DRV001',
        name: 'Driver One',
        phone: '111',
        oldDebts: 3,
        contractHistory: [],
        oldDebtDetails: []
    };
}

test('actual archive callback rolls back every business and audit write when commit fails', async () => {
    const driver = sampleDriver();
    const fake = makeFirestore([
        ['drivers/DRV001', { ...driver, id: undefined }],
        ['driverPayments/pay1', { driverId: 'DRV001', amount: 12 }]
    ].map(([key, value]) => [key, Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))]), {
        failWrite: (operation, ref, value) =>
            operation === 'set' && ref.collection === 'editHistory' && value.recordType === 'driver'
    });
    const { callback } = loadDeleteDriver(fake, driver);

    await callback('DRV001');

    assert.ok(fake.state.has('drivers/DRV001'));
    assert.ok(fake.state.has('driverPayments/pay1'));
    assert.equal([...fake.state.keys()].some(key => key.startsWith('archivedDrivers/')), false);
    assert.equal([...fake.state.keys()].some(key => key.startsWith('editHistory/')), false);
});

test('actual archive callback writes a detailed event for every child in the same commit', async () => {
    const driver = sampleDriver();
    const driverStored = { ...driver };
    delete driverStored.id;
    const fake = makeFirestore([
        ['drivers/DRV001', driverStored],
        ['driverPayments/pay1', { driverId: 'DRV001', amount: 12, note: 'payment detail' }],
        ['expenses/exp1', { driverId: 'DRV001', amount: 4, description: 'expense detail' }],
        ['revenues/rev1', { driverId: 'DRV001', amount: 9, description: 'revenue detail' }]
    ]);
    const { callback } = loadDeleteDriver(fake, driver);

    await callback('DRV001');

    assert.equal(fake.state.has('drivers/DRV001'), false);
    assert.equal(fake.state.has('driverPayments/pay1'), false);
    assert.equal(fake.state.has('expenses/exp1'), false);
    assert.equal(fake.state.has('revenues/rev1'), false);
    assert.ok(fake.state.has('archivedDrivers/DRV001'));
    const events = [...fake.state.values()].filter(value => value.action === 'archive');
    assert.equal(events.length, 4);
    for (const [type, id] of [['driverPayment', 'pay1'], ['expense', 'exp1'], ['revenue', 'rev1']]) {
        const event = events.find(value => value.recordType === type);
        assert.equal(event.recordId, id);
        assert.equal(event.fullSnapshotBefore.id, id);
        assert.equal(event.parentArchiveId, 'DRV001');
    }
});

test('actual archive callback aborts on a child changed after the query snapshot', async () => {
    const driver = sampleDriver();
    const driverStored = { ...driver };
    delete driverStored.id;
    const stale = { driverId: 'DRV001', amount: 12 };
    const fake = makeFirestore([
        ['drivers/DRV001', driverStored],
        ['driverPayments/pay1', { driverId: 'DRV001', amount: 99 }]
    ], {
        querySnapshots: { driverPayments: [{ id: 'pay1', data: stale }] }
    });
    const { callback, context } = loadDeleteDriver(fake, driver);

    await callback('DRV001');

    assert.ok(fake.state.has('drivers/DRV001'));
    assert.equal(fake.state.get('driverPayments/pay1').amount, 99);
    assert.equal([...fake.state.keys()].some(key => key.startsWith('editHistory/')), false);
    assert.match(context.alerts.at(-1), /تغيرت بيانات السجل المرتبط/);
});

test('actual create callback rolls back driver, user, and audits on audit failure', async () => {
    const fake = makeFirestore([], {
        failWrite: (operation, ref) => operation === 'set' && ref.collection === 'editHistory'
    });
    const { callback } = loadCreateDriver(fake);

    await callback({ preventDefault() {} });

    assert.equal(fake.state.size, 0);
});

test('actual create callback permits only one concurrent create for an employee number', async () => {
    const fake = makeFirestore([]);
    const first = loadCreateDriver(fake);
    const second = loadCreateDriver(fake);

    await Promise.all([
        first.callback({ preventDefault() {} }),
        second.callback({ preventDefault() {} })
    ]);

    assert.ok(fake.state.has('drivers/DRV100'));
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('drivers/')).length, 1);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('users/')).length, 1);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('editHistory/')).length, 2);
    assert.match(second.context.alerts.at(-1), /مستخدم بالفعل/);
});

test('actual old-debt callback rolls back the business update when audit creation fails', async () => {
    const driver = sampleDriver();
    const stored = { ...driver };
    delete stored.id;
    const fake = makeFirestore([['drivers/DRV001', stored]], {
        failWrite: (operation, ref) => operation === 'set' && ref.collection === 'editHistory'
    });
    const { callback } = loadOldDebtEdit(fake, driver);

    await callback();

    assert.equal(fake.state.get('drivers/DRV001').oldDebts, 3);
    assert.deepEqual(fake.state.get('drivers/DRV001').contractHistory, []);
    assert.equal([...fake.state.keys()].some(key => key.startsWith('editHistory/')), false);
});

test('actual end-contract callback rolls back contract closure when its audit write fails', async () => {
    const driver = {
        ...sampleDriver(),
        currentContractId: 'contract-1',
        contractStartDate: new Date('2025-01-01T00:00:00.000Z'),
        contractType: 'daily',
        dailyRent: 10,
        isActive: true,
        debtAllocationRevision: 0
    };
    const stored = { ...driver };
    delete stored.id;
    const fake = makeFirestore([['drivers/DRV001', stored]], {
        failWrite: (operation, ref) => operation === 'set' && ref.collection === 'editHistory'
    });
    const { callback } = loadEndContract(fake, driver);

    await callback();

    assert.equal(fake.state.get('drivers/DRV001').isActive, true);
    assert.equal(fake.state.get('drivers/DRV001').endContractReason, undefined);
    assert.deepEqual(fake.state.get('drivers/DRV001').contractHistory, []);
    assert.equal([...fake.state.keys()].some(key => key.startsWith('editHistory/')), false);
});
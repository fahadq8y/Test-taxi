/* Retired: this former rollback-based route could leave a partially restored driver.
 * The only supported restore implementation is the transaction in archived-drivers.html.
 * Intentionally do not assign window.restoreDriver or expose any mutation.
 */
console.warn('archived-drivers-improved.js is retired; use archived-drivers.html.');

// Synthetic regression harness; never runs in a browser.
// Run: node archived-drivers-improved.js --test
if (typeof module !== 'undefined' && typeof require === 'function' && process.argv.includes('--test')) {
    const fs = require('node:fs');
    const vm = require('node:vm');
    const assert = require('node:assert/strict');
    const read = file => fs.readFileSync(require('node:path').join(__dirname, file), 'utf8');
    function environment(seed) {
        const store = structuredClone(seed);
        let counter = 0, fail = false;
        const ref = (collection, id) => ({ path: collection + '/' + id, id });
        const snapshot = r => ({
            ref: r, id: r.id, exists: () => store[r.path] !== undefined,
            data: () => structuredClone(store[r.path])
        });
        const context = {
            console, TextEncoder, auth: { currentUser: { uid: 'u', email: 'u@test', isAnonymous: false } },
            getAuth: () => context.auth, app: {}, db: {}, window: {},
            doc: (a, b, c) => typeof a === 'string' ? ref(a, b || 'auto' + (++counter)) : ref(b, c),
            collection: (db, name) => name, serverTimestamp: () => ({ seconds: 123 }),
            query: collection => collection, where: () => null,
            getDocs: async collection => ({
                docs: Object.keys(store).filter(p => p.startsWith(collection + '/')).map(p => snapshot(ref(...p.split('/'))))
            }),
            runTransaction: async (db, callback) => {
                let writing = false;
                const writes = [];
                await callback({
                    get: async r => { assert(!writing, 'transaction read after write'); return snapshot(r); },
                    set: (r, value) => { writing = true; writes.push(() => { store[r.path] = structuredClone(value); }); },
                    delete: r => { writing = true; writes.push(() => { delete store[r.path]; }); },
                    update: (r, values) => {
                        writing = true;
                        writes.push(() => {
                            for (const [key, value] of Object.entries(values)) {
                                if (key.includes('.')) {
                                    const [parent, field] = key.split('.');
                                    store[r.path][parent] ??= {};
                                    store[r.path][parent][field] = value;
                                } else store[r.path][key] = value;
                            }
                        });
                    }
                });
                if (fail) throw new Error('injected commit failure');
                writes.forEach(write => write());
            }
        };
        vm.createContext(context);
        return { context, store, failure: value => { fail = value; } };
    }
    function extract(file, start, end) {
        const text = read(file);
        assert(text.includes(start) && text.includes(end), 'actual implementation markers missing');
        return text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
    }
    (async () => {
        for (const file of ['driver-view.html', 'driver-documents-history.html', 'archived-drivers.html']) {
            for (const [, script] of read(file).matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) {
                new vm.Script(script.replace(/^\s*import .*;\s*$/gm, ''));
            }
        }
        const restore = extract('archived-drivers.html', '        async function restoreArchivedDriver', '        window.restoreDriver = async id');
        let e = environment({
            'users/u': { role: 'admin' },
            'archivedDrivers/d': { name: 'D', isArchived: true, archivedAt: { seconds: 1 }, financial: { amount: 100 } },
            'editHistory/original': { action: 'archive', immutable: true }
        });
        vm.runInContext(restore, e.context);
        const expected = { ...e.store['archivedDrivers/d'], id: 'd' };
        const original = structuredClone(e.store);
        e.failure(true);
        await assert.rejects(() => e.context.restoreArchivedDriver('d', expected));
        assert.deepEqual(e.store, original);
        e.failure(false);
        await assert.rejects(() => e.context.restoreArchivedDriver('d', { ...expected, name: 'stale' }));
        await e.context.restoreArchivedDriver('d', expected);
        assert(e.store['drivers/d']);
        assert(!e.store['archivedDrivers/d']);
        assert.deepEqual(e.store['editHistory/original'], original['editHistory/original']);
        await assert.rejects(() => e.context.restoreArchivedDriver('d', expected));
        const events = Object.keys(e.store).filter(k => k.startsWith('editHistory/') && k !== 'editHistory/original');
        assert.equal(events.length, 1);
        assert.deepEqual(e.store[events[0]].fullSnapshotBefore, original['archivedDrivers/d']);
        assert.equal(e.store[events[0]].actorUid, 'u');
        console.log('PASS actual restore: atomic failure, stale/repeated, reads before writes, immutable prior audit, complete snapshot');

        const resolve = extract('driver-documents-history.html', '  async function resolveRequest', '  // التوثيق');
        e = environment({
            'users/u': { role: 'accountant' },
            'drivers/d': { expiry: 'new', pendingVerification: { expiry: true } },
            'documentChangeRequests/r': { driverId: 'd', fieldKey: 'expiry', newDate: 'new', status: 'pending' },
            'documentChangeRequests/other': { driverId: 'd', fieldKey: 'expiry', newDate: 'old', status: 'pending' }
        });
        e.context.allRequests = ['r', 'other'].map(id => ({ ...e.store['documentChangeRequests/' + id], id }));
        vm.runInContext(resolve, e.context);
        const before = structuredClone(e.store);
        e.failure(true);
        await assert.rejects(() => e.context.resolveRequest('r', 'rejected'));
        assert.deepEqual(e.store, before);
        e.failure(false);
        e.context.allRequests[0].newDate = 'stale';
        await assert.rejects(() => e.context.resolveRequest('r', 'verified'));
        e.context.allRequests[0].newDate = 'new';
        await e.context.resolveRequest('r', 'rejected');
        assert.equal(e.store['drivers/d'].expiry, 'new');
        assert.equal(e.store['drivers/d'].pendingVerification.expiry, true);
        await assert.rejects(() => e.context.resolveRequest('r', 'verified'));
        await e.context.resolveRequest('other', 'verified');
        assert.equal(e.store['drivers/d'].pendingVerification.expiry, false);
        assert.equal(Object.keys(e.store).filter(k => k.startsWith('editHistory/')).length, 2);
        console.log('PASS actual resolveRequest: atomic failure, stale/repeated, reads before writes, rejection retains date, other pending flags');

        const actor = extract('driver-view.html', '        function driverAuditActor(', '        // Parse date');
        const save = extract('driver-view.html', '          window.saveDocEdit = async function()', "        document.addEventListener('DOMContentLoaded'");
        const maintenance = extract('driver-view.html', '        window.updateMaintenance = async function()', '        // Logout function');
        e = environment({
            'drivers/d': { name: 'D', expiry: '2026-01-01', assignedCar: 'c' },
            'cars/c': { currentKilometers: 100, lastOilChangeKm: 100, lastOilChangeDate: '2026-01-01' }
        });
        const messages = [];
        const inputs = {
            docEditDate: { value: '2026-02-01' }, newKilometers: { value: '200' },
            oilChangeDate: { value: '2026-02-01' }, updateBtn: {}
        };
        Object.assign(e.context, {
            driverId: 'd', driverData: structuredClone(e.store['drivers/d']),
            cars: [{ ...e.store['cars/c'], id: 'c' }], docEditField: 'expiry', docEditLabel: 'Expiry',
            document: { getElementById: id => inputs[id] },
            alert: message => messages.push(message), showMessage: message => messages.push(message),
            closeDocEdit: () => {}, loadDriverData: async () => {},
            console: { log: () => {}, error: () => {} }
        });
        e.context.auth.currentUser.isAnonymous = true;
        vm.runInContext(actor + save + maintenance, e.context);
        const initialDriverStore = structuredClone(e.store);
        e.failure(true);
        await e.context.window.saveDocEdit();
        assert.deepEqual(e.store, initialDriverStore);
        e.failure(false);
        e.context.driverData.expiry = 'stale';
        await e.context.window.saveDocEdit();
        assert.deepEqual(e.store, initialDriverStore);
        e.context.driverData.expiry = '2026-01-01';
        await e.context.window.saveDocEdit();
        assert.equal(e.store['drivers/d'].pendingVerification.expiry, true);
        assert.equal(Object.keys(e.store).filter(k => k.startsWith('documentChangeRequests/')).length, 1);
        await e.context.window.saveDocEdit();
        assert.equal(Object.keys(e.store).filter(k => k.startsWith('documentChangeRequests/')).length, 1);
        const savedDocState = structuredClone(e.store);
        e.failure(true);
        await e.context.window.updateMaintenance();
        assert.equal(JSON.stringify(e.store), JSON.stringify(savedDocState));
        e.failure(false);
        e.context.cars[0].currentKilometers = 99;
        await e.context.window.updateMaintenance();
        assert.equal(JSON.stringify(e.store), JSON.stringify(savedDocState));
        e.context.cars[0].currentKilometers = 100;
        await e.context.window.updateMaintenance();
        assert.equal(e.store['cars/c'].currentKilometers, 200);
        assert.equal(Object.keys(e.store).filter(k => k.startsWith('oilChangeHistory/')).length, 1);
        await e.context.window.updateMaintenance();
        e.context.cars[0] = { ...e.store['cars/c'], id: 'c' };
        await e.context.window.updateMaintenance();
        assert.equal(Object.keys(e.store).filter(k => k.startsWith('oilChangeHistory/')).length, 1);
        const driverEvents = Object.keys(e.store).filter(k => k.startsWith('editHistory/'));
        assert.equal(driverEvents.length, 2);
        for (const key of driverEvents) {
            assert.equal(e.store[key].actorUid, 'u');
            assert.equal(e.store[key].editedByUid, 'u');
            assert.equal(e.store[key].editedByRole, 'anonymous');
            assert.equal(e.store[key].driverOwnershipVerified, false);
        }
        console.log('PASS actual saveDocEdit/updateMaintenance: atomic failure, stale/repeated/no-op, reads before writes, anonymous identity labeled');
    })().catch(error => { console.error(error); process.exitCode = 1; });
}
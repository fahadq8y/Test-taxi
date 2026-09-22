const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const readPage = name => fs.readFileSync(path.join(root, name), 'utf8');
const between = (source, start, end) => {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing start marker: ${start}`);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(to, -1, `missing end marker: ${end}`);
  return source.slice(from, to);
};

test('expense and revenue creates commit business and audit documents in one batch', () => {
  for (const [file, formMarker, endMarker, collection] of [
    ['expenses.html', "document.getElementById('expenseForm')", '// Delete expense', 'expenses'],
    ['revenues.html', "document.getElementById('revenueForm')", '// Delete revenue', 'revenues']
  ]) {
    const code = between(readPage(file), formMarker, endMarker);
    assert.match(code, /const batch = db\.batch\(\)/);
    assert.match(code, new RegExp(`batch\\.set\\(${collection.slice(0, -1)}Ref,`));
    assert.match(code, /batch\.set\(auditRef,/);
    assert.match(code, /await batch\.commit\(\)/);
    assert.doesNotMatch(code, /AuditHistory\.recordCreation|collection\('editHistory'\)\.add/);
  }
});

test('all delete handlers use fresh transaction snapshots and atomic audit writes', () => {
  for (const [file, start, end] of [
    ['driver-payments.html', 'async function confirmDeletePayment()', '// Handle form submission'],
    ['expenses.html', 'async function confirmDeleteAction()', '// Display expenses with pagination'],
    ['revenues.html', 'async function confirmDeleteAction()', '// Display revenues with pagination']
  ]) {
    const code = between(readPage(file), start, end);
    assert.match(code, /db\.runTransaction\(async tx =>/);
    assert.match(code, /await tx\.get\(/);
    assert.match(code, /tx\.set\(db\.collection\('editHistory'\)\.doc\(\),/);
    assert.doesNotMatch(code, /collection\('editHistory'\)\.add/);
    assert.doesNotMatch(code, /await db\.collection\([^)]*\)\.doc\([^)]*\)\.delete/);
  }
});

test('edit handlers derive audit snapshots from documents read inside transactions', () => {
  const cases = [
    ['driver-payments.html', 'window.saveOldDebtsEdit = async () =>', '// ===== تعديل عملية دفعة السائق'],
    ['driver-payments.html', 'async function saveDriverPaymentEdit()', 'window.saveDriverPaymentEdit = saveDriverPaymentEdit'],
    ['expenses.html', 'async function saveExpenseEdit()', 'async function openHistoryModal'],
    ['revenues.html', 'async function saveRevenueEdit()', '// فتح نافذة الهيستوري']
  ];
  for (const [file, start, end] of cases) {
    const code = between(readPage(file), start, end);
    assert.match(code, /db\.runTransaction\(async tx =>/);
    assert.match(code, /const \w+Snap = await tx\.get\(/);
    assert.match(code, /fullSnapshotBefore:/);
    assert.match(code, /fullSnapshotAfter:/);
    assert.match(code, /tx\.update\(/);
    assert.match(code, /tx\.set\(db\.collection\('editHistory'\)\.doc\(\),/);
    assert.doesNotMatch(code, /collection\('editHistory'\)\.add/);
  }
});

test('driver payment automatic renewal is a single audited transaction', () => {
  const code = between(readPage('driver-payments.html'), 'async function checkResidenceRenewal()', '// Delete payment');
  assert.match(code, /await db\.runTransaction\(async tx =>/);
  assert.match(code, /const driverSnap = await tx\.get\(driverRef\)/);
  assert.match(code, /tx\.set\(renewalRef, renewalData\)/);
  assert.match(code, /tx\.update\(driverRef,/);
  assert.equal((code.match(/tx\.set\(db\.collection\('editHistory'\)\.doc\(\),/g) || []).length, 2);
});

function clone(value) {
  return structuredClone(value);
}

function makeDb(initialEntries = [], options = {}) {
  const state = new Map(initialEntries.map(([key, value]) => [key, clone(value)]));
  let autoId = 0;
  let queue = Promise.resolve();
  const ref = (collection, id) => ({ collection, id, key: `${collection}/${id}` });
  const snapshot = documentRef => {
    const value = state.get(documentRef.key);
    return { id: documentRef.id, exists: value !== undefined, data: () => clone(value) };
  };
  const apply = (draft, operation, documentRef, value) => {
    if (options.failWrite?.(operation, documentRef, value)) throw new Error('synthetic audit failure');
    if (operation === 'set') draft.set(documentRef.key, clone(value));
    if (operation === 'update') {
      if (!draft.has(documentRef.key)) throw new Error(`missing update target ${documentRef.key}`);
      draft.set(documentRef.key, { ...draft.get(documentRef.key), ...clone(value) });
    }
    if (operation === 'delete') draft.delete(documentRef.key);
  };
  const db = {
    collection(name) {
      return {
        doc(id) {
          const documentRef = ref(name, id || `auto${++autoId}`);
          documentRef.get = async () => snapshot(documentRef);
          return documentRef;
        }
      };
    },
    batch() {
      const writes = [];
      return {
        set(documentRef, value) { writes.push(['set', documentRef, value]); },
        update(documentRef, value) { writes.push(['update', documentRef, value]); },
        delete(documentRef) { writes.push(['delete', documentRef]); },
        async commit() {
          const draft = new Map([...state].map(([key, value]) => [key, clone(value)]));
          for (const [operation, documentRef, value] of writes) apply(draft, operation, documentRef, value);
          state.clear();
          for (const [key, value] of draft) state.set(key, value);
        }
      };
    },
    runTransaction(callback) {
      const run = queue.then(async () => {
        const draft = new Map([...state].map(([key, value]) => [key, clone(value)]));
        const tx = {
          async get(documentRef) {
            const value = draft.get(documentRef.key);
            return { id: documentRef.id, exists: value !== undefined, data: () => clone(value) };
          },
          set(documentRef, value) { apply(draft, 'set', documentRef, value); },
          update(documentRef, value) { apply(draft, 'update', documentRef, value); },
          delete(documentRef) { apply(draft, 'delete', documentRef); }
        };
        await callback(tx);
        state.clear();
        for (const [key, value] of draft) state.set(key, value);
      });
      queue = run.catch(() => {});
      return run;
    }
  };
  return { db, state };
}

function makeContext(fake, overrides = {}) {
  const alerts = [];
  const elements = overrides.elements || {};
  const context = {
    db: fake.db,
    firebase: {
      auth: () => ({ currentUser: { uid: 'user-1' } }),
      firestore: { FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) } }
    },
    localStorage: {
      getItem(key) {
        return key === 'userName' ? 'Synthetic User' : key === 'userRole' ? 'admin' : null;
      }
    },
    document: {
      getElementById(id) {
        return elements[id] || { value: '', style: {}, reset() {}, focus() {} };
      }
    },
    alert: message => alerts.push(String(message)),
    console: { log() {}, error() {}, warn() {} },
    setTimeout,
    clearTimeout,
    ...overrides
  };
  delete context.elements;
  context.window = context;
  context.globalThis = context;
  context.alerts = alerts;
  vm.createContext(context);
  return context;
}

function loadCreate(file, kind, fake) {
  const capture = {};
  const prefix = kind === 'expense' ? 'expense' : 'revenue';
  const values = {
    [`${prefix}Type`]: { value: 'أخرى', focus() {} },
    [`${prefix}Description`]: { value: 'synthetic detail' },
    [`${prefix}Date`]: { value: '2025-01-02' },
    [`${prefix}Amount`]: { value: '12.5' },
    expenseNote: { value: 'note' },
    [`${prefix}Form`]: {
      addEventListener(_event, callback) { capture.callback = callback; },
      reset() {}
    }
  };
  const context = makeContext(fake, {
    elements: values,
    generateNextRefNum: async () => kind === 'expense' ? 'EXP-1' : 'REV-1',
    loadAllData() {}
  });
  const source = readPage(file);
  vm.runInContext(between(
    source,
    `document.getElementById('${prefix}Form').addEventListener('submit'`,
    kind === 'expense' ? '// Delete expense' : '// Delete revenue'
  ), context);
  assert.equal(typeof capture.callback, 'function');
  return { callback: capture.callback, context };
}

function submitEvent() {
  const button = { disabled: false, textContent: 'save' };
  return { preventDefault() {}, target: { querySelector: () => button } };
}

test('actual expense and revenue create callbacks roll back business writes on audit failure', async () => {
  for (const [file, kind, collection] of [
    ['expenses.html', 'expense', 'expenses'],
    ['revenues.html', 'revenue', 'revenues']
  ]) {
    const fake = makeDb([], {
      failWrite: (operation, documentRef) =>
        operation === 'set' && documentRef.collection === 'editHistory'
    });
    const { callback } = loadCreate(file, kind, fake);
    await callback(submitEvent());
    assert.equal([...fake.state.keys()].filter(key => key.startsWith(`${collection}/`)).length, 0);
    assert.equal([...fake.state.keys()].filter(key => key.startsWith('editHistory/')).length, 0);
  }
});

function loadLegacyDelete(file, fake, collection, recordType) {
  const elements = {
    deleteReasonInput: { value: 'synthetic delete reason' },
    deleteConfirmModal: { style: {} }
  };
  const context = makeContext(fake, { elements, loadAllData() {} });
  const page = readPage(file);
  vm.runInContext(between(page, 'let pendingDeleteId = null;', '// Display '), context);
  vm.runInContext(
    `pendingDeleteId = 'record-1'; pendingDeleteType = '${recordType}'; ` +
    `pendingDeleteSnapshot = { id:'record-1', amount:1, type:'legacy' };`,
    context
  );
  assert.equal(typeof context.confirmDeleteAction, 'function');
  return context;
}

test('actual legacy delete callbacks do not delete when their audit write fails', async () => {
  for (const [file, collection, recordType] of [
    ['expenses.html', 'expenses', 'expense'],
    ['revenues.html', 'revenues', 'revenue']
  ]) {
    const original = { amount: 19, type: 'legacy', description: 'fresh record' };
    const fake = makeDb([[`${collection}/record-1`, original]], {
      failWrite: (operation, documentRef) =>
        operation === 'set' && documentRef.collection === 'editHistory'
    });
    const context = loadLegacyDelete(file, fake, collection, recordType);
    await context.confirmDeleteAction();
    assert.deepEqual(fake.state.get(`${collection}/record-1`), original);
    assert.equal([...fake.state.keys()].some(key => key.startsWith('editHistory/')), false);
  }
});

function loadRenewal(fake) {
  const currentDriver = {
    name: 'Driver One',
    residenceExpiryDate: '2020-01-01'
  };
  const context = makeContext(fake, { currentDriver, currentDriverId: 'driver-1' });
  const page = readPage('driver-payments.html');
  vm.runInContext(between(page, 'async function checkResidenceRenewal()', '// Delete payment'), context);
  return context.checkResidenceRenewal;
}

test('actual automatic-renewal callback permits only one concurrent renewal from stale page state', async () => {
  const fake = makeDb([['drivers/driver-1', {
    name: 'Driver One',
    residenceExpiryDate: '2020-01-01'
  }]]);
  const renew = loadRenewal(fake);
  await Promise.all([renew(), renew()]);
  assert.equal([...fake.state.keys()].filter(key => key.startsWith('driverPayments/')).length, 1);
  assert.equal([...fake.state.keys()].filter(key => key.startsWith('editHistory/')).length, 2);
  assert.equal(fake.state.get('drivers/driver-1').residenceExpiryDate, '2021-01-01');
});

function loadExpenseEdit(fake) {
  const elements = {
    editDate: { value: '2025-02-03' },
    editType: { value: 'fuel' },
    editAmount: { value: '30' },
    editDescription: { value: 'new description' },
    editNote: { value: 'new note' },
    editReason: { value: 'synthetic correction' }
  };
  const context = makeContext(fake, {
    elements,
    currentEditingId: 'expense-1',
    currentEditingType: 'expense',
    originalEditData: {
      date: 'stale-date', type: 'stale-type', amount: 1,
      description: 'stale description', note: 'stale note',
      fullSnapshot: { id: 'expense-1', amount: 1 }
    },
    closeEditModal() {},
    loadAllData() {}
  });
  const page = readPage('expenses.html');
  vm.runInContext(between(page, 'async function saveExpenseEdit()', 'async function openHistoryModal'), context);
  return context;
}

test('actual edit callback audits the fresh transaction snapshot, not modal state', async () => {
  const live = {
    date: '2025-01-01', type: 'maintenance', amount: 20,
    description: 'fresh description', note: 'fresh note', refNum: 'EXP-9'
  };
  const fake = makeDb([['expenses/expense-1', live]]);
  const context = loadExpenseEdit(fake);
  await context.saveExpenseEdit();
  const audit = [...fake.state.values()].find(value => value.action === 'edit');
  assert.equal(audit.fullSnapshotBefore.amount, 20);
  assert.equal(audit.fullSnapshotBefore.description, 'fresh description');
  assert.equal(audit.changes.find(change => change.field === 'amount').oldValue, 20);
  assert.equal(fake.state.get('expenses/expense-1').amount, 30);
});

test('actual edit callback rolls back the fresh business update on audit failure', async () => {
  const live = {
    date: '2025-01-01', type: 'maintenance', amount: 20,
    description: 'fresh description', note: 'fresh note'
  };
  const fake = makeDb([['expenses/expense-1', live]], {
    failWrite: (operation, documentRef) =>
      operation === 'set' && documentRef.collection === 'editHistory'
  });
  const context = loadExpenseEdit(fake);
  await context.saveExpenseEdit();
  assert.deepEqual(fake.state.get('expenses/expense-1'), live);
  assert.equal([...fake.state.keys()].some(key => key.startsWith('editHistory/')), false);
});
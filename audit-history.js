/* Read-only compatibility helpers: never infer missing history or alter snapshots. */
(function (root) {
    'use strict';
    function normalize(data, id) {
        return {
            ...data,
            id: id == null ? data.id : id,
            editedByRole: data.editedByRole || data.editorRole || data.deletedByRole || '',
            editedBy: data.editedBy || data.deletedBy || '',
            editReason: data.editReason || data.deleteReason ||
                (data.endContractData && data.endContractData.reason) || ''
        };
    }
    function date(value) {
        if (value == null) return null;
        const parsed = value && typeof value.toDate === 'function' ? value.toDate() :
            value && typeof value.seconds === 'number' ? new Date(value.seconds * 1000) : new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    function searchText(item) {
        const fields = ['editedBy', 'editedByRole', 'editReason', 'deleteReason',
            'fieldLabel', 'field', 'oldValue', 'newValue', 'description',
            'driverName', 'driverId', 'recordId', 'refNum'];
        const values = fields.map(key => item[key] == null ? '' : String(item[key]));
        if (Array.isArray(item.changes)) {
            item.changes.forEach(change => {
                ['field', 'fieldLabel', 'oldValue', 'newValue'].forEach(key => {
                    values.push(change[key] == null ? '' : String(change[key]));
                });
            });
        }
        return values.join(' ').toLowerCase();
    }
    function actor(firebase) {
        const user = firebase.auth().currentUser;
        return {
            editedBy: root.localStorage.getItem('userName') || (user && user.email) || 'غير محدد',
            editedById: user ? user.uid : null,
            editedByRole: root.localStorage.getItem('userRole') || 'unknown'
        };
    }
    async function recordCreation(db, firebase, recordType, recordId, snapshot, source) {
        try {
            await db.collection('editHistory').add({
                recordType, recordId, action: 'create', source,
                refNum: snapshot.refNum || null,
                driverId: snapshot.driverId || null, driverName: snapshot.driverName || null,
                description: snapshot.description || snapshot.type || null,
                fullSnapshotAfter: { ...snapshot, id: recordId },
                ...actor(firebase), timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            return true;
        } catch (error) {
            root.alert('⚠️ تم الحفظ لكن تعذر تسجيل التدقيق. لا تكرر العملية؛ أبلغ المالك: ' + error.message);
            return false;
        }
    }
    // A correction is a new event, never removal of the original evidence.
    // Transaction protects this reversal only; other legacy producers are not atomic.
    async function reverseEdit(db, firebase, historyId, recordId, recordType, collectionName) {
        if (firebase.auth().currentUser?.email !== 'f5h5d_q8@hotmail.com') throw new Error('التراجع متاح للمالك فقط');
        const historyRef = db.collection('editHistory').doc(historyId);
        const recordRef = db.collection(collectionName).doc(recordId);
        const reversalRef = db.collection('editHistory').doc();
        await db.runTransaction(async tx => {
            const historyDoc = await tx.get(historyRef);
            const recordDoc = await tx.get(recordRef);
            if (!historyDoc.exists || !recordDoc.exists) throw new Error('السجل غير موجود');
            const history = historyDoc.data(), before = recordDoc.data();
            if (history.action !== 'edit' || history.recordId !== recordId || history.recordType !== recordType || history.reversedAt) {
                throw new Error('سجل التدقيق غير مطابق أو تم التراجع عنه');
            }
            if (before.status === 'voided' || before.allocationKind || before.obligationId ||
                (Array.isArray(before.allocations) && before.allocations.length)) {
                throw new Error('لا يمكن التراجع عن دفعة موزعة أو ملغاة مباشرة');
            }
            const changes = Array.isArray(history.changes) && history.changes.length
                ? history.changes : [{ field: history.field, oldValue: history.oldValue, newValue: history.newValue }];
            const allowed = ['date', 'type', 'amount', 'description', 'note'];
            const update = {};
            changes.forEach(change => {
                if (!allowed.includes(change.field) || change.oldValue === undefined || change.newValue === undefined) {
                    throw new Error('التعديل القديم لا يحتوي على قيم صالحة للتراجع');
                }
                if (JSON.stringify(before[change.field] ?? '') !== JSON.stringify(change.newValue)) {
                    throw new Error('تغيرت البيانات بعد هذا التعديل؛ راجع السجل قبل التراجع');
                }
                update[change.field] = change.oldValue;
            });
            const editor = actor(firebase), timestamp = firebase.firestore.FieldValue.serverTimestamp();
            tx.update(recordRef, update);
            tx.set(reversalRef, {
                recordId, recordType, action: 'reversal', reversesHistoryId: historyId,
                refNum: before.refNum || null, driverId: before.driverId || null,
                driverName: before.driverName || null, description: 'التراجع عن تعديل موثق',
                editReason: 'تراجع المالك عن التعديل من شاشة العملية',
                changes: changes.map(c => ({ field: c.field, oldValue: c.newValue, newValue: c.oldValue })),
                fullSnapshotBefore: { ...before, id: recordId },
                fullSnapshotAfter: { ...before, ...update, id: recordId },
                ...editor, timestamp
            });
            tx.update(historyRef, { reversedAt: timestamp, reversedBy: editor.editedBy, reversedByHistoryId: reversalRef.id });
        });
    }
    const api = { normalize, date, searchText, recordCreation, reverseEdit };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AuditHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);
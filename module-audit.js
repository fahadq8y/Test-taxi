import { getAuth } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { runTransaction, doc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Fail closed: the business write and its evidence have one transaction.
const clean = value => {
    // Firestore transforms cannot appear inside the changes array.
    if (value?._methodName === 'serverTimestamp') return '__SERVER_TIMESTAMP__';
    if (value?._methodName === 'deleteField') return '__DELETE_FIELD__';
    if (Array.isArray(value)) return value.map(clean);
    if (value && Object.getPrototypeOf(value) === Object.prototype) {
        return Object.fromEntries(Object.entries(value)
            .filter(([key]) => !/password|credential|secret|token/i.test(key))
            .map(([key, item]) => [key, clean(item)]));
    }
    return value;
};

export async function auditedMutations(db, operations, reason) {
    const auth = getAuth(db.app);
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user) throw new Error('يلزم تسجيل الدخول لحفظ سجل التدقيق');
    const claims = (await user.getIdTokenResult()).claims;
    reason = reason || window.prompt('سبب التغيير (مطلوب للتدقيق):');
    if (!reason || !reason.trim()) throw new Error('تم الإلغاء: سبب التغيير مطلوب');
    // Two writes per target. Reject rather than partially applying a large request.
    if (!operations.length || operations.length > 150) throw new Error('اختر من 1 إلى 150 سجل للعملية الواحدة');
    const source = window.location.pathname.split('/').pop();
    const historyRefs = operations.map(() => doc(collection(db, 'editHistory')));
    const configHistoryRefs = operations.map(() => doc(collection(db, 'appConfig', 'configHistory', 'entries')));
    return runTransaction(db, async tx => {
        const profile = await tx.get(doc(db, 'users', user.uid));
        const role = claims.role || (profile.exists() && profile.data().role);
        if (!role) throw new Error('تعذر التحقق من دور المستخدم');
        if (auth.currentUser?.uid !== user.uid) throw new Error('تغيرت جلسة المستخدم');
        const snapshots = [];
        for (const operation of operations) snapshots.push(await tx.get(operation.ref));
        operations.forEach((operation, index) => {
            const { ref, data = {}, action, merge = false } = operation;
            const snapshot = snapshots[index];
            if (action === 'create' && snapshot.exists()) throw new Error('السجل موجود مسبقاً');
            if ((action === 'edit' || action === 'delete') && !snapshot.exists()) throw new Error('السجل غير موجود');
            const before = snapshot.exists() ? clean(snapshot.data()) : null;
            let after = action === 'delete' ? null : { ...(merge ? before : {}), ...clean(data) };
            if (after) Object.keys(after).forEach(key => {
                if (after[key] === '__DELETE_FIELD__') delete after[key];
            });
            const changes = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])]
                .filter(field => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null))
                .map(field => ({ field, oldValue: before?.[field] ?? null, newValue: after?.[field] ?? null }));
            const driverId = ref.path.includes('/driverConfigs/drivers/') ? ref.id : data.driverId || before?.driverId || null;
            const event = {
                type: ref.path.split('/')[0], recordType: ref.path.split('/')[0],
                action: action === 'upsert' ? (snapshot.exists() ? 'edit' : 'create') : action,
                source, driverId, recordId: ref.id, recordPath: ref.path,
                sourceRecordPath: operation.sourceRecordPath || null, changes,
                fullSnapshotBefore: before, fullSnapshotAfter: after,
                editedById: user.uid, editedByUid: user.uid, actorUid: user.uid, editedBy: user.email || user.uid,
                identityVerification: user.isAnonymous ? 'anonymous/unverified' : 'firebase-auth',
                editedByRole: role, actorRole: role, editReason: reason.trim(),
                timestamp: serverTimestamp()
            };
            if (action === 'delete') tx.delete(ref);
            else tx.set(ref, data, { merge });
            tx.set(historyRefs[index], event);
            if (source === 'driver-config.html') {
                tx.set(configHistoryRefs[index], {
                    ...event, scope: driverId ? 'driver' : 'global',
                    modifiedBy: user.uid,
                    changes: Object.fromEntries(changes.map(change => [change.field, change.newValue])),
                    fieldChanges: changes
                });
            }
        });
    });
}
export const setDoc = (ref, data, options = {}) => auditedMutations(ref.firestore, [{ ref, data, merge: !!options.merge, action: 'upsert' }]);
export const updateDoc = (ref, data) => auditedMutations(ref.firestore, [{ ref, data, merge: true, action: 'edit' }]);
export const deleteDoc = ref => auditedMutations(ref.firestore, [{ ref, action: 'delete' }]);
export async function addDoc(parent, data) {
    const ref = doc(parent);
    await auditedMutations(parent.firestore, [{ ref, data, action: 'create' }]);
    return ref;
}
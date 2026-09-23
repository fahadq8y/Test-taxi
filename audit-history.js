/* Read-only compatibility helpers: never infer missing history or alter snapshots. */
(function (root) {
    'use strict';
    function normalize(data, id) {
        const before = data.fullSnapshotBefore ?? data.before ?? data.oldData ??
            (['delete', 'permanentDelete'].includes(data.action) ? data.fullSnapshot : undefined);
        const after = data.fullSnapshotAfter ?? data.after ?? data.newData;
        const changes = Array.isArray(data.changes) ? data.changes :
            data.field ? [{field:data.field, oldValue:data.oldValue, newValue:data.newValue}] : [];
        return {
            ...data,
            fullSnapshotBefore: before,
            fullSnapshotAfter: after,
            changes,
            action: data.action === 'delete' && after?.status === 'voided' ? 'void' : data.action,
            source: data.source || data.sourcePage || data.channel || '',
            editedById: data.actorUid || data.editedByUid || data.editedById || data.deletedById || data.createdById || data.createdByUid || data.actor?.uid || '',
            id: id == null ? data.id : id,
            editedByRole: data.editedByRole || data.editorRole || data.deletedByRole || data.createdByRole || data.actor?.role || '',
            editedBy: data.editedBy || data.deletedBy || data.createdBy || data.actor?.email || '',
            editReason: data.editReason || data.deleteReason ||
                (data.endContractData && data.endContractData.reason) || data.reason || data.note || ''
        };
    }
    const labels = {
        create:'إنشاء',add:'إضافة',edit:'تعديل',update:'تحديث',transferStatus:'تحديث حالة التحويل',delete:'حذف',permanentDelete:'حذف نهائي',
        upsert:'حفظ / تحديث',addUser:'إضافة مستخدم',updateUser:'تعديل مستخدم',deleteUser:'حذف مستخدم',activateUser:'تفعيل مستخدم',deactivateUser:'تعطيل مستخدم',changePassword:'تغيير كلمة المرور',
        void:'إلغاء مع حفظ السجل',voided:'ملغى',restore:'استعادة',reversal:'تراجع موثق',archive:'أرشفة',unarchive:'إلغاء الأرشفة',
        newContract:'عقد جديد',endContract:'إنهاء عقد',updateContract:'تعديل عقد',closeContract:'إغلاق عقد',settlement:'تسوية',settleContract:'تسوية عقد',
        driver:'سائق',drivers:'السائقون',payment:'دفعة',payments:'الدفعات',driverPayment:'دفعة سائق',driverPayments:'دفعات السائقين',
        expense:'مصروف',expenses:'المصروفات',revenue:'إيراد',revenues:'الإيرادات',
        contract:'عقد',contracts:'العقود',oldDebts:'ديون قديمة',user:'مستخدم',users:'المستخدمون',account:'حساب',accounts:'الحسابات',
        car:'سيارة',cars:'السيارات',notification:'إشعار',notifications:'الإشعارات',ownerNote:'ملاحظة المالك',ownerNotes:'ملاحظات المالك',ownerFollowup:'متابعة المالك',appConfig:'إعدادات التطبيق',config:'إعدادات',
        documentChangeRequest:'طلب تغيير مستند',document:'مستند',oilChange:'تغيير زيت',version:'إصدار',
        amount:'المبلغ (ليس الدين)',totalDebt:'إجمالي الدين',debt:'الدين',remainingDebt:'الدين المتبقي',carryOver:'الدين المرحّل',
        status:'الحالة',date:'التاريخ',name:'الاسم',type:'النوع',description:'الوصف',note:'ملاحظة',notes:'ملاحظات',
        companyTransferStatus:'حالة تحويل الشركة',companyTransferDate:'تاريخ حالة التحويل',companyTransferNote:'ملاحظة حالة التحويل',
        on_company:'على الشركة',pending:'قيد التحويل',transferred:'تم التحويل',
        followUpStatus:'حالة متابعة المالك',followUpDate:'تاريخ متابعة المالك',promisedAmount:'المبلغ الموعود',promisedDate:'تاريخ الدفع الموعود','entries.added':'الملاحظة الخاصة المضافة',
        driverId:'مرجع السائق',recordId:'مرجع السجل',refNum:'الرقم المرجعي',contractId:'مرجع العقد',source:'صفحة المصدر',
        allocationKind:'نوع التخصيص',allocations:'التخصيصات',obligationId:'مرجع الالتزام',contracts:'العقود',contractHistory:'تاريخ العقود',
        permissions:'الصلاحيات',role:'الدور',email:'البريد',owner:'المالك',admin:'المدير',accountant:'المحاسب',
        active:'نشط',createdAt:'وقت الإنشاء',updatedAt:'وقت التحديث',timestamp:'وقت العملية',isArchived:'مؤرشف',
        dailyWage:'الأجرة اليومية',monthlyPayment:'الأجرة الشهرية',startDate:'البداية',endDate:'النهاية',reason:'السبب',
        fullSnapshotBefore:'لقطة قبل العملية',fullSnapshotAfter:'لقطة بعد العملية',fullSnapshot:'لقطة محفوظة (مرحلتها غير محددة)'
    };
    const escape = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const missing = v => v == null || String(v).trim() === '' || /^(unknown|unset|undefined|null|n\/a)$/i.test(String(v).trim());
    const label = v => missing(v) ? 'غير مسجل' : Object.hasOwn(labels,String(v)) ? labels[v] : String(v);
    function structured(v) {
        if (v === undefined) return '<em>غير معروف — لم يُحفظ</em>';
        if (v === null) return '<em>قيمة فارغة (null)</em>';
        if (typeof v !== 'object') return escape(label(v));
        if (typeof v.toDate === 'function') return escape(date(v)?.toISOString() || 'وقت غير صالح');
        return '<dl>'+Object.entries(v).map(([k,x])=>`<dt>${escape(label(k))}</dt><dd>${structured(x)}</dd>`).join('')+'</dl>';
    }
    function comparison(e) {
        e=normalize(e);
        const rows=[];
        function walk(a,b,path) {
            if (a && b && typeof a==='object' && typeof b==='object') {
                for(const k of new Set([...Object.keys(a),...Object.keys(b)])) walk(a[k],b[k],path?path+'.'+k:k);
            } else if (JSON.stringify(a)!==JSON.stringify(b)) rows.push({field:path,oldValue:a,newValue:b});
        }
        if(e.changes.length) e.changes.forEach(c=>walk(Object.hasOwn(c,'oldValue')?c.oldValue:c.before,Object.hasOwn(c,'newValue')?c.newValue:c.after,c.field||c.key||''));
        else if(e.fullSnapshotBefore !== undefined || e.fullSnapshotAfter !== undefined) walk(e.fullSnapshotBefore,e.fullSnapshotAfter,'');
        return rows;
    }
    function related(e, all) {
        const links=['operationId','correlationId','batchId','transactionId','requestId'];
        return all.filter(x=>x.id!==e.id && (
            links.some(k=>e[k] && x[k]===e[k]) ||
            (e.recordId && e.recordType && e.recordId===x.recordId && e.recordType===x.recordType) ||
            ['reversesHistoryId','reversedByHistoryId','restoredByHistoryId','restoresHistoryId','originalHistoryId'].some(k=>e[k]===x.id||x[k]===e.id)));
    }
    function deltas(e) {
        const numeric=v=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null;
        const result=comparison(e).filter(c=>['amount','totalDebt','oldDebts','debt','remainingDebt','carryOver'].includes(c.field)).flatMap(c=>{
            const a=numeric(c.oldValue),b=numeric(c.newValue);
            return a===null||b===null?[]:[{field:c.field,kind:c.field==='amount'?'amount':'debt',value:b-a}];
        });
        const before=numeric(e.debtBefore),after=numeric(e.debtAfter);
        if(before!==null&&after!==null)result.push({field:'debtBefore → debtAfter',kind:'debt',value:after-before});
        return result;
    }
    function ensureDisplayStyle() {
        if (typeof document === 'undefined' || document.getElementById('audit-history-display-style')) return;
        const style=document.createElement('style');
        style.id='audit-history-display-style';
        style.textContent=`
          .audit-history-event,.audit-history-event *{box-sizing:border-box;min-width:0;overflow-wrap:anywhere}
          .audit-history-event{width:100%;max-width:100%;white-space:normal;text-align:start}
          .audit-history-event table{width:100%;max-width:100%;table-layout:fixed;border-collapse:collapse}
          .audit-history-event th,.audit-history-event td{white-space:normal;vertical-align:top;padding:10px}
          .audit-history-event pre{max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
          .audit-history-event dl{max-width:100%;margin-inline:0}
          .audit-history-event dd{margin-inline-start:12px;margin-inline-end:0}
          @media(max-width:600px){
            .audit-history-event table,.audit-history-event tbody,.audit-history-event tr,.audit-history-event th,.audit-history-event td{display:block;width:100%;max-width:100%}
            .audit-history-event thead{display:none}
            .audit-history-event tr{margin-block:12px;border:1px solid #8793a3}
            .audit-history-event td::before{content:attr(data-audit-label);display:block;font-weight:bold;margin-bottom:6px}
          }`;
        document.head.appendChild(style);
    }
    function renderEvent(data, all=[]) {
        ensureDisplayStyle();
        const e=normalize(data), rows=comparison(e);
        return `<section class="audit-history-event"><h4 id="audit-${escape(encodeURIComponent(e.id||''))}">${escape(label(e.action))} · ${escape(label(e.recordType))}</h4>
        <div class="audit-history-facts">
          <p><strong>المحرر:</strong> ${escape(e.editedBy||'غير مسجل')} · <strong>UID:</strong> ${escape(e.editedById||'غير مسجل')} · <strong>الدور وقت التسجيل:</strong> ${escape(label(e.editedByRole))}</p>
          <p><strong>وقت العملية:</strong> ${escape(date(e.timestamp)?.toLocaleString('ar-KW')||'غير مسجل')}</p>
          <p><strong>المصدر:</strong> ${escape(e.source||'غير مسجل')} · <strong>نوع السجل:</strong> ${escape(label(e.recordType))} · <strong>مرجع السجل:</strong> ${escape(e.recordId||'غير مسجل')}</p>
          <p><strong>السبب:</strong> ${escape(e.editReason||'غير مسجل')}</p>
        </div>
        <p>السائق: ${escape(e.driverId||'غير مسجل')} · الحدث: ${escape(e.id||'غير مسجل')}</p>
        <p>${escape(e.actorIdentityVerification||'التحقق من الهوية غير مسجل؛ UID وحده لا يثبت ملكية السائق')}</p>
        <p>فرق المبلغ لا يمثل فرق الدين. القيم التاريخية غير المحفوظة معروضة صراحةً كغير معروفة ولا تُستنتج من القيمة الحالية.</p>
        <p>${deltas(e).map(d=>escape((d.kind==='amount'?'فرق مبلغ (ليس فرق الدين)':'فرق دين مسجل')+': '+d.value)).join(' · ')||'فرق مالي غير معروف'}</p>
        <table><thead><tr><th>الحقل</th><th>قبل</th><th>بعد</th></tr></thead><tbody>${rows.length?rows.map(c=>`<tr><th>${escape(c.field.split('.').map(label).join(' / '))}</th><td data-audit-label="قبل">${structured(c.oldValue)}</td><td data-audit-label="بعد">${structured(c.newValue)}</td></tr>`).join(''):'<tr><th>القيم التاريخية</th><td data-audit-label="قبل"><em>غير معروف — لم يُحفظ</em></td><td data-audit-label="بعد"><em>غير معروف — لم يُحفظ</em></td></tr>'}</tbody></table>
        ${['fullSnapshotBefore','fullSnapshotAfter','fullSnapshot'].filter(k=>e[k]!==undefined).map(k=>`<details><summary>${escape(label(k))}</summary>${structured(e[k])}</details>`).join('')}
        <details><summary>سلسلة الأحداث المرتبطة ضمن المحمّل فقط (${related(e,all).length})</summary>${related(e,all).map(x=>`<p><a href="#audit-${escape(encodeURIComponent(x.id||''))}">${escape(x.id)}</a> · ${escape(label(x.action))} · ${escape(date(x.timestamp)?.toLocaleString('ar-KW')||'وقت غير مسجل')}</p>`).join('')}</details>
        <details><summary>الدليل الكامل المحفوظ</summary><pre>${escape(JSON.stringify(data,null,2))}</pre></details></section>`;
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
        return (values.join(' ')+' '+JSON.stringify(item)).toLowerCase();
    }
    function actor(firebase) {
        const user = firebase.auth().currentUser;
        return {
            actorUid: user ? user.uid : null,
            editedByUid: user ? user.uid : null,
            actorIdentityVerification: user?.isAnonymous ? 'anonymous/unverified' : user ? 'firebase-auth (not proof of driver ownership)' : 'unverified',
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
                ...editor, source:'audit-history.js/reverseEdit', timestamp
            });
            tx.update(historyRef, { reversedAt: timestamp, reversedBy: editor.editedBy, reversedByHistoryId: reversalRef.id });
        });
    }
    const api = { normalize, date, searchText, recordCreation, reverseEdit, escape, label, structured, comparison, related, renderEvent, deltas };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AuditHistory = api;
})(typeof window !== 'undefined' ? window : globalThis);
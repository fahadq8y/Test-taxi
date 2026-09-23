/* Owner-only presentation. No debt calculations or writes to financial records. */
(function (root) {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = v => v === undefined || v === null ? 'غير مسجل' : typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
  const enumLabels = {
    create:'إنشاء',add:'إضافة',edit:'تعديل',update:'تحديث',transferStatus:'تحديث حالة التحويل',delete:'حذف',permanentDelete:'حذف نهائي',restore:'استعادة',archive:'أرشفة',unarchive:'إلغاء الأرشفة',void:'إلغاء',voided:'ملغى',active:'نشط',
    newContract:'إنشاء عقد',endContract:'إنهاء عقد',updateContract:'تحديث عقد',closeContract:'إغلاق عقد',settlement:'تسوية',settleContract:'تسوية عقد',duplicateClosure:'محاولة إغلاق مكررة',duplicateEndContract:'محاولة إنهاء مكررة',duplicate_closure:'محاولة إغلاق مكررة',duplicate_end_contract:'محاولة إنهاء مكررة',
    driver:'ملف سائق',drivers:'ملفات السائقين',payment:'دفعة',payments:'الدفعات',driverPayment:'دفعة سائق',driverPayments:'دفعات السائقين',expense:'مصروف',expenses:'المصروفات',revenue:'إيراد',revenues:'الإيرادات',contract:'عقد',contracts:'العقود',user:'مستخدم',users:'المستخدمون',account:'حساب',accounts:'الحسابات',car:'سيارة',cars:'السيارات',notification:'إشعار',notifications:'الإشعارات',ownerNote:'ملاحظة المالك',ownerNotes:'ملاحظات المالك',owner:'المالك',accountant:'المحاسب',admin:'المدير',system:'النظام',manual:'إدخال يدوي',monthly:'شهري',daily:'يومي',on_company:'على الشركة',pending:'قيد التحويل',transferred:'تم التحويل',unset:'غير محدد'
  };
  const fieldLabels = {
    amount:'المبلغ',date:'التاريخ',paymentDate:'تاريخ الدفعة',type:'نوع العملية',category:'التصنيف',status:'الحالة',name:'الاسم',driverName:'اسم السائق',driverId:'مرجع السائق','driver.id':'مرجع السائق',recordId:'مرجع السجل',contractId:'مرجع العقد',
    totalDebt:'إجمالي الدين',oldDebts:'الدين القديم',debt:'الدين',remainingDebt:'الدين المتبقي',carryOver:'الدين المرحّل',debtBefore:'الدين السابق',debtAfter:'الدين اللاحق','debtBefore → debtAfter':'الدين قبل العملية وبعدها',
    contractType:'نوع العقد',contractStartDate:'بداية العقد',contractEndDate:'نهاية العقد',startDate:'تاريخ البداية',endDate:'تاريخ النهاية',dailyWage:'الأجرة اليومية',dailyRent:'الأجرة اليومية',monthlyPayment:'الأجرة الشهرية',
    allocationKind:'نوع التخصيص',account:'الحساب',notes:'الملاحظات',note:'الملاحظة',description:'الوصف',reason:'السبب',editReason:'سبب التعديل',timestamp:'وقت العملية',createdAt:'وقت الإنشاء',updatedAt:'وقت التحديث',
    contracts:'العقود',contractHistory:'تاريخ العقود',sealedPeriods:'الفترات المغلقة',settlements:'التسويات',contractSettlements:'تسويات العقود',oldDebtItems:'بنود الدين القديم',
    violations:'المخالفات',residencyFees:'رسوم الإقامة',driverBalance:'رصيد السائق',isArchived:'الأرشفة',isActive:'حالة النشاط',
    companyTransferStatus:'حالة تحويل الشركة',companyTransferDate:'تاريخ حالة التحويل',companyTransferNote:'ملاحظة حالة التحويل'
  };
  const label = (v,kind='enum') => {
    if(root.AuditHistory) return root.AuditHistory.label(v);
    if(v==null||v===''||/^(unknown|unset|undefined|null|n\/a)$/i.test(String(v).trim()))return 'غير مسجل';
    const key=String(v), mapped=(kind==='field'?fieldLabels:enumLabels)[key];
    if(mapped)return mapped;
    if(/[\u0600-\u06ff]/.test(key))return key;
    const legacy=kind==='field'?root.monitorFieldLabel:root.monitorEnum;
    if(typeof legacy==='function'){const result=legacy(key);if(result!==key)return result;}
    return kind==='field'?'حقل آخر (راجع السجل الكامل)':'قيمة غير مصنفة (راجع السجل الكامل)';
  };
  const date = v => {
    if(root.AuditHistory)return root.AuditHistory.date(v);
    if (!v) return null;
    const d = v.toDate ? v.toDate() : v.seconds != null ? new Date(v.seconds * 1000) : new Date(v);
    return Number.isNaN(+d) ? null : d;
  };
  const num = v => v === '' || v == null || typeof v === 'boolean' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
  const snapshots = e => [e.fullSnapshotBefore, e.fullSnapshotAfter, e.fullSnapshot, e.before, e.after, e.oldData, e.newData].filter(x => x && typeof x === 'object');
  function driverIds(e, sources) {
    const ids = new Set();
    const add = v => { if (typeof v === 'string' && v.trim()) ids.add(v); };
    add(e.driverId);
    for (const s of snapshots(e)) { add(s.driverId); add(s.driver?.id); if (/^drivers?$/.test(String(e.recordType))) add(s.id); }
    for (const c of Array.isArray(e.changes) ? e.changes : []) {
      if (['driverId','driver.id'].includes(c.field || c.key)) { add(c.oldValue ?? c.before); add(c.newValue ?? c.after); }
    }
    const type = String(e.recordType || '').toLowerCase();
    if (['driver','drivers'].includes(type)) add(e.recordId);
    const collection = {payment:'payments',driverpayment:'payments',driverpayments:'payments',expense:'expenses',expenses:'expenses',revenue:'revenues',revenues:'revenues'}[type];
    if (collection && e.recordId) {
      const record = (sources[collection] || []).find(r => r.id === e.recordId);
      if (record) add(record.driverId);
    }
    return [...ids];
  }
  function deltas(e) {
    if(root.AuditHistory)return root.AuditHistory.deltas(e);
    const result = [];
    const changes = Array.isArray(e.changes) ? e.changes : [];
    for (const c of changes) {
      const field = String(c.field || c.key || '');
      if (!['amount','totalDebt','oldDebts','debt','remainingDebt','carryOver'].includes(field)) continue;
      const before = num(c.oldValue ?? c.before), after = num(c.newValue ?? c.after);
      if (before !== null && after !== null) result.push({field, kind:field === 'amount' ? 'amount' : 'debt', value:after-before});
    }
    for (const field of ['amount','totalDebt','oldDebts','debt']) {
      const before = num(e.fullSnapshotBefore?.[field]), after = num(e.fullSnapshotAfter?.[field]);
      if (!result.some(r => r.field === field) && before !== null && after !== null) result.push({field,kind:field === 'amount' ? 'amount':'debt',value:after-before});
    }
    const before = num(e.debtBefore), after = num(e.debtAfter);
    if (before !== null && after !== null) result.push({field:'debtBefore → debtAfter',kind:'debt',value:after-before});
    return result;
  }
  function matches(e, f, timestamp) {
    const searchable=(root.AuditHistory?root.AuditHistory.searchText(e)+' ':'')+JSON.stringify(e).toLowerCase();
    if (f.q && !searchable.includes(f.q.toLowerCase())) return false;
    const d = date(timestamp);
    if ((f.from || f.to) && !d) return false;
    if (f.from && d < new Date(f.from + 'T00:00:00')) return false;
    if (f.to && d >= new Date(new Date(f.to + 'T00:00:00').setDate(new Date(f.to + 'T00:00:00').getDate() + 1))) return false;
    if(f.actor && String(e.editedById||e.editedBy||'')!==f.actor)return false;
    if(f.source && String(e.source||'')!==f.source)return false;
    return !f.action || String(e.action || '') === f.action;
  }
  function eventRole(e) {
    const value=e.editedByRole||e.actorRole||e.actor?.role;
    return value==null||String(value).trim()===''||/^(unknown|unset|undefined|null|n\/a)$/i.test(String(value).trim())
      ? 'غير مسجل' : String(value);
  }
  function monitorRows(all, f={}, reviewDecision=()=> 'pending') {
    return all.filter(e=>matches(e,f,e.timestamp)&&
      (!f.type||String(e.recordType||'')===f.type)&&
      (!f.role||eventRole(e)===f.role)&&
      (!f.decision||reviewDecision(e)===f.decision));
  }
  function applyRecentSnapshot(eventMap, history, snapshot) {
    const cache=new Map(history.map(e=>[e.id,e]));
    snapshot.docs.forEach(doc=>{
      const e={...(typeof doc.data==='function'?doc.data():doc),id:doc.id};
      eventMap.set(e.id,e);
      cache.set(e.id,e);
    });
    return [...cache.values()];
  }
  const PRIVATE_LIMIT_BYTES = 700 * 1024;
  const byteSize = value => {
    const json=JSON.stringify(value,(_key,v)=>{
      if(v&&typeof v.toDate==='function')return v.toDate().toISOString();
      if(v&&typeof v==='object'&&Number.isFinite(v.seconds))return {seconds:v.seconds,nanoseconds:v.nanoseconds||0};
      return v;
    });
    return typeof TextEncoder!=='undefined' ? new TextEncoder().encode(json).length : Buffer.byteLength(json,'utf8');
  };
  function privateEventsFromNotes(notes) {
    const out=[];
    for(const doc of notes||[]) {
      const driverId=doc.id||doc.driverId;
      for(const item of Array.isArray(doc.auditHistory)?doc.auditHistory:[]) {
        if(!item||!item.id)continue;
        out.push({...item,id:`owner-private:${driverId}:${item.id}`,privateOwnerEvent:true,driverId:item.driverId||driverId});
      }
    }
    return out;
  }
  function mergePrivateEvents(events,notes) {
    const all=new Map((events||[]).map(e=>[e.id,e]));
    for(const event of privateEventsFromNotes(notes))all.set(event.id,event);
    return [...all.values()];
  }
  function privateMutationPlan(current, spec, context) {
    const base=current&&typeof current==='object'?current:{};
    const auditHistory=Array.isArray(base.auditHistory)?base.auditHistory.slice():[];
    let patch,changes,action,recordType,reason;
    if(spec.kind==='note') {
      const entries=Array.isArray(base.entries)?base.entries.slice():[];
      entries.push(spec.entry);
      patch={entries};
      changes=[{field:'entries.added',oldValue:null,newValue:spec.entry}];
      action='add';recordType='ownerNote';reason=spec.reason||'إضافة ملاحظة مالك خاصة';
    } else if(spec.kind==='followup') {
      const fields=['followUpStatus','followUpDate','promisedAmount','promisedDate'];
      patch={};changes=[];
      for(const field of fields) {
        const before=base[field]===undefined?null:base[field],after=spec.values[field]===undefined?null:spec.values[field];
        patch[field]=after;
        if(JSON.stringify(before)!==JSON.stringify(after))changes.push({field,oldValue:before,newValue:after});
      }
      action='update';recordType='ownerFollowup';reason=spec.reason||'تحديث متابعة المالك الخاصة';
    } else throw new Error('نوع تعديل سجل المالك غير صالح');
    const event={id:context.eventId,action,recordType,driverId:context.driverId,changes,
      editedBy:context.actor.email||context.actor.uid,editedById:context.actor.uid,
      actorUid:context.actor.uid,editedByUid:context.actor.uid,actorIdentity:'firebase-authenticated',
      editedByRole:'owner',
      actor:{uid:context.actor.uid,email:context.actor.email||'',role:'owner'},timestamp:context.timestamp,
      timestampSource:'client-clock',source:context.source,reason,description:reason};
    auditHistory.push(event);
    patch={...patch,auditHistory,driverId:context.driverId,driverName:spec.driverName||base.driverName||context.driverId,
      updatedAt:context.timestamp,updatedBy:context.actor.email||context.actor.uid};
    const result={...base,...patch};
    if(byteSize(result)>PRIVATE_LIMIT_BYTES)throw new Error('سجل المالك الخاص تجاوز حد الأمان 700KB؛ لم يتم حفظ أي تغيير');
    return {patch,result,event};
  }
  async function commitPrivateMutation(db,driverId,actor,spec,options={}) {
    if(!db||typeof db.runTransaction!=='function')throw new Error('قاعدة البيانات غير متاحة');
    if(!driverId||!actor?.uid)throw new Error('هوية المالك أو السائق غير صالحة');
    const collection=db.collection('ownerNotes'),ref=collection.doc(driverId);
    const eventId=options.eventId||collection.doc().id;
    let committed;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref), current=snap.exists?snap.data():{};
      const timestamp=options.timestampFactory?options.timestampFactory():firebase.firestore.Timestamp.now();
      committed=privateMutationPlan(current,spec,{eventId,driverId,actor,timestamp,source:options.source||'owner-dashboard.html'});
      tx.set(ref,committed.patch,{merge:true});
    });
    return committed;
  }
  const core = {driverIds, deltas, matches, date, eventRole, monitorRows, applyRecentSnapshot,
    byteSize,privateEventsFromNotes,mergePrivateEvents,privateMutationPlan,commitPrivateMutation,PRIVATE_LIMIT_BYTES};
  root.OwnerAuditCore = core;
  if (typeof module !== 'undefined' && module.exports) module.exports = core;
  if (typeof document === 'undefined') return;

  function owner() {
    const u = firebase.auth().currentUser;
    if (!u || u.email !== OWNER_EMAIL) throw new Error('هذه العملية متاحة للمالك فقط');
    return {uid:u.uid, email:u.email, role:'owner'};
  }
  const reviewKey = id => '__owner_review_v1__' + encodeURIComponent(id);
  const reviewLabels = {pending:'لم تتم المراجعة',review:'للمراجعة',defer:'مؤجل',ignore:'متجاهل',approved:'تمت المراجعة'};
  root.OwnerReviewStore = {
    async load(id) {
      owner();
      const snap = await firebase.firestore().collection('ownerNotes').doc(reviewKey(id)).get();
      return snap.exists ? snap.data() : {decision:'pending'};
    },
    async save(id, decision, note = '') {
      const actor = owner();
      if (!id || !Object.hasOwn(reviewLabels, decision)) throw new Error('قرار أو مرجع غير صالح');
      const db = firebase.firestore(), ref = db.collection('ownerNotes').doc(reviewKey(id));
      const history = db.collection('ownerNotes').doc('__owner_review_history_v1__' + db.collection('ownerNotes').doc().id);
      await db.runTransaction(async tx => {
        const previous = await tx.get(ref);
        const stamp = firebase.firestore.FieldValue.serverTimestamp();
        const payload = {kind:'ownerReview',recordId:id,decision,note:String(note),actor,updatedAt:stamp};
        tx.set(ref,payload,{merge:true});
        tx.set(history,{kind:'ownerReviewHistory',reviewKey:reviewKey(id),recordId:id,previousDecision:previous.exists ? previous.data().decision : 'pending',decision,note:String(note),actor,at:stamp});
      });
      root.dispatchEvent(new CustomEvent('owner-review-updated',{detail:{id}}));
      return {recordId:id,decision,note:String(note),actor};
    },
    async history(id) {
      owner();
      const snap = await firebase.firestore().collection('ownerNotes').where('reviewKey','==',reviewKey(id)).get();
      return snap.docs.map(d => ({...d.data(),id:d.id})).sort((a,b) => (+date(b.at)||0)-(+date(a.at)||0));
    }
  };

  const state = {id:null, tab:'summary', filters:{}, cursor:null, complete:false, busy:false, error:'', events:new Map(), open:new Set()};
  const monitor = {q:'',from:'',to:'',action:'',type:'',role:'',actor:'',source:'',decision:''};
  const reviews = new Map();
  let historyUnsubscribe=null, recentHistoryUnsubscribe=null, historyGeneration=0;
  const sources = () => ({payments:gPayments,expenses:gExpenses,revenues:gRevenues});
  const normalize = e => root.AuditHistory ? root.AuditHistory.normalize(e,e.id) : e;
  const events = () => {
    const all = new Map(state.events);
    for (const e of gEditHistory) all.set(e.id,e);
    return mergePrivateEvents([...all.values()],typeof gOwnerNotes==='undefined'?[]:gOwnerNotes)
      .map(normalize).sort((a,b) => (+date(b.timestamp)||0)-(+date(a.timestamp)||0));
  };
  const linked = e => driverIds(e,sources()).includes(state.id);
  const filters = tab => state.filters[tab] || (state.filters[tab] = {q:'',from:'',to:'',action:''});
  const raw = (label, value) => `<details><summary>${esc(label)}</summary><pre class="od-json">${esc(text(value))}</pre></details>`;
  function eventHtml(e) {
    const role=e.editedByRole||e.actorRole||e.actor?.role;
    const reason=e.editReason||e.deleteReason||e.reason||e.note||e.endContractData?.reason;
    return `<details class="card od-event" data-event="${esc(e.id)}"${state.open.has(e.id)?' open':''}><summary><strong>${esc(label(e.action))} · ${esc(label(e.recordType))}</strong><span class="od-event-meta">المحرر: ${esc(e.editedBy||'غير مسجل')} · الدور: ${esc(label(role))} · الوقت: ${esc(date(e.timestamp)?.toLocaleString('ar-KW')||'غير مسجل')} · المصدر: ${esc(e.source||'غير مسجل')} · السبب: ${esc(reason||'غير مسجل')} · ${esc(reviewLabels[reviews.get(e.id)?.decision]||reviewLabels.pending)}</span></summary>${root.AuditHistory.renderEvent(e,events())}<button class="btn outline od-review" data-id="${esc(e.id)}">قرار المراجعة وسجل القرارات</button><div class="od-review-box" aria-live="polite"></div></details>`;
  }
  function tools(tab) {
    const f=filters(tab);
    return `<div class="od-filters"><label>بحث نصي<input data-filter="q" value="${esc(f.q)}" type="search"></label><label>من تاريخ<input data-filter="from" type="date" value="${esc(f.from)}"></label><label>إلى تاريخ (شامل)<input data-filter="to" type="date" value="${esc(f.to)}"></label></div>`;
  }
  function historyScope(driver = true) {
    return `<div class="od-scope" role="status">نطاق البحث: ${events().length} عملية محملة من السجل العام؛ ${driver?'تظهر فقط الروابط المثبتة لهذا السائق.':''} ${state.complete?'اكتمل اجتياز السجل.':'السجل لم يُحمّل كله؛ لا يعني غياب نتيجة عدم وجودها.'} التحميل حسب مرجع الوثيقة ليشمل السجلات بلا وقت؛ العرض حسب وقت العملية، وغير المؤرخ في النهاية.
      <button class="btn outline od-more" ${state.busy||state.complete?'disabled':''}>${state.busy?'جاري التحميل…':'تحميل 200 عملية إضافية'}</button>${state.error?`<p role="alert">${esc(state.error)}</p>`:''}</div>`;
  }
  async function loadMore() {
    if (state.busy || state.complete) return;
    state.busy=true;state.error='';renderData();renderMonitor();
    try {
      let query=firebase.firestore().collection('editHistory').orderBy(firebase.firestore.FieldPath.documentId()).limit(200);
      if(state.cursor) query=query.startAfter(state.cursor);
      const snap=await query.get();
      snap.docs.forEach(d=>state.events.set(d.id,{...d.data(),id:d.id}));
      if(snap.docs.length)state.cursor=snap.docs[snap.docs.length-1];
      state.complete=snap.size<200;
      watchLoadedHistory();
    } catch(e) { state.error='تعذر تحميل سجل التدقيق: '+e.message; }
    finally {state.busy=false;renderData();renderMonitor();}
  }
  function watchLoadedHistory() {
    if(historyUnsubscribe)historyUnsubscribe();
    if(recentHistoryUnsubscribe)recentHistoryUnsubscribe();
    const generation=++historyGeneration;
    let query=firebase.firestore().collection('editHistory').orderBy(firebase.firestore.FieldPath.documentId());
    if(!state.complete&&state.cursor)query=query.endAt(state.cursor);
    historyUnsubscribe=query.onSnapshot(snap=>{
      if(generation!==historyGeneration)return;
      const cache=new Map(gEditHistory.map(e=>[e.id,e]));
      for(const ch of snap.docChanges()) {
        if(ch.type==='removed'){state.events.delete(ch.doc.id);cache.delete(ch.doc.id);}
        else {const e={...ch.doc.data(),id:ch.doc.id};state.events.set(e.id,e);cache.set(e.id,e);}
      }
      gEditHistory=[...cache.values()];
      renderData();renderMonitor();
    },e=>{state.error='تعذر تحديث السجل المباشر: '+e.message;renderData();renderMonitor();});
    // The document-id listener above keeps modified/deleted loaded pages accurate.
    // This independent newest-events listener makes a newly created event visible
    // immediately even when its random document id lies beyond the loaded cursor.
    recentHistoryUnsubscribe=firebase.firestore().collection('editHistory').orderBy('timestamp','desc').limit(200).onSnapshot(snap=>{
      if(generation!==historyGeneration)return;
      gEditHistory=applyRecentSnapshot(state.events,gEditHistory,snap);
      renderData();renderMonitor();
    },e=>{state.error='تعذر تحديث أحدث عمليات السجل: '+e.message;renderData();renderMonitor();});
  }
  function renderPanel(tab) {
    const panel=document.getElementById('od-'+tab);if(!panel)return;
    const host=panel.querySelector('.od-results'); if(!host)return;
    const f=filters(tab);
    if(tab==='payments'||tab==='movements') {
      const list=tab==='payments'?gPayments.map(p=>({...p,collection:'driverPayments'})):[...gExpenses.map(p=>({...p,collection:'expenses'})),...gRevenues.map(p=>({...p,collection:'revenues'}))];
      const rows=list.filter(p=>linked({...p,recordType:p.collection,recordId:p.id})&&matches(p,f,p.date||p.timestamp)).sort((a,b)=>(+date(b.date||b.timestamp)||0)-(+date(a.date||a.timestamp)||0));
      host.innerHTML=`<p>جميع السجلات الحالية المحملة للسائق: ${rows.length} نتيجة؛ يشمل العرض الملغى والمحذوف إن كان محفوظاً. السجلات المحذوفة نهائياً تُراجع في تبويب التدقيق، ولا تدخل هذه القائمة في حساب الأرصدة.</p>
        ${rows.map(p=>`<details class="card"><summary>${esc(date(p.date||p.timestamp)?.toLocaleDateString('ar-KW')||'تاريخ غير مسجل')} · ${esc(label(p.type||p.category||p.collection))} · مبلغ ${esc(text(p.amount))} ${p.status==='voided'?' · ملغى':''}</summary>${raw('السجل الكامل · '+p.id,p)}</details>`).join('')||'<p>لا توجد سجلات مطابقة بروابط مثبتة.</p>'}`;
    } else {
      let rows=events().filter(linked);
      if(tab==='contracts') rows=rows.filter(e=>/contract|settle|close|عقد|تسوي|إغلاق/i.test([e.action,e.recordType,...(Array.isArray(e.changes)?e.changes:[]).map(c=>c.field||c.key)].join(' ')));
      rows=rows.filter(e=>matches(e,f,e.timestamp));
      const d=gDriverMap[state.id];
      host.innerHTML=(tab==='contracts'?`<div class="card"><h3>العقود والتسويات المحفوظة</h3><p>بيانات حالية فقط؛ ليست دليلاً على قيمة الدين قبل التعديل. فروق المبلغ منفصلة عن فروق الدين المسجل.</p>${['contracts','contractHistory','sealedPeriods','settlements','contractSettlements','oldDebtItems'].filter(k=>d[k]!=null).map(k=>raw(label(k,'field'),d[k])).join('')||'<p>لا توجد مجموعات تاريخية محفوظة بهذه الحقول. راجع أحداث التدقيق أدناه.</p>'}</div>`:'')+
        historyScope()+`<p>${rows.length} عملية مطابقة للسائق ضمن التاريخ المحمّل.</p>`+rows.map(eventHtml).join('');
    }
  }
  function renderData() {if(state.id)for(const tab of ['payments','contracts','audit','movements']) {
    // Do not discard a review draft or a pending transaction on realtime refresh.
    if(!document.querySelector('#od-'+tab+' .od-save-review'))renderPanel(tab);
  }}
  function refreshSummary() {
    const d=gDriverMap[state.id], panel=document.getElementById('od-summary');
    if(!d||!panel)return;
    gModalDriver=d;
    const x=detailed(d);
    const values=[money(x.totalDebt),money(x.lateAmount),money(x.oldDebts),fmtDate(x.lastPayment),x.contractStart?fmtDate(x.contractStart):'بلا عقد',x.contractEnd?fmtDate(x.contractEnd):'غير محدد'];
    panel.querySelectorAll(':scope > .mini-grid .val').forEach((el,i)=>{if(values[i]!=null)el.textContent=values[i];});
    const amounts=[x.lateAmount,x.violations,x.residencyFees,x.oldDebts,x.netAdvance,-x.driverBalance,x.totalDebt];
    panel.querySelectorAll('.explain-item strong').forEach((el,i)=>{if(amounts[i]!=null)el.textContent=money(amounts[i]);});
    const transfer=panel.querySelector('[data-owner-transfer-summary]');
    if(transfer)transfer.outerHTML=transferSummary(d,x.totalDebt);
    if(state.tab==='summary')renderOwnerChart(state.id);
  }
  function transferSummary(driver,totalDebt) {
    const helper=root.DriverTransferStatus;
    if(!helper)return '';
    const status=helper.normalize(driver);
    const dateValue=driver.companyTransferDate || 'غير مسجل';
    const note=driver.companyTransferNote || 'لا توجد ملاحظة تشغيلية';
    const archiveReview=status==='transferred' && Number(totalDebt)<=0
      ? '<p class="small-muted">إذا تمت التسوية المالية، راجع الأرشفة يدوياً. لا ينفذ النظام أي أرشفة تلقائية.</p>' : '';
    return `<div class="card ${helper.className(driver)} od-transfer-summary" data-owner-transfer-summary><h3>حالة التحويل التشغيلية</h3>
      <p>${helper.badge(driver)} · التاريخ: ${esc(dateValue)}</p><p>${esc(note)}</p>${archiveReview}</div>`;
  }
  function renderMonitor() {
    const host=document.getElementById('tab-monitor');if(!host)return;
    if(!host.querySelector('#od-monitor-results')) {
      host.innerHTML=`<div class="card"><h2>مراقبة العمليات · السجل الكامل</h2><p>يعرض كل أنواع العمليات وكل المحررين افتراضياً، بما فيها السائق والدفعة والإيراد والمصروف والمستخدم. يشمل التدقيق العمليات الملغاة؛ لا تؤثر قرارات المراجعة على الحسابات أو السجلات الأصلية.</p><p class="small-muted">قد لا تحتوي الأحداث القديمة على دور محفوظ؛ تظهر بدور «غير مسجل» وتبقى ظاهرة عند اختيار «الكل». لا يُستنتج مؤلف الحدث أو دوره من البيانات الحالية.</p>
        <div class="od-filters"><label>النص<input type="search" data-monitor-filter="q"></label><label>من<input type="date" data-monitor-filter="from"></label><label>إلى (شامل)<input type="date" data-monitor-filter="to"></label>
        <label>الإجراء<select data-monitor-filter="action"></select></label><label>نوع السجل<select data-monitor-filter="type"></select></label><label>دور المحرر<select data-monitor-filter="role"></select></label><label>حالة المراجعة<select data-monitor-filter="decision"><option value="">الكل</option>${Object.entries(reviewLabels).map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></label></div></div><div id="od-monitor-results"></div>`;
      host.oninput=e=>{const k=e.target.dataset.monitorFilter;if(k){monitor[k]=e.target.value;renderMonitor();}};
      host.onclick=handleClick;
      host.addEventListener('toggle',e=>{if(e.target.matches('.od-event')){if(e.target.open)state.open.add(e.target.dataset.event);else state.open.delete(e.target.dataset.event);}},true);
    }
    const all=events(), role=eventRole;
    for(const k of ['actor','source']) if(!host.querySelector(`[data-monitor-filter="${k}"]`)) {
      const node=document.createElement('label');node.textContent=k==='actor'?'هوية المحرر':'صفحة المصدر';
      const select=document.createElement('select');select.dataset.monitorFilter=k;node.appendChild(select);host.querySelector('.od-filters').appendChild(node);
    }
    for(const [k,get] of [['action',e=>String(e.action||'')],['type',e=>String(e.recordType||'')],['role',role],['actor',e=>String(e.editedById||e.editedBy||'')],['source',e=>String(e.source||'')]]) {
      const select=host.querySelector(`[data-monitor-filter="${k}"]`);
      const values=[...new Set([...all.map(get),monitor[k]])].filter(Boolean).sort();
      select.innerHTML='<option value="">الكل</option>'+values.map(v=>`<option value="${esc(v)}"${v===monitor[k]?' selected':''}>${esc(label(v))}</option>`).join('');
    }
    const rows=monitorRows(all,monitor,e=>reviews.get(e.id)?.decision||'pending');
    const results=host.querySelector('#od-monitor-results');
    if(host.querySelector('.od-save-review')) {
      // Keep the live review form and its in-flight save node intact, while still
      // inserting/reordering realtime events that match the current filters.
      const wanted=new Set(rows.map(e=>String(e.id)));
      results.querySelectorAll('.od-event').forEach(node=>{
        if(!wanted.has(String(node.dataset.event))&&!node.querySelector('.od-save-review'))node.remove();
      });
      const existing=new Map([...results.querySelectorAll('.od-event')].map(node=>[String(node.dataset.event),node]));
      rows.forEach(e=>{
        let node=existing.get(String(e.id));
        if(!node){
          const holder=document.createElement('div');
          holder.innerHTML=eventHtml(e);
          node=holder.firstElementChild;
          existing.set(String(e.id),node);
        }
        results.append(node);
      });
      const count=results.querySelector('.od-result-count');
      if(count)count.textContent=`${rows.length} نتيجة مطابقة · الترتيب من الأحدث للأقدم`;
      return;
    }
    results.innerHTML=historyScope(false)+`<p class="od-result-count">${rows.length} نتيجة مطابقة · الترتيب من الأحدث للأقدم</p>`+rows.map(eventHtml).join('');
  }
  async function review(button) {
    const id=button.dataset.id, box=button.nextElementSibling;
    button.disabled=true;box.textContent='جاري تحميل القرار من الخادم…';
    try {
      const [current,history]=await Promise.all([OwnerReviewStore.load(id),OwnerReviewStore.history(id)]);
      box.innerHTML=`<p>الحالة: ${esc(reviewLabels[current.decision]||current.decision)} · ${esc(current.actor?.email||'')} · ${esc(date(current.updatedAt)?.toLocaleString('ar-KW')||'')}</p><p class="small-muted">للحفاظ على مسودة القرار، تحديث قائمة النتائج مؤجل حتى إغلاق هذه المراجعة؛ البيانات والفلاتر تظل محفوظة.</p>
        <label>القرار<select class="od-decision">${Object.entries(reviewLabels).map(([v,l])=>`<option value="${v}" ${v===current.decision?'selected':''}>${l}</option>`).join('')}</select></label>
        <label>سبب / ملاحظة<textarea class="od-review-note">${esc(current.note||'')}</textarea></label><button class="btn success od-save-review" data-id="${esc(id)}">حفظ القرار على الخادم</button><button class="btn outline od-close-review">إغلاق المراجعة</button><p class="od-review-status" role="status"></p>
        <details><summary>سجل القرارات (${history.length})</summary>${history.map(h=>`<p>${esc(date(h.at)?.toLocaleString('ar-KW')||'وقت غير مسجل')} · ${esc(h.actor?.email)} · ${esc(reviewLabels[h.previousDecision])} ← ${esc(reviewLabels[h.decision])} · ${esc(h.note)}</p>`).join('')||'لا توجد قرارات سابقة'}</details>`;
    } catch(e) {box.textContent='تعذر تحميل المراجعة: '+e.message;}
    finally {button.disabled=false;}
  }
  async function saveReview(button) {
    const box=button.parentElement, status=box.querySelector('.od-review-status');
    button.disabled=true;status.textContent='جاري الحفظ…';
    try {
      await OwnerReviewStore.save(button.dataset.id,box.querySelector('.od-decision').value,box.querySelector('.od-review-note').value);
      await review(box.previousElementSibling);
    } catch(e) {status.textContent='لم يتم الحفظ: '+e.message;button.disabled=false;}
  }
  function handleClick(e) {
    const b=e.target.closest('button');if(!b)return;
    if(b.classList.contains('od-more'))loadMore();
    if(b.classList.contains('od-review'))review(b);
    if(b.classList.contains('od-save-review'))saveReview(b);
    if(b.classList.contains('od-close-review')){b.parentElement.innerHTML='';renderData();renderMonitor();}
  }
  root.OwnerDriverTabs = {
    loadMore, refresh:renderData, renderMonitor,
    mount(id) {
      state.id=id;state.tab='summary';state.filters={};state.open.clear();
      const box=document.getElementById('modalContent');
      const children=[...box.children], head=children.filter(el=>el.classList.contains('modal-head')||el.classList.contains('modal-nav'));
      const content=children.filter(el=>!head.includes(el));
      const tabs=[['summary','الملخص المالي'],['payments','الدفعات'],['contracts','العقود والتسويات'],['audit','تدقيق السائق'],['movements','حركات الحساب'],['notes','ملاحظات ومتابعة']];
      const nav=document.createElement('div');nav.className='od-tabs';nav.setAttribute('role','tablist');nav.setAttribute('aria-label','ملف السائق');
      nav.innerHTML=tabs.map(([key,label],i)=>`<button type="button" role="tab" id="od-tab-${key}" aria-controls="od-${key}" aria-selected="${!i}" tabindex="${i?-1:0}" data-tab="${key}">${label}</button>`).join('');
      box.insertBefore(nav,content[0]);
      for(const [key] of tabs) {
        const panel=document.createElement('section');panel.id='od-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby','od-tab-'+key);panel.hidden=key!=='summary';panel.dir='rtl';panel.tabIndex=0;
        if(key==='summary') content.slice(0,-2).forEach(el=>panel.append(el));
        else if(key==='notes') content.slice(-2).forEach(el=>panel.append(el));
        else panel.innerHTML=tools(key)+'<div class="od-results"></div>';
        box.append(panel);
      }
      const summaryPanel=box.querySelector('#od-summary');
      if(summaryPanel && !summaryPanel.querySelector('[data-owner-transfer-summary]')){
        const transfer=document.createElement('div');
        const driver=gDriverMap[id];
        transfer.innerHTML=transferSummary(driver,detailed(driver).totalDebt);
        if(transfer.firstElementChild)summaryPanel.prepend(transfer.firstElementChild);
      }
      const select=key=>{
        state.tab=key;
        for(const [k] of tabs){const b=box.querySelector('#od-tab-'+k);b.setAttribute('aria-selected',String(k===key));b.tabIndex=k===key?0:-1;box.querySelector('#od-'+k).hidden=k!==key;}
        if(key==='summary' && typeof renderOwnerChart==='function')renderOwnerChart(id);
      };
      nav.onclick=e=>{if(e.target.dataset.tab)select(e.target.dataset.tab);};
      nav.onkeydown=e=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
        e.preventDefault();let i=tabs.findIndex(t=>t[0]===state.tab);
        i=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowLeft'?1:-1)+tabs.length)%tabs.length;
        select(tabs[i][0]);nav.children[i].focus();
      };
      box.oninput=e=>{if(e.target.dataset.filter){filters(state.tab)[e.target.dataset.filter]=e.target.value;renderPanel(state.tab);}};
      if(!box.dataset.odToggleBound){
        box.dataset.odToggleBound='1';
        box.addEventListener('toggle',e=>{if(e.target.matches('.od-event')){if(e.target.open)state.open.add(e.target.dataset.event);else state.open.delete(e.target.dataset.event);}},true);
      }
      box.onclick=handleClick;
      renderData();
      if(!state.cursor&&!state.complete)loadMore();
    }
  };
  const style=document.createElement('style');
  style.textContent='.od-tabs{display:flex;flex-wrap:wrap;gap:6px;margin:16px 0}.od-tabs button{flex:1 1 125px;padding:12px;border:1px solid #475569;border-radius:8px;background:#172336;color:#e2e8f0;cursor:pointer}.od-tabs [aria-selected=true]{background:#0f766e;border-color:#5eead4}.od-tabs button:focus-visible{outline:3px solid #fbbf24}.od-filters{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin:14px 0}.od-filters label{min-width:0}.od-filters input,.od-review-box select,.od-review-box textarea{display:block;width:100%;box-sizing:border-box;margin:6px 0}.od-json{direction:ltr;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere;max-height:420px;overflow:auto;background:#101827;padding:12px}.od-event summary{cursor:pointer;line-height:1.9}.od-event-meta{display:block;font-size:.9em;font-weight:400;margin-top:3px}.audit-history-facts{border-inline-start:4px solid #0f766e;padding-inline-start:12px;margin-block:12px}.audit-history-facts p{margin:6px 0}.od-change{padding:9px;border-bottom:1px solid #334155;overflow-wrap:anywhere}.od-scope{border:1px solid #475569;border-radius:8px;padding:12px;line-height:1.8}#modalContent [hidden]{display:none!important}@media(max-width:600px){.od-filters{grid-template-columns:1fr}.od-tabs button{flex-basis:40%}}';
  document.head.append(style);
  root.addEventListener('owner-history-updated',()=>{renderData();renderMonitor();refreshSummary();});
  root.addEventListener('owner-private-history-updated',()=>{renderData();renderMonitor();});
  let reviewUnsubscribe=null;
  firebase.auth().onAuthStateChanged(user=>{
    if(reviewUnsubscribe){reviewUnsubscribe();reviewUnsubscribe=null;}
    reviews.clear();
    if(user?.email!==OWNER_EMAIL){
      if(historyUnsubscribe){historyUnsubscribe();historyUnsubscribe=null;}
      if(recentHistoryUnsubscribe){recentHistoryUnsubscribe();recentHistoryUnsubscribe=null;}
      ++historyGeneration;return;
    }
    reviewUnsubscribe=firebase.firestore().collection('ownerNotes').where('kind','==','ownerReview').onSnapshot(snap=>{
      reviews.clear();snap.docs.forEach(d=>reviews.set(d.data().recordId,d.data()));
      renderData();renderMonitor();
    },e=>{
      const host=document.getElementById('tab-monitor');
      if(host){let status=host.querySelector('.od-review-error');if(!status){status=document.createElement('p');status.className='od-review-error';status.setAttribute('role','alert');host.prepend(status);}status.textContent='تعذر تحميل قرارات المراجعة: '+e.message;}
    });
  });
  // Existing dashboard realtime refresh replaces its arrays. Observe cache changes, never
  // reopen the modal: selected tab, search fields, note drafts and review forms survive.
  let signature='';
  setInterval(()=>{
    if(!state.id||!document.getElementById('driverModal')?.classList.contains('active'))return;
    const next=JSON.stringify([gPayments,gExpenses,gRevenues,gEditHistory,gDriverMap[state.id]]);
    if(next===signature)return;
    signature=next;
    refreshSummary();
    if(document.querySelector('.od-save-review'))return;
    renderData();
  },2500);
})(typeof window !== 'undefined' ? window : globalThis);
import { getApps } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js';

const STORAGE_KEY = 'archiveDeletion.activeOperation.v1';
const DISPATCHER_NAME = 'archiveDeletion';
const STEP_SIZE = 100;
const ACTIVE_STAGES = new Set(['preparing', 'prepared', 'committed', 'purging']);
const TERMINAL_STAGES = new Set(['completed', 'cancelled']);

const panel = document.getElementById('archiveDeletionPanel');
const statusBox = document.getElementById('archiveDeletionStatus');
const actionsBox = document.getElementById('archiveDeletionActions');
const progress = document.getElementById('archiveDeletionProgress');

let capability = null;
let operation = readOperation();
let busy = false;
let lastError = '';
let callable = null;

function readOperation() {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (
            parsed &&
            typeof parsed.employeeNumber === 'string' &&
            typeof parsed.idempotencyKey === 'string' &&
            parsed.idempotencyKey.length >= 16
        ) return parsed;
    } catch (_) {
        // Corrupt browser state cannot be trusted as an operation identity.
    }
    return null;
}

function saveOperation(next) {
    operation = next;
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
    render();
}

function newIdempotencyKey() {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return `archive-delete-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

function capabilityReady(value) {
    return Boolean(
        value?.authorized === true &&
        value?.enabled === true &&
        value?.checks?.enabled === true &&
        value?.checks?.rulesVerified === true &&
        value?.checks?.writerLocksVerified === true &&
        value?.checks?.readerGateVerified === true
    );
}

function disabledReason() {
    if (!getAuth().currentUser) return 'الحذف معطل: يلزم تسجيل الدخول أولاً.';
    if (!capability) return lastError || 'الحذف معطل: لم يتم التحقق من الخادم بعد.';
    if (capability.authorized !== true) return 'الحذف معطل: يلزم تصريح archiveAdmin صادر من الخادم؛ دور المستخدم المحلي لا يمنح هذه الصلاحية.';
    if (!capabilityReady(capability)) return 'الحذف معطل: لم يؤكد الخادم تفعيل القواعد وأقفال الكتّاب وحجب القراءة الآمن.';
    return '';
}

function friendlyError(error) {
    const code = String(error?.details?.error || error?.code || '').replace('functions/', '');
    const serverMessage = error?.details?.message || error?.message || '';
    const messages = {
        'permission-denied': 'رفض الخادم العملية: يلزم تصريح archiveAdmin صادر من الخادم.',
        FORBIDDEN: 'رفض الخادم العملية: يلزم تصريح archiveAdmin صادر من الخادم.',
        DISABLED: 'الحذف معطل من الخادم حتى يكتمل التحقق من قواعد الأمان والأقفال وحجب القراءة.',
        OPERATION_NOT_FOUND: 'لم تُنشأ العملية على الخادم بعد. يمكن إعادة محاولة التحضير بالمفتاح نفسه.',
        STAGE_CONFLICT: 'لا يسمح الخادم بهذا الإجراء في المرحلة الحالية. تم الاحتفاظ ببيانات الاستئناف.',
        PERMANENT_LOCK_EXISTS: 'السائق مقفل بعملية أخرى. لا تبدأ عملية جديدة.',
        ARCHIVE_CHANGED: 'تغير سجل الأرشيف؛ لم يتم الحذف. أعد تحميل القائمة وتحقق من السجل.',
        ACTIVE_DRIVER_EXISTS: 'يوجد سائق نشط مطابق؛ رفض الخادم الحذف.',
        unavailable: 'الخادم غير متاح حالياً. تم الاحتفاظ ببيانات العملية للاستئناف.',
        internal: 'تعذر إكمال طلب الخادم. تم الاحتفاظ ببيانات العملية للاستئناف.'
    };
    return messages[code] || `تعذر إكمال طلب الخادم${serverMessage ? `: ${serverMessage}` : ''}. تم الاحتفاظ ببيانات الاستئناف.`;
}

async function invoke(action, data = {}) {
    if (!callable) {
        const app = window.archiveDeletionFirebase?.app || getApps()[0];
        if (!app) throw new Error('Firebase app is not initialized');
        callable = httpsCallable(getFunctions(app), DISPATCHER_NAME);
    }
    const response = await callable({ action, ...data });
    return response.data;
}

function operationPayload() {
    return {
        employeeNumber: operation.employeeNumber,
        idempotencyKey: operation.idempotencyKey
    };
}

function applyServerOperation(result) {
    if (!operation) return;
    saveOperation({
        ...operation,
        operationId: result.operationId || operation.operationId,
        stage: result.stage || operation.stage,
        childCount: Number(result.childCount || 0),
        purgedCount: Number(result.purgedCount || 0),
        updatedAt: Date.now()
    });
}

async function run(action, extra = {}) {
    busy = true;
    lastError = '';
    render();
    try {
        const result = await invoke(action, { ...operationPayload(), ...extra });
        applyServerOperation(result);
        return result;
    } catch (error) {
        lastError = friendlyError(error);
        render();
        throw error;
    } finally {
        busy = false;
        render();
    }
}

async function checkCapability() {
    busy = true;
    lastError = '';
    render();
    try {
        capability = await invoke('capability');
        if (!capabilityReady(capability)) lastError = disabledReason();
    } catch (error) {
        capability = { authorized: false, enabled: false, checks: {} };
        lastError = friendlyError(error);
    } finally {
        busy = false;
        render();
    }
}

async function resume() {
    if (!operation || !capabilityReady(capability)) return;
    try {
        const result = await run('status');
        // Preparing is a durable server stage. Calling prepare again with the
        // same persisted key resumes evidence capture idempotently.
        if (result?.stage === 'preparing') await run('prepare');
    } catch (error) {
        const code = String(error?.details?.error || error?.code || '');
        if (code.includes('OPERATION_NOT_FOUND') && operation.stage === 'preparing') {
            operation.stage = 'not-created';
            saveOperation(operation);
        }
    }
}

async function begin(employeeNumber) {
    if (!capabilityReady(capability) || busy) return;
    if (operation && ACTIVE_STAGES.has(operation.stage)) {
        lastError = `توجد عملية محفوظة للسائق ${operation.employeeNumber}. أكملها أو ألغها في المرحلة المسموح بها.`;
        render();
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    if (!confirm(`سيجمع الخادم دليلاً دائماً ويقفل السائق ${employeeNumber} قبل أي حذف. هل تريد بدء التحضير؟`)) return;
    saveOperation({
        employeeNumber,
        idempotencyKey: newIdempotencyKey(),
        stage: 'preparing',
        childCount: 0,
        purgedCount: 0,
        createdAt: Date.now()
    });
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
        await run('prepare');
    } catch (_) {
        // The same persistent key is deliberately retained for a safe retry.
    }
}

async function retryPrepare() {
    try {
        operation.stage = 'preparing';
        saveOperation(operation);
        await run('prepare');
    } catch (_) {}
}

async function commit() {
    if (operation?.stage !== 'prepared') return;
    const typed = prompt(
        `هذه نقطة لا رجعة فيها: سيحذف الخادم سجل الأرشيف للسائق ${operation.employeeNumber} ثم تصبح الإزالة المالية المرحلية واجبة الإكمال.\nاكتب "حذف نهائي" للتأكيد:`
    );
    if (typed !== 'حذف نهائي') {
        lastError = 'لم يتم الالتزام بالحذف لأن عبارة التأكيد لم تتطابق. لا تزال العملية في مرحلة التحضير ويمكن إلغاؤها.';
        render();
        return;
    }
    try { await run('commit'); } catch (_) {}
}

async function cancel() {
    if (!['preparing', 'prepared'].includes(operation?.stage)) return;
    if (!confirm('إلغاء العملية قبل الالتزام؟ سيحرر الخادم القفل المؤقت ويوقف وضع الصيانة، ولن يُحذف سجل الأرشيف أو السجلات المالية.')) return;
    try { await run('cancel'); } catch (_) {}
}

async function step() {
    if (!['committed', 'purging'].includes(operation?.stage)) return;
    try { await run('step', { chunkSize: STEP_SIZE }); } catch (_) {}
}

function button(label, action, className = '') {
    return `<button type="button" class="operation-btn ${className}" data-operation-action="${action}" ${busy ? 'disabled' : ''}>${label}</button>`;
}

function stageArabic(stage) {
    return {
        preparing: 'جارٍ التحضير',
        'not-created': 'لم تُنشأ على الخادم',
        prepared: 'مُحضّرة — لم يحدث حذف بعد',
        committed: 'تم الالتزام — حذف سجل الأرشيف وأصبحت المتابعة واجبة',
        purging: 'تنظيف مالي مرحلي',
        completed: 'مكتملة',
        cancelled: 'ملغاة قبل الالتزام'
    }[stage] || stage || 'غير معروفة';
}

function renderCards() {
    const reason = disabledReason();
    document.querySelectorAll('[data-archive-delete]').forEach(node => {
        const hasBlockingOperation = operation && ACTIVE_STAGES.has(operation.stage);
        node.disabled = busy || !capabilityReady(capability) || hasBlockingOperation;
        node.title = reason || (hasBlockingOperation ? 'أكمل العملية المحفوظة أولاً.' : '');
    });
    document.querySelectorAll('[data-delete-reason]').forEach(node => {
        const hasBlockingOperation = operation && ACTIVE_STAGES.has(operation.stage);
        node.textContent = reason || (hasBlockingOperation ? `أكمل العملية المحفوظة للسائق ${operation.employeeNumber} أولاً.` : '');
        node.hidden = !node.textContent;
    });
}

function render() {
    renderCards();
    actionsBox.innerHTML = '';
    progress.hidden = true;

    if (!operation) {
        const reason = disabledReason();
        statusBox.dataset.tone = capabilityReady(capability) ? 'success' : 'warning';
        statusBox.textContent = reason || 'الخادم جاهز والتصريح الصادر من الخادم مؤكد. اختر «بدء حذف مرحلي» من سجل سائق.';
        if (!capabilityReady(capability) && getAuth().currentUser) actionsBox.innerHTML = button('إعادة التحقق من الخادم', 'capability');
        return;
    }

    const count = Number(operation.childCount || 0);
    const purged = Number(operation.purgedCount || 0);
    const irreversible = ['committed', 'purging', 'completed'].includes(operation.stage);
    statusBox.dataset.tone = lastError ? 'danger' : operation.stage === 'completed' ? 'success' : 'warning';
    statusBox.textContent =
        `السائق: ${operation.employeeNumber}\nالمرحلة: ${stageArabic(operation.stage)}` +
        (count ? `\nالتقدم المالي: ${purged} من ${count}` : '') +
        (irreversible ? '\nتم تجاوز نقطة اللاعودة. لا تغلق المهمة قبل اكتمال التنظيف.' : '') +
        (lastError ? `\n\n${lastError}` : '');

    if (count > 0) {
        progress.hidden = false;
        progress.max = count;
        progress.value = Math.min(purged, count);
    }

    if (!capabilityReady(capability)) {
        actionsBox.innerHTML = button('إعادة التحقق من الخادم', 'capability');
        return;
    }
    if (operation.stage === 'not-created' || operation.stage === 'preparing') {
        actionsBox.innerHTML =
            button('استئناف التحضير بالمفتاح نفسه', 'prepare') +
            (operation.stage === 'preparing' ? button('إلغاء التحضير وتحرير القفل المؤقت', 'cancel', 'cancel') : '');
    } else if (operation.stage === 'prepared') {
        actionsBox.innerHTML = button('التزام بالحذف غير القابل للتراجع', 'commit', 'commit') + button('إلغاء قبل الالتزام', 'cancel', 'cancel');
    } else if (['committed', 'purging'].includes(operation.stage)) {
        actionsBox.innerHTML = button(`تنفيذ خطوة تنظيف محدودة (حتى ${STEP_SIZE})`, 'step');
    } else if (TERMINAL_STAGES.has(operation.stage)) {
        actionsBox.innerHTML = button('تحديث الحالة', 'status') + button('إخفاء العملية المكتملة', 'clear', 'cancel');
    }
}

document.addEventListener('click', event => {
    const deleteButton = event.target.closest('[data-archive-delete]');
    if (deleteButton) {
        begin(deleteButton.dataset.archiveDelete);
        return;
    }
    const action = event.target.closest('[data-operation-action]')?.dataset.operationAction;
    if (!action) return;
    if (action === 'capability') checkCapability().then(resume);
    else if (action === 'prepare') retryPrepare();
    else if (action === 'commit') commit();
    else if (action === 'cancel') cancel();
    else if (action === 'step') step();
    else if (action === 'status') run('status').catch(() => {});
    else if (action === 'clear' && operation && TERMINAL_STAGES.has(operation.stage)) saveOperation(null);
});
document.addEventListener('archive-list-rendered', renderCards);

onAuthStateChanged(getAuth(), async user => {
    if (!user) {
        capability = null;
        lastError = 'الحذف معطل: يلزم تسجيل الدخول أولاً.';
        render();
        return;
    }
    await checkCapability();
    await resume();
});

render();

window.archiveDeletionUI = Object.freeze({
    storageKey: STORAGE_KEY,
    dispatcherName: DISPATCHER_NAME,
    stepSize: STEP_SIZE
});
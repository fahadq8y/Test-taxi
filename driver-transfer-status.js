(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.DriverTransferStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATUSES = ['on_company', 'pending', 'transferred'];
    var LABELS = {
        on_company: 'على الشركة',
        pending: 'قيد التحويل',
        transferred: 'تم التحويل',
        unset: 'غير محدد'
    };
    var CSS = [
        '.transfer-card--pending{background:#fffbeb!important;border-right:5px solid #eab308!important;color:#1f2937}',
        '.transfer-card--transferred{background:#fef2f2!important;border-right:5px solid #dc2626!important;color:#1f2937}',
        '.transfer-badge{display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:700;line-height:1.4}',
        '.transfer-badge--pending{color:#713f12;background:#fde68a;border:1px solid #eab308}',
        '.transfer-badge--transferred{color:#7f1d1d;background:#fecaca;border:1px solid #ef4444}',
        '.transfer-badge--on_company{color:#334155;background:#f1f5f9;border:1px solid #cbd5e1}',
        '.transfer-badge--unset{color:#334155;background:#e2e8f0;border:1px solid #94a3b8}'
    ].join('');

    function statusValue(value) {
        return value && typeof value === 'object' ? value.companyTransferStatus : value;
    }

    function normalize(value) {
        value = statusValue(value);
        return STATUSES.indexOf(value) === -1 ? 'unset' : value;
    }

    function label(value) {
        return LABELS[normalize(value)];
    }

    function className(value) {
        return 'transfer-card--' + normalize(value);
    }

    function visualClass(value, kind) {
        var prefix = kind === 'row' ? 'transfer-row--' : kind === 'badge' ? 'transfer-badge--' : 'transfer-card--';
        return prefix + normalize(value);
    }

    function badge(value) {
        var status = normalize(value);
        return '<span class="transfer-badge ' + visualClass(status, 'badge') + '">' + escapeHtml(LABELS[status]) + '</span>';
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }

    function matches(driver, filter, totalDebt) {
        var status = normalize(driver && driver.companyTransferStatus);
        if (!filter || filter === 'all') return true;
        if (filter === 'transferred_debt') {
            return status === 'transferred' && Number(totalDebt) > 0;
        }
        return status === filter;
    }

    function localToday(now) {
        var date = now instanceof Date ? now : new Date();
        var offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 10);
    }

    function validDate(value) {
        if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
        var parts = value.split('-').map(Number);
        var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        return date.getUTCFullYear() === parts[0] &&
            date.getUTCMonth() === parts[1] - 1 &&
            date.getUTCDate() === parts[2];
    }

    function validate(input) {
        var status = normalize(input && input.status);
        var date = input && typeof input.date === 'string' ? input.date.trim() : '';
        var note = input && typeof input.note === 'string' ? input.note.trim() : '';
        if (status === 'unset') return { ok: false, error: 'يرجى اختيار حالة تحويل صحيحة.' };
        if (!validDate(date)) return { ok: false, error: 'يرجى إدخال تاريخ صحيح.' };
        if (note.length > 500) return { ok: false, error: 'الملاحظة يجب ألا تتجاوز 500 حرف.' };
        return { ok: true, value: { status: status, date: date, note: note } };
    }

    function injectStyles(doc) {
        doc = doc || (typeof document !== 'undefined' ? document : null);
        if (!doc || doc.getElementById('driver-transfer-status-styles')) return;
        var style = doc.createElement('style');
        style.id = 'driver-transfer-status-styles';
        style.textContent = CSS;
        (doc.head || doc.documentElement).appendChild(style);
    }

    injectStyles();

    function canonical(value) {
        if (value === undefined) return { type: 'undefined' };
        if (value === null) return null;
        if (value && typeof value.toDate === 'function') return { type: 'date', value: value.toDate().toISOString() };
        if (value instanceof Date) return { type: 'date', value: value.toISOString() };
        if (Array.isArray(value)) return value.map(canonical);
        if (value && typeof value === 'object') {
            return Object.keys(value).sort().reduce(function (result, key) {
                result[key] = canonical(value[key]);
                return result;
            }, {});
        }
        return { type: typeof value, value: value };
    }

    function equal(left, right) {
        return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
    }

    function changedPatch(opened, submitted, excluded) {
        var patch = {};
        var skip = new Set(excluded || []);
        Object.keys(submitted || {}).forEach(function (key) {
            if (!skip.has(key) && !equal(submitted[key], opened && opened[key])) patch[key] = submitted[key];
        });
        return patch;
    }

    function assertNoConflicts(live, opened, changedKeys, protectedKeys) {
        var keys = Array.from(new Set((changedKeys || []).concat(protectedKeys || [])));
        keys.forEach(function (key) {
            if (!equal(live && live[key], opened && opened[key])) {
                var error = new Error('conflict:' + key);
                error.code = 'optimistic-conflict';
                error.field = key;
                throw error;
            }
        });
    }

    async function saveTransferStatus(options) {
        var keys = ['companyTransferStatus', 'companyTransferDate', 'companyTransferNote'];
        // The form baseline is normalized for user-change detection (for
        // example a Firestore Timestamp displayed as YYYY-MM-DD). The raw
        // opened snapshot remains the concurrency baseline.
        var userChanges = changedPatch(options.baseline || options.opened, options.next);
        if (!Object.keys(userChanges).length && normalize(options.opened) !== 'unset') {
            return { noop: true, changes: [] };
        }
        // Once staff explicitly save a first status or a real form change,
        // persist the complete validated metadata, including the default date.
        var patch = changedPatch(options.opened, options.next);
        var changedKeys = Object.keys(patch);
        if (!changedKeys.length) return { noop: true, changes: [] };
        var changes = changedKeys.map(function (key) {
            return { field: key, oldValue: options.opened[key] == null ? null : options.opened[key], newValue: patch[key] };
        });
        await options.runTransaction(async function (tx) {
            var snap = await tx.get(options.driverRef);
            var exists = typeof snap.exists === 'function' ? snap.exists() : snap.exists;
            if (!exists) throw new Error('driver-not-found');
            var live = snap.data();
            assertNoConflicts(live, options.opened, keys);
            tx.update(options.driverRef, patch);
            tx.set(options.auditRef(), options.makeAudit({
                action: 'transferStatus',
                recordType: 'driver',
                recordId: options.driverId,
                driverId: options.driverId,
                source: options.source || 'drivers.html',
                changes: changes,
                before: {
                    companyTransferStatus: options.opened.companyTransferStatus == null ? null : options.opened.companyTransferStatus,
                    companyTransferDate: options.opened.companyTransferDate == null ? null : options.opened.companyTransferDate,
                    companyTransferNote: options.opened.companyTransferNote == null ? null : options.opened.companyTransferNote
                },
                after: {
                    companyTransferStatus: options.next.companyTransferStatus,
                    companyTransferDate: options.next.companyTransferDate,
                    companyTransferNote: options.next.companyTransferNote
                },
                description: 'تعديل حالة تحويل السائق'
            }));
        });
        return { noop: false, changes: changes, patch: patch };
    }

    return Object.freeze({
        statuses: STATUSES.slice(),
        normalize: normalize,
        label: label,
        badge: badge,
        className: className,
        cssClass: visualClass,
        visualClass: visualClass,
        matches: matches,
        css: CSS,
        injectStyles: injectStyles,
        localToday: localToday,
        validate: validate,
        equal: equal,
        changedPatch: changedPatch,
        assertNoConflicts: assertNoConflicts,
        saveTransferStatus: saveTransferStatus
    });
});
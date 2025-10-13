// ملف تطبيق الصلاحيات لصفحة دفعات السائق
// مطابق لمنطق revenues-permissions.js

/**
 * التحقق من صلاحية الحذف بناءً على دور المستخدم وتاريخ الإضافة
 * @param {string} itemDate - تاريخ إضافة العنصر
 * @param {Date} createdAt - تاريخ الإنشاء من Firebase
 * @returns {boolean}
 */
function canDeletePayment(itemDate, createdAt) {
    const userRole = localStorage.getItem('userRole');
    
    // إذا لم يكن هناك دور محدد، لا يمكن الحذف
    if (!userRole) {
        return false;
    }
    
    // Admin يمكنه الحذف دائماً
    if (userRole === 'admin') {
        return true;
    }
    
    // Accountant يمكنه الحذف فقط خلال 24 ساعة
    if (userRole === 'accountant') {
        // استخدام تاريخ الإنشاء من Firebase إذا كان متاحاً
        let itemTime;
        if (createdAt && createdAt.toDate) {
            itemTime = createdAt.toDate().getTime();
        } else if (createdAt) {
            itemTime = new Date(createdAt).getTime();
        } else {
            itemTime = new Date(itemDate).getTime();
        }
        
        const now = new Date().getTime();
        const hoursDiff = (now - itemTime) / (1000 * 60 * 60);
        
        return hoursDiff <= 24;
    }
    
    // أي دور آخر لا يمكنه الحذف
    return false;
}

/**
 * إنشاء زر الحذف بناءً على الصلاحيات
 * @param {string} id - معرف الدفعة
 * @param {string} itemDate - تاريخ الدفعة
 * @param {Date} createdAt - تاريخ الإنشاء من Firebase
 * @param {string} functionName - اسم دالة الحذف
 * @param {string} className - class للزر
 * @returns {string} - HTML للزر أو القفل
 */
function getPaymentDeleteButton(id, itemDate, createdAt, functionName, className) {
    if (canDeletePayment(itemDate, createdAt)) {
        return `<button class="${className}" onclick="${functionName}('${id}')">حذف</button>`;
    } else {
        return '<span class="locked-icon" title="لا يمكن الحذف بعد 24 ساعة">🔒</span>';
    }
}

// تصدير الدوال للاستخدام العام
window.canDeletePayment = canDeletePayment;
window.getPaymentDeleteButton = getPaymentDeleteButton;


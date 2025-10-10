// ملف تطبيق الصلاحيات لصفحة الإيرادات

/**
 * التحقق من صلاحية الحذف بناءً على دور المستخدم وتاريخ الإضافة
 * @param {string} itemDate - تاريخ إضافة العنصر
 * @param {Date} createdAt - تاريخ الإنشاء من Firebase
 * @returns {boolean}
 */
function canDeleteRevenue(itemDate, createdAt) {
    const userRole = localStorage.getItem('userRole');
    
    // إذا لم يكن هناك دور محدد، لا يمكن الحذف
    if (!userRole) {
        return false;
    }
    
    // Admin يمكنه الحذف دائماً
    if (userRole === 'admin') {
        return true;
    }
    
    // Manager يمكنه الحذف فقط خلال 24 ساعة
    if (userRole === 'accountant') {
        // استخدام تاريخ الإنشاء من Firebase إذا كان متاحاً
        let itemTime;
        if (createdAt && createdAt.toDate) {
            itemTime = createdAt.toDate().getTime();
        } else if (createdAt) {
            itemTime = new Date(createdAt).getTime();
        } else {
            // إذا لم يكن هناك تاريخ إنشاء، استخدم تاريخ العنصر
            itemTime = new Date(itemDate).getTime();
        }
        
        const now = new Date().getTime();
        const hoursPassed = (now - itemTime) / (1000 * 60 * 60);
        
        return hoursPassed < 24;
    }
    
    // المستخدمون الآخرون لا يمكنهم الحذف
    return false;
}

/**
 * إنشاء زر حذف بناءً على الصلاحيات
 * @param {string} itemId - معرف العنصر
 * @param {string} itemDate - تاريخ العنصر
 * @param {Date} createdAt - تاريخ الإنشاء من Firebase
 * @param {string} deleteFunction - اسم دالة الحذف
 * @param {string} buttonClass - فئة CSS للزر
 * @returns {string} HTML للزر أو سلسلة فارغة
 */
function getRevenueDeleteButton(itemId, itemDate, createdAt, deleteFunction, buttonClass = 'delete-btn') {
    if (canDeleteRevenue(itemDate, createdAt)) {
        return `<button class="${buttonClass}" onclick="${deleteFunction}('${itemId}')">حذف</button>`;
    } else {
        return '<span class="no-permission" title="لا يمكن الحذف بعد 24 ساعة">🔒</span>';
    }
}

/**
 * التحقق من تسجيل الدخول
 */
function checkRevenueAuth() {
    const userRole = localStorage.getItem('userRole');
    if (!userRole) {
        alert('يجب تسجيل الدخول أولاً');
        window.location.href = 'index.html';
        return false;
    }
    return true;
}


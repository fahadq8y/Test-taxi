// نظام التحقق من الصلاحيات للمستخدمين
// يتكامل مع Firebase Authentication

/**
 * الحصول على نوع المستخدم الحالي من Firebase
 * @param {string} userId - معرف المستخدم
 * @returns {Promise<string|null>} نوع المستخدم (admin, accountant, driver) أو null
 */
async function getUserRole(userId) {
    try {
        // محاولة الحصول على الدور من localStorage أولاً
        const cachedRole = localStorage.getItem('userRole');
        if (cachedRole) {
            return cachedRole;
        }
        
        // إذا لم يكن موجوداً في localStorage، جلبه من Firebase
        if (userId && typeof db !== 'undefined') {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                const role = userDoc.data().role;
                localStorage.setItem('userRole', role);
                return role;
            }
        }
        
        return null;
    } catch (error) {
        console.error('خطأ في الحصول على دور المستخدم:', error);
        return localStorage.getItem('userRole');
    }
}

/**
 * الحصول على نوع المستخدم الحالي بشكل متزامن
 * @returns {string|null} نوع المستخدم من localStorage
 */
function getUserRoleSync() {
    return localStorage.getItem('userRole');
}

/**
 * التحقق من إمكانية الحذف خلال فترة زمنية محددة (أسبوعان = 336 ساعة)
 * @param {Date} createdAt - تاريخ إنشاء العنصر
 * @returns {boolean} true إذا كان ضمن أسبوعين
 */
function canDeleteWithinTimeLimit(createdAt) {
    const now = new Date();
    const itemTime = createdAt instanceof Date ? createdAt : new Date(createdAt);
    const hoursPassed = (now - itemTime) / (1000 * 60 * 60);
    
    return hoursPassed <= 336; // أسبوعان = 14 يوم × 24 ساعة
}

/**
 * التحقق من إمكانية حذف عنصر بناءً على تاريخ إضافته ونوع المستخدم
 * @param {string|Date} itemDate - تاريخ إضافة العنصر
 * @returns {boolean} true إذا كان يمكن الحذف، false إذا لم يكن
 */
function canDelete(itemDate) {
    const userRole = getUserRoleSync();
    
    // Admin يمكنه الحذف دائماً
    if (userRole === 'admin') {
        return true;
    }
    
    // Accountant (المسؤول) يمكنه الحذف فقط خلال أسبوعين من تاريخ الإضافة
    if (userRole === 'accountant') {
        return canDeleteWithinTimeLimit(itemDate);
    }
    
    // المستخدمون الآخرون (driver) لا يمكنهم الحذف
    return false;
}

/**
 * إنشاء زر حذف بناءً على الصلاحيات
 * @param {string} itemId - معرف العنصر
 * @param {string|Date} itemDate - تاريخ إضافة العنصر
 * @param {string} deleteFunction - اسم دالة الحذف
 * @param {string} buttonClass - فئة CSS للزر (اختياري)
 * @returns {string} HTML للزر أو سلسلة فارغة
 */
function getDeleteButton(itemId, itemDate, deleteFunction, buttonClass = 'delete-btn') {
    if (canDelete(itemDate)) {
        return `<button class="${buttonClass}" onclick="${deleteFunction}('${itemId}', '${itemDate}')">🗑️ حذف</button>`;
    } else {
        return '';
    }
}

/**
 * التحقق من أن المستخدم مسجل دخول
 * @returns {boolean}
 */
function isLoggedIn() {
    return localStorage.getItem('userRole') !== null;
}

/**
 * إعادة التوجيه إلى صفحة تسجيل الدخول إذا لم يكن المستخدم مسجلاً
 */
function requireLogin() {
    if (!isLoggedIn()) {
        window.location.href = 'index.html';
    }
}

// تصدير الدوال للاستخدام في الصفحات الأخرى
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        getUserRole,
        canDelete,
        getDeleteButton,
        isLoggedIn,
        requireLogin
    };
}


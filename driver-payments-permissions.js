// نظام الصلاحيات لصفحة دفعات السائقين
// يتكامل مع user-permissions.js

/**
 * التحقق من صلاحية حذف دفعة سائق
 * @param {string} paymentId - معرف الدفعة
 * @param {Date} createdAt - تاريخ إنشاء الدفعة
 * @returns {Promise<boolean>} - هل يمكن الحذف؟
 */
async function canDeletePayment(paymentId, createdAt) {
    try {
        // التحقق من تسجيل الدخول
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('المستخدم غير مسجل الدخول');
            return false;
        }

        // الحصول على دور المستخدم
        const userRole = await getUserRole(user.uid);
        
        // المدير له صلاحيات حذف كاملة
        if (userRole === 'admin') {
            return true;
        }
        
        // المسؤول يمكنه الحذف فقط خلال 24 ساعة
        if (userRole === 'accountant') {
            return canDeleteWithinTimeLimit(createdAt);
        }
        
        // أي دور آخر لا يمكنه الحذف
        return false;
        
    } catch (error) {
        console.error('خطأ في التحقق من صلاحية الحذف:', error);
        return false;
    }
}

/**
 * عرض زر الحذف بناءً على الصلاحيات
 * @param {string} paymentId - معرف الدفعة
 * @param {Date} createdAt - تاريخ الإنشاء
 * @returns {Promise<string>} - HTML لزر الحذف أو فارغ
 */
async function renderPaymentDeleteButton(paymentId, createdAt) {
    const canDelete = await canDeletePayment(paymentId, createdAt);
    
    if (!canDelete) {
        return '';
    }
    
    return `<button class="delete-btn" onclick="deletePayment('${paymentId}')">حذف</button>`;
}

/**
 * التحقق من الصلاحية قبل تنفيذ الحذف
 * @param {string} paymentId - معرف الدفعة
 * @returns {Promise<boolean>} - هل يمكن المتابعة بالحذف؟
 */
async function verifyPaymentDeletePermission(paymentId) {
    try {
        // الحصول على بيانات الدفعة من Firebase
        const doc = await db.collection('driverPayments').doc(paymentId).get();
        
        if (!doc.exists) {
            alert('الدفعة غير موجودة');
            return false;
        }
        
        const data = doc.data();
        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
        
        // التحقق من الصلاحية
        const canDelete = await canDeletePayment(paymentId, createdAt);
        
        if (!canDelete) {
            const user = firebase.auth().currentUser;
            const userRole = await getUserRole(user.uid);
            
            if (userRole === 'accountant') {
                alert('عذراً، يمكن للمحاسب حذف الدفعات فقط خلال 24 ساعة من تاريخ الإنشاء');
            } else {
                alert('عذراً، ليس لديك صلاحية حذف هذه الدفعة');
            }
            return false;
        }
        
        return true;
        
    } catch (error) {
        console.error('خطأ في التحقق من صلاحية الحذف:', error);
        alert('حدث خطأ في التحقق من الصلاحيات');
        return false;
    }
}

/**
 * إخفاء/إظهار أزرار الحذف بناءً على الصلاحيات
 * يتم استدعاؤها بعد عرض الجدول
 */
async function updatePaymentDeleteButtonsVisibility() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            // إخفاء جميع أزرار الحذف
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.style.display = 'none';
            });
            return;
        }

        const userRole = await getUserRole(user.uid);
        
        // المدير يرى جميع الأزرار
        if (userRole === 'admin') {
            return;
        }
        
        // المسؤول: التحقق من كل زر على حدة
        if (userRole === 'accountant') {
            const deleteButtons = document.querySelectorAll('.delete-btn');
            for (const btn of deleteButtons) {
                const onclick = btn.getAttribute('onclick');
                const match = onclick.match(/'([^']+)'/);
                if (match) {
                    const paymentId = match[1];
                    
                    // الحصول على تاريخ الإنشاء من البيانات
                    const doc = await db.collection('driverPayments').doc(paymentId).get();
                    
                    if (doc.exists) {
                        const data = doc.data();
                        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
                        
                        if (!canDeleteWithinTimeLimit(createdAt)) {
                            btn.style.display = 'none';
                        }
                    }
                }
            }
        } else {
            // أي دور آخر: إخفاء جميع الأزرار
            document.querySelectorAll('.delete-btn').forEach(btn => {
                btn.style.display = 'none';
            });
        }
        
    } catch (error) {
        console.error('خطأ في تحديث أزرار الحذف:', error);
    }
}

// تصدير الدوال للاستخدام العام
window.canDeletePayment = canDeletePayment;
window.renderPaymentDeleteButton = renderPaymentDeleteButton;
window.verifyPaymentDeletePermission = verifyPaymentDeletePermission;
window.updatePaymentDeleteButtonsVisibility = updatePaymentDeleteButtonsVisibility;


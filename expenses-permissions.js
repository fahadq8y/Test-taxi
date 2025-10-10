// نظام الصلاحيات لصفحة المصروفات
// يتكامل مع user-permissions.js

// استيراد دوال الصلاحيات من الملف الرئيسي
// يتم تحميل user-permissions.js قبل هذا الملف

/**
 * التحقق من صلاحية حذف مصروف
 * @param {string} expenseId - معرف المصروف
 * @param {Date} createdAt - تاريخ إنشاء المصروف
 * @returns {Promise<boolean>} - هل يمكن الحذف؟
 */
async function canDeleteExpense(expenseId, createdAt) {
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
 * التحقق من صلاحية حذف دفعة سائق
 * @param {string} paymentId - معرف الدفعة
 * @param {Date} createdAt - تاريخ إنشاء الدفعة
 * @returns {Promise<boolean>} - هل يمكن الحذف؟
 */
async function canDeleteDriverPayment(paymentId, createdAt) {
    // نفس منطق حذف المصروفات
    return await canDeleteExpense(paymentId, createdAt);
}

/**
 * عرض زر الحذف بناءً على الصلاحيات
 * @param {string} itemId - معرف العنصر
 * @param {Date} createdAt - تاريخ الإنشاء
 * @param {string} type - نوع العنصر (expense أو payment)
 * @returns {Promise<string>} - HTML لزر الحذف أو فارغ
 */
async function renderDeleteButton(itemId, createdAt, type = 'expense') {
    const canDelete = type === 'expense' 
        ? await canDeleteExpense(itemId, createdAt)
        : await canDeleteDriverPayment(itemId, createdAt);
    
    if (!canDelete) {
        return '';
    }
    
    const deleteFunction = type === 'expense' ? 'deleteExpense' : 'deleteDriverPayment';
    return `<button class="delete-btn" onclick="${deleteFunction}('${itemId}')">حذف</button>`;
}

/**
 * التحقق من الصلاحية قبل تنفيذ الحذف
 * @param {string} itemId - معرف العنصر
 * @param {string} type - نوع العنصر (expense أو payment)
 * @returns {Promise<boolean>} - هل يمكن المتابعة بالحذف؟
 */
async function verifyDeletePermission(itemId, type = 'expense') {
    try {
        // الحصول على بيانات العنصر من Firebase
        const collection = type === 'expense' ? 'expenses' : 'driverPayments';
        const doc = await db.collection(collection).doc(itemId).get();
        
        if (!doc.exists) {
            alert('العنصر غير موجود');
            return false;
        }
        
        const data = doc.data();
        const createdAt = data.createdAt ? data.createdAt.toDate() : new Date(data.date);
        
        // التحقق من الصلاحية
        const canDelete = type === 'expense'
            ? await canDeleteExpense(itemId, createdAt)
            : await canDeleteDriverPayment(itemId, createdAt);
        
        if (!canDelete) {
            const user = firebase.auth().currentUser;
            const userRole = await getUserRole(user.uid);
            
            if (userRole === 'accountant') {
                alert('عذراً، يمكن للمحاسب حذف العناصر فقط خلال 24 ساعة من تاريخ الإنشاء');
            } else {
                alert('عذراً، ليس لديك صلاحية حذف هذا العنصر');
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
async function updateDeleteButtonsVisibility() {
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
                    const itemId = match[1];
                    const type = onclick.includes('deleteDriverPayment') ? 'payment' : 'expense';
                    
                    // الحصول على تاريخ الإنشاء من البيانات
                    const collection = type === 'expense' ? 'expenses' : 'driverPayments';
                    const doc = await db.collection(collection).doc(itemId).get();
                    
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
window.canDeleteExpense = canDeleteExpense;
window.canDeleteDriverPayment = canDeleteDriverPayment;
window.renderDeleteButton = renderDeleteButton;
window.verifyDeletePermission = verifyDeletePermission;
window.updateDeleteButtonsVisibility = updateDeleteButtonsVisibility;


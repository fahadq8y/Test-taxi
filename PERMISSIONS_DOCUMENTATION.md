# توثيق نظام الصلاحيات - تطبيق إدارة سيارات الأجرة

## نظرة عامة

تم تطبيق نظام صلاحيات شامل في تطبيق إدارة سيارات الأجرة يتكامل مع Firebase Authentication ويحدد صلاحيات الحذف بناءً على دور المستخدم والوقت المنقضي منذ إنشاء العنصر.

## الأدوار والصلاحيات

### 1. المدير (Admin)
- **صلاحيات الحذف**: كاملة وغير محدودة
- **القيود الزمنية**: لا توجد
- **الوصف**: يمكن للمدير حذف أي عنصر في أي وقت بغض النظر عن تاريخ إنشائه

### 2. المحاسب (Accountant)
- **صلاحيات الحذف**: محدودة بفترة زمنية
- **القيود الزمنية**: يمكن الحذف فقط خلال 24 ساعة من تاريخ الإنشاء
- **الوصف**: يمكن للمحاسب حذف العناصر التي أُنشئت خلال آخر 24 ساعة فقط

### 3. السائق (Driver)
- **صلاحيات الحذف**: لا توجد
- **القيود الزمنية**: غير قابل للتطبيق
- **الوصف**: لا يمكن للسائق حذف أي عناصر

## الملفات المعدلة

### 1. ملفات النظام الأساسي

#### `user-permissions.js`
الملف الرئيسي لنظام الصلاحيات الذي يحتوي على:
- `getUserRole(userId)`: دالة غير متزامنة للحصول على دور المستخدم من Firebase
- `getUserRoleSync()`: دالة متزامنة للحصول على الدور من localStorage
- `canDeleteWithinTimeLimit(createdAt)`: التحقق من إمكانية الحذف خلال 24 ساعة
- `canDelete(itemDate)`: التحقق من صلاحية الحذف بناءً على الدور والوقت
- `isLoggedIn()`: التحقق من تسجيل الدخول
- `requireLogin()`: إعادة التوجيه لصفحة تسجيل الدخول إذا لزم الأمر

### 2. ملفات الصلاحيات الخاصة بالصفحات

#### `revenues-permissions.js`
نظام الصلاحيات لصفحة الإيرادات:
- `canDeleteRevenue(revenueId, createdAt)`: التحقق من صلاحية حذف إيراد
- `renderDeleteButton(revenueId, createdAt)`: إنشاء زر الحذف بناءً على الصلاحيات
- `verifyDeletePermission(revenueId)`: التحقق من الصلاحية قبل تنفيذ الحذف
- `updateDeleteButtonsVisibility()`: تحديث ظهور أزرار الحذف

#### `expenses-permissions.js`
نظام الصلاحيات لصفحة المصروفات:
- `canDeleteExpense(expenseId, createdAt)`: التحقق من صلاحية حذف مصروف
- `canDeleteDriverPayment(paymentId, createdAt)`: التحقق من صلاحية حذف دفعة سائق
- `renderDeleteButton(itemId, createdAt, type)`: إنشاء زر الحذف
- `verifyDeletePermission(itemId, type)`: التحقق من الصلاحية قبل الحذف
- `updateDeleteButtonsVisibility()`: تحديث ظهور أزرار الحذف

#### `driver-payments-permissions.js`
نظام الصلاحيات لصفحة دفعات السائقين:
- `canDeletePayment(paymentId, createdAt)`: التحقق من صلاحية حذف دفعة
- `renderPaymentDeleteButton(paymentId, createdAt)`: إنشاء زر الحذف
- `verifyPaymentDeletePermission(paymentId)`: التحقق من الصلاحية قبل الحذف
- `updatePaymentDeleteButtonsVisibility()`: تحديث ظهور أزرار الحذف

### 3. الصفحات المعدلة

#### `revenues.html`
- إضافة ملفات الصلاحيات (`user-permissions.js`, `revenues-permissions.js`)
- تحديث دالة `deleteRevenue()` لإضافة التحقق من الصلاحيات
- إضافة حقل `createdAt` عند حفظ الإيرادات الجديدة
- استدعاء `updateDeleteButtonsVisibility()` بعد عرض البيانات

#### `expenses.html`
- إضافة ملفات الصلاحيات (`user-permissions.js`, `expenses-permissions.js`)
- تحديث دالة `deleteExpense()` لإضافة التحقق من الصلاحيات
- تحديث دالة `deleteDriverPayment()` لإضافة التحقق من الصلاحيات
- إضافة حقل `createdAt` عند حفظ المصروفات الجديدة
- استدعاء `updateDeleteButtonsVisibility()` بعد عرض البيانات

#### `driver-payments.html`
- إضافة ملفات الصلاحيات (`user-permissions.js`, `driver-payments-permissions.js`)
- تحديث دالة `deletePayment()` لإضافة التحقق من الصلاحيات
- حقل `createdAt` موجود مسبقاً في الكود
- استدعاء `updatePaymentDeleteButtonsVisibility()` بعد عرض البيانات

## آلية العمل

### 1. عند تسجيل الدخول
1. يقوم المستخدم بإدخال بيانات الدخول في `index.html`
2. يتم التحقق من البيانات عبر Firebase Authentication
3. يتم جلب دور المستخدم من مجموعة `users` في Firestore
4. يتم حفظ الدور في `localStorage` للوصول السريع
5. يتم توجيه المستخدم إلى لوحة التحكم المناسبة

### 2. عند عرض البيانات
1. يتم تحميل البيانات من Firebase
2. يتم عرض البيانات في الجدول
3. يتم استدعاء دالة `updateDeleteButtonsVisibility()`
4. تقوم الدالة بالتحقق من دور المستخدم لكل عنصر
5. يتم إخفاء أزرار الحذف للعناصر التي لا يملك المستخدم صلاحية حذفها

### 3. عند محاولة الحذف
1. يضغط المستخدم على زر الحذف
2. يتم استدعاء دالة `verifyDeletePermission()`
3. تقوم الدالة بجلب بيانات العنصر من Firebase
4. يتم التحقق من دور المستخدم وتاريخ إنشاء العنصر
5. إذا كان المستخدم لا يملك الصلاحية، يتم عرض رسالة خطأ
6. إذا كان يملك الصلاحية، يتم عرض رسالة تأكيد
7. بعد التأكيد، يتم حذف العنصر من Firebase

## حقل createdAt

تم إضافة حقل `createdAt` إلى جميع العناصر الجديدة:
- **الإيرادات**: يتم إضافة `createdAt` عند حفظ إيراد جديد
- **المصروفات**: يتم إضافة `createdAt` عند حفظ مصروف جديد
- **دفعات السائقين**: حقل `createdAt` موجود مسبقاً

**ملاحظة**: العناصر القديمة التي لا تحتوي على حقل `createdAt` سيتم استخدام حقل `date` كبديل.

## رسائل الخطأ

### للمحاسب (Accountant)
عند محاولة حذف عنصر أقدم من 24 ساعة:
```
عذراً، يمكن للمحاسب حذف العناصر فقط خلال 24 ساعة من تاريخ الإنشاء
```

### للسائق (Driver)
عند محاولة الحذف:
```
عذراً، ليس لديك صلاحية حذف هذا العنصر
```

## الاختبار

تم إنشاء صفحة اختبار (`test-permissions.html`) للتحقق من عمل النظام:
1. افتح الصفحة في المتصفح
2. اختر دور المستخدم من القائمة المنسدلة
3. اضغط على "تشغيل الاختبارات"
4. سيتم عرض نتائج الاختبارات لجميع السيناريوهات

## التكامل مع Firebase

### مجموعة users
يجب أن تحتوي كل وثيقة مستخدم على:
```javascript
{
  name: "اسم المستخدم",
  email: "email@example.com",
  role: "admin" | "accountant" | "driver",
  isActive: true | false
}
```

### مجموعات البيانات
يجب أن تحتوي كل وثيقة على:
```javascript
{
  date: "2024-01-01",
  // ... باقي الحقول
  createdAt: firebase.firestore.FieldValue.serverTimestamp()
}
```

## الأمان

- جميع عمليات التحقق تتم على جانب العميل (Client-side)
- **يُنصح بشدة** بإضافة قواعد أمان Firebase (Security Rules) لتأمين البيانات على جانب الخادم
- يجب عدم الاعتماد فقط على التحقق من جانب العميل

### قواعد أمان Firebase المقترحة

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // دالة مساعدة للتحقق من الدور
    function getUserRole() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
    }
    
    // دالة للتحقق من إمكانية الحذف خلال 24 ساعة
    function canDeleteWithin24Hours(createdAt) {
      return request.time < createdAt + duration.value(24, 'h');
    }
    
    // قواعد الإيرادات
    match /revenues/{revenueId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && getUserRole() in ['admin', 'accountant'];
      allow delete: if request.auth != null && (
        getUserRole() == 'admin' ||
        (getUserRole() == 'accountant' && canDeleteWithin24Hours(resource.data.createdAt))
      );
    }
    
    // قواعد المصروفات
    match /expenses/{expenseId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && getUserRole() in ['admin', 'accountant'];
      allow delete: if request.auth != null && (
        getUserRole() == 'admin' ||
        (getUserRole() == 'accountant' && canDeleteWithin24Hours(resource.data.createdAt))
      );
    }
    
    // قواعد دفعات السائقين
    match /driverPayments/{paymentId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && getUserRole() in ['admin', 'accountant'];
      allow delete: if request.auth != null && (
        getUserRole() == 'admin' ||
        (getUserRole() == 'accountant' && canDeleteWithin24Hours(resource.data.createdAt))
      );
    }
  }
}
```

## الصيانة والتطوير المستقبلي

### إضافة صفحة جديدة
1. إنشاء ملف صلاحيات جديد (مثل `page-permissions.js`)
2. استيراد `user-permissions.js` في الصفحة
3. استيراد ملف الصلاحيات الخاص بالصفحة
4. تطبيق نفس النمط المستخدم في الصفحات الموجودة

### تعديل القيود الزمنية
لتغيير فترة الـ 24 ساعة إلى فترة أخرى:
1. افتح ملف `user-permissions.js`
2. ابحث عن دالة `canDeleteWithinTimeLimit`
3. غيّر القيمة `24` إلى الفترة المطلوبة بالساعات

### إضافة دور جديد
1. أضف الدور الجديد في `index.html` (نظام تسجيل الدخول)
2. حدّث دالة `canDelete` في `user-permissions.js`
3. حدّث جميع ملفات الصلاحيات الخاصة بالصفحات

## المشاكل المعروفة والحلول

### المشكلة: العناصر القديمة لا تحتوي على createdAt
**الحل**: يتم استخدام حقل `date` كبديل في الكود الحالي

### المشكلة: أزرار الحذف تظهر ثم تختفي
**الحل**: هذا سلوك طبيعي لأن التحقق من الصلاحيات يتم بشكل غير متزامن (async)

### المشكلة: المستخدم يمكنه الحذف من Console
**الحل**: يجب تطبيق قواعد أمان Firebase على جانب الخادم

## الدعم والمساعدة

للحصول على المساعدة أو الإبلاغ عن مشاكل:
1. راجع هذا التوثيق أولاً
2. تحقق من ملف `test-permissions.html` للاختبار
3. راجع console المتصفح للأخطاء
4. تحقق من قواعد أمان Firebase

## الإصدار

- **الإصدار**: 1.0.0
- **التاريخ**: 2024-10-11
- **المطور**: نظام Manus AI


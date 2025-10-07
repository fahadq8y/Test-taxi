# سجل التعديلات - نظام إدارة التاكسي

## 📅 التاريخ: 7 أكتوبر 2025

---

## ✅ التعديل الثالث: توحيد حساب الديون في جميع الصفحات

### 📋 الهدف
توحيد طريقة حساب ديون السائقين في الثلاث صفحات الرئيسية لضمان التناسق والدقة.

### 🎯 المشكلة
كانت كل صفحة تحسب الديون بطريقة مختلفة:
- **drivers-overview.html**: يحسب فقط من المدفوعات (مخالفات، إقامة، رواتب) بدون الأجرة اليومية المتأخرة
- **revenues.html**: يستخدم دالة من ملف آخر غير موجودة
- **balance-display.html**: يقرأ من حقل `totalDebt` في Firebase (قد يكون قديم)

### ✨ الحل
إنشاء دالة موحدة تحسب **جميع** أنواع الديون على السائق:

#### 1️⃣ الأجرة اليومية المتأخرة
```
الأجرة المتأخرة = (عدد الأيام × الأجرة اليومية) - إجمالي الأجرة المدفوعة
```

#### 2️⃣ المخالفات
- **دفع مخالفة** (الشركة دفعت عن السائق) → يزيد الدين
- **تحصيل مخالفة** (السائق دفع) → ينقص الدين

#### 3️⃣ رسوم الإقامة
- **دفع رسوم إقامة** (الشركة دفعت عن السائق) → يزيد الدين
- **تحصيل رسوم إقامة** (السائق دفع) → ينقص الدين

#### 4️⃣ رسوم الرواتب
- **دفع رسوم رواتب** (الشركة دفعت عن السائق) → يزيد الدين
- **تحصيل رسوم رواتب** (السائق دفع) → ينقص الدين

#### 5️⃣ الديون القديمة
- **دين قديم** (تحصيل من السائق) → ينقص الدين
- الديون القديمة المسجلة عند إضافة السائق → تضاف للدين

### 📝 الملفات المعدلة

#### 1. drivers-overview.html
**الموقع**: السطور 664-735

**التعديل**:
- استبدال دالة `calculateDriverDebt()` بالدالة الموحدة
- إضافة حساب الأجرة اليومية المتأخرة
- إضافة دعم لجميع أنواع المدفوعات

**الكود الجديد**:
```javascript
function calculateDriverDebt(driverId) {
    // البحث عن بيانات السائق
    const driver = allDrivers.find(d => d.id === driverId);
    if (!driver) return 0;
    
    // الحصول على جميع مدفوعات السائق
    const payments = driverPayments.filter(payment => payment.driverId === driverId);
    
    let totalDebt = 0;
    
    // 1. حساب الأجرة اليومية المتأخرة
    const today = new Date();
    const contractStart = driver.contractStartDate ? 
        (driver.contractStartDate.toDate ? driver.contractStartDate.toDate() : new Date(driver.contractStartDate)) :
        (driver.createdAt ? (driver.createdAt.toDate ? driver.createdAt.toDate() : new Date(driver.createdAt)) : today);
    
    const daysSinceStart = Math.floor((today - contractStart) / (1000 * 60 * 60 * 24));
    const dailyWage = parseFloat(driver.dailyWage || driver.dailyRent || 0);
    const expectedTotal = daysSinceStart * dailyWage;
    
    // حساب إجمالي الأجرة اليومية المدفوعة
    const dailyRentPayments = payments.filter(p => p.type === 'أجرة يومية');
    const totalDailyRentPaid = dailyRentPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // الأجرة المتأخرة = المتوقع - المدفوع
    const lateRent = Math.max(0, expectedTotal - totalDailyRentPaid);
    totalDebt += lateRent;
    
    // 2. حساب الديون من المدفوعات الأخرى
    payments.forEach(payment => {
        const amount = parseFloat(payment.amount || 0);
        
        switch(payment.type) {
            // العمليات التي تزيد الدين (الشركة دفعت عن السائق)
            case 'دفع مخالفة':
            case 'دفع رسوم إقامة':
            case 'دفع رسوم رواتب':
                totalDebt += amount;
                break;
            
            // العمليات التي تنقص الدين (السائق دفع)
            case 'تحصيل مخالفة':
            case 'تحصيل رسوم إقامة':
            case 'تحصيل رسوم رواتب':
                totalDebt -= amount;
                break;
            
            // الديون القديمة (تنقص الدين عند التحصيل)
            case 'دين قديم':
                totalDebt -= amount;
                break;
            
            // الأجرة اليومية تم حسابها أعلاه
            case 'أجرة يومية':
                // لا نفعل شيء هنا لأنها محسوبة في lateRent
                break;
            
            // دفع الرواتب لا يؤثر على دين السائق
            case 'دفع رواتب':
                // لا يؤثر على دين السائق
                break;
        }
    });
    
    // 3. إضافة الديون القديمة المسجلة عند إضافة السائق
    const oldDebts = parseFloat(driver.oldDebts || 0);
    totalDebt += oldDebts;
    
    // الدين لا يمكن أن يكون سالب
    return Math.max(0, totalDebt);
}
```

---

#### 2. revenues.html
**الموقع**: السطور 1196-1264

**التعديل**:
- إضافة الدالة الموحدة `calculateDriverDebt()`
- تحديث استدعاء الدالة في `showDriverDebts()`

**الكود الجديد**:
```javascript
// الدالة الموحدة لحساب ديون السائقين
function calculateDriverDebt(driverId, payments) {
    // نفس الكود من drivers-overview.html
    // ...
}

// Show driver debts modal
function showDriverDebts() {
    // ...
    drivers.forEach(driver => {
        const payments = driverPayments.filter(p => p.driverId === driver.id);
        const debt = calculateDriverDebt(driver.id, payments);
        // ...
    });
}
```

---

#### 3. balance-display.html
**الموقع**: السطور 419-551

**التعديل**:
- إضافة الدالة الموحدة `calculateDriverDebt()`
- تحديث `calculateDriversDebtBalance()` لاستخدام الدالة الموحدة
- تحديث `showDriversDebt()` لحساب الديون ديناميكياً

**الكود الجديد**:
```javascript
// الدالة الموحدة لحساب ديون السائقين
function calculateDriverDebt(driverId, driver, payments) {
    // نفس الكود من drivers-overview.html
    // ...
}

async function calculateDriversDebtBalance() {
    let totalDebt = 0;

    // Get all drivers and payments
    const driversSnapshot = await db.collection('drivers').get();
    const paymentsSnapshot = await db.collection('payments').get();
    
    const allPayments = [];
    paymentsSnapshot.forEach(doc => {
        allPayments.push({ id: doc.id, ...doc.data() });
    });

    driversSnapshot.forEach(doc => {
        const driver = { id: doc.id, ...doc.data() };
        const driverPayments = allPayments.filter(p => p.driverId === driver.id);
        const debt = calculateDriverDebt(driver.id, driver, driverPayments);
        totalDebt += debt;
    });

    return totalDebt;
}

async function showDriversDebt() {
    // ...
    // Get all drivers and payments
    const driversSnapshot = await db.collection('drivers').get();
    const paymentsSnapshot = await db.collection('payments').get();
    
    const allPayments = [];
    paymentsSnapshot.forEach(doc => {
        allPayments.push({ id: doc.id, ...doc.data() });
    });
    
    driversSnapshot.forEach(doc => {
        const driver = { id: doc.id, ...doc.data() };
        const driverPayments = allPayments.filter(p => p.driverId === driver.id);
        const totalDebt = calculateDriverDebt(driver.id, driver, driverPayments);
        // ...
    });
}
```

---

### 📊 الإحصائيات

- **الملفات المعدلة**: 3 ملفات
- **الأسطر المضافة**: ~210 سطر
- **الأسطر المحذوفة**: ~30 سطر
- **الدوال المعدلة**: 5 دوال

---

### ✅ الفوائد

#### 1️⃣ التناسق
- جميع الصفحات تعرض نفس الرقم للديون
- لا يوجد اختلاف بين الصفحات

#### 2️⃣ الدقة
- حساب شامل لجميع أنواع الديون
- يشمل الأجرة اليومية المتأخرة
- يشمل المخالفات ورسوم الإقامة والرواتب

#### 3️⃣ الشفافية
- الحساب واضح ومفهوم
- سهل التتبع والمراجعة

#### 4️⃣ المرونة
- سهل التعديل والتطوير
- إضافة أنواع جديدة من الديون سهلة

---

### 🎯 المعادلة النهائية

```
إجمالي الدين = الأجرة المتأخرة 
              + (دفع مخالفة + دفع رسوم إقامة + دفع رسوم رواتب)
              - (تحصيل مخالفة + تحصيل رسوم إقامة + تحصيل رسوم رواتب + دين قديم)
              + الديون القديمة المسجلة

حيث:
الأجرة المتأخرة = (عدد الأيام × الأجرة اليومية) - إجمالي الأجرة المدفوعة
```

---

### 🔍 مثال توضيحي

**سائق: أحمد محمد**

**البيانات**:
- بداية العقد: 1 يناير 2025
- اليوم: 7 أكتوبر 2025 (280 يوم)
- الأجرة اليومية: 10 د.ك

**المدفوعات**:
1. أجرة يومية: 2000 د.ك
2. دفع مخالفة: 50 د.ك (الشركة دفعت)
3. تحصيل مخالفة: 30 د.ك (السائق دفع)
4. دفع رسوم إقامة: 100 د.ك (الشركة دفعت)
5. تحصيل رسوم إقامة: 80 د.ك (السائق دفع)

**الحساب**:
```
الأجرة المتوقعة = 280 × 10 = 2800 د.ك
الأجرة المدفوعة = 2000 د.ك
الأجرة المتأخرة = 2800 - 2000 = 800 د.ك

الديون الأخرى = (50 + 100) - (30 + 80) = 40 د.ك

إجمالي الدين = 800 + 40 = 840 د.ك
```

---

### 🛡️ النسخ الاحتياطية

تم إنشاء نسخ احتياطية:
- ✅ `drivers-overview.html.backup3`
- ✅ `revenues.html.backup`
- ✅ `balance-display.html.backup2`

---

## ✅ التعديل الثاني: تحويل التواريخ إلى ميلادي وتحذير السيارات المخصصة

### 📋 الهدف
1. تحويل جميع التواريخ إلى ميلادي فقط
2. إضافة تحذير للسيارات المخصصة لسائقين آخرين

### 📝 الملفات المعدلة

#### 1. balance-display.html
**السطر**: 351  
**التعديل**: `ar-SA` → `en-GB`

#### 2. cars.html
**السطور**: 624-625  
**التعديل**: `ar-SA` → `en-GB`

#### 3. drivers-overview.html
**الوظيفة**: `loadCarsForModal()`  
**السطور**: 1454-1498  
**التعديل**: إضافة تحذير للسيارات المخصصة

#### 4. drivers.html
**الوظيفة**: `populateCarOptions()`  
**السطور**: 647-675  
**التعديل**: إضافة تحذير للسيارات المخصصة

### 📊 الإحصائيات
- **الملفات المعدلة**: 5 ملفات
- **الأسطر المضافة**: 268 سطر
- **الأسطر المحذوفة**: 9 أسطر
- **Commit ID**: `c554874`

---

## ✅ التعديل الأول: إضافة نموذج إضافة سائق في جدول السائقين

### 📋 الهدف
إضافة نموذج منبثق لإضافة سائق جديد في صفحة جدول السائقين

### 📝 الملفات المعدلة

#### drivers-overview.html
**التعديلات**:
1. إضافة أنماط CSS للنموذج المنبثق
2. إضافة HTML للنموذج المنبثق
3. إضافة وظائف JavaScript
4. تغيير زر "إضافة سائق" من رابط إلى زر

### 📊 الإحصائيات
- **الأسطر المضافة**: 627 سطر
- **الأسطر المحذوفة**: 1 سطر
- **Commit ID**: `693e401`

---

## 📌 ملاحظات عامة

### ✅ تم الحفاظ على:
- استقرار الكود الأساسي
- التوافق مع Firebase
- التصميم الموحد
- الأمان والصلاحيات

### ✅ تم اختبار:
- حساب الديون في الثلاث صفحات
- عرض التواريخ بالميلادي
- تحذير السيارات المخصصة
- إضافة سائق جديد

---

**آخر تحديث**: 7 أكتوبر 2025  
**المطور**: Manus AI Assistant

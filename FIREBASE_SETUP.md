# إعداد Firebase لنظام إدارة التاكسي

## خطوات الإعداد

### 1. إنشاء مشروع Firebase

1. اذهب إلى [Firebase Console](https://console.firebase.google.com/)
2. انقر على "إضافة مشروع" (Add project)
3. أدخل اسم المشروع: `taxi-management-system`
4. اختر الإعدادات المناسبة واكمل الإنشاء

### 2. إعداد Firestore Database

1. في لوحة تحكم Firebase، اذهب إلى "Firestore Database"
2. انقر على "إنشاء قاعدة بيانات" (Create database)
3. اختر "Start in test mode" للبداية
4. اختر المنطقة الجغرافية المناسبة

### 3. إعداد Authentication

1. اذهب إلى "Authentication"
2. انقر على "البدء" (Get started)
3. في تبويب "Sign-in method"
4. فعّل "Email/Password"

### 4. إضافة تطبيق ويب

1. في إعدادات المشروع، انقر على أيقونة الويب `</>`
2. أدخل اسم التطبيق: `Taxi Management`
3. انسخ بيانات التكوين

### 5. تحديث بيانات التكوين

استبدل البيانات التالية في جميع ملفات HTML:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_ACTUAL_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_ACTUAL_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_ACTUAL_SENDER_ID",
    appId: "YOUR_ACTUAL_APP_ID"
};
```

### 6. إعداد قواعد الأمان

في Firestore Database > Rules، استبدل القواعد بالتالي:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // المستخدمون
    match /users/{userId} {
      allow read, write: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // السائقون
    match /drivers/{driverId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'accountant'];
    }
    
    // السيارات
    match /cars/{carId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'accountant'];
    }
    
    // الإيرادات والمصروفات
    match /{collection}/{docId} {
      allow read: if request.auth != null && collection in ['revenues', 'expenses'];
      allow create: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'accountant'] &&
        collection in ['revenues', 'expenses'];
      allow update, delete: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin' &&
        collection in ['revenues', 'expenses'];
    }
    
    // الإشعارات
    match /notifications/{notificationId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'accountant'];
    }
    
    // العقود
    match /contracts/{contractId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'accountant'];
    }
    
    // التقارير
    match /reports/{reportId} {
      allow read, write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'accountant'];
    }
  }
}
```

### 7. إنشاء المستخدمين الأوليين

استخدم Firebase Console لإنشاء المستخدمين:

#### المدير:
```
Email: admin@taxicompany.com
Password: Admin123!
```

#### المحاسب:
```
Email: accountant@taxicompany.com  
Password: Account123!
```

### 8. إضافة بيانات المستخدمين في Firestore

في Firestore، أنشئ مجموعة `users` وأضف المستندات التالية:

#### مستند المدير:
```json
{
  "email": "admin@taxicompany.com",
  "name": "مدير الشركة",
  "phone": "+965XXXXXXXX",
  "role": "admin",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

#### مستند المحاسب:
```json
{
  "email": "accountant@taxicompany.com",
  "name": "المحاسب",
  "phone": "+965XXXXXXXX", 
  "role": "accountant",
  "isActive": true,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 9. إعداد الفهارس

في Firestore > Indexes، أضف الفهارس التالية:

#### فهرس السائقين:
- Collection: `drivers`
- Fields: `contractStatus` (Ascending), `createdAt` (Descending)

#### فهرس الإيرادات:
- Collection: `revenues`  
- Fields: `driverId` (Ascending), `date` (Descending)

#### فهرس المصروفات:
- Collection: `expenses`
- Fields: `type` (Ascending), `date` (Descending)

#### فهرس الإشعارات:
- Collection: `notifications`
- Fields: `recipientId` (Ascending), `isRead` (Ascending), `createdAt` (Descending)

### 10. اختبار النظام

1. ارفع الملفات على خادم ويب
2. سجل دخول بحساب المدير
3. أضف سائق تجريبي
4. أضف سيارة تجريبية
5. سجل إيراد تجريبي
6. تأكد من عمل جميع الوظائف

### 11. نشر التطبيق

يمكن نشر التطبيق على:
- Firebase Hosting
- Netlify
- Vercel
- أي خادم ويب يدعم HTML/CSS/JS

### ملاحظات مهمة:

1. **الأمان**: تأكد من تطبيق قواعد الأمان بشكل صحيح
2. **النسخ الاحتياطي**: فعّل النسخ الاحتياطي التلقائي في Firebase
3. **المراقبة**: راقب استخدام قاعدة البيانات والتكاليف
4. **التحديثات**: احتفظ بنسخة من الكود للتحديثات المستقبلية

### الدعم الفني:

في حالة وجود مشاكل:
1. تحقق من إعدادات Firebase
2. راجع قواعد الأمان
3. تأكد من صحة بيانات التكوين
4. استخدم أدوات المطور في المتصفح لتتبع الأخطاء


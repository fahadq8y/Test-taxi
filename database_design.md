# تصميم قاعدة البيانات - نظام إدارة شركة التاكسي

## هيكل قاعدة البيانات Firebase Firestore

### 1. مجموعة المستخدمين (users)
```
users/{userId}
{
  email: string,
  password: string (مشفر),
  role: string, // "admin", "accountant", "driver"
  name: string,
  phone: string,
  isActive: boolean,
  createdAt: timestamp,
  lastLogin: timestamp
}
```

### 2. مجموعة السائقين (drivers)
```
drivers/{driverId}
{
  // بيانات أساسية
  name: string,
  phone: string,
  nationalId: string,
  
  // بيانات السداد
  lastPaymentDate: date,
  paymentDueDate: date,
  delayDays: number,
  delayAmount: number,
  partialPaymentDifference: number,
  
  // المصاريف والديون
  trafficViolations: number,
  residenceExpenses: number,
  oldDebts: {
    amount: number,
    note: string
  },
  totalVariables: number,
  
  // تواريخ انتهاء الوثائق
  carRegistrationExpiry: date,
  residenceExpiry: date,
  licenseExpiry: date,
  permitExpiry: date,
  passportExpiry: date,
  
  // مزايا السائق
  salaryDeposit: number, // 30 دينار
  annualLeave: number, // 30 يوم
  
  // معلومات الصيانة
  lastOilChangeDate: date,
  currentKilometers: number,
  
  // معلومات السيارة المؤجرة
  assignedCarId: string,
  contractStartDate: date,
  contractEndDate: date,
  dailyRent: number,
  contractStatus: string, // "active", "expired", "cancelled"
  
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 3. مجموعة السيارات (cars)
```
cars/{carId}
{
  plateNumber: string,
  brand: string,
  model: string,
  year: number,
  purchasePrice: number,
  purchaseDate: date,
  status: string, // "available", "rented", "maintenance"
  currentDriverId: string,
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### 4. مجموعة الإيرادات (revenues)
```
revenues/{revenueId}
{
  driverId: string,
  amount: number,
  date: date,
  paymentMethod: string, // "cash", "link"
  collectedBy: string, // userId of accountant
  notes: string,
  createdAt: timestamp,
  createdBy: string
}
```

### 5. مجموعة المصروفات (expenses)
```
expenses/{expenseId}
{
  type: string, // "rent", "salaries", "salary_deposits", "buffet", "cleaning", "car_purchase", "meter_purchase", "meter_installation", "car_painting", "car_maintenance", "administrative", "other"
  amount: number,
  date: date,
  description: string,
  notes: string,
  createdAt: timestamp,
  createdBy: string
}
```

### 6. مجموعة الإشعارات (notifications)
```
notifications/{notificationId}
{
  recipientId: string, // driverId
  senderId: string, // userId
  senderName: string,
  title: string,
  message: string,
  type: string, // "custom", "document_expiry", "oil_change", "payment_due"
  isRead: boolean,
  createdAt: timestamp
}
```

### 7. مجموعة العقود (contracts)
```
contracts/{contractId}
{
  driverId: string,
  carId: string,
  startDate: date,
  endDate: date,
  dailyRent: number,
  duration: number, // بالسنوات
  status: string, // "active", "expired", "cancelled"
  createdAt: timestamp,
  createdBy: string
}
```

### 8. مجموعة التقارير (reports)
```
reports/{reportId}
{
  type: string, // "revenue", "expense", "driver", "alerts"
  dateFrom: date,
  dateTo: date,
  data: object,
  generatedBy: string,
  createdAt: timestamp
}
```

## فهارس قاعدة البيانات المطلوبة

### فهارس مركبة:
1. `drivers`: `contractStatus`, `createdAt`
2. `revenues`: `driverId`, `date`
3. `expenses`: `type`, `date`
4. `notifications`: `recipientId`, `isRead`, `createdAt`
5. `contracts`: `driverId`, `status`

## قواعد الأمان Firebase Security Rules

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
  }
}
```


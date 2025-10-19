// Script to mark restored records in archivedDrivers collection
// This adds isRestored: true to all records that have restoredAt field

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (using Application Default Credentials in Cloud environment)
// For local testing, you would need to provide service account credentials
const admin = require('firebase-admin');

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyB8Q9CYIWXPmTdiz3vPiLlPYFxiJu0vE_g",
    authDomain: "taxi-management-system-d8210.firebaseapp.com",
    projectId: "taxi-management-system-d8210",
    storageBucket: "taxi-management-system-d8210.firebasestorage.app",
    messagingSenderId: "1041883775933",
    appId: "1:1041883775933:web:c4b8a3f8e5c72b9e0a8f5e"
};

// Initialize app
admin.initializeApp({
    projectId: firebaseConfig.projectId
});

const db = getFirestore();

async function markRestoredRecords() {
    try {
        console.log('🔍 جاري البحث عن السجلات المستعادة...');
        
        // Get all archived drivers
        const archivedDriversRef = db.collection('archivedDrivers');
        const snapshot = await archivedDriversRef.get();
        
        console.log(`📊 إجمالي السجلات في الأرشيف: ${snapshot.size}`);
        
        let updatedCount = 0;
        let skippedCount = 0;
        
        // Process each document
        const batch = db.batch();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            
            // Check if record has restoredAt field but not isRestored
            if (data.restoredAt && !data.isRestored) {
                console.log(`✏️ تحديث السجل: ${doc.id} (${data.name || 'بدون اسم'})`);
                batch.update(doc.ref, { isRestored: true });
                updatedCount++;
            } else if (data.isRestored) {
                console.log(`⏭️ تخطي السجل (محدث مسبقاً): ${doc.id}`);
                skippedCount++;
            } else {
                console.log(`✅ سجل نشط: ${doc.id} (${data.name || 'بدون اسم'})`);
                skippedCount++;
            }
        });
        
        // Commit the batch
        if (updatedCount > 0) {
            await batch.commit();
            console.log(`\n✅ تم تحديث ${updatedCount} سجل بنجاح!`);
        } else {
            console.log('\n✅ لا توجد سجلات تحتاج للتحديث.');
        }
        
        console.log(`📊 إحصائيات:`);
        console.log(`   - محدثة: ${updatedCount}`);
        console.log(`   - متخطاة: ${skippedCount}`);
        console.log(`   - الإجمالي: ${snapshot.size}`);
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        process.exit(1);
    }
}

// Run the script
markRestoredRecords()
    .then(() => {
        console.log('\n🎉 انتهت العملية بنجاح!');
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ فشلت العملية:', error);
        process.exit(1);
    });


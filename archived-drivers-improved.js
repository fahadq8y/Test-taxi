// Improved restoreDriver function with Rollback and Verification

window.restoreDriver = async (archiveId) => {
    if (!confirm('هل أنت متأكد من استعادة هذا السائق?\nسيتم نقله من الأرشيف إلى قائمة السائقين النشطين.')) {
        return;
    }

    try {
        const archivedDriver = archivedDrivers.find(d => d.id === archiveId);
        if (!archivedDriver) {
            alert('لم يتم العثور على السائق');
            return;
        }

        // Check if driver already exists in active drivers
        const activeDriversSnapshot = await getDocs(
            query(collection(db, 'drivers'), where('phone', '==', archivedDriver.phone))
        );
        
        if (!activeDriversSnapshot.empty) {
            alert('⚠️ تنبيه: يوجد سائق نشط بنفس رقم الهاتف!\nلا يمكن استعادة السائق.');
            return;
        }

        // Create a copy in drivers collection (without archive fields)
        const restoreData = { ...archivedDriver };
        delete restoreData.id;
        delete restoreData.isArchived;
        delete restoreData.archivedAt;
        delete restoreData.archivedBy;
        delete restoreData.archiveReason;
        
        restoreData.restoredAt = new Date();
        restoreData.restoredBy = currentUser.name || currentUser.email;
        restoreData.updatedAt = new Date();
        restoreData.updatedBy = currentUser.name || currentUser.email;

        // Step 1: Add to drivers collection — 🔧 FIX #014 (2026-05-06)
          // استخدم setDoc بنفس الـ archiveId عشان دفعات driverPayments تبقى مرتبطة
          console.log('📝 الخطوة 1: إضافة السائق بنفس الـ ID:', archiveId);
          let newDriverRef;
          try {
              const existingDoc = await getDoc(doc(db, 'drivers', archiveId));
              if (existingDoc.exists()) {
                  throw new Error('سائق بنفس الـ ID موجود مسبقاً في drivers — يمنع الكتابة فوقه');
              }
              await setDoc(doc(db, 'drivers', archiveId), restoreData);
              newDriverRef = { id: archiveId };
              console.log('✅ تم إضافة السائق بنفس الـ ID:', archiveId);
          } catch (addError) {
              console.error('❌ فشل في إضافة السائق:', addError);
              throw new Error('فشل في إضافة السائق إلى القائمة النشطة: ' + addError.message);
          }
        
        // Step 2: Delete from archived collection
        console.log('🗑️ الخطوة 2: حذف السائق من archivedDrivers collection...');
        try {
            await deleteDoc(doc(db, 'archivedDrivers', archiveId));
            console.log('✅ تم حذف السائق من الأرشيف بنجاح');
            
            // Verify deletion
            console.log('🔍 التحقق من الحذف...');
            const verifyDoc = await getDoc(doc(db, 'archivedDrivers', archiveId));
            if (verifyDoc.exists()) {
                console.error('❌ فشل التحقق: السجل ما زال موجوداً!');
                throw new Error('فشل حذف السائق من الأرشيف - السجل ما زال موجوداً');
            }
            console.log('✅ تم التحقق: السجل تم حذفه بنجاح');
            
        } catch (deleteError) {
            console.error('❌ فشل في حذف السائق من الأرشيف:', deleteError);
            console.error('❌ كود الخطأ:', deleteError.code);
            console.error('❌ رسالة الخطأ:', deleteError.message);
            
            // Rollback: Delete the driver we just added
            console.log('🔄 تنفيذ Rollback: حذف السائق من drivers...');
            try {
                await deleteDoc(doc(db, 'drivers', newDriverRef.id));
                console.log('✅ تم التراجع بنجاح');
            } catch (rollbackError) {
                console.error('❌ فشل التراجع:', rollbackError);
                alert('⚠️ خطأ خطير: تم إضافة السائق لكن فشل حذفه من الأرشيف وفشل التراجع!\n' +
                      'السائق موجود الآن في المكانين!\n\n' +
                      'يرجى حذف السجل يدوياً من Firebase Console:\n' +
                      'drivers/' + newDriverRef.id + '\n' +
                      'archivedDrivers/' + archiveId);
                throw rollbackError;
            }
            
            // Show error to user
            alert('❌ فشلت عملية الاستعادة\n\n' +
                  'السبب: ' + deleteError.message + '\n\n' +
                  'تم التراجع عن العملية.');
            throw deleteError;
        }
        
        // Reload archived drivers to update the display
        console.log('🔄 تحديث قائمة الأرشيف...');
        await loadArchivedDrivers();
        displayArchivedDrivers(archivedDrivers);
        console.log('✅ تم تحديث العرض');
        
        alert('✅ تم استعادة السائق بنجاح\n\n' +
              'تم نقله من الأرشيف إلى قائمة السائقين النشطين.');
    } catch (error) {
        console.error('❌ خطأ في استعادة السائق:', error);
        console.error('❌ نوع الخطأ:', error.name);
        console.error('❌ رسالة الخطأ:', error.message);
        console.error('❌ Stack:', error.stack);
        
        let errorMessage = 'حدث خطأ في استعادة السائق';
        
        // تحديد نوع الخطأ
        if (error.code === 'permission-denied') {
            errorMessage = '❌ خطأ في الصلاحيات: ليس لديك صلاحية لحذف من الأرشيف';
        } else if (error.message.includes('not found')) {
            errorMessage = '❌ السائق غير موجود في الأرشيف';
        } else if (!error.message.includes('فشلت عملية الاستعادة')) {
            // Only show this if we haven't already shown an error
            errorMessage = `❌ حدث خطأ: ${error.message}`;
            alert(errorMessage + '\n\n' +
                  'تفاصيل الخطأ في Console (اضغط F12)');
        }
    }
};


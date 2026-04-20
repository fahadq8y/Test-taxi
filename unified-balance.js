// دالة موحدة لحساب الأرصدة في جميع الصفحات حسب النظام المحاسبي الجديد
function calculateUnifiedBalances(revenues, expenses, driverPayments, drivers) {
    console.log('🔄 بدء حساب الأرصدة الموحدة...');
    console.log('📊 البيانات:', {
        revenues: revenues?.length || 0,
        expenses: expenses?.length || 0,
        driverPayments: driverPayments?.length || 0,
        drivers: drivers?.length || 0
    });
    
    let bankBalance = 0;
    let warbaBalance = 0;
    let salaryBalance = 0;
    let totalDriverDebts = 0;
    let totalRevenues = 0;
    let totalExpenses = 0;

    // حساب الإيرادات العادية
    if (revenues && revenues.length > 0) {
        revenues.forEach(revenue => {
            const amount = parseFloat(revenue.amount || 0);
            
            if (revenue.type === 'تحويل من حساب رامي إلى بنك وربه') {
                // تحويل من حساب رامي إلى بنك وربه (لا يحتسب في إجمالي الإيرادات)
                bankBalance -= amount;  // خصم من حساب رامي
                warbaBalance += amount; // إضافة إلى بنك وربه
            } else {
                // إيرادات عادية تضاف إلى حساب رامي وإجمالي الإيرادات
                totalRevenues += amount;
                bankBalance += amount;
            }
        });
    }

    // حساب المصروفات العادية
    if (expenses && expenses.length > 0) {
        expenses.forEach(expense => {
            const amount = parseFloat(expense.amount || 0);
            
            if (expense.type === 'تحويل من بنك وربه إلى حساب رامي') {
                // تحويل من بنك وربه إلى حساب رامي (لا يحتسب في إجمالي المصروفات)
                warbaBalance -= amount; // خصم من بنك وربه
                bankBalance += amount;  // إضافة إلى حساب رامي
            } else if (expense.type === 'سحب فهد') {
                // سحب فهد من بنك وربه فقط (يحتسب في إجمالي المصروفات)
                totalExpenses += amount;
                warbaBalance -= amount;
            } else if (expense.type === 'مصاريف إيداعات الرواتب') {
                // مصاريف إيداعات الرواتب تخصم من الرصيد البنكي ورصيد الرواتب
                totalExpenses += amount;
                bankBalance -= amount;
                salaryBalance -= amount;
            } else {
                // مصروفات عادية تخصم من حساب رامي وتحتسب في إجمالي المصروفات
                totalExpenses += amount;
                bankBalance -= amount;
            }
        });
    }

    // حساب المصروفات من دفعات السائقين (سداد مخالفة، سداد رسوم إقامة)
    if (driverPayments && driverPayments.length > 0) {
        driverPayments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0;
            
            // المصروفات التي يجب احتسابها في إجمالي المصروفات
            if (payment.type === 'سداد مخالفة' || payment.type === 'سداد رسوم إقامة' || payment.type === 'سلفة إلى السائق') {
                totalExpenses += amount;
            }
            // الإيرادات من دفعات السائقين التي تُحتسب في إجمالي الإيرادات
            if (payment.type === 'تحصيل سلفة من السائق') {
                totalRevenues += amount;
            }
        });
    }

    // حساب دفعات السائقين حسب النظام المحاسبي الجديد
    if (driverPayments && driverPayments.length > 0) {
        driverPayments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0;
            
            switch(payment.type) {
                // دفعات تزيد الرصيد البنكي (تحصيل من السائق)
                case 'أجرة يومية':
                case 'أجرة شهرية':
                case 'تحصيل مخالفة':
                case 'تحصيل رسوم إقامة':
                case 'دين قديم':
                    bankBalance += amount;
                    break;
                
                // إجازة سنوية: تضاف كإيراد وتُخصم كمصروف = صافي صفر على رصيد رامي
                case 'إجازة سنوية':
                    // لا تؤثر على رصيد رامي (إيراد ومصروف بنفس القيمة يلغيان بعضهما)
                    break;
                
                // دفعات تنقص الرصيد البنكي (الشركة تدفع)
                case 'سداد مخالفة':
                case 'سداد رسوم إقامة':
                    bankBalance -= amount;
                    break;
                
                // سلفة إلى السائق: تنقص حساب رامي
                case 'سلفة إلى السائق':
                    bankBalance -= amount;
                    break;
                
                // تحصيل سلفة من السائق: تزيد حساب رامي
                case 'تحصيل سلفة من السائق':
                    bankBalance += amount;
                    break;
                
                // رسوم الرواتب (نظام منفصل)
                case 'تحصيل رسوم رواتب':
                case 'تحصيل رسوم إيداعات الرواتب':
                    // تضاف للرصيد البنكي ورصيد الرواتب
                    bankBalance += amount;
                    salaryBalance += amount;
                    break;
                case 'سداد رواتب':
                    salaryBalance -= amount;
                    break;
            }
        });
    }

    // حساب ديون السائقين حسب النظام الجديد
    if (drivers && drivers.length > 0) {
        drivers.forEach(driver => {
            try {
                const driverDebts = calculateDriverDebt(driver.id, driver, driverPayments);
                totalDriverDebts += driverDebts;
            } catch (error) {
                console.error('خطأ في حساب دين السائق:', driver.name || driver.id, error);
                // نتجاهل هذا السائق ونكمل مع الباقي
            }
        });
    }

    console.log('✅ انتهى حساب الأرصدة:', {
        bankBalance: bankBalance.toFixed(3),
        warbaBalance: warbaBalance.toFixed(3),
        salaryBalance: salaryBalance.toFixed(3),
        totalDriverDebts: totalDriverDebts.toFixed(3),
        totalRevenues: totalRevenues.toFixed(3),
        totalExpenses: totalExpenses.toFixed(3)
    });
    
    return {
        bankBalance: bankBalance,
        warbaBalance: warbaBalance,
        salaryBalance: salaryBalance,
        totalDriverDebts: totalDriverDebts,
        totalRevenues: totalRevenues,
        totalExpenses: totalExpenses
    };
}

// دالة موحدة لحساب ديون السائق حسب النظام المحاسبي الجديد
// #004: إصلاح دعم العقود الشهرية
// #005: إضافة دعم contractHistory لحساب كل فترة بعقدها
// #006: Fallback للسائقين القدامى بدون contractHistory
function calculateDriverDebt(driverId, driver, driverPayments) {
    let totalDebt = 0;
    
    // الحصول على مدفوعات السائق
    const payments = driverPayments ? driverPayments.filter(payment => payment.driverId === driverId) : [];
    
    const today = new Date();
    let expectedRentTotal = 0;
    
    // #005: إذا كان لدى السائق contractHistory، نحسب كل فترة بعقدها
    if (driver.contractHistory && driver.contractHistory.length > 0) {
        driver.contractHistory.forEach((contract, index) => {
            // #009: تجاهل سجلات التعديل - تُحسب فقط سجلات "عقد جديد" و"عقد أولي"
            if (contract.note === 'تعديل عقد' || contract.type === 'تعديل') return;
            
            const periodStart = contract.startDate ?
                (contract.startDate.toDate ? contract.startDate.toDate() : new Date(contract.startDate)) : null;
            
            if (!periodStart) return;
            
            // نهاية الفترة: إذا كان هناك عقد تالٍ، نستخدم تاريخ بداية العقد التالي
            // إذا كان العقد الأخير (النشط)، نستخدم اليوم
            let periodEnd;
            if (index < driver.contractHistory.length - 1) {
                // ليس العقد الأخير - نهايته هي بداية العقد التالي
                const nextContract = driver.contractHistory[index + 1];
                periodEnd = nextContract.startDate ?
                    (nextContract.startDate.toDate ? nextContract.startDate.toDate() : new Date(nextContract.startDate)) : today;
            } else {
                // العقد الأخير (النشط) - نهايته اليوم
                periodEnd = today;
            }
            
            // لا نحسب ما بعد اليوم
            if (periodStart > today) return;
            if (periodEnd > today) periodEnd = today;
            
            if (contract.contractType === 'daily') {
                // عقد يومي: عدد الأيام × الأجرة اليومية
                const days = Math.floor((periodEnd - periodStart) / (1000 * 60 * 60 * 24));
                const rate = parseFloat(contract.dailyRent || 0);
                expectedRentTotal += days * rate;
            } else if (contract.contractType === 'monthly') {
                // عقد شهري: عدد الأشهر الكاملة × المبلغ الشهري
                const rate = parseFloat(contract.monthlyPayment || 0);
                const startYear = periodStart.getFullYear();
                const startMonth = periodStart.getMonth();
                const endYear = periodEnd.getFullYear();
                const endMonth = periodEnd.getMonth();
                const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
                expectedRentTotal += monthsDiff * rate;
            }
        });
    } else {
        // #006: Fallback للسائقين القدامى بدون contractHistory
        const contractStart = driver.contractStartDate ?
            (driver.contractStartDate.toDate ? driver.contractStartDate.toDate() : new Date(driver.contractStartDate)) :
            (driver.createdAt ? (driver.createdAt.toDate ? driver.createdAt.toDate() : new Date(driver.createdAt)) : today);
        
        const contractType = driver.contractType || 'daily';
        
        if (contractType === 'monthly') {
            // #004: إصلاح حساب العقود الشهرية
            const rate = parseFloat(driver.monthlyPayment || 0);
            const startYear = contractStart.getFullYear();
            const startMonth = contractStart.getMonth();
            const endYear = today.getFullYear();
            const endMonth = today.getMonth();
            const monthsDiff = (endYear - startYear) * 12 + (endMonth - startMonth);
            expectedRentTotal = monthsDiff * rate;
        } else {
            // عقد يومي (الطريقة القديمة)
            const daysSinceStart = Math.floor((today - contractStart) / (1000 * 60 * 60 * 24));
            const dailyWage = parseFloat(driver.dailyWage || driver.dailyRent || 0);
            expectedRentTotal = daysSinceStart * dailyWage;
        }
    }
    
    // حساب إجمالي الأجرة المدفوعة (يومية أو شهرية)
    const rentPayments = payments.filter(p => p.type === 'أجرة يومية' || p.type === 'أجرة شهرية');
    const totalRentPaid = rentPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // الأجرة المتأخرة = المتوقع - المدفوع
    const lateAmount = Math.max(0, expectedRentTotal - totalRentPaid);
    
    // حساب رصيد السائق (إذا دفع أكثر من المطلوب)
    const driverBalance = Math.max(0, totalRentPaid - expectedRentTotal);
    
    // 2. حساب المخالفات (positive = driver owes, negative = driver paid)
    const violationPayments = payments.filter(p => 
        p.type === 'سداد مخالفة' || p.type === 'تحصيل مخالفة'
    );
    const violations = violationPayments.reduce((sum, p) => {
        const amount = parseFloat(p.amount || 0);
        // تحصيل مخالفة = السائق دفع (يقلل الدين)
        // سداد مخالفة = الشركة دفعت عن السائق (يزيد الدين)
        return p.type === 'تحصيل مخالفة' ? sum - amount : sum + amount;
    }, 0);
    
    // 3. حساب رسوم الإقامة (positive = driver owes, negative = driver paid)
    const residencyPayments = payments.filter(p => 
        p.type === 'سداد رسوم إقامة' || p.type === 'تحصيل رسوم إقامة'
    );
    const residencyFees = residencyPayments.reduce((sum, p) => {
        const amount = parseFloat(p.amount || 0);
        // تحصيل رسوم إقامة = السائق دفع (يقلل الدين)
        // سداد رسوم إقامة = الشركة دفعت عن السائق (يزيد الدين)
        return p.type === 'تحصيل رسوم إقامة' ? sum - amount : sum + amount;
    }, 0);
    
    // 4. حساب الديون القديمة (الديون المسجلة - المدفوعات)
    const oldDebtsInitial = parseFloat(driver.oldDebts || 0);
    const oldDebtPayments = payments.filter(p => p.type === 'دين قديم');
    const oldDebtsPaid = oldDebtPayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    const oldDebts = Math.max(0, oldDebtsInitial - oldDebtsPaid);
    
    // 5. حساب خصم الإجازة السنوية (تخفض الدين مباشرة)
    const annualLeavePayments = payments.filter(p => p.type === 'إجازة سنوية');
    const annualLeaveTotal = annualLeavePayments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
    
    // 6. حساب السلف المستحقة (positive = سلفة مفتوحة, negative = تحصيل أكثر من السلفة)
    const advancePayments = payments.filter(p =>
        p.type === 'سلفة إلى السائق' || p.type === 'تحصيل سلفة من السائق'
    );
    const advanceBalance = advancePayments.reduce((sum, p) => {
        const amount = parseFloat(p.amount || 0);
        // سلفة إلى السائق = الشركة دفعت (يزيد الدين)
        // تحصيل سلفة من السائق = السائق دفع (ينقص الدين)
        return p.type === 'سلفة إلى السائق' ? sum + amount : sum - amount;
    }, 0);
    // رصيد السلف المستحق: لا يمكن أن يكون سالباً (التحقق يتم في نموذج الإدخال)
    const netAdvance = Math.max(0, advanceBalance);
    
    // 7. حساب إجمالي الدين
    totalDebt = lateAmount + violations + residencyFees + oldDebts + netAdvance - driverBalance - annualLeaveTotal;
    
    // الدين لا يمكن أن يكون سالب
    return Math.max(0, totalDebt);
}

// دالة موحدة لتحديث عرض الأرصدة
function updateBalanceDisplay(balances) {
    // تحديث الرصيد البنكي (حساب رامي)
    const bankBalanceElement = document.getElementById('bankBalance');
    if (bankBalanceElement) {
        bankBalanceElement.textContent = balances.bankBalance.toFixed(3) + ' د.ك';
        // تغيير اللون حسب الرصيد
        if (balances.bankBalance < 0) {
            bankBalanceElement.style.color = '#dc3545'; // أحمر للرصيد السالب
        } else {
            bankBalanceElement.style.color = '#28a745'; // أخضر للرصيد الموجب
        }
    }

    // تحديث رصيد بنك وربه
    const warbaBalanceElement = document.getElementById('warbaBalance');
    if (warbaBalanceElement) {
        warbaBalanceElement.textContent = balances.warbaBalance.toFixed(3) + ' د.ك';
        // تغيير اللون حسب الرصيد
        if (balances.warbaBalance < 0) {
            warbaBalanceElement.style.color = '#dc3545'; // أحمر للرصيد السالب
        } else {
            warbaBalanceElement.style.color = '#28a745'; // أخضر للرصيد الموجب
        }
    }

    // تحديث رصيد الرواتب
    const salaryBalanceElement = document.getElementById('salaryBalance');
    if (salaryBalanceElement) {
        salaryBalanceElement.textContent = balances.salaryBalance.toFixed(3) + ' د.ك';
        // تغيير اللون حسب الرصيد
        if (balances.salaryBalance < 0) {
            salaryBalanceElement.style.color = '#dc3545'; // أحمر للرصيد السالب
        } else {
            salaryBalanceElement.style.color = '#28a745'; // أخضر للرصيد الموجب
        }
    }

    // تحديث ديون السائقين (للتوافق مع الصفحات القديمة)
    const driverDebtsElement = document.getElementById('driverDebts');
    if (driverDebtsElement) {
        driverDebtsElement.textContent = balances.totalDriverDebts.toFixed(3) + ' د.ك';
        // ديون السائقين دائماً باللون الأحمر إذا كانت أكبر من صفر
        if (balances.totalDriverDebts > 0) {
            driverDebtsElement.style.color = '#dc3545';
        } else {
            driverDebtsElement.style.color = '#28a745';
        }
    }

    // تحديث إجمالي الديون (الاسم الجديد)
    const totalDebtElement = document.getElementById('totalDebt');
    if (totalDebtElement) {
        totalDebtElement.textContent = balances.totalDriverDebts.toFixed(3) + ' د.ك';
        // ديون السائقين دائماً باللون الأحمر إذا كانت أكبر من صفر
        if (balances.totalDriverDebts > 0) {
            totalDebtElement.style.color = '#dc3545';
        } else {
            totalDebtElement.style.color = '#28a745';
        }
    }

    // تحديث إجمالي الإيرادات
    const totalRevenuesElement = document.getElementById('totalRevenues');
    if (totalRevenuesElement) {
        totalRevenuesElement.textContent = balances.totalRevenues.toFixed(3) + ' د.ك';
        totalRevenuesElement.style.color = '#28a745'; // أخضر للإيرادات
    }

    // تحديث إجمالي المصروفات
    const totalExpensesElement = document.getElementById('totalExpenses');
    if (totalExpensesElement) {
        totalExpensesElement.textContent = balances.totalExpenses.toFixed(3) + ' د.ك';
        totalExpensesElement.style.color = '#dc3545'; // أحمر للمصروفات
    }
}

// دالة لحساب صافي الربح/الخسارة
function calculateNetProfit(balances) {
    return balances.totalRevenues - balances.totalExpenses;
}

// دالة لتحديث عرض صافي الربح
function updateNetProfitDisplay(balances) {
    const netProfitElement = document.getElementById('netProfit');
    if (netProfitElement) {
        const netProfit = calculateNetProfit(balances);
        netProfitElement.textContent = netProfit.toFixed(3) + ' د.ك';
        
        // تغيير اللون حسب الربح/الخسارة
        if (netProfit < 0) {
            netProfitElement.style.color = '#dc3545'; // أحمر للخسارة
        } else {
            netProfitElement.style.color = '#28a745'; // أخضر للربح
        }
    }
}

// دالة لتطبيق تجديد الإقامة التلقائي (30 دينار سنوياً)
async function applyAnnualResidencyRenewal(db, drivers) {
    const currentYear = new Date().getFullYear();
    
    for (const driver of drivers) {
        // التحقق من آخر تجديد إقامة للسائق
        const lastRenewal = await getLastResidencyRenewal(db, driver.id, currentYear);
        
        if (!lastRenewal) {
            // إضافة رسوم تجديد الإقامة التلقائية
            const renewalPayment = {
                driverId: driver.id,
                type: 'سداد رسوم إقامة',
                amount: 30.000,
                date: `${currentYear}-01-01`,
                description: `تجديد إقامة تلقائي - ${currentYear}`,
                notes: 'تجديد تلقائي سنوي',
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('driverPayments').add(renewalPayment);
        }
    }
}

// دالة للتحقق من آخر تجديد إقامة
async function getLastResidencyRenewal(db, driverId, year) {
    const snapshot = await db.collection('driverPayments')
        .where('driverId', '==', driverId)
        .where('type', '==', 'سداد رسوم إقامة')
        .where('date', '>=', `${year}-01-01`)
        .where('date', '<=', `${year}-12-31`)
        .get();
    
    return !snapshot.empty;
}



// دالة حساب رصيد السائق الذكي
function calculateDriverBalance(driverId, driverPayments, dailyRate) {
    if (!driverPayments || !dailyRate) return 0;
    
    // فلترة دفعات السائق المحدد
    const payments = driverPayments.filter(payment => payment.driverId === driverId);
    
    // ترتيب الدفعات حسب التاريخ (الأقدم أولاً)
    payments.sort((a, b) => {
        const dateA = new Date(a.date || a.timestamp);
        const dateB = new Date(b.date || b.timestamp);
        return dateA - dateB;
    });
    
    let currentBalance = 0;
    
    // حساب الرصيد من جميع الدفعات
    payments.forEach(payment => {
        const amount = parseFloat(payment.amount) || 0;
        
        // فقط دفعات الأجرة تؤثر على الرصيد
        if (payment.type === 'أجرة يومية' || payment.type === 'أجرة شهرية') {
            currentBalance += amount;
            
            // تطبيق قاعدة الحد الأقصى (لا يتعدى الأجرة اليومية)
            while (currentBalance >= dailyRate) {
                currentBalance -= dailyRate;
                // هنا يتم تسجيل يوم مدفوع (يمكن إضافة منطق إضافي لاحقاً)
            }
        }
    });
    
    return currentBalance;
}

// دالة حساب عدد الأيام المدفوعة من الرصيد
function calculatePaidDaysFromBalance(driverId, driverPayments, dailyRate) {
    if (!driverPayments || !dailyRate) return 0;
    
    const payments = driverPayments.filter(payment => 
        payment.driverId === driverId && (payment.type === 'أجرة يومية' || payment.type === 'أجرة شهرية')
    );
    
    const totalPaid = payments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
    return Math.floor(totalPaid / dailyRate);
}


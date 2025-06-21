// دالة موحدة لحساب الأرصدة في جميع الصفحات حسب النظام المحاسبي الجديد
function calculateUnifiedBalances(revenues, expenses, driverPayments, drivers) {
    let bankBalance = 0;
    let salaryBalance = 0;
    let totalDriverDebts = 0;
    let totalRevenues = 0;
    let totalExpenses = 0;

    // حساب الإيرادات العادية
    if (revenues && revenues.length > 0) {
        totalRevenues = revenues.reduce((sum, revenue) => sum + parseFloat(revenue.amount || 0), 0);
        bankBalance += totalRevenues;
    }

    // حساب المصروفات العادية
    if (expenses && expenses.length > 0) {
        totalExpenses = expenses.reduce((sum, expense) => {
            const amount = parseFloat(expense.amount || 0);
            if (expense.type === 'مصاريف إيداعات الرواتب') {
                salaryBalance += amount;
            } else {
                bankBalance -= amount;
            }
            return sum + amount;
        }, 0);
    }

    // حساب دفعات السائقين حسب النظام المحاسبي الجديد
    if (driverPayments && driverPayments.length > 0) {
        driverPayments.forEach(payment => {
            const amount = parseFloat(payment.amount) || 0;
            
            switch(payment.type) {
                // دفعات تزيد الرصيد البنكي (تحصيل من السائق)
                case 'أجرة يومية':
                case 'تحصيل مخالفة':
                case 'تحصيل رسوم إقامة':
                case 'دين قديم':
                    bankBalance += amount;
                    break;
                
                // دفعات تنقص الرصيد البنكي (الشركة تدفع)
                case 'دفع مخالفة':
                case 'دفع رسوم إقامة':
                    bankBalance -= amount;
                    break;
                
                // رسوم الرواتب (نظام منفصل)
                case 'تحصيل رسوم رواتب':
                    salaryBalance += amount;
                    break;
                case 'دفع رواتب':
                    salaryBalance -= amount;
                    break;
            }
        });
    }

    // حساب ديون السائقين حسب النظام الجديد
    if (drivers && drivers.length > 0) {
        drivers.forEach(driver => {
            const driverDebts = calculateDriverDebt(driver.id, driverPayments);
            totalDriverDebts += driverDebts;
        });
    }

    return {
        bankBalance: bankBalance,
        salaryBalance: salaryBalance,
        totalDriverDebts: totalDriverDebts,
        totalRevenues: totalRevenues,
        totalExpenses: totalExpenses
    };
}

// دالة موحدة لحساب ديون السائق حسب النظام المحاسبي الجديد
function calculateDriverDebt(driverId, driverPayments) {
    let debt = 0;
    const payments = driverPayments.filter(payment => payment.driverId === driverId);
    
    payments.forEach(payment => {
        const amount = parseFloat(payment.amount) || 0;
        
        switch(payment.type) {
            // دفعات تنقص الدين على السائق
            case 'أجرة يومية':
            case 'تحصيل مخالفة':
            case 'تحصيل رسوم إقامة':
            case 'تحصيل رسوم رواتب':
            case 'دين قديم':
                debt -= amount;
                break;
            
            // دفعات تزيد الدين على السائق
            case 'دفع مخالفة':
            case 'دفع رسوم إقامة':
                debt += amount;
                break;
            
            // رسوم الرواتب لا تؤثر على الدين الشخصي للسائق
            case 'دفع رواتب':
                // لا تؤثر على دين السائق
                break;
        }
    });
    
    // إضافة رسوم الإقامة السنوية التلقائية (30 دينار لكل سائق)
    // يمكن تطبيق هذا لاحقاً عند تفعيل النظام التلقائي
    
    return Math.max(0, debt);
}

// دالة موحدة لتحديث عرض الأرصدة
function updateBalanceDisplay(balances) {
    // تحديث الرصيد البنكي
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

    // تحديث ديون السائقين
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
                type: 'دفع رسوم إقامة',
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
        .where('type', '==', 'دفع رسوم إقامة')
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
        
        // فقط دفعات الأجرة اليومية تؤثر على الرصيد
        if (payment.type === 'أجرة يومية') {
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
        payment.driverId === driverId && payment.type === 'أجرة يومية'
    );
    
    const totalPaid = payments.reduce((sum, payment) => sum + (parseFloat(payment.amount) || 0), 0);
    return Math.floor(totalPaid / dailyRate);
}


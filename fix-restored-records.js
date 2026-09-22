// Retired maintenance script. Mutations must go through the audited archive UI.
const DISABLED_MESSAGE =
    '⛔ هذا السكربت القديم معطل ولا يكتب في قاعدة البيانات. استخدم archived-drivers.html لتنفيذ عملية مسجلة في سجل التدقيق.';

async function markRestoredRecords() {
    console.error(DISABLED_MESSAGE);
    return { disabled: true, updatedCount: 0 };
}

if (require.main === module) {
    markRestoredRecords().then(() => {
        process.exitCode = 1;
    });
}

module.exports = { markRestoredRecords, DISABLED_MESSAGE };


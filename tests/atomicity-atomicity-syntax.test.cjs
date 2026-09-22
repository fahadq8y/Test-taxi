const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('all inline scripts in the six changed pages parse', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taxi-audit-syntax-'));
    try {
        for (const name of ['drivers', 'driver-payments', 'expenses', 'revenues', 'user-management', 'edit-history']) {
            const html = fs.readFileSync(path.join(__dirname, '..', `${name}.html`), 'utf8');
            let index = 0;
            for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
                if (/\bsrc\s*=/.test(match[1]) || !match[2].trim()) continue;
                const extension = /\btype\s*=\s*["']module["']/.test(match[1]) ? 'mjs' : 'cjs';
                const filename = path.join(dir, `${name}-${index++}.${extension}`);
                fs.writeFileSync(filename, match[2]);
                const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
                assert.equal(result.status, 0, `${name}: ${result.stderr}`);
            }
            assert.ok(index > 0, `${name}: no inline scripts found`);
        }
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
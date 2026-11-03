const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {test} = require('node:test');

test('the GUI resolver terminates when its checkout is nested inside the host repository', t => {
    const host = path.resolve(__dirname, '../..');
    const gui = process.env.E2E_GUI_ROOT || path.join(host, '.host/scratch-gui');
    const prepared = path.join(host, '.host');
    fs.mkdirSync(prepared, {recursive: true});
    const nested = fs.mkdtempSync(path.join(prepared, 'resolver-layout-'));
    t.after(() => fs.rmSync(nested, {recursive: true, force: true}));
    fs.writeFileSync(path.join(nested, 'package.json'), '{}');
    fs.symlinkSync(path.join(gui, 'node_modules'), path.join(nested, 'node_modules'),
        process.platform === 'win32' ? 'junction' : 'dir');
    const helper = path.join(__dirname, 'unit/extension-security/helpers.cjs');
    const script = `require(${JSON.stringify(helper)});\n` +
        `const req = require('node:module').createRequire(${JSON.stringify(path.join(nested, 'package.json'))});\n` +
        "console.log(req.resolve('react'));\n";
    const result = spawnSync(process.execPath, ['-e', script], {
        cwd: host, env: {...process.env, E2E_GUI_ROOT: nested}, encoding: 'utf8', timeout: 7000
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /react/);
});

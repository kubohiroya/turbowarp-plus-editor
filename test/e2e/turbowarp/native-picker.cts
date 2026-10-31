const path = require('node:path');
const fs = require('node:fs/promises');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const run = promisify(execFile);

// Scope every OS operation to the browser process launched by this test.
const selectNativeProject = async (browser, filename, testInfo) => {
    if (process.platform !== 'darwin') throw new Error('The native picker requires macOS and local Google Chrome.');
    const file = await fs.realpath(filename);
    if (path.extname(file) !== '.sb3') throw new Error('The native picker accepts only the downloaded .sb3 fixture.');
    const session = await browser.newBrowserCDPSession();
    let pid;
    try {
        const {processInfo} = await session.send('SystemInfo.getProcessInfo');
        pid = processInfo.find(info => info.type === 'browser')?.id;
    } finally {
        await session.detach();
    }
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('The isolated browser PID is unavailable.');
    let log = '';
    try {
        const result = await run('/usr/bin/swift', [path.join(__dirname, 'native-picker.swift'),
            String(pid), file], {timeout: 60_000, maxBuffer: 64 * 1024});
        log = result.stderr + result.stdout;
    } catch (error) {
        log = `${error.stderr || ''}\n${error.stdout || ''}\n${error.message}`;
        throw error;
    } finally {
        await testInfo.attach('native-picker-operation.log', {body: log, contentType: 'text/plain'});
    }
};

module.exports = {selectNativeProject};

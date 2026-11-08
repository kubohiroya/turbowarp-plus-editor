const path = require('node:path');
const port = JSON.stringify(path.resolve(__dirname, '../../site/extension-host/shared-project-archive.ts'));

module.exports = (source: string) => {
    const unpack = '    unpack(input, isSprite)';
    const parse = '            return parse(unpackedProject[0])';
    if (!source.includes(unpack) || !source.includes(parse)) throw new Error('The pinned Scratch parser has changed');
    return `const {readPreparedVMProject} = require(${port});\n` + source
        .replace(unpack, `    const shared = isSprite ? undefined : readPreparedVMProject(input);
    (shared ? Promise.resolve([shared.text, shared.zip]) : unpack(input, isSprite))`)
        .replace(parse, `            const parsed = shared && shared.text === undefined ?
                Promise.resolve(shared.project) : parse(unpackedProject[0]);
            return parsed`);
};

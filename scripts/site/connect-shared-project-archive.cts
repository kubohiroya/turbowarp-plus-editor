// The Loader shares the SB3 read it verified; the pinned Scratch parser reuses it instead of unpacking again.
const port = JSON.stringify('@kubohiroya/turbowarp-extension-loader/shared-project-archive');

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

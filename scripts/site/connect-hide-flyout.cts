module.exports = (source: string) => {
    const hoverTargets = '[toolbox, addExtensionButton, flyOut, scrollBar]';
    const hoverLoop = `for (let element of ${hoverTargets}) {`;
    if (!source.includes(hoverLoop)) throw new Error('Pinned GUI auto-hide palette hover targets have changed');

    // The Plus File menu can replace the standalone Add Extension button.
    return source.replace(hoverLoop, `for (let element of ${hoverTargets}.filter(Boolean)) {`);
};

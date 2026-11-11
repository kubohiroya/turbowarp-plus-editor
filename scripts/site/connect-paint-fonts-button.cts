module.exports = (source: string) => {
    const marker = '                    <FixedToolsContainer';
    if (source.indexOf(marker) === -1 || source.indexOf(marker) !== source.lastIndexOf(marker)) {
        throw new Error('The pinned Paint Editor toolbar has changed');
    }
    return "import PaintFontsButton from '@kubohiroya/turbowarp-plus-editor-ui/paint-fonts-button';\n" +
        source.replace(marker, `                    <PaintFontsButton intl={props.intl} onOpen={props.onManageFonts} />
${marker}`);
};

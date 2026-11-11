const path: typeof import('node:path') = require('node:path');

const replaceOnce = (source: string, marker: string, replacement: string) => {
    if (!source.includes(marker) || source.indexOf(marker) !== source.lastIndexOf(marker)) {
        throw new Error('The pinned GUI Fonts modal has changed');
    }
    return source.replace(marker, () => replacement);
};

module.exports = function (source: string) {
    const hostImport = "import {getHostIntegration} from '../../addons/hooks.js';\n";
    if (path.basename(this.resourcePath) === 'manage-font.jsx') {
        source = replaceOnce(source, '{this.props.system ? (',
            '{this.props.webFontLabel || (this.props.system ? (');
        return replaceOnce(source, 'formatBytes(this.props.data.byteLength)\n                        )}',
                'formatBytes(this.props.data.byteLength)\n                        ))}');
    }
    const fileButton = '                    <button\n                        className={styles.openButton}\n                        onClick={props.onOpenCustomFonts}';
    const fileButtonEnd = '                    </button>\n                </div>\n            ) : props.screen';
    const fileForm = '                <AddCustomFont';
    const fileFormEnd = '            ) : (\n                // Should never happen';
    source = replaceOnce(source, 'const FontModal = props => (', `const FontModal = props => {
    const {WebFontButton, WebFontForm, webFontLabel} = getHostIntegration()?.webFontDialogs || {};
    return (`);
    source = replaceOnce(source, fileButton, `                    {WebFontButton ?
                        <WebFontButton className={styles.openButton} locale={props.intl.locale} onClick={props.onOpenCustomFonts} /> : (
${fileButton}`);
    source = replaceOnce(source, fileButtonEnd, fileButtonEnd.replace('</button>', '</button>\n                    )}'));
    source = replaceOnce(source, fileForm, `                WebFontForm ?
                    <WebFontForm manager={props.fontManager} locale={props.intl.locale} onClose={props.onClose} /> : (
${fileForm}`);
    source = replaceOnce(source, fileFormEnd, '                )\n' + fileFormEnd);
    source = replaceOnce(source, '                                    system={font.system}',
        '                                    webFontLabel={font.webFont && webFontLabel?.(props.intl.locale)}\n' +
        '                                    system={font.system}');
    source = replaceOnce(source, '\n);\n\nFontModal.propTypes', '\n    );\n};\n\nFontModal.propTypes');
    return hostImport + source;
};

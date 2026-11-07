const path = require('node:path');

const session = path.resolve(__dirname, '../../packages/editor-views/asset-edit-session.ts');
const importSession = `import {createAssetEditSession} from ${JSON.stringify(session)};\n`;

// The pinned editors own rendering and encoding. Connect their lifecycle and
// asynchronous completion points to the host's asset edit session.
const connections: Record<string, [string, string][]> = {
    'sound-editor.jsx': [
        ['super(props);', `super(props);
        this.soundEdits = createAssetEditSession('sound');
        this.soundEdits.select(props.vm, props.soundIndex);`],
        ['componentWillReceiveProps (newProps) {', `componentWillReceiveProps (newProps) {
        this.soundEdits.select(newProps.vm, newProps.soundIndex);`],
        ['componentWillUnmount () {', `componentWillUnmount () {
        this.soundEdits.close();`],
        ['submitNewSamples (samples, sampleRate, skipUndo) {', `submitNewSamples (samples, sampleRate, skipUndo, isCurrent = this.soundEdits.begin()) {
        if (!isCurrent()) return Promise.resolve(false);`],
        ['}).then(wavBuffer => {', `}).then(wavBuffer => {
                    if (!isCurrent()) return false;`],
        ['handleEffect (name) {', `handleEffect (name) {
        const isCurrent = this.soundEdits.begin();
        if (!isCurrent()) return;`],
        ['this.submitNewSamples(samples, sampleRate).then(success => {\n                if (success) {',
            'this.submitNewSamples(samples, sampleRate, false, isCurrent).then(success => {\n                if (success && isCurrent()) {']
    ],
    'paint-editor-wrapper.jsx': [
        ['super(props);', `super(props);
        this.costumeEdits = createAssetEditSession('costume');
        this.costumeEdits.select(props.vm, props.selectedCostumeIndex);`],
        ['shouldComponentUpdate (nextProps, nextState) {', `shouldComponentUpdate (nextProps, nextState) {
        this.costumeEdits.select(nextProps.vm, nextProps.selectedCostumeIndex);`],
        ['componentWillUnmount () {', `componentWillUnmount () {
        this.costumeEdits.close();`],
        ['fontInlineFn={this.fontInlineFn}', 'fontInlineFn={this.fontInlineFn}\n                beginCostumeEdit={this.costumeEdits.begin}']
    ],
    'paint-editor.jsx': [
        ['convertToBitmap(this.props.clearSelectedItems, this.props.onUpdateImage, this.props.fontInlineFn);',
            `convertToBitmap(this.props.clearSelectedItems, this.props.onUpdateImage, this.props.fontInlineFn,
                this.props.beginCostumeEdit && this.props.beginCostumeEdit());`],
        ['fontInlineFn: PropTypes.func,', 'fontInlineFn: PropTypes.func,\n    beginCostumeEdit: PropTypes.func,']
    ],
    'bitmap.js': [
        ['const convertToBitmap = function (clearSelectedItems, onUpdateImage, optFontInlineFn) {',
            `const convertToBitmap = function (clearSelectedItems, onUpdateImage, optFontInlineFn, isCurrent = () => true) {
    if (!isCurrent()) return;`],
        ['img.onload = () => {\n        if (img.width && img.height) {',
            'img.onload = () => {\n        if (!isCurrent()) return;\n        if (img.width && img.height) {'],
        ['img.onerror = () => {\n        // Fallback', 'img.onerror = () => {\n        if (!isCurrent()) return;\n        // Fallback'],
        ['raster.onLoad = () => {\n            if (raster.canvas.width && raster.canvas.height) {',
            'raster.onLoad = () => {\n            if (!isCurrent()) return;\n            if (raster.canvas.width && raster.canvas.height) {']
    ]
};

module.exports = function (source: string) {
    const filename = path.basename(this.resourcePath);
    for (const [before, after] of connections[filename]) {
        const first = source.indexOf(before);
        if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
            throw new Error(`Asset edit connection differs from the pinned source in ${filename}: ${before}`);
        }
        source = source.replace(before, () => after);
    }
    return filename === 'sound-editor.jsx' || filename === 'paint-editor-wrapper.jsx' ? importSession + source : source;
};

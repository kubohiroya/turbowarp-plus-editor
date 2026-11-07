const path = require('node:path');

const session = path.resolve(__dirname, '../../packages/editor-views/asset-edit-session.ts');
const imports: Record<string, string> = {
    'sound-editor.jsx': `import {createAssetEditSession, prepareAssetHistoryMove} from ${JSON.stringify(session)};\n`,
    'paint-editor-wrapper.jsx': `import {createAssetEditSession} from ${JSON.stringify(session)};\n`,
    'virtual-machine.js': `const {commitCostumeImage} = require(${JSON.stringify(session)});\n`
};

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
        ['submitNewSamples (samples, sampleRate, skipUndo) {', `submitNewSamples (samples, sampleRate, updateHistory, isCurrent = this.soundEdits.begin()) {
        if (!isCurrent()) return Promise.resolve(false);`],
        ['}).then(wavBuffer => {', `}).then(wavBuffer => {
                    if (!isCurrent()) return false;`],
        ['if (!skipUndo) {', 'if (updateHistory) {\n                        updateHistory();\n                    } else {'],
        ['const effects = new AudioEffects(', `const isCurrent = this.soundEdits.begin();
        if (!isCurrent()) return;
        const effects = new AudioEffects(`],
        ['this.submitNewSamples(samples, sampleRate).then(success => {\n                if (success) {',
            'this.submitNewSamples(samples, sampleRate, false, isCurrent).then(success => {\n                if (success && isCurrent()) {'],
        ...(['Undo', 'Redo'] as const).map((action): [string, string] => {
            const from = action.toLowerCase();
            const to = action === 'Undo' ? 'redo' : 'undo';
            const readItem = `const {samples, sampleRate, trimStart, trimEnd} = this.${from}Stack.pop();`;
            const pushItem = `this.${to}Stack.push(this.getUndoItem());`;
            const move = action === 'Undo' ? `${pushItem}\n        ${readItem}\n        if (samples) {` :
                `${readItem}\n        if (samples) {\n            ${pushItem}`;
            return [`handle${action} () {
        ${move}
            return this.submitNewSamples(samples, sampleRate, true).then(success => {`,
            `handle${action} () {
        const history = prepareAssetHistoryMove(this.${from}Stack, this.${to}Stack, () => this.getUndoItem());
        if (!history.item) return;
        const {samples, sampleRate, trimStart, trimEnd} = history.item;
        if (samples) {
            return this.submitNewSamples(samples, sampleRate, history.commit).then(success => {`];
        })
    ],
    'paint-editor-wrapper.jsx': [
        ['super(props);', `super(props);
        this.costumeEdits = createAssetEditSession('costume');
        this.costumeEdits.select(props.vm, props.selectedCostumeIndex);`],
        ['shouldComponentUpdate (nextProps, nextState) {', `shouldComponentUpdate (nextProps, nextState) {
        this.costumeEdits.select(nextProps.vm, nextProps.selectedCostumeIndex);`],
        ['componentWillUnmount () {', `componentWillUnmount () {
        this.costumeEdits.close();`],
        ['fontInlineFn={this.fontInlineFn}', `fontInlineFn={this.fontInlineFn}
                beginCostumeEdit={this.costumeEdits.begin}
                cancelCostumeEdit={this.costumeEdits.cancelPending}`]
    ],
    'paint-editor.jsx': [
        ['} else if (isVector(prevProps.format) && this.props.format === Formats.BITMAP) {\n' +
            '            convertToBitmap(this.props.clearSelectedItems, this.props.onUpdateImage, this.props.fontInlineFn);\n        }',
        '}'],
        ["            'switchModeForFormat',", "            'switchModeForFormat',\n            'handleConvertToBitmap',"],
        ['    switchModeForFormat (newFormat) {', `    handleConvertToBitmap () {
        const isCurrent = this.props.beginCostumeEdit();
        convertToBitmap(this.props.clearSelectedItems, (...args) => {
            this.props.onUpdateImage(...args);
            this.props.handleSwitchToBitmap();
        }, this.props.fontInlineFn, isCurrent);
    }
    switchModeForFormat (newFormat) {`],
        ['onSwitchToBitmap={this.props.handleSwitchToBitmap}', 'onSwitchToBitmap={this.handleConvertToBitmap}'],
        ['    onMouseDown (event) {', `    onMouseDown (event) {
        if (event.target === this.canvas) this.props.cancelCostumeEdit();`],
        ['fontInlineFn: PropTypes.func,', `fontInlineFn: PropTypes.func,
    beginCostumeEdit: PropTypes.func.isRequired,
    cancelCostumeEdit: PropTypes.func.isRequired,`]
    ],
    'virtual-machine.js': [
        [`_updateBitmap (costume, bitmap, rotationCenterX, rotationCenterY, bitmapResolution) {
        if (!(costume && this.runtime && this.runtime.renderer)) return;`,
        `_updateBitmap (costume, bitmap, rotationCenterX, rotationCenterY, bitmapResolution) {
        if (!(costume && this.runtime && this.runtime.renderer)) return;
        const isCurrentImage = commitCostumeImage(costume);`],
        ["reader.addEventListener('loadend', () => {", "reader.addEventListener('loadend', () => {\n                if (!isCurrentImage()) return;"],
        ['_updateSvg (costume, svg, rotationCenterX, rotationCenterY) {',
            '_updateSvg (costume, svg, rotationCenterX, rotationCenterY) {\n        if (costume) commitCostumeImage(costume);']
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

module.exports = function (this: {resourcePath: string}, source: string) {
    const filename = path.basename(this.resourcePath);
    for (const [before, after] of connections[filename]) {
        const first = source.indexOf(before);
        if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
            throw new Error(`Asset edit connection differs from the pinned source in ${filename}: ${before}`);
        }
        source = source.replace(before, () => after);
    }
    return (imports[filename] || '') + source;
};

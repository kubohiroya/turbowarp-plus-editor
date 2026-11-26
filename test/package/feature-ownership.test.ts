import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

test('migrated feature adapters contain wiring without local UI or feature state', () => {
    const adapters = [
        'site/horizontal-block-palette/index.ts', 'site/palette-delete-preview/index.ts',
        'site/context-menu-icons/index.ts', 'site/editor-layout/editor-tabs.tsx',
        'site/editor-layout/basic-panel.tsx', 'site/editor-layout/popup-layout.tsx',
        'site/editor-layout/stage-display-menu.tsx', 'site/editor-layout/stage-panel.tsx',
        'site/editor-views/code-popout.tsx', 'site/editor-views/desktop-code.ts',
        'site/project-tools/dialog.ts', 'site/project-tools/properties.ts', 'site/project-tools/index.ts',
        'site/project-payloads/codec.ts', 'site/project-payloads/host.ts', 'site/project-payloads/native-assets.ts',
        'site/extension-host/host.ts', 'site/extension-host/project-size-gate.ts',
        'site/extension-host/review.ts', 'site/extension-host/review-channel.ts',
        'site/extension-host/permission-ui.ts', 'site/extension-library/plus-library.tsx',
        'site/extension-library/catalog-settings.ts', 'site/extension-library/load-extensions.ts',
        'site/test-run/editor.ts', 'site/test-run/frame.ts'
    ];
    for (const filename of adapters) {
        const text = fs.readFileSync(filename, 'utf8');
        const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
        const inspect = (node: ts.Node) => {
            assert.ok(!ts.isClassDeclaration(node) && !ts.isFunctionDeclaration(node), `${filename} owns a feature implementation`);
            assert.ok(!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node), `${filename} owns feature presentation`);
            if (ts.isNewExpression(node)) {
                assert.ok(!['Map', 'Set', 'WeakMap', 'WeakSet'].includes(node.expression.getText(source)),
                    `${filename} owns feature state`);
            }
            ts.forEachChild(node, inspect);
        };
        inspect(source);
    }
});

test('the wiring under site/ shows no words of its own; the packages that own the features word them', () => {
    // Japanese text is the sign of user-facing wording: every feature offers it next to English.
    const japanese = /[぀-ヿ一-鿿]/;
    const sources = (directory: string): string[] => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const file = `${directory}/${entry.name}`;
        if (entry.isDirectory()) return sources(file);
        return /\.(?:[cm]?ts|tsx|jsx?)$/.test(entry.name) ? [file] : [];
    });
    const found: string[] = [];
    for (const filename of sources('site')) {
        const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true,
            filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
        const inspect = (node: ts.Node) => {
            if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) ||
                ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) && japanese.test(node.text)) {
                found.push(`${filename}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
            }
            ts.forEachChild(node, inspect);
        };
        inspect(source);
    }
    assert.deepEqual(found, [], 'Move these words to the package that owns the feature');
});

test('remaining feature facades reject controllers expressed as arrow functions too', async () => {
    const {featureFacadeViolations, strictFeatureFacades} = await import('../../scripts/site/feature-boundaries.ts');
    const found = strictFeatureFacades.flatMap(filename => featureFacadeViolations(filename, fs.readFileSync(filename, 'utf8')));
    assert.deepEqual(found, []);
});

test('facade checks detect mutable state, async controllers, matching and DOM logic independently of language', async () => {
    const {featureFacadeViolations} = await import('../../scripts/site/feature-boundaries.ts');
    for (const source of [
        'let current; export const run = () => current;',
        'export const run = () => { let pending = false; return pending; };',
        'export const run = async () => { await saveProject(); };',
        'export const run = () => projects.find(project => project.id === id);',
        'export const run = () => document.querySelector("button").addEventListener("click", save);',
        'export const run = () => { state.pending = true; };',
        'export const run = () => JSON.parse(bytes);',
        'export const run = () => new Map();'
    ]) assert.ok(featureFacadeViolations('fixture.ts', source).length > 0, source);
    assert.deepEqual(featureFacadeViolations('fixture.ts', `
        const integration = createFeature({
            document: () => document,
            isDirty: () => store.getState().scratchGui.projectChanged,
            subscribe: listener => store.subscribe(listener),
            markSaved: () => store.dispatch(nativeAction()),
            createVM: () => new VirtualMachine()
        });
        export const {attach} = integration;
    `), []);
});

test('the packager HTML is only a distribution shell; its owner supplies all UI, CSS and text', async () => {
    const {packagerShellViolations} = await import('../../scripts/site/feature-boundaries.ts');
    const shell = fs.readFileSync('site/plus-packager.html', 'utf8');
    assert.deepEqual(packagerShellViolations(shell), []);
    for (const addition of ['<button>Generate HTML</button>', '<p>生成</p>', '<style>body{color:red}</style>',
        '<script>let pending = false;</script>']) {
        assert.ok(packagerShellViolations(shell.replace('</body>', `${addition}</body>`)).length > 0, addition);
    }
});

test('every site file has an explicit ownership entry so new helpers cannot bypass the boundary audit', async () => {
    const inventory = JSON.parse(fs.readFileSync('config/site-ownership.json', 'utf8')) as Record<string, string[]>;
    const actual = (directory: string): string[] => fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const file = `${directory}/${entry.name}`;
        return entry.isDirectory() ? actual(file) : [file];
    });
    const listed = Object.values(inventory).flat();
    assert.equal(new Set(listed).size, listed.length, 'Each file must have one role');
    assert.deepEqual(listed.sort(), actual('site').sort(), 'Review the owner before adding a site module');
    const {strictFeatureFacades} = await import('../../scripts/site/feature-boundaries.ts');
    assert.deepEqual(inventory['feature-facade'].sort(), [...strictFeatureFacades].sort());
});

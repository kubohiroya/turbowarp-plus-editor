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

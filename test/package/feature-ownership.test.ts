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
        'site/extension-host/review.ts', 'site/extension-host/review-channel.ts',
        'site/extension-host/permission-ui.ts', 'site/extension-library/plus-library.tsx',
        'site/extension-library/catalog-settings.ts', 'site/extension-library/load-extensions.ts'
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

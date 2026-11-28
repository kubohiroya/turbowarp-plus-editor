import ts from 'typescript';

/** Additional checks for feature facades. Native host adapters remain explicitly inventoried. */
export const strictFeatureFacades = [
    'site/packager/page.ts', 'site/packager/handoff.ts', 'site/trusted-extensions.ts',
    'site/project-folder-host.ts', 'site/test-run/editor.ts', 'site/test-run/frame.ts'
];

export function featureFacadeViolations(filename: string, text: string): string[] {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true,
        filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const violations: string[] = [];
    const report = (node: ts.Node, reason: string) => violations.push(
        `${filename}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${reason}`);
    const controlMethods = new Set(['addEventListener', 'removeEventListener', 'createElement', 'querySelector',
        'querySelectorAll', 'postMessage', 'dispatchEvent', 'append', 'replaceChildren', 'createObjectURL',
        'revokeObjectURL', 'filter', 'map', 'find', 'some', 'reduce', 'forEach', 'toJSON', 'generateAsync',
        'parse', 'stringify', 'digest', 'race', 'then', 'catch', 'finally', 'defineProperty']);
    const nativeConstructors = new Set(['URL', 'VirtualMachine', 'ScratchStorage', 'ScratchRender', 'BitmapAdapter', 'Packager']);
    const inspect = (node: ts.Node) => {
        if (ts.isClassDeclaration(node) || ts.isFunctionDeclaration(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
            report(node, 'feature presentation or implementation');
        if (ts.isVariableDeclarationList(node) && !(node.flags & ts.NodeFlags.Const)) report(node, 'mutable feature state');
        if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isForInStatement(node) || ts.isWhileStatement(node) ||
            ts.isDoStatement(node) || ts.isTryStatement(node) || ts.isSwitchStatement(node)) report(node, 'feature control flow');
        if (ts.isBinaryExpression(node) && (node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment)) report(node, 'feature mutation');
        if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) {
            if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
                report(node, 'feature mutation');
        }
        if (ts.isNewExpression(node) && !nativeConstructors.has(node.expression.getText(source))) report(node, 'feature allocation');
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && controlMethods.has(node.expression.name.text))
            report(node, 'feature UI, matching, data processing or lifecycle');
        // A catalog read is a distribution port projection. Other asynchronous workflows belong to their owner.
        if (ts.isAwaitExpression(node) && !(ts.isCallExpression(node.expression) &&
            ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === 'read'))
            report(node, 'asynchronous feature workflow');
        ts.forEachChild(node, inspect);
    };
    inspect(source);
    return violations;
}

export function packagerShellViolations(text: string): string[] {
    const allowed = new Set(['html', 'head', 'meta', 'body', 'script']);
    const tags = [...text.matchAll(/<\s*([a-z][a-z0-9-]*)\b/gi)].map(match => match[1].toLowerCase());
    const errors = tags.filter(tag => !allowed.has(tag)).map(tag => `feature markup: ${tag}`);
    if (/<[^>]+\s(?:style|on[a-z]+)\s*=/i.test(text)) errors.push('inline feature style or handler');
    const shellText = text.replace(/<!doctype[^>]*>|<[^>]*>/gi, '').trim();
    if (shellText) errors.push('feature text or inline implementation');
    if (!/<script\s+src="plus-packager\.js"><\/script>/.test(text)) errors.push('missing package entry');
    return errors;
}

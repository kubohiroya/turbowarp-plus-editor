/*! @license
 * Acorn copyright (C) 2012-2022 and Acorn Walk copyright (C) 2012-2020
 * by various contributors (https://github.com/acornjs/acorn).
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
import {parse} from 'acorn';
import type {Expression, FunctionExpression, PrivateIdentifier} from 'acorn';
import {simple} from 'acorn-walk';
import {parseExtensionMetadata} from '@kubohiroya/turbowarp-extension-security-dialog';

const headerBytes = 64 * 1024;
const maxSyntaxBytes = 1024 * 1024;
const propertyName = (key: Expression | PrivateIdentifier) => key.type === 'Identifier' ? key.name :
    key.type === 'Literal' ? key.value : undefined;

/** Large bundles only need their leading metadata. Read simple getInfo literals without running them. */
export function embeddedExtensionName(bytes: Uint8Array, id: string): string | undefined {
    const decoder = new TextDecoder('utf-8', {fatal: true});
    const name = parseExtensionMetadata(decoder.decode(bytes.subarray(0, headerBytes), {
        stream: bytes.byteLength > headerBytes
    })).name?.trim();
    if (name || bytes.byteLength > maxSyntaxBytes) return name;

    const source = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    if (!source.includes('getInfo')) return;
    const names = new Set<string | undefined>();
    const readMethod = (method: FunctionExpression) => {
        if (method.async || method.generator || method.body.type !== 'BlockStatement') return;
        const [statement] = method.body.body;
        if (method.body.body.length !== 1 || statement.type !== 'ReturnStatement' ||
            statement.argument?.type !== 'ObjectExpression') return;

        const fields = new Map<'id' | 'name', unknown>();
        for (const property of statement.argument.properties) {
            // A spread or computed property could override either field.
            if (property.type !== 'Property' || property.computed) return;
            const key = propertyName(property.key);
            if (key === 'id' || key === 'name') {
                fields.set(key, property.kind === 'init' && property.value.type === 'Literal' ?
                    property.value.value : undefined);
            }
        }
        if (fields.get('id') !== id) return;
        const value = fields.get('name');
        names.add(typeof value === 'string' && value.length <= 4096 ? value.trim() || undefined : undefined);
    };
    simple(parse(source, {ecmaVersion: 'latest'}), {
        MethodDefinition(node) {
            if (!node.static && !node.computed && node.kind === 'method' &&
                propertyName(node.key) === 'getInfo' && node.value.type === 'FunctionExpression') readMethod(node.value);
        },
        Property(node) {
            if (!node.computed && node.kind === 'init' &&
                propertyName(node.key) === 'getInfo' && node.value.type === 'FunctionExpression') readMethod(node.value);
        }
    });
    if (names.size === 1) return names.values().next().value;
}

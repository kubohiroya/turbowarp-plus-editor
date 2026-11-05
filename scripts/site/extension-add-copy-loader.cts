// The pinned review package bundles its translations inside the component and has no copy override.
const replacements = new Map([
    ['Choose what to add. Anything a chosen extension needs is selected for you.',
        'Choose the extensions to add to the project. Required extensions are selected automatically.'],
    ['追加するものを選んでください。選んだ拡張が必要とするものは自動で選ばれます。',
        '作品に追加する機能拡張を選んでください。選んだ機能拡張に必要な機能拡張は自動で選ばれます。']
]);

module.exports = source => {
    const found = new Set();
    const result = source.replace(/\baddIntro: ("(?:\\.|[^"\\])*")/g, (match, literal) => {
        const original = JSON.parse(literal);
        if (!replacements.has(original)) return match;
        found.add(original);
        return `addIntro: ${JSON.stringify(replacements.get(original))}`;
    });
    if (found.size !== replacements.size) throw new Error('Extension review copy differs from the pinned package');
    return result;
};

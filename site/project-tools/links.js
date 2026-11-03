/** Make links from plain text without interpreting project content as markup. */
export const contactLink = value => {
    const text = String(value || '').trim();
    if (/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z0-9-]+$/i.test(text)) return `mailto:${text}`;
    try {
        const url = new URL(text);
        if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
        if (url.protocol === 'mailto:' && url.pathname && !/[\r\n]/.test(text)) return url.href;
    } catch (error) { /* Incomplete input remains plain text. */ }
    return null;
};

export const descriptionParts = value => {
    const text = String(value || '');
    const parts = [];
    const pattern = /https:\/\/[^\s<>"'\u3000]+/g;
    let previous = 0;
    for (const match of text.matchAll(pattern)) {
        const url = match[0].replace(/[.,;:!?\)\]\}\u3001\u3002\uff09\u300d\u300f]+$/u, '');
        const href = contactLink(url);
        if (!href || !href.startsWith('https:')) continue;
        parts.push({text: text.slice(previous, match.index)}, {text: url, href});
        previous = match.index + url.length;
    }
    parts.push({text: text.slice(previous)});
    return parts;
};

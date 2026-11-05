export function decorateSurface(doc) {
    const mirror = () => {
        doc.head.querySelectorAll('[data-backpack-style]').forEach(style => style.remove());
        for (const style of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
            const copy = doc.importNode(style, true);
            copy.setAttribute('data-backpack-style', '');
            doc.head.appendChild(copy);
        }
        doc.documentElement.dir = document.documentElement.dir;
        doc.documentElement.lang = document.documentElement.lang;
        doc.documentElement.style.cssText = document.documentElement.style.cssText;
        doc.body.className = document.body.className;
        doc.body.style.cssText = document.body.style.cssText;
    };
    mirror();
    const observer = new MutationObserver(mirror);
    observer.observe(document.head, {childList: true, subtree: true, characterData: true, attributes: true});
    observer.observe(document.body, {attributes: true});
    observer.observe(document.documentElement, {attributes: true});
    return () => observer.disconnect();
}

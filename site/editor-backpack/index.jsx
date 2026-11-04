import React from 'react';
import {importScript} from '@kubohiroya/turbowarp-script-transfer';
import {createBackpackIntegration} from '@kubohiroya/turbowarp-editor-backpack';
import {layoutFlags, WindowLayoutContext} from '../editor-layout/index.jsx';
import {createBrowserHost} from './browser-host.ts';

function decorateSurface(doc) {
    const mirror = () => {
        doc.head.querySelectorAll('[data-backpack-style]').forEach(style => style.remove());
        for (const style of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
            const copy = doc.importNode(style, true);
            copy.setAttribute('data-backpack-style', '');
            doc.head.appendChild(copy);
        }
        doc.documentElement.dir = document.documentElement.dir;
        doc.documentElement.lang = document.documentElement.lang;
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

const feature = layoutFlags.backpackPopout ? createBackpackIntegration({
    host: createBrowserHost(window, (url, ticket) =>
        window.open(url, `tw-plus-backpack-${ticket}`, 'popup,width=560,height=320'), 'backpack-popout.html'),
    importScript, decorateSurface
}) : null;

function WebBackpackSurface(props) {
    const {enabled, locale} = React.useContext(WindowLayoutContext);
    return <feature.BackpackSurface {...props} enabled={enabled} locale={locale} />;
}

export const BackpackSurface = feature ? WebBackpackSurface : undefined;
export const attachBackpackDrop = context => feature?.attachBackpackDrop(context);

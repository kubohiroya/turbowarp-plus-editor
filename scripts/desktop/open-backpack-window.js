// The Desktop main process resolves the ticket to its fixed, packaged child document.
export const openBackpackWindow = (_url, ticket) => window.open(
    'about:blank', `tw-plus-backpack-${ticket}`, 'popup,width=560,height=320'
);

export const detachBackpackOpener = true;

export const getBackpackOpenLabel = locale => /^ja(?:-|$)/i.test(locale) ?
    'バックパックを別ウィンドウで開く' : 'Open Backpack in a separate window';

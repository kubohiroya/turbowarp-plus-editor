export const openBackpackWindow = (url, ticket) => window.open(
    url, `tw-plus-backpack-${ticket}`, 'popup,width=560,height=320'
);

export const detachBackpackOpener = false;

export const getBackpackOpenLabel = () => undefined;

// Optional transfer sockets. With no host, the GUI keeps its own menus and clipboard.
export const attachHostScriptTransfer = (context, integration) =>
    integration?.scriptTransfer?.attach?.(context) || null;

export const hostStageTransferMenu = (context, integration) =>
    integration?.scriptTransfer?.stageMenu?.(context) || {contextItems: [], backdropItems: []};

export const finalizeHostTransferMenu = (items, integration) =>
    integration?.scriptTransfer?.finalizeMenu?.(items) || items;

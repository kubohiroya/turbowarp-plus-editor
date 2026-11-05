const blockFields = {
    create: ['blockId', 'xml'],
    change: ['blockId', 'element', 'name', 'newValue'],
    move: ['blockId', 'oldParentId', 'oldInputName', 'newParentId', 'newInputName', 'newCoordinate'],
    delete: ['blockId']
};

const commentFields = {
    comment_create: ['commentId', 'blockId', 'text', 'xy', 'width', 'height', 'minimized'],
    comment_change: ['commentId', 'newContents_'],
    comment_move: ['commentId', 'newCoordinate_'],
    comment_delete: ['commentId', 'blockId']
};

export function isCommentEdit(event) {
    return event && Object.hasOwn(commentFields, event.type) && typeof event.commentId === 'string';
}

function isBlockEdit(event) {
    return event && Object.hasOwn(blockFields, event.type) && typeof event.blockId === 'string' &&
        (event.type !== 'change' || ['field', 'mutation'].includes(event.element));
}

export const isCodeEdit = event => isBlockEdit(event) || isCommentEdit(event);

export function encodeEdit(event) {
    if (!isCodeEdit(event)) return null;
    const fields = isCommentEdit(event) ? commentFields : blockFields;
    const data = {type: event.type};
    for (const key of fields[event.type]) data[key] = key === 'xml' ? event.xml.outerHTML : event[key];
    return data;
}

export function decodeEdit(event) {
    if (!isCodeEdit(event)) return null;
    if (event.type === 'create') return typeof event.xml === 'string' ? {...event, xml: {outerHTML: event.xml}} : null;
    return event;
}

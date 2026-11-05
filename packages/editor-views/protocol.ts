interface Edit {
    type: string;
    commentId?: string;
    blockId?: string;
    element?: string;
    xml?: string | {outerHTML: string};
    [field: string]: unknown;
}

const blockFields: Record<string, string[]> = {
    create: ['blockId', 'xml'],
    change: ['blockId', 'element', 'name', 'newValue'],
    move: ['blockId', 'oldParentId', 'oldInputName', 'newParentId', 'newInputName', 'newCoordinate'],
    delete: ['blockId']
};

const commentFields: Record<string, string[]> = {
    comment_create: ['commentId', 'blockId', 'text', 'xy', 'width', 'height', 'minimized'],
    comment_change: ['commentId', 'newContents_'],
    comment_move: ['commentId', 'newCoordinate_'],
    comment_delete: ['commentId', 'blockId']
};

export function isCommentEdit(event: Edit) {
    return event && Object.hasOwn(commentFields, event.type) && typeof event.commentId === 'string';
}

function isBlockEdit(event: Edit) {
    return event && Object.hasOwn(blockFields, event.type) && typeof event.blockId === 'string' &&
        (event.type !== 'change' || ['field', 'mutation'].includes(event.element));
}

export const isCodeEdit = (event: Edit) => isBlockEdit(event) || isCommentEdit(event);

export function encodeEdit(event: Edit) {
    if (!isCodeEdit(event)) return null;
    const fields = isCommentEdit(event) ? commentFields : blockFields;
    const data: Edit = {type: event.type};
    for (const key of fields[event.type]) data[key] = key === 'xml' ? (event.xml as {outerHTML: string}).outerHTML : event[key];
    return data;
}

export function decodeEdit(event: Edit) {
    if (!isCodeEdit(event)) return null;
    if (event.type === 'create') return typeof event.xml === 'string' ? {...event, xml: {outerHTML: event.xml}} : null;
    return event;
}

const fields = {
    create: ['blockId', 'xml'],
    change: ['blockId', 'element', 'name', 'newValue'],
    move: ['blockId', 'oldParentId', 'oldInputName', 'newParentId', 'newInputName', 'newCoordinate'],
    delete: ['blockId']
};

export function isBlockEdit(event) {
    return event && Object.hasOwn(fields, event.type) && typeof event.blockId === 'string' &&
        (event.type !== 'change' || ['field', 'mutation'].includes(event.element));
}

export function encodeEdit(event) {
    if (!isBlockEdit(event)) return null;
    const data = {type: event.type};
    for (const key of fields[event.type]) data[key] = key === 'xml' ? event.xml.outerHTML : event[key];
    return data;
}

export function decodeEdit(event) {
    if (!isBlockEdit(event)) return null;
    if (event.type === 'create') return typeof event.xml === 'string' ? {...event, xml: {outerHTML: event.xml}} : null;
    return event;
}

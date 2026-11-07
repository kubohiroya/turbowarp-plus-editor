export type PresentationElements = (injection: HTMLElement) => {
    wrapper?: Element | null;
    extensionButton?: HTMLElement | null;
    watermark?: HTMLElement | null;
};

// These are display-only copies of the controls that belong to the shared editable workspace.
export function captureCodePreviewChrome(workspace, target, presentationElements: PresentationElements | null,
    includeNavigation: boolean) {
    const injection: HTMLElement = workspace.getInjectionDiv();
    const svg = workspace.getParentSvg();
    const {wrapper, extensionButton, watermark} = presentationElements?.(injection) ?? {};
    if (!wrapper) return null;

    const chrome = injection.ownerDocument.createElement('div');
    chrome.setAttribute('inert', '');
    chrome.dataset.codePreviewChrome = '';
    const origin = wrapper.getBoundingClientRect();

    function copy(node: HTMLElement | SVGElement | null | undefined, {right = false, bottom = false, stretch = false, deep = true} = {}) {
        if (!node) return;
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const clone = node.cloneNode(deep) as HTMLElement | SVGElement;
        clone.removeAttribute('id');
        for (const child of clone.querySelectorAll('[id]')) child.removeAttribute('id');
        const style = clone.style;
        // Override the native positioning rules while retaining the control's theme and contents.
        for (const [key, value] of Object.entries({
            position: 'absolute',
            left: right && !stretch ? 'auto' : `${rect.left - origin.left}px`,
            right: right || stretch ? `${origin.right - rect.right}px` : 'auto',
            top: bottom ? 'auto' : `${rect.top - origin.top}px`,
            bottom: bottom ? `${origin.bottom - rect.bottom}px` : 'auto',
            width: stretch ? 'auto' : `${rect.width}px`,
            height: `${rect.height}px`
        })) style.setProperty(key, value, 'important');
        chrome.appendChild(clone);
        return clone;
    }

    const palette = injection.querySelector<HTMLElement | SVGElement>(':scope > .blocklyToolboxDiv');
    const paletteCopy = copy(palette, {stretch: palette?.hasAttribute('data-horizontal-block-palette')});
    const paletteScroll = palette?.scrollLeft ?? 0;
    copy(injection.querySelector<HTMLElement | SVGElement>(':scope > .blocklyFlyout'));
    copy(injection.querySelector<HTMLElement | SVGElement>(':scope > .blocklyFlyoutScrollbar'));
    copy(extensionButton);
    const zoom = includeNavigation && svg.querySelector('.blocklyZoom');
    if (zoom) {
        const shell = copy(svg, {right: true, bottom: true, deep: false});
        if (shell) {
            shell.classList.remove('blocklySvg');
            shell.appendChild(zoom.cloneNode(true));
        }
    }
    copy(injection.querySelector<HTMLElement | SVGElement>(':scope > .blocklyScrollbarVertical.blocklyMainWorkspaceScrollbar'), {right: true});
    copy(injection.querySelector<HTMLElement | SVGElement>(':scope > .blocklyScrollbarHorizontal.blocklyMainWorkspaceScrollbar'), {bottom: true});
    if (includeNavigation) {
        const minimap = copy(injection.querySelector<SVGElement>(':scope > [data-workspace-minimap]'), {right: true, bottom: true});
        const image = copy(watermark, {right: true, bottom: true});
        // The GUI throttles costume changes, so the last frame may still show the previous target.
        const asset = target.getCostumes()[target.currentCostume]?.asset;
        if (minimap && watermark && asset) {
            const mark = image ?? watermark.cloneNode(false) as HTMLElement;
            const img = mark.ownerDocument.createElement('img');
            img.src = asset.encodeDataURI();
            mark.replaceChildren(img);
            mark.style.cssText = watermark.style.cssText;
            mark.style.position = 'absolute';
            chrome.appendChild(mark);
        }
    }
    return {
        mount(container) {
            container.appendChild(chrome);
            if (paletteCopy) paletteCopy.scrollLeft = paletteScroll;
        },
        dispose() {
            chrome.remove();
        }
    };
}

import styles from './preview.css';

const installed = new WeakSet();

export const installPaletteDeletePreview = ScratchBlocks => {
    const gesture = ScratchBlocks.Gesture?.prototype;
    if (!gesture?.handleMove || !gesture.dispose || installed.has(gesture)) return;
    installed.add(gesture);

    const previews = new WeakMap();
    const clear = current => {
        previews.get(current)?.remove();
        previews.delete(current);
    };
    const {handleMove, dispose} = gesture;
    gesture.handleMove = function (event) {
        const result = handleMove.call(this, event);
        const dragger = this.blockDragger_;
        // Reuse the dragger's decision, including deletability and competing connections.
        if (!dragger?.wouldDeleteBlock_ || dragger.deleteArea_ !== ScratchBlocks.DELETE_AREA_TOOLBOX) {
            clear(this);
            return result;
        }

        const workspace = this.startWorkspace_;
        // Addons can report DELETE_AREA_TOOLBOX for drop targets outside the palette.
        const hitbox = workspace.deleteAreaToolbox_;
        const {clientX, clientY} = event;
        if (!hitbox || clientX < hitbox.left || clientX > hitbox.left + hitbox.width ||
            clientY < hitbox.top || clientY > hitbox.top + hitbox.height) {
            clear(this);
            return result;
        }
        const toolbox = workspace.getToolbox()?.HtmlDiv;
        const flyout = workspace.getFlyout()?.svgBackground_;
        const container = workspace.getInjectionDiv();
        if (!toolbox || !container || workspace.isMutator) {
            clear(this);
            return result;
        }

        // The hitbox extends offscreen. Use the visible toolbox and flyout for the overlay.
        const bounds = container.getBoundingClientRect();
        const menu = toolbox.getBoundingClientRect();
        const blocks = toolbox.hasAttribute('data-horizontal-block-palette') ? menu : flyout?.getBoundingClientRect();
        if (!blocks?.width || !blocks.height) {
            clear(this);
            return result;
        }
        const left = Math.max(bounds.left, Math.min(menu.left, blocks.left));
        const top = Math.max(bounds.top, Math.min(menu.top, blocks.top));
        const right = Math.min(bounds.right, Math.max(menu.right, blocks.right));
        const bottom = Math.min(bounds.bottom, Math.max(menu.bottom, blocks.bottom));
        if (right <= left || bottom <= top) {
            clear(this);
            return result;
        }

        let preview = previews.get(this);
        if (!preview) {
            preview = container.ownerDocument.createElement('div');
            preview.className = styles.preview;
            preview.dataset.paletteDeletePreview = '';
            preview.setAttribute('aria-hidden', 'true');
            container.appendChild(preview);
            previews.set(this, preview);
        }
        preview.style.inset = `${top - bounds.top}px ${bounds.right - right}px ${bounds.bottom - bottom}px ${left - bounds.left}px`;
        return result;
    };
    gesture.dispose = function (...args) {
        clear(this);
        return dispose.apply(this, args);
    };
};

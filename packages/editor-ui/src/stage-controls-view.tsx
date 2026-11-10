import React from 'react';
import type {createStageControlsService} from './stage-controls.ts';
import styles from './stage-controls.css';

/** The distribution owns both the registered controls and the view of their service. */
type Service = ReturnType<typeof createStageControlsService>;
interface StageControlsProps {
    service: Service;
    isSmall?: boolean;
    menuLocale?: string;
}
interface StageControlsState {
    controls: ReturnType<Service['snapshot']>;
    panel: HTMLElement | null;
    debuggerButton: HTMLElement | null;
    recordButton: ReturnType<Service['recordButton']>;
}

/**
 * The debugger add-on's button, kept on the menu bar on its own rather than in the extension tray:
 * it is always there once the add-on is on, whereas the tray holds what the project's extensions
 * registered. Its add-on icon is a shell prompt; like a browser's own "more tools" entry point it is
 * drawn as "…" instead (see the stylesheet), and given the name and keyboard handling of a button.
 */
function DebuggerButton ({element, label}: {element: HTMLElement; label: string}) {
    const mount = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        const root = mount.current;
        root.appendChild(element);
        return () => {
            if (element.parentNode === root) element.remove();
        };
    }, [element]);
    React.useLayoutEffect(() => {
        const button = element.querySelector<HTMLElement>('[class*="stage-header_stage-button"]');
        if (!button) return;
        const activate = (event: KeyboardEvent) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            button.click();
        };
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('aria-label', label);
        button.title = label;
        button.addEventListener('keydown', activate);
        return () => button.removeEventListener('keydown', activate);
    }, [element, label]);
    return <div className={styles.debuggerButton} ref={mount} />;
}

/**
 * The stage recorder add-on's control as an icon button, on the menu bar on its own beside the
 * debugger for the same reason: it is always there once the add-on is on. The add-on's own element stays out of the
 * document: it keeps its click handler and writes its state into its text, which this button reads.
 * While idle the button is the icon alone; otherwise the state ("Stop recording", a countdown, ...)
 * is shown beside it so it is clear that recording is in progress and how to stop it.
 */
function RecordButton ({element, idleText}: {element: HTMLElement; idleText: string}) {
    const read = () => ({text: (element.textContent || '').trim(), title: element.title});
    const [state, setState] = React.useState(read);
    React.useEffect(() => {
        setState(read());
        const Observer = element.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        const observer = new Observer(() => setState(read()));
        observer.observe(element, {childList: true, characterData: true, subtree: true, attributes: true,
            attributeFilter: ['title']});
        return () => observer.disconnect();
    }, [element]);
    const busy = state.text !== '' && state.text !== idleText;
    const label = state.text || idleText;
    return (
        <button
            aria-label={label}
            aria-pressed={busy}
            className={styles.recordButton}
            data-addon-stage-control="mediarecorder"
            title={state.title || label}
            type="button"
            onClick={() => element.click()}
        >
            <span aria-hidden="true" className={styles.icon}>🎥</span>
            {busy && <span className={styles.label}>{state.text}</span>}
        </button>
    );
}

class StageControlsView extends React.PureComponent<StageControlsProps, StageControlsState> {
    declare unsubscribe?: () => void;
    declare panelRoot?: HTMLElement | null;
    declare mountedPanel?: HTMLElement | null;

    constructor (props: StageControlsProps) {
        super(props);
        this.state = this.readService();
        this.handleChange = this.handleChange.bind(this);
        this.mountPanel = this.mountPanel.bind(this);
    }
    readService () {
        const {service} = this.props;
        return {controls: service.snapshot(), panel: service.panel?.() || null, debuggerButton: service.debuggerButton(),
            recordButton: service.recordButton?.() || null};
    }
    bindService () {
        this.unsubscribe?.();
        this.unsubscribe = this.props.service.subscribe(this.handleChange);
        this.handleChange();
    }
    componentDidMount () {
        this.bindService();
    }
    componentDidUpdate (previous: StageControlsProps) {
        if (previous.service !== this.props.service) this.bindService();
        this.mountPanel(this.panelRoot);
    }
    componentWillUnmount () {
        this.unsubscribe?.();
        this.mountPanel(null);
    }
    handleChange () {
        this.setState(this.readService());
    }
    mountPanel (node: HTMLElement | null) {
        const panel = node ? this.state.panel : null;
        if (this.mountedPanel && this.mountedPanel !== panel && this.mountedPanel.parentNode === this.panelRoot) {
            this.panelRoot.removeChild(this.mountedPanel);
        }
        this.panelRoot = node;
        this.mountedPanel = panel;
        if (node && panel && panel.parentNode !== node) node.appendChild(panel);
    }
    render () {
        const {isSmall, menuLocale} = this.props;
        const {panel, debuggerButton, recordButton} = this.state;
        const buttons = this.state.controls.filter(control => control.visible).map(control => (
            <button
                aria-expanded={control.expanded}
                aria-haspopup="dialog"
                aria-label={control.label}
                className={styles.control}
                data-extension-stage-control={control.id}
                data-runtime-dock-control={control.id}
                key={control.id}
                ref={control.ref}
                title={control.label}
                type="button"
                onClick={control.onClick}
            >
                <span aria-hidden="true" className={styles.icon}>{control.icon}</span>
                {!isSmall && control.text !== '' && <span className={styles.label}>{control.text}</span>}
            </button>
        ));
        if (menuLocale === undefined) return <>
            {buttons}
            {panel && <div className={styles.panel} ref={this.mountPanel} />}
        </>;
        if (!buttons.length && !debuggerButton && !recordButton && !panel) return null;
        const japanese = /^ja(?:-|$)/i.test(menuLocale);
        return <>
            {recordButton && <RecordButton element={recordButton.element} idleText={recordButton.idleText} />}
            {debuggerButton && <DebuggerButton element={debuggerButton} label={japanese ? 'デバッグ' : 'Debugger'} />}
            {(buttons.length > 0 || panel) && <div className={styles.menuDock}>
                {buttons.length > 0 && <div
                    className={styles.controlGroup}
                    role="group"
                    aria-label={japanese ? '機能拡張コントロールボタン領域' : 'Extension controls'}
                >
                    {buttons}
                </div>}
                {panel && <div className={styles.menuPanel} ref={this.mountPanel} />}
            </div>}
        </>;
    }
}

export default StageControlsView;

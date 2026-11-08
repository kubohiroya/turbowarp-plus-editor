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
}

function DebuggerButton ({element}: {element: HTMLElement}) {
    const mount = React.useRef<HTMLDivElement>(null);
    React.useLayoutEffect(() => {
        const root = mount.current;
        root.appendChild(element);
        return () => {
            if (element.parentNode === root) element.remove();
        };
    }, [element]);
    return <div className={styles.debuggerButton} ref={mount} />;
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
        return {controls: service.snapshot(), panel: service.panel?.() || null, debuggerButton: service.debuggerButton()};
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
        const {panel, debuggerButton} = this.state;
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
                <span aria-hidden="true">{control.icon}</span>
                {!isSmall && <span className={styles.label}>{control.text}</span>}
            </button>
        ));
        if (menuLocale === undefined) return <>
            {buttons}
            {panel && <div className={styles.panel} ref={this.mountPanel} />}
        </>;
        const hasButtons = buttons.length > 0 || Boolean(debuggerButton);
        if (!hasButtons && !panel) return null;
        const label = /^ja(?:-|$)/i.test(menuLocale) ? '機能拡張コントロールボタン領域' : 'Extension controls';
        return <div className={styles.menuDock}>
            {hasButtons && <div className={styles.controlGroup} role="group" aria-label={label}>
                {buttons}
                {debuggerButton && <DebuggerButton element={debuggerButton} />}
            </div>}
            {panel && <div className={styles.menuPanel} ref={this.mountPanel} />}
        </div>;
    }
}

export default StageControlsView;

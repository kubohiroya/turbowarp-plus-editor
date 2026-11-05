import React from 'react';
import type {createStageControlsService} from '../stage-controls.ts';
import styles from './view.css';

/** The distribution owns both the registered controls and the view of their service. */
type Service = ReturnType<typeof createStageControlsService>;
interface StageControlsProps {
    service: Service;
    isSmall?: boolean;
}
interface StageControlsState {
    controls: ReturnType<Service['snapshot']>;
    panel: HTMLElement | null;
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
        return {controls: this.props.service.snapshot(), panel: this.props.service.panel?.() || null};
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
        return (
            <React.Fragment>
                {this.state.controls.filter(control => control.visible).map(control => (
                    <button
                        aria-expanded={control.expanded}
                        aria-haspopup="dialog"
                        aria-label={control.label}
                        className={styles.control}
                        data-extension-stage-control={control.id}
                        key={control.id}
                        ref={control.ref}
                        title={control.label}
                        type="button"
                        onClick={control.onClick}
                    >
                        <span aria-hidden="true">{control.icon}</span>
                        {!this.props.isSmall && <span className={styles.label}>{control.text}</span>}
                    </button>
                ))}
                {this.state.panel && <div className={styles.panel} ref={this.mountPanel} />}
            </React.Fragment>
        );
    }
}

export default StageControlsView;

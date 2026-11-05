import React from 'react';
import {connect} from 'react-redux';
import {BLOCK_EDITOR_MODAL} from '../../plus-integration.js';
import afterNativeFieldStartup from '../lib/tw-block-editor-startup.js';
import getBlockEditorService from '../lib/tw-block-editor-service.js';
import {hostBlockEditor, hostIntegration} from '../lib/tw-plus-integration-points.js';
import BlockEditorModal from './tw-block-editor-modal.jsx';

// The native Blocks component reports when its workspace is ready and when it is about to be
// disposed. The host attaches its workspace features and presents its own modal.
const createBlocksWrapper = ({ModalComponent, openHostModal, closeHostModal, onError}) => Blocks => {
    class PlusBlocks extends React.Component {
        constructor (props) {
            super(props);
            this.state = {dialog: null};
            this.handleWorkspaceReady = this.handleWorkspaceReady.bind(this);
            this.disposeWorkspace = this.disposeWorkspace.bind(this);
        }
        componentDidUpdate () {
            // A VM replacement must not leave a live or pending editor on the old workspace.
            if (this.attachment && this.attachment.vm !== this.props.vm) this.disposeWorkspace();
        }
        componentWillUnmount () {
            this.unmounting = true;
            this.disposeWorkspace();
        }
        handleWorkspaceReady (workspace, ScratchBlocks, startupReady) {
            this.disposeWorkspace();
            const integration = hostIntegration();
            const editor = hostBlockEditor(integration);
            const {vm} = this.props;
            const attachment = {vm};
            this.attachment = attachment;
            try {
                attachment.minimap = integration?.attachWorkspaceMinimap?.(workspace, ScratchBlocks);
            } catch (error) {
                onError(error);
            }
            if (!editor) return;
            const isCurrent = () => this.attachment === attachment && this.props.vm === vm;
            const canOpen = () => isCurrent() && this.props.isVisible && !this.props.anyModalVisible && !this.dialog;
            afterNativeFieldStartup(startupReady, fixedInputs => {
                const {intl} = this.props;
                attachment.bridge = editor.attach({
                    fixedInputs,
                    ScratchBlocks,
                    workspace,
                    vm,
                    service: getBlockEditorService(vm, intl, integration),
                    label: intl.formatMessage({
                        id: 'tw.blockEditor.open',
                        defaultMessage: 'Edit block',
                        description: 'Tooltip for an extension block editor icon'
                    }),
                    canOpen,
                    onOpen: (session, nodeLabels, nodeAppearances) => {
                        if (!canOpen()) {
                            session.dispose();
                            return;
                        }
                        getBlockEditorService(vm, this.props.intl, integration);
                        const dialog = {session, nodeLabels, nodeAppearances};
                        this.dialog = dialog;
                        this.props.onModalOpen();
                        if (this.dialog === dialog) this.setState({dialog});
                    },
                    onError
                });
            }, () => !isCurrent(), onError);
        }
        closeDialog (dialog) {
            if (!dialog || this.dialog !== dialog) return;
            this.dialog = null;
            if (!this.unmounting) this.setState({dialog: null});
            this.props.onModalClose();
        }
        disposeWorkspace () {
            const {attachment, dialog} = this;
            this.attachment = null;
            try {
                try {
                    attachment?.minimap?.dispose();
                } finally {
                    attachment?.bridge?.dispose();
                }
            } catch (error) {
                onError(error);
            } finally {
                this.closeDialog(dialog);
            }
        }
        render () {
            const {onModalOpen, onModalClose, ...props} = this.props;
            const {dialog} = this.state;
            return (
                <React.Fragment>
                    <Blocks
                        {...props}
                        onWorkspaceReady={this.handleWorkspaceReady}
                        onWorkspaceWillDispose={this.disposeWorkspace}
                    />
                    {dialog && (
                        <BlockEditorModal
                            {...dialog}
                            ModalComponent={ModalComponent}
                            onClose={() => this.closeDialog(dialog)}
                            onError={onError}
                        />
                    )}
                </React.Fragment>
            );
        }
    }
    return connect(null, dispatch => ({
        onModalOpen: () => dispatch(openHostModal(BLOCK_EDITOR_MODAL)),
        onModalClose: () => dispatch(closeHostModal(BLOCK_EDITOR_MODAL))
    }))(PlusBlocks);
};

export default createBlocksWrapper;

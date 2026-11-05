import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import {attachHostToWorkspace, hostIntegration} from '../lib/tw-plus-integration-points.ts';

/**
 * Where the distributing host attaches whatever it runs alongside the workspace.
 *
 * This renders nothing. It exists because attaching needs a VM and the editor's locale, which only
 * the connected tree knows, and because something has to dispose of the attachment when the VM is
 * replaced. What is attached is the host's business: this fork passes the VM, the locale, the
 * document and a way to reach ScratchBlocks, and never looks inside what comes back.
 */
export const createWorkspaceAttachment = ({LazyScratchBlocks, log}) => {
    interface AttachmentProps {
        vm: object;
        locale: string;
        messages: Record<string, string>;
    }
    class PlusWorkspaceAttachment extends React.Component<AttachmentProps> {
        declare attachment: {dispose(): void} | null;
        declare static propTypes: React.WeakValidationMap<AttachmentProps>;

        componentDidMount () {
            this.attach();
        }
        componentDidUpdate (previous: AttachmentProps) {
            // Only the VM identity matters. The host is handed the current locale when it attaches and
            // what it mounts is not rebuilt for a language change, which is how this behaved before.
            if (previous.vm !== this.props.vm) {
                this.detach();
                this.attach();
            }
        }
        componentWillUnmount () {
            this.detach();
        }
        attach () {
            try {
                this.attachment = attachHostToWorkspace({
                    vm: this.props.vm,
                    locale: this.props.locale,
                    document,
                    getMessages: () => this.props.messages,
                    getBlockly: () => LazyScratchBlocks.load().then(() => LazyScratchBlocks.get())
                }, hostIntegration());
            } catch (error) {
                // A host that throws must not keep the editor from opening.
                log.error('The host integration could not attach to the workspace.', error);
                this.attachment = null;
            }
        }
        detach () {
            try {
                if (this.attachment) this.attachment.dispose();
            } catch (error) {
                log.error('The host integration could not be detached from the workspace.', error);
            }
            this.attachment = null;
        }
        render () {
            return null;
        }
    }
    PlusWorkspaceAttachment.propTypes = {
        vm: PropTypes.shape({}).isRequired, locale: PropTypes.string, messages: PropTypes.objectOf(PropTypes.string)
    };
    const mapStateToProps = state => ({
        vm: state.scratchGui.vm, locale: state.locales.locale, messages: state.locales.messages
    });
    return connect(mapStateToProps)(PlusWorkspaceAttachment);
};
export default createWorkspaceAttachment;

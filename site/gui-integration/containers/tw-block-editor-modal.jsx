import PropTypes from 'prop-types';
import {injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import theme from '../../block-editor/theme.css';
import {hostBlockEditor, hostIntegration} from '../lib/tw-plus-integration-points.js';

const BlockEditorModal = ({dark, intl, nodeAppearances, nodeLabels, onClose, session, ModalComponent, onError}) =>
    hostBlockEditor(hostIntegration())?.render({
        intl,
        nodeAppearances,
        nodeLabels,
        onClose,
        session,
        ModalComponent,
        onError,
        className: dark ? theme.dark : undefined
    }) || null;

BlockEditorModal.propTypes = {
    dark: PropTypes.bool,
    ModalComponent: PropTypes.elementType.isRequired,
    onError: PropTypes.func.isRequired,
    nodeAppearances: PropTypes.object,
    nodeLabels: PropTypes.object,
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    session: PropTypes.object.isRequired
};

export {BlockEditorModal};
export default connect(state => ({dark: state.scratchGui.theme.theme.isDark()}))(injectIntl(BlockEditorModal));

import PropTypes from 'prop-types';
import {injectIntl, intlShape} from 'react-intl';
import {hostBlockEditor, hostIntegration} from '../lib/tw-plus-integration-points.js';

const BlockEditorModal = ({intl, nodeAppearances, nodeLabels, onClose, session, ModalComponent, onError}) =>
    hostBlockEditor(hostIntegration())?.render({
        intl,
        nodeAppearances,
        nodeLabels,
        onClose,
        session,
        ModalComponent,
        onError
    }) || null;

BlockEditorModal.propTypes = {
    ModalComponent: PropTypes.elementType.isRequired,
    onError: PropTypes.func.isRequired,
    nodeAppearances: PropTypes.object,
    nodeLabels: PropTypes.object,
    intl: intlShape,
    onClose: PropTypes.func.isRequired,
    session: PropTypes.object.isRequired
};

export {BlockEditorModal};
export default injectIntl(BlockEditorModal);

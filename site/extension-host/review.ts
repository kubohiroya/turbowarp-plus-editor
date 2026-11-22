import {createProjectSecurityReview} from '@kubohiroya/turbowarp-extension-security-dialog/project-review';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import styles from '@kubohiroya/turbowarp-extension-security-dialog/project-review.css';
import {duringProjectLoadApproval} from '@kubohiroya/turbowarp-plus-editor-workbench/project-load-progress';
import {plusTrustedExtensions} from '../trusted-extensions.ts';
import {plusCatalog} from '../plus-catalog.ts';
import {pendingPlusReview} from './review-channel.ts';
import {reviewedProjectArchive} from '@kubohiroya/turbowarp-extension-loader/shared-project-archive';

export const {identifyProject, plusReviewRows, frameFor, createSecurityReview} = createProjectSecurityReview({
    catalog: plusCatalog, trusted: plusTrustedExtensions.catalog, pendingReview: pendingPlusReview,
    reviewedArchive: reviewedProjectArchive, duringApproval: duringProjectLoadApproval, styles
});
export const plusSecurityReview = createSecurityReview();

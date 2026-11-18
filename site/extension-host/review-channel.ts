import {createProjectReviewChannel} from '@kubohiroya/turbowarp-extension-security-dialog/project-review-channel';
export type {ReadEmbeddedReviewFile} from '@kubohiroya/turbowarp-extension-security-dialog/project-review-channel';
export const {openPlusReview, pendingPlusReview, closePlusReview} = createProjectReviewChannel();

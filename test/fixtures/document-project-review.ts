import type {Page} from '@playwright/test';

export const documentProjectReview = (page: Page) =>
    page.getByRole('dialog').filter({has: page.locator('.twextsec-review')});

// Only use this for the repository's generated document-source and YAML settings SB3 fixtures.
export async function approveDocumentProjectFixture(page: Page) {
    const review = documentProjectReview(page);
    await review.getByTestId('twextsec-enable-all').click({timeout: 60000});
    await review.waitFor({state: 'hidden', timeout: 60000});
}

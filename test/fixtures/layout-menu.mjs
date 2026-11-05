export const layoutMenu = page => page.getByLabel(/^(Layout options|配置メニュー)$/);

export const undockButtons = page => page.locator('details').filter({has: layoutMenu(page)})
    .locator('button[aria-pressed]');

export async function toggleUndockButtons(page, click = button => button.click()) {
    await click(layoutMenu(page));
    await click(undockButtons(page));
}

module.exports = async function selectBackdrop(page) {
    const pin = page.getByRole('button', {name: 'スプライト一覧を固定表示', exact: true});
    if (!await pin.isVisible()) {
        await page.getByRole('button', {name: 'スプライト一覧を展開', exact: true}).hover();
    }
    if (await pin.getAttribute('aria-pressed') === 'false') await pin.click();
    await page.getByRole('button', {name: '背景', exact: true}).click();
};

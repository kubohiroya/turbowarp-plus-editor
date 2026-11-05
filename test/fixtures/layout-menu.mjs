export const layoutMenu = page => page.getByRole('button', {name: /^(Layout options|配置メニュー)$/});

export const undockButtons = page => page.getByRole('menuitemcheckbox', {
    name: /^(Show undock buttons|アンドックボタンを表示)$/
});

export async function toggleUndockButtons(page, click = button => button.click()) {
    await click(layoutMenu(page));
    await click(undockButtons(page));
}

export async function readUndockButtonsChecked(page) {
    await layoutMenu(page).press('ArrowDown');
    const item = undockButtons(page);
    const checked = await item.getAttribute('aria-checked');
    await item.press('Escape');
    return checked === 'true';
}

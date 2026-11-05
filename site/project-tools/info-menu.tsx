import React from 'react';
import logo from '../extension-library/icon.svg';
import styles from './info-menu.css';

export function ProjectInfoMenu({locale}) {
    const menu = React.useRef(null);
    const japanese = /^ja(?:-|$)/i.test(locale);
    const label = japanese ? 'TurboWarp Plus プロジェクト情報' : 'TurboWarp Plus project information';
    React.useEffect(() => {
        const node = menu.current;
        const dismiss = event => {
            if (!node.contains(event.target)) node.open = false;
        };
        node.ownerDocument.addEventListener('pointerdown', dismiss, true);
        return () => node.ownerDocument.removeEventListener('pointerdown', dismiss, true);
    }, []);
    const close = () => { menu.current.open = false; };
    return <details className={styles.root} ref={menu} onKeyDown={event => {
        if (event.key !== 'Escape' || !menu.current.open) return;
        event.stopPropagation();
        close();
        menu.current.firstElementChild.focus();
    }}>
        <summary aria-label={label} title={label}><img src={logo} alt="" draggable={false} /></summary>
        <nav aria-label={label}>
            <a href="./" target="_blank" rel="noreferrer" onClick={close}>
                {japanese ? 'TurboWarp Plus Editor について' : 'About TurboWarp Plus Editor'}
            </a>
            <a href="https://github.com/kubohiroya/turbowarp-plus-editor" target="_blank" rel="noreferrer" onClick={close}>
                {japanese ? 'ソースコード' : 'Source code'}
            </a>
            <a href="credits.html" target="_blank" rel="noreferrer" onClick={close}>
                {japanese ? 'ライセンスとクレジット' : 'Licenses and credits'}
            </a>
        </nav>
    </details>;
}

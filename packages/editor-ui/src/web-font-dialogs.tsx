import React, {useEffect, useRef, useState} from 'react';
import {webFontEditor, webFonts} from './web-fonts.ts';
import styles from './web-font-dialogs.css';

const strings = locale => /^ja(?:-|$)/i.test(locale) ? {
    add: 'Web フォントを追加', font: 'フォント', fallback: '代替フォント',
    hint: 'Google Fonts の欧文フォントです。オフライン時や Packager での書き出しには代替フォントを使います。',
    duplicate: 'このフォントは追加済みか、使用できません。',
    loading: '読み込み中…', cancel: '戻る',
    title: 'Web フォントの読み込み', notice: 'この作品は Google Fonts（fonts.gstatic.com）から次のフォントを読み込みます。',
    allow: '読み込む', decline: '代替フォントで開く', web: 'Web フォント'
} : {
    add: 'Add a web font', font: 'Font', fallback: 'Fallback font',
    hint: 'Latin fonts from Google Fonts. Offline and Packager exports use the fallback font.',
    duplicate: 'This font is already installed or unavailable.',
    loading: 'Loading…', cancel: 'Back',
    title: 'Load web fonts', notice: 'This project requests the following fonts from Google Fonts (fonts.gstatic.com).',
    allow: 'Load fonts', decline: 'Open with fallback fonts', web: 'Web font'
};

const webFontLabel = locale => strings(locale).web;

function WebFontButton({className, locale, onClick}) {
    return <button type="button" className={className} onClick={onClick}>{strings(locale).add}</button>;
}

function WebFontForm({manager, locale, onClose}) {
    const text = strings(locale);
    const [id, setId] = useState(webFonts[0].id);
    const [fallback, setFallback] = useState('Sans Serif');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    return <form className={styles.form} aria-busy={busy} data-plus-web-fonts onSubmit={async event => {
        event.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(false);
        try {
            const added = await webFontEditor(manager)?.add(id, fallback);
            if (!mounted.current) return;
            if (added) onClose();
            else setError(true);
        } catch {
            if (mounted.current) setError(true);
        } finally {
            if (mounted.current) setBusy(false);
        }
    }}>
        <p>{text.hint}</p>
        <div className={styles.field}>
            <label htmlFor="plus-web-font-family">{text.font}</label>
            <select id="plus-web-font-family" value={id} onChange={event => setId(event.target.value)} disabled={busy}>
                {webFonts.map(font => <option key={font.id} value={font.id}>{font.family}</option>)}
            </select>
        </div>
        <div className={styles.field}>
            <label htmlFor="plus-web-font-fallback">{text.fallback}</label>
            <select id="plus-web-font-fallback" value={fallback} onChange={event => setFallback(event.target.value)} disabled={busy}>
                {['Sans Serif', 'Serif', 'Handwriting', 'Marker', 'Curly', 'Pixel'].map(font =>
                    <option key={font} value={font}>{font}</option>)}
            </select>
        </div>
        {error && <p role="alert">{text.duplicate}</p>}
        <div className={styles.actions}>
            <button type="button" disabled={busy} onClick={onClose}>{text.cancel}</button>
            <button type="submit" disabled={busy}>{busy ? text.loading : text.add}</button>
        </div>
    </form>;
}

function WebFontApproval({families, locale, DialogFrame, onComplete}) {
    const text = strings(locale);
    return <DialogFrame className={styles.frame} id="web-font-approval" contentLabel={text.title}
        onRequestClose={() => onComplete(false)}>
        <div className={styles.body} data-plus-web-fonts>
            <p>{text.notice}</p>
            <ul>{families.map(family => <li key={family}>{family}</li>)}</ul>
            <div className={styles.actions}>
                <button type="button" onClick={() => onComplete(false)}>{text.decline}</button>
                <button type="button" onClick={() => onComplete(true)}>{text.allow}</button>
            </div>
        </div>
    </DialogFrame>;
}

export default {WebFontButton, WebFontForm, WebFontApproval, webFontLabel};

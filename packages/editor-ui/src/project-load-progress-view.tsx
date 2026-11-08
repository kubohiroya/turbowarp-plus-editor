import React, {useEffect, useMemo, useState} from 'react';
import {projectLoadSnapshot, subscribeProjectLoadProgress} from './project-load-progress.ts';
import type {ProjectLoadPhase} from './project-load-progress.ts';
import styles from './project-load-progress.css';

const japanese: Record<ProjectLoadPhase, string> = {
    opening: 'プロジェクトの読み込みを準備中…',
    payloads: 'SB3 内の作品データを確認中…',
    archive: 'SB3 を検査・展開中…',
    project: 'プロジェクトを解析中…',
    assets: '画像・音声を読み込み中…',
    extensions: '拡張機能を読み込み中…',
    approval: 'ユーザーの確認待ち…',
    finishing: 'エディターを準備中…'
};
const english: Record<ProjectLoadPhase, string> = {
    opening: 'Preparing to open the project…',
    payloads: 'Checking project data in the SB3…',
    archive: 'Validating and unpacking the SB3…',
    project: 'Parsing the project…',
    assets: 'Loading images and sounds…',
    extensions: 'Loading extensions…',
    approval: 'Waiting for your confirmation…',
    finishing: 'Preparing the editor…'
};

export function ProjectLoadProgress({vm, locale, children}: {
    vm: object;
    locale: string;
    children: React.ReactNode;
}) {
    const [snapshot, setSnapshot] = useState(() => projectLoadSnapshot(vm));
    useEffect(() => {
        let frame: number | undefined;
        const sync = () => setSnapshot(projectLoadSnapshot(vm));
        const unsubscribe = subscribeProjectLoadProgress(vm, () => {
            if (frame !== undefined) return;
            frame = window.requestAnimationFrame(() => {
                frame = undefined;
                sync();
            });
        });
        sync();
        return () => {
            unsubscribe();
            if (frame !== undefined) window.cancelAnimationFrame(frame);
        };
    }, [vm]);

    const ja = locale.startsWith('ja');
    const labels = ja ? japanese : english;
    const current = snapshot?.current;
    const history = ja ? '読み込み履歴' : 'Loading history';
    const clock = useMemo(() => new Intl.DateTimeFormat(ja ? 'ja' : locale, {
        hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23'
    }), [ja, locale]);
    return <React.Fragment>
        <span hidden={Boolean(current)}>{children}</span>
        {current && <div className={styles.progress} role="group" tabIndex={0} aria-label={history} data-project-load-progress="">
            <div className={styles.current} role="status" data-phase={current.phase}>
                {labels[current.phase]}
                {snapshot.assets && ` (${snapshot.assets.finished}/${snapshot.assets.total})`}
            </div>
            <div className={styles.history} data-project-load-history="">
                <div className={styles.heading}>{history}</div>
                {snapshot.previous.length ? <ol>
                    {snapshot.previous.map(({phase, time, elapsed}, index) => <li key={index} data-phase={phase}>
                        <time dateTime={new Date(time).toISOString()}>{clock.format(time)}</time>
                        <span className={styles.elapsed}>+{(elapsed / 1000).toFixed(2)} {ja ? '秒' : 's'}</span>
                        <span>{labels[phase]}</span>
                    </li>)}
                </ol> : <div>{ja ? '完了した工程はまだありません。' : 'No previous steps yet.'}</div>}
            </div>
        </div>}
    </React.Fragment>;
}

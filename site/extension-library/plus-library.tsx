/**
 * The Plus tab of the extension library: what this distribution offers, and the review before any
 * of it runs.
 *
 * Moved from the fork's `src/containers/tw-plus-library.jsx` with its stylesheet and icon. The
 * catalog, the review screen, both languages of its text and the whole offer are this
 * distribution's; the GUI's library only makes room for a tab and renders what it is given.
 *
 * Choosing and reviewing are one screen: `ExtensionReview` in its `add` mode lists the catalog,
 * selects what a chosen extension needs, and asks how each one loads, in the same four forms the
 * Loader's manifest records. A catalog row is trusted, so it runs without the sandbox and the
 * screen states that instead of asking.
 *
 * The library's search text (`filterQuery`) is not applied to this screen: it keeps its answers by
 * row from the rows it was first given, and narrowing them while someone types would drop a chosen
 * extension's dependency out of a selection it is still completing.
 *
 * A failed load is stated by the screen, not here: the failure goes to `ExtensionReview` as its
 * `failure`, and whether asking again could end differently is the Loader's `isWorthAskingAgain`,
 * passed through as `retryable`. "Try again" repeats the last answer as it was. With the Loader
 * switched off the failure comes from the VM's own extension loading, which no fetch port of the
 * Loader produced, so the Loader cannot vouch for it and the screen offers no retry.
 *
 * The GUI's own `src/css/extension-security-dialog.css` is not imported here: its security manager
 * imports it already, and that is what themes the dialog package against the GUI's own variables.
 */

import {ExtensionReview} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {parseExtensionCatalog} from '@kubohiroya/turbowarp-extension-security-dialog';
import type {CatalogEntry, ReviewDecision, ReviewEntry, ReviewFailure} from '@kubohiroya/turbowarp-extension-security-dialog';
import {isWorthAskingAgain} from '@kubohiroya/turbowarp-extension-loader';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import {plusCatalog} from '../plus-catalog.ts';
import {applyPlusCatalogSettings, readPlusCatalogSettings} from './catalog-settings.ts';
import {PLUS_EXTENSION_LOADER_ENABLED} from './flags.ts';
import loadPlusExtensions from './load-extensions.ts';
import styles from './plus-library.css';

const text = {
    en: {
        loading: 'Loading TurboWarp Plus extensions…',
        failed: 'The extension catalog could not be loaded.',
        denied: 'No extensions were loaded. Review the selected extensions and their permissions.',
        retry: 'Retry'
    },
    ja: {
        loading: 'TurboWarp Plusの機能拡張を取得しています…',
        failed: '機能拡張の一覧を取得できませんでした。',
        denied: '機能拡張は読み込まれませんでした。選択と読み込み許可を確認してください。',
        retry: '再試行'
    }
};

/**
 * The catalog as rows of the review screen.
 *
 * With the Loader switched off there is nothing to write a form into — the extension loads by its
 * address, as a custom extension does — so the rows say so and the screen offers no form.
 * @param {Array<object>} entries Parsed catalog entries.
 * @param {object} vm The VM, to say which are already running.
 * @param {boolean} [loader] Whether the Loader writes the chosen form into the project.
 * @returns {Array<object>} One `ReviewEntry` per catalog entry, keyed by its extension ID.
 */
interface LibraryVM {
    extensionManager: {
        isExtensionLoaded(id: string): boolean;
        _loadedExtensions: ReadonlyMap<string, string>;
    };
}
type Decisions = Map<string, ReviewDecision>;
interface LibraryProps {
    vm: LibraryVM;
    locale: string;
    filterQuery?: string;
    permissions: Parameters<typeof loadPlusExtensions>[3];
    onBusyChange(busy: boolean): void;
    onCategorySelected(id: string): void;
    onRequestClose(): void;
}
interface LibraryState {
    entries: CatalogEntry[] | null;
    fetchError: boolean;
    denied: boolean;
    failure: ReviewFailure | null;
    busy: boolean;
    decisions: Decisions;
}
export const reviewRows = (entries: CatalogEntry[], vm: LibraryVM,
    loader = PLUS_EXTENSION_LOADER_ENABLED): ReviewEntry[] => entries.map(entry => ({
    key: entry.id,
    ids: [entry.id],
    metadata: entry.metadata,
    source: {kind: loader ? 'catalog' : 'legacy', url: entry.url},
    dependencies: [...(entry.dependencies || [])],
    state: {trusted: true, loaded: vm.extensionManager.isExtensionLoaded(entry.id)}
}));

class PlusLibrary extends React.PureComponent<LibraryProps, LibraryState> {
    declare controller?: AbortController;
    declare answered: Decisions | null;
    declare alive: boolean;
    declare static propTypes: Record<string, PropTypes.Validator<unknown>>;

    constructor (props: LibraryProps) {
        super(props);
        bindAll(this, ['handleFetchCatalog', 'handleComplete', 'handleRetry']);
        this.state = {entries: null,
            fetchError: false,
            denied: false,
            failure: null,
            busy: false,
            decisions: new Map()};
        // The last answer the screen gave, which "Try again" repeats unchanged.
        this.answered = null;
    }
    componentDidMount () {
        this.alive = true;
        this.handleFetchCatalog();
    }
    componentWillUnmount () {
        this.alive = false;
        if (this.controller) this.controller.abort();
    }
    async handleFetchCatalog () {
        if (this.controller) this.controller.abort();
        this.controller = new AbortController();
        this.setState({fetchError: false});
        const timeout = setTimeout(() => this.controller.abort(), 15000);
        try {
            const read = await plusCatalog.read(this.controller.signal);
            const entries = read.catalog ? parseExtensionCatalog(read.catalog) : [];
            // Display images come from the trusted build, not from a project or remote metadata,
            // and the side that owns them has already checked them.
            const icons = read.icons || {};
            for (const entry of entries) {
                if (Object.hasOwn(icons, entry.id)) {
                    entry.metadata = {...entry.metadata, banner: icons[entry.id]};
                }
            }
            const {decisions} = await readPlusCatalogSettings(this.props.vm, entries);
            if (this.alive) this.setState({entries, decisions});
        } catch (error) {
            if (this.alive) {
                console.error(error);
                this.setState({fetchError: true});
            }
        } finally {
            clearTimeout(timeout);
        }
    }
    /**
     * Act on the screen's answer: every chosen row, with how it runs and how it loads.
     * @param {Map<string, object>|null} decisions The answer by extension ID, or null for no.
     */
    async handleComplete (decisions: Decisions | null) {
        if (decisions === null) {
            this.props.onRequestClose();
            return;
        }
        this.answered = decisions;
        await this.apply(decisions);
    }
    /**
     * Ask again with the answer that just failed, as the screen's "Try again" requests.
     */
    async handleRetry () {
        if (this.answered && !this.state.busy) await this.apply(this.answered);
    }
    /**
     * Load the chosen rows as answered, and keep how it failed for the screen to state.
     * @param {Map<string, object>} decisions The answer by extension ID.
     */
    async apply (decisions: Decisions) {
        const chosen = this.state.entries.filter(entry => decisions.has(entry.id));
        this.setState({busy: true, denied: false, failure: null});
        this.props.onBusyChange(true);
        try {
            const loaded = PLUS_EXTENSION_LOADER_ENABLED ?
                await applyPlusCatalogSettings(this.props.vm, {entries: chosen, decisions},
                    {signal: this.controller.signal}) :
                await loadPlusExtensions(this.props.vm, chosen,
                    new Map(chosen.map(entry => [entry.url, decisions.get(entry.id).execution])),
                    this.props.permissions);
            if (!this.alive) return;
            if (loaded.length) {
                this.props.onCategorySelected(loaded[loaded.length - 1]);
                this.props.onRequestClose();
            } else this.setState({denied: true});
        } catch (error) {
            console.error(error);
            if (this.alive) {
                this.setState({failure: {code: error?.code || 'LOAD_FAILED', message: error?.message || String(error),
                    retryable: isWorthAskingAgain(error)}});
            }
        } finally {
            if (this.alive) {
                this.setState({busy: false});
                this.props.onBusyChange(false);
            }
        }
    }
    render () {
        const t = text[this.props.locale.startsWith('ja') ? 'ja' : 'en'];
        const {entries, busy, denied, failure, fetchError, decisions} = this.state;
        if (!entries) {
            return (<div
                className={styles.message}
                role={fetchError ? 'alert' : 'status'}
            >
                <p>{fetchError ? t.failed : t.loading}</p>
                {fetchError && <button
                    type="button"
                    onClick={this.handleFetchCatalog}
                >{t.retry}</button>}
            </div>);
        }
        return (<div className={styles.root}>
            {denied && <p
                className={styles.error}
                role="alert"
            >{t.denied}</p>}
            <div hidden={busy}>
                <ExtensionReview
                    mode="add"
                    entries={reviewRows(entries, this.props.vm)}
                    initialDecisions={decisions}
                    locale={this.props.locale}
                    failure={failure}
                    onRetry={this.handleRetry}
                    onComplete={this.handleComplete}
                />
            </div>
            {busy && <p role="status">{t.loading}</p>}
        </div>);
    }
}

PlusLibrary.propTypes = {
    filterQuery: PropTypes.string,
    locale: PropTypes.string.isRequired,
    // The GUI's review bookkeeping, which only it can keep: see `load-extensions.ts`.
    permissions: PropTypes.shape({
        beginReview: PropTypes.func.isRequired,
        canLoad: PropTypes.func.isRequired
    }).isRequired,
    onBusyChange: PropTypes.func.isRequired,
    onCategorySelected: PropTypes.func.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    vm: PropTypes.shape({extensionManager: PropTypes.object.isRequired}).isRequired
};

export default PlusLibrary;

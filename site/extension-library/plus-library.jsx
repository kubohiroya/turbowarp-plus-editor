/**
 * The Plus tab of the extension library: what this distribution offers, and the review before any
 * of it runs.
 *
 * Moved from the fork's `src/containers/tw-plus-library.jsx` with its stylesheet and icon. The
 * catalog, the review dialog, both languages of its text and the whole offer are this
 * distribution's; the GUI's library only makes room for a tab and renders what it is given.
 *
 * The GUI's own `src/css/extension-security-dialog.css` is not imported here: its security manager
 * imports it already, and that is what themes the dialog package against the GUI's own variables.
 */

import {ExtensionSecurityDialog, ExtensionSelectionList} from '@kubohiroya/turbowarp-extension-security-dialog/react';
import {parseExtensionCatalog} from '@kubohiroya/turbowarp-extension-security-dialog';
import '@kubohiroya/turbowarp-extension-security-dialog/webpack4.css';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';

import {plusCatalog} from '../plus-catalog.js';
import {applyPlusCatalogSettings, readPlusCatalogSettings} from './catalog-settings.js';
import {PLUS_EXTENSION_LOADER_ENABLED} from './flags.js';
import loadPlusExtensions from './load-extensions.js';
import styles from './plus-library.css';

const text = {
    en: {
        loading: 'Loading TurboWarp Plus extensions…',
        failed: 'The extension catalog could not be loaded.',
        loadFailed: 'An extension could not be loaded. Extensions already loaded remain available. ' +
            'Retry your selection.',
        denied: 'No extensions were loaded. Review the selected extensions and their permissions.',
        applyFailed: 'Extension settings could not be applied.',
        retry: 'Retry'
    },
    ja: {
        loading: 'TurboWarp Plusの機能拡張を取得しています…',
        failed: '機能拡張の一覧を取得できませんでした。',
        loadFailed: '機能拡張を読み込めませんでした。読み込み済みの拡張は利用できます。選択を確認して再試行してください。',
        denied: '機能拡張は読み込まれませんでした。選択と読み込み許可を確認してください。',
        applyFailed: '拡張の設定を適用できませんでした。検証・許可の結果を確認してください。',
        retry: '再試行'
    }
};

class PlusLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, ['handleFetchCatalog', 'handleSelection', 'handleReview']);
        this.state = {entries: null,
            fetchError: false,
            loadError: null,
            reviewing: null,
            busy: false,
            choices: new Map(),
            distributions: new Map()};
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
            const settings = await readPlusCatalogSettings(this.props.vm, entries);
            // Catalog-listed extensions are trusted like TurboWarp's official gallery, so they start unsandboxed.
            const choices = new Map(entries.map(entry => [entry.url, 'unsandboxed']));
            settings.choices.forEach((mode, url) => choices.set(url, mode));
            if (this.alive) this.setState({entries, choices, distributions: settings.distributions});
        } catch (error) {
            if (this.alive) {
                console.error(error);
                this.setState({fetchError: true});
            }
        } finally {
            clearTimeout(timeout);
        }
    }
    async handleSelection (entries, selection) {
        if (PLUS_EXTENSION_LOADER_ENABLED) {
            this.setState({busy: true, loadError: null});
            this.props.onBusyChange(true);
            try {
                const loaded = await applyPlusCatalogSettings(this.props.vm, selection,
                    {signal: this.controller.signal});
                if (!this.alive) return;
                if (loaded.length) {
                    this.props.onCategorySelected(loaded[loaded.length - 1]);
                    this.props.onRequestClose();
                } else this.setState({loadError: 'denied'});
            } catch (error) {
                console.error(error);
                if (this.alive) {
                    this.setState({loadError: `${text[this.props.locale.startsWith('ja') ? 'ja' : 'en'].applyFailed} ` +
                    `${error.code || 'LOAD_FAILED'}: ${error.message}`});
                }
            } finally {
                if (this.alive) {
                    this.setState({busy: false});
                    this.props.onBusyChange(false);
                }
            }
            return;
        }
        this.setState({reviewing: entries, loadError: null});
        this.props.onBusyChange(true);
    }
    async handleReview (choices) {
        if (choices === null) {
            this.setState({reviewing: null});
            this.props.onBusyChange(false);
            return;
        }
        this.setState({busy: true});
        try {
            const loaded = await loadPlusExtensions(this.props.vm, this.state.reviewing, choices,
                this.props.permissions);
            if (!this.alive) return;
            if (loaded.length) {
                this.props.onCategorySelected(loaded[loaded.length - 1]);
                this.props.onRequestClose();
            } else if (this.alive) {
                this.setState({loadError: 'denied'});
            }
        } catch (error) {
            console.error(error);
            if (this.alive) this.setState({loadError: 'loadFailed'});
        } finally {
            if (this.alive) {
                this.setState({reviewing: null, busy: false});
                this.props.onBusyChange(false);
            }
        }
    }
    render () {
        const t = text[this.props.locale.startsWith('ja') ? 'ja' : 'en'];
        const {entries, reviewing, busy, loadError, fetchError, choices, distributions} = this.state;
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
        const loadedIds = entries.filter(entry => this.props.vm.extensionManager.isExtensionLoaded(entry.id))
            .map(entry => entry.id);
        return (<div className={styles.root}>
            {loadError && <p
                className={styles.error}
                role="alert"
            >{t[loadError] || loadError}</p>}
            <div hidden={Boolean(reviewing)}>
                <ExtensionSelectionList
                    entries={entries}
                    loadedIds={loadedIds}
                    initialChoices={choices}
                    initialDistributions={distributions}
                    enableDistribution={PLUS_EXTENSION_LOADER_ENABLED}
                    locale={this.props.locale}
                    filterQuery={this.props.filterQuery}
                    busy={busy}
                    onComplete={this.handleSelection}
                    onCancel={this.props.onRequestClose}
                />
            </div>
            {busy && <p role="status">{t.loading}</p>}
            {reviewing && !busy && <ExtensionSecurityDialog
                context="catalog"
                entries={reviewing}
                initialChoices={choices}
                locale={this.props.locale}
                onComplete={this.handleReview}
            />}
        </div>);
    }
}

PlusLibrary.propTypes = {
    filterQuery: PropTypes.string,
    locale: PropTypes.string.isRequired,
    // The GUI's review bookkeeping, which only it can keep: see `load-extensions.js`.
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

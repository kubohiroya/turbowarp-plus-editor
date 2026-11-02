#!/usr/bin/env node
/**
 * Rewrite which form a built SB3 stores its extensions in, from the command line.
 *
 * The four forms and the writer live in `@kubohiroya/turbowarp-sb3-save-format`, so this command
 * names them exactly as the Loader's Manifest and the security dialog's `ReviewDecision.loading`
 * do: a value chosen in the dialog is passed here as it is, with no table between the two.
 *
 * What stays here is what only this distribution knows: reading and re-serialising the ZIP, what
 * this command can write, and which extensions it may request unsandboxed (none by default).
 */
import {lstat, readFile, writeFile} from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {fileURLToPath} from 'node:url';
import JSZip from '@turbowarp/jszip';
import {
    describeSb3SaveFormats,
    normalizeSb3SaveSelection,
    sb3SaveCapabilities,
    type Sb3SaveCapabilities,
    type Sb3SaveFormat,
    type Sb3SaveFormatKey,
    type Sb3SaveSelection
} from '@kubohiroya/turbowarp-sb3-save-format';
import {verifySb3ExtensionUrls, writeSb3ExtensionFormat} from '@kubohiroya/turbowarp-sb3-save-format/writer';

const keepSource = 'Omit --source to keep the source data exactly as built.';
const keepAssets = 'Omit --assets to keep the assets exactly as built.';
const notHere = (payload: string, keep: string) => `This command rewrites extensions only and does not rewrite ${payload}. ${keep}`;

/** What this command can write: every extension form, and nothing for source data or assets. */
export const sb3SaveFormatCapabilities: Sb3SaveCapabilities = sb3SaveCapabilities({
    formats: Object.fromEntries((['remote-non-cacheable', 'remote-cacheable', 'embedded-file', 'embedded-data'] as const)
        .flatMap(format => [[`source:${format}`, notHere('source data', keepSource)], [`assets:${format}`, notHere('assets', keepAssets)]])) as Partial<Record<Sb3SaveFormatKey, string>>,
    projectAssets: notHere('assets', 'Omit --assets-as-project-assets.')
});

/**
 * This distribution decides trust when a work is opened, from the catalog it ships, and nothing in
 * an SB3 grants it. So a legacy `data:` extension, which records no execution mode, is requested
 * sandboxed unless the caller names it; an existing Manifest entry keeps the mode it requested.
 */
export const defaultUnsandboxedExtensionIds: readonly string[] = Object.freeze([]);

/**
 * Why `remote-cacheable` is no promise of offline use from here. The copy it permits is kept by the
 * opener's browser (IndexedDB), which a command line can neither write, read nor check.
 */
export const remoteCacheableNote = 'remote-cacheable only records that the opener\'s browser may keep a verified copy. This command cannot write, read or check that copy (IndexedDB), so it is no reason the saved SB3 will run offline; choose embedded-file or embedded-data for that.';

/** Matches the input bound the App's SB3-reading commands default to. */
const defaultMaxInputBytes = 536_870_912;
// A fixed timestamp keeps the output a function of its content, so a rerun writes the same bytes.
const fixedZipDate = new Date(Date.UTC(1980, 0, 1));

export const usage = `turbowarp-plus-editor-sb3-format --input IN.sb3 --output OUT.sb3 \\
    [--extensions remote-non-cacheable|remote-cacheable|embedded-file|embedded-data] \\
    [--keep-embedded-data] [--extension-urls URLS.json] [--skip-url-check] \\
    [--unsandboxed-extensions ID,ID] [--max-input-bytes N]

  Writable here: ${describeSb3SaveFormats(sb3SaveFormatCapabilities)}.
  An option left unset keeps that payload as it is. The value of --extensions is the security
  dialog's ReviewDecision.loading, spelled the same. The old spellings embedded, remote and cached
  are refused, not read as one of these.
  The two remote forms differ in whether the opener's browser may keep a copy: non-cacheable
  forbids one, cacheable permits one the opener may decline. ${remoteCacheableNote}
  Only embedded-data, or --keep-embedded-data beside another form, loads in a standard TurboWarp
  host. Going from a remote form to a carried one fetches the URL and refuses anything but the
  pinned bytes. --skip-url-check skips confirming that a recorded URL still serves them.
`;

export class Sb3SaveFormatCliError extends Error {
    readonly code: string;
    constructor(message: string, code = 'cli', options?: {cause?: unknown}) {
        super(message, options);
        this.name = 'Sb3SaveFormatCliError';
        this.code = code;
    }
}

const fail = (message: string): never => { throw new Sb3SaveFormatCliError(message); };

function validateEntryName(name: string) {
    if (!name || name.includes('\0') || name.includes('\\') || name.startsWith('/') || /^[A-Za-z]:/u.test(name) ||
        name.replace(/\/$/u, '').split('/').some(part => !part || part === '.' || part === '..'))
        fail(`The SB3 has an unsafe ZIP entry: ${JSON.stringify(name)}`);
}

/** Unpack an SB3 into its entries and parsed project. */
export async function readSb3(bytes: Uint8Array) {
    let zip: JSZip;
    try {
        zip = await JSZip.loadAsync(bytes);
    } catch (cause) {
        throw new Sb3SaveFormatCliError('The input is not a valid ZIP archive.', 'cli', {cause});
    }
    const archive: Record<string, Uint8Array> = {};
    for (const entry of Object.values(zip.files)) {
        validateEntryName(entry.name);
        if (!entry.dir) archive[entry.name] = await entry.async('uint8array');
    }
    if (!archive['project.json']) fail('The SB3 does not contain project.json.');
    let project: Record<string, unknown>;
    try {
        project = JSON.parse(new TextDecoder().decode(archive['project.json']));
    } catch (cause) {
        throw new Sb3SaveFormatCliError('The SB3 project.json is invalid JSON.', 'cli', {cause});
    }
    if (!project || typeof project !== 'object' || Array.isArray(project) || !Array.isArray(project.targets))
        fail('The SB3 project.json must be an object with a targets array.');
    return {archive, project};
}

/** Pack the entries back, project.json first and the rest in name order, with fixed timestamps. */
export async function serializeSb3(archive: Record<string, Uint8Array>, project: Record<string, unknown>) {
    const zip = new JSZip();
    const names = Object.keys(archive).filter(name => name !== 'project.json').sort((left, right) => left.localeCompare(right, 'en'));
    zip.file('project.json', JSON.stringify(project), {date: fixedZipDate});
    for (const name of names) zip.file(name, archive[name], {date: fixedZipDate});
    return zip.generateAsync({type: 'uint8array', compression: 'DEFLATE', compressionOptions: {level: 6}});
}

/** What a caller passes; `extensions` takes `ReviewDecision.loading` as it is. */
export interface Sb3SaveFormatOptions {
    readonly selection: {readonly extensions?: Sb3SaveFormat | undefined; readonly source?: Sb3SaveFormat | undefined; readonly assets?: Sb3SaveFormat | undefined; readonly assetsAsProjectAssets?: boolean | undefined};
    readonly urls?: Readonly<Record<string, string>> | undefined;
    readonly unsandboxed?: readonly string[] | undefined;
    readonly keepEmbeddedData?: boolean | undefined;
    readonly skipUrlCheck?: boolean | undefined;
    readonly fetch?: typeof fetch | undefined;
}

export interface Sb3SaveFormatOutput {
    readonly bytes: Uint8Array;
    readonly selection: Sb3SaveSelection;
    readonly converted: readonly string[];
    readonly urlsChecked: readonly string[];
    /** Things a person must be told about this output, such as what remote-cacheable does not do. */
    readonly notes: readonly string[];
}

/** Validate a selection against what this command writes, refusing any other spelling. */
export function normalizeSelection(selection: Sb3SaveFormatOptions['selection']): Sb3SaveSelection {
    try {
        return normalizeSb3SaveSelection(Object.fromEntries(Object.entries(selection).filter(([, value]) => value !== undefined)), sb3SaveFormatCapabilities);
    } catch (cause) {
        throw new Sb3SaveFormatCliError((cause as Error).message, 'selection', {cause});
    }
}

/** Rewrite one SB3 into the chosen form. Running it again on its own output returns the same bytes. */
export async function saveSb3Format(input: Uint8Array, options: Sb3SaveFormatOptions): Promise<Sb3SaveFormatOutput> {
    const selection = normalizeSelection(options.selection);
    const {archive, project} = await readSb3(input);
    let converted: readonly string[] = [];
    let urlsChecked: readonly string[] = [];
    if (selection.extensions !== undefined) {
        try {
            converted = (await writeSb3ExtensionFormat(archive, project, selection.extensions, {
                capabilities: sb3SaveFormatCapabilities,
                urls: options.urls,
                unsandboxed: [...defaultUnsandboxedExtensionIds, ...(options.unsandboxed ?? [])],
                keepEmbeddedData: options.keepEmbeddedData,
                fetch: options.fetch
            })).converted;
            // Check what a host will load before writing an SB3 that only looks finished.
            if (!options.skipUrlCheck) urlsChecked = await verifySb3ExtensionUrls(project, {fetch: options.fetch});
        } catch (cause) {
            const error = cause as Error & {code?: string};
            throw new Sb3SaveFormatCliError(error.message, error.code ?? 'writer', {cause});
        }
    }
    const notes = [
        ...(selection.extensions === 'remote-cacheable' ? [remoteCacheableNote] : []),
        ...(options.skipUrlCheck && selection.extensions?.startsWith('remote-') ? ['--skip-url-check: no recorded URL was confirmed.'] : [])
    ];
    return {bytes: await serializeSb3(archive, project), selection, converted, urlsChecked, notes};
}

export function parseArguments(args: readonly string[]) {
    let values;
    try {
        ({values} = parseArgs({args: [...args], strict: true, allowPositionals: false, options: {
            help: {type: 'boolean', short: 'h'},
            input: {type: 'string'}, output: {type: 'string'},
            extensions: {type: 'string'}, source: {type: 'string'}, assets: {type: 'string'},
            'assets-as-project-assets': {type: 'boolean'},
            'keep-embedded-data': {type: 'boolean'}, 'skip-url-check': {type: 'boolean'},
            'extension-urls': {type: 'string'}, 'unsandboxed-extensions': {type: 'string'},
            'max-input-bytes': {type: 'string'}
        }}));
    } catch (cause) {
        throw new Sb3SaveFormatCliError(`${(cause as Error).message}\n\n${usage}`, 'cli', {cause});
    }
    if (values.help) return {help: true} as const;
    if (!values.input || !values.output) fail(`--input and --output are required.\n\n${usage}`);
    const maxInputBytes = values['max-input-bytes'] === undefined ? defaultMaxInputBytes : Number(values['max-input-bytes']);
    if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1) fail('--max-input-bytes must be an integer >= 1.');
    return {
        help: false,
        input: path.resolve(values.input),
        output: path.resolve(values.output),
        // Passed on as typed: the shared vocabulary validates it, so no spelling is translated here.
        selection: {
            extensions: values.extensions as Sb3SaveFormat | undefined,
            source: values.source as Sb3SaveFormat | undefined,
            assets: values.assets as Sb3SaveFormat | undefined,
            ...(values['assets-as-project-assets'] ? {assetsAsProjectAssets: true} : {})
        },
        extensionURLs: values['extension-urls'] === undefined ? undefined : path.resolve(values['extension-urls']),
        unsandboxed: (values['unsandboxed-extensions'] ?? '').split(',').map(id => id.trim()).filter(Boolean),
        keepEmbeddedData: values['keep-embedded-data'] === true,
        skipUrlCheck: values['skip-url-check'] === true,
        maxInputBytes
    } as const;
}

interface Output { write(text: string): unknown }

export async function main(args = process.argv.slice(2), {stdout = process.stdout as Output, stderr = process.stderr as Output, fetch: fetchBytes = undefined as typeof fetch | undefined} = {}) {
    const parsed = parseArguments(args);
    if (parsed.help) {
        stdout.write(usage);
        return undefined;
    }
    // Refuse a selection before touching any file, so a wrong spelling is reported as itself.
    normalizeSelection(parsed.selection);
    let urls: Record<string, string> | undefined;
    if (parsed.extensionURLs !== undefined) {
        urls = JSON.parse(await readFile(parsed.extensionURLs, 'utf8'));
        if (!urls || typeof urls !== 'object' || Array.isArray(urls) || Object.values(urls).some(value => typeof value !== 'string'))
            fail('--extension-urls must contain a JSON object mapping extension IDs to HTTPS URLs.');
    }
    // Bound the input before reading it.
    const state = await lstat(parsed.input);
    if (!state.isFile()) fail('--input must be a regular file.');
    if (state.size > parsed.maxInputBytes) fail(`--input is ${state.size} bytes, more than --max-input-bytes ${parsed.maxInputBytes}.`);
    const result = await saveSb3Format(await readFile(parsed.input), {
        selection: parsed.selection, urls, unsandboxed: parsed.unsandboxed,
        keepEmbeddedData: parsed.keepEmbeddedData, skipUrlCheck: parsed.skipUrlCheck, fetch: fetchBytes
    });
    await writeFile(parsed.output, result.bytes);
    // Name what this command left alone, so an unset option is never mistaken for a conversion.
    stdout.write(`Saved ${path.basename(parsed.output)}: ` +
        (result.selection.extensions === undefined ? 'extensions kept as they were' : `extensions as ${result.selection.extensions} (${result.converted.length} converted)`) +
        (result.urlsChecked.length ? `, ${result.urlsChecked.length} URL(s) checked` : '') +
        '; source and assets kept as built.\n');
    for (const note of result.notes) stderr.write(`Note: ${note}\n`);
    return result;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {console.error(error.message); process.exitCode = 1;});
}

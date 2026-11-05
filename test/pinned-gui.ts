/**
 * Reach the pinned GUI checkout these tests run against, and refuse one that is not the pin.
 *
 * Several suites compile the GUI's own source and run it against this repository's modules. What
 * that pairing proves depends on which GUI revision is on disk: a checkout a few commits ahead
 * renames a module those sources import, and the failures that follow name a missing file rather
 * than the drift that caused them. `site/source.json` is the revision the build and CI resolve, so
 * a local run is held to it as well — once, with both revisions named, instead of once per suite
 * with neither.
 *
 * A directory that is not a checkout of its own is not held to the pin: `checkout-layout.test.cjs`
 * builds one inside this repository to exercise module resolution alone.
 */

import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

import pins from '../site/source.json' with {type: 'json'};

/**
 * The pinned GUI checkout.
 * @param {string} [need] What the caller needs it for, used when there is no checkout at all.
 * @returns {string} The absolute path to the checkout.
 */
export default function resolvePinnedGui(need = 'These tests need the pinned GUI'): string {
    const configured = process.env.E2E_GUI_ROOT;
    const fallback = path.resolve('.host/scratch-gui');
    const root = configured && path.isAbsolute(configured) ? configured :
        fs.existsSync(path.join(fallback, 'package.json')) ? fallback : null;
    if (!root) {
        throw new Error(`${need}: set E2E_GUI_ROOT to an absolute checkout, or check one out at ` +
            '.host/scratch-gui (see scripts/site/source.ts)');
    }
    const git = (args: string[]) => {
        try {
            return execFileSync('git', args,
                {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
        } catch {
            return null;
        }
    };
    if (git(['rev-parse', '--show-toplevel']) !== fs.realpathSync(root)) return root;
    const revision = git(['rev-parse', 'HEAD']);
    if (revision !== pins.guiRevision) {
        throw new Error(`The GUI checkout at ${root} is at ${revision}, but site/source.json pins ` +
            `${pins.guiRevision}. Check that revision out there, or move the pin to this one.`);
    }
    return root;
}

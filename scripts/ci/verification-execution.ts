import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {fullChecks, inspectCurrentEvidence, requireCompletedChecks, verificationOutcomes} from './verification-evidence.ts';
import {readVerificationPlan} from './verification-plan.ts';

const guiChecks = ['extension-host', 'gui-integration', 'project-tools',
    'site-build'];

export function selectExecution({enabled, release, main, plan, evidence, exactMain = false}: {
    enabled: boolean; release: boolean; main: boolean; exactMain?: boolean;
    plan: {mode: string; reason: string; checks: readonly string[]; base?: string; exactMainReuse?: boolean};
    evidence?: {reason: string; reusable: readonly string[]};
}) {
    if (release) return {mode: 'full', reason: 'stable-release'};
    if (exactMain && main && plan.exactMainReuse && plan.base) {
        if (evidence?.reason !== 'verified-items') return {mode: 'full', reason: evidence?.reason ?? 'missing-evidence'};
        const reused = fullChecks.filter(check => check !== 'site-build');
        if (reused.some(check => !evidence.reusable.includes(check))) {
            return {mode: 'full', reason: 'incomplete-exact-tree-evidence'};
        }
        return {
            mode: 'scoped', reason: 'exact-main-tree', base: plan.base, checks: ['documentation', 'site-build'],
            reused, needsNpm: true, needsGui: true
        };
    }

    if (!enabled) return {mode: 'legacy', reason: 'disabled'};
    if (plan.mode !== 'scoped' || !plan.base) return {mode: 'full', reason: plan.reason};
    if (main && evidence?.reason !== 'verified-items') {
        return {mode: 'full', reason: evidence?.reason ?? 'missing-evidence'};
    }

    const reusable = new Set(main ? evidence.reusable : []);
    const reused = plan.checks.filter(check => check !== 'site-build' && reusable.has(check));
    const checks = new Set(plan.checks.filter(check => !reused.includes(check)));
    if (main) checks.add('site-build');
    return {
        mode: 'scoped', reason: 'matched-paths', base: plan.base, checks: [...checks], reused,
        needsNpm: [...checks].some(check => check !== 'documentation'),
        needsGui: guiChecks.some(check => checks.has(check))
    };
}

async function recordExecution() {
    const env = process.env;
    const plan = readVerificationPlan(env);
    const main = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/main';
    const enabled = env.TW_PLUS_CI_SCOPED === '1';
    const release = Boolean(env.CI_RELEASE_REVISION);
    const exactMain = env.TW_PLUS_CI_EXACT_MAIN_REUSE !== '0';
    const canInspect = (exactMain && plan.exactMainReuse === true) || (enabled && plan.mode === 'scoped');
    const evidence = !release && main && canInspect ? await inspectCurrentEvidence(env) : undefined;
    const execution = selectExecution({enabled, release, main, plan, evidence, exactMain});
    console.log(JSON.stringify({execution, source: evidence, plan}));
    if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, [
        '## Verification execution', '', `- Mode: ${execution.mode}`, `- Reason: ${execution.reason}`,
        `- Proposed checks: ${plan.checks.join(', ')}`,
        ...('checks' in execution ? [
            `- Run: ${execution.checks.join(', ') || 'none'}`,
            `- Reused: ${execution.reused.join(', ') || 'none'}`
        ] : []),
        ...(evidence && 'runId' in evidence && 'attempt' in evidence ? [
            `- Source: [run ${evidence.runId}, attempt ${evidence.attempt}](` +
            `${env.GITHUB_SERVER_URL ?? 'https://github.com'}/${env.GITHUB_REPOSITORY}/actions/runs/${evidence.runId}/attempts/${evidence.attempt})`
        ] : []), ''
    ].join('\n') + '\n');
    const outputs = execution.mode === 'scoped' && 'checks' in execution ? [
        `base=${execution.base}`, `checks=|${execution.checks.join('|')}|`,
        `npm=${execution.needsNpm}`, `gui=${execution.needsGui}`
    ] : [];
    appendFileSync(env.GITHUB_OUTPUT, [...outputs, `mode=${execution.mode}`].join('\n') + '\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    if (process.argv[2] === 'verify') {
        const {CI_RELEASE_REVISION, CI_EXECUTION_MODE, CI_REQUIRED_CHECKS, CI_STEP_OUTCOMES,
            GITHUB_STEP_SUMMARY} = process.env;
        const required = !CI_RELEASE_REVISION && CI_EXECUTION_MODE === 'scoped' ?
            (CI_REQUIRED_CHECKS ?? '').split('|').filter(Boolean) : fullChecks;
        if (!required.length) throw new Error('The scoped execution has no required checks');
        const steps = JSON.parse(CI_STEP_OUTCOMES);
        if (GITHUB_STEP_SUMMARY) {
            const outcomes = verificationOutcomes(steps);
            appendFileSync(GITHUB_STEP_SUMMARY, [
                '## Verification outcomes', '',
                ...['passed', 'failed', 'not run'].map(status =>
                    `- Required and ${status}: ${required.filter(check => outcomes[check] === status).join(', ') || 'none'}`),
                '', ''
            ].join('\n'));
        }
        requireCompletedChecks(required, steps);
    } else {
        await recordExecution();
    }
}

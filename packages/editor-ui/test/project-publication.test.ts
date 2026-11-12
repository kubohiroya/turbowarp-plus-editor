import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate} from 'node:timers/promises';
import {JSDOM} from 'jsdom';
import {renderProjectPublicationDialog} from '../src/project-publication-dialog.ts';
import {createProjectPublication, type DesktopPublicationBridge, type PublicationIntent,
    type PublicationJob} from '../src/project-publication.ts';

const remote = 'https://github.com/Octocat/Project';
const commit = {id: '67b0c99f-ab7f-4b48-b0d5-43fb009985d6', message: 'Save project', commitOid: 'a'.repeat(40)};
const baseOid = 'b'.repeat(40);
const head = 'tw-plus/pr-' + commit.id;
const inspect = async () => ({remote, defaultBranch: 'main', branches: [{name: 'main', oid: baseOid},
    {name: 'develop', oid: 'c'.repeat(40)}, {name: 'same', oid: commit.commitOid}]});
const capabilities = async () => ['pulls-read', 'pulls-write', 'issues-read', 'issues-write', 'checks-read', 'merge'];

test('publication approval queues the exact saved commit and drives the host independently of its view', async () => {
    let job: PublicationJob | null = null;
    let allow = false;
    let pushed = false;
    let calls = 0;
    const poll = Promise.withResolvers<void>();
    const bridge: DesktopPublicationBridge = {
        capabilities,
        async repository(url) {assert.equal(url, remote); return {repositoryId: 17};},
        async enqueue(intent) {
            assert.equal(intent.commitOid, commit.commitOid);
            assert.equal(intent.baseOid, baseOid);
            assert.equal(intent.head, head);
            return allow ? job = {intent, status: 'queued'} : null;
        },
        async get() {return job;},
        async advance() {
            calls++;
            assert.ok(job);
            switch (job.status) {
            case 'queued': return pushed ? job = {...job, status: 'pushed'} : {...job, awaitingPush: true};
            case 'pushed': return job = {...job, status: 'waiting', pullNumber: 5};
            case 'waiting': return job = {...job, status: 'done', mergeOid: 'd'.repeat(40)};
            default: assert.fail('The completed job should not be advanced');
            }
        }
    };
    const options = {bridge, inspect, guard() {}, async push(target) {
        assert.deepEqual(target, {remote, oid: commit.commitOid, ref: 'refs/heads/' + head});
        assert.equal(allow, true);
        pushed = true;
    }, async delay(ms: number) {assert.equal(ms, 30_000); await poll.promise;}};
    const port = createProjectPublication(options);
    const prepared = await port.prepare(commit);
    const draft = {base: 'main', title: 'One change', body: '', goal: 'merge'} as const;
    assert.equal(await prepared.submit(draft, () => false), false);
    assert.equal(await prepared.submit(draft, () => true), false);
    assert.equal(calls, 0);
    allow = true;
    assert.equal(await prepared.submit(draft, () => true), true);
    await setImmediate();
    const sameView = await port.prepare(commit);
    assert.equal(sameView.progress().running, true);
    assert.equal(sameView.progress().job?.pullNumber, 5);
    sameView.resume();
    assert.equal(calls, 3);
    poll.resolve();
    await setImmediate();
    const restored = await createProjectPublication(options).prepare(commit);
    assert.equal(restored.progress().job?.status, 'done');
    restored.resume();
    assert.equal(calls, 4);
});

test('dialog shows exact refs, keeps merge unchecked and restores progress with the selected issue', async t => {
    const dom = new JSDOM('<body></body>');
    t.after(() => dom.window.close());
    const {document} = dom.window;
    let intent: PublicationIntent;
    let saved: PublicationJob | null = null;
    const resumes: boolean[] = [];
    const bridge: DesktopPublicationBridge = {
        capabilities,
        async repository() {return {repositoryId: 17};},
        async enqueue(approved) {
            intent = approved;
            return saved = {intent, status: 'queued'};
        },
        async get() {return saved;},
        async advance({retryRejectedMerge}) {
            resumes.push(Boolean(retryRejectedMerge));
            assert.ok(saved);
            return saved = {...saved, status: 'waiting', pause: 'mergeRejected', pullNumber: 3, issueNumber: 19};
        }
    };
    const options = {bridge, inspect, guard() {}, async push() {assert.fail('No push was requested');}};
    const open = () => {
        const view = renderProjectPublicationDialog(document, 'en', createProjectPublication(options), commit, () => {}, () => {});
        document.body.append(view.element);
        return view;
    };
    const view = open();
    await setImmediate();
    const field = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: string) =>
        view.element.querySelector<T>(`[name="${name}"]`)!;
    assert.match(view.element.querySelector('dl')!.textContent!, new RegExp(baseOid));
    assert.match(view.element.querySelector('dl')!.textContent!, new RegExp(commit.commitOid));
    assert.equal(field<HTMLInputElement>('pr-merge').checked, false);
    field<HTMLInputElement>('pr-merge').checked = true;
    field<HTMLInputElement>('pr-title').value = 'Review this change';
    field<HTMLTextAreaElement>('pr-body').value = 'Details';
    const mode = field<HTMLSelectElement>('pr-issue-mode');
    mode.value = 'existing';
    mode.dispatchEvent(new dom.window.Event('change'));
    field<HTMLInputElement>('pr-issue-number').value = '19';
    field<HTMLInputElement>('pr-issue-close').checked = true;
    view.element.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await setImmediate();
    assert.deepEqual(intent!, {id: commit.id, remote, repositoryId: 17, base: 'main', baseOid, head, commitOid: commit.commitOid,
        goal: 'merge', title: 'Review this change', body: 'Details', issue: {number: 19, closeAfterMerge: true}});
    view.dispose();
    view.element.remove();
    const restored = open();
    await setImmediate();
    assert.equal(restored.element.querySelector('a')?.href, 'https://github.com/Octocat/Project/pull/3');
    const retry = [...restored.element.querySelectorAll('button')].find(button => button.textContent === 'Retry merge');
    assert.ok(retry && !retry.hidden);
    retry.click();
    await setImmediate();
    assert.deepEqual(resumes, [false, true]);
    restored.dispose();
});

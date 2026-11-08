const kamishibaiReleasePath = /^\/kubohiroya\/turbowarp-kamishibai-app\/releases\/download\/v([^/]+)\/kamishibai-([^/]+)\.sb3$/;
const releaseVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function kamishibaiPagesUrl(projectUrl: string) {
    try {
        const url = new URL(projectUrl);
        if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash) return;
        const match = kamishibaiReleasePath.exec(url.pathname);
        if (!match) return;
        const version = decodeURIComponent(match[1]);
        if (!releaseVersion.test(version) || decodeURIComponent(match[2]) !== version) return;
        return `https://kubohiroya.github.io/turbowarp-kamishibai-app/downloads/kamishibai-${encodeURIComponent(version)}.sb3`;
    } catch {
        // Let the normal project fetch handle malformed URLs.
    }
}

const scratchProjectPagePath = /^\/projects\/(\d+)(?:\/(?:editor|fullscreen|embed)?)?\/?$/;

// A Scratch project page is HTML without CORS headers; its project data comes from the Scratch project API.
function scratchProjectId(projectUrl: string) {
    try {
        const url = new URL(projectUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return;
        if (url.hostname !== 'scratch.mit.edu' && url.hostname !== 'www.scratch.mit.edu') return;
        return scratchProjectPagePath.exec(url.pathname)?.[1];
    } catch {
        // Let the normal project fetch handle malformed URLs.
    }
}

async function fetchScratchProject(projectId: string, fetchResource: typeof fetch): Promise<Response> {
    const meta = await fetchResource(`https://trampoline.turbowarp.org/api/projects/${projectId}`);
    if (!meta.ok) throw new Error(`Could not access Scratch project ${projectId}: status ${meta.status}`);
    const token = (await meta.json())?.project_token;
    if (typeof token !== 'string' || !token) throw new Error(`Scratch project ${projectId} has no project token`);
    return fetchResource(`https://projects.scratch.mit.edu/${projectId}?token=${encodeURIComponent(token)}`);
}

export async function fetchProjectUrl(projectUrl: string, fetchResource = fetch): Promise<Response> {
    const scratchId = scratchProjectId(projectUrl);
    if (scratchId) return fetchScratchProject(scratchId, fetchResource);
    const pagesUrl = kamishibaiPagesUrl(projectUrl);
    if (pagesUrl) {
        try {
            const response = await fetchResource(pagesUrl, {redirect: 'error'});
            const contentType = response.headers.get('content-type');
            if (response.status === 200 && !contentType?.startsWith('text/html')) return response;
        } catch {
            // A Pages outage or missing mirror must preserve the original fetch path.
        }
    }
    return fetchResource(projectUrl);
}

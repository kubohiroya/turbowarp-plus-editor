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

export async function fetchProjectUrl(projectUrl: string, fetchResource = fetch): Promise<Response> {
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

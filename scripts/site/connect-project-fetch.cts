const path = require('node:path');

module.exports = (source: string) => {
    if (!source.includes('fetch(projectUrl)')) throw new Error('Pinned GUI project URL fetch has changed');
    const adapter = path.resolve(__dirname, '../../site/project-url.ts');
    return `import {fetchProjectUrl as fetch} from ${JSON.stringify(adapter)};\n${source}`;
};

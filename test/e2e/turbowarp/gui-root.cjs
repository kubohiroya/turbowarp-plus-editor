const path = require('node:path');
const fs = require('node:fs');
module.exports = () => {
    const root = process.env.E2E_GUI_ROOT;
    if (!root || !path.isAbsolute(root) || !fs.existsSync(path.join(root, 'webpack.config.js'))) {
        throw new Error('E2E_GUI_ROOT must point to an absolute scratch-gui checkout.');
    }
    return root;
};

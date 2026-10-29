const path = require('node:path');
if (!process.env.E2E_GUI_ROOT || !path.isAbsolute(process.env.E2E_GUI_ROOT)) throw new Error('An absolute GUI checkout is required');
// The host owns its application configuration; the site selects only its browser build.
module.exports = require(path.join(process.env.E2E_GUI_ROOT, 'webpack.config.js'))[0];

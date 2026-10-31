module.exports = {
    env: {browser: true},
    rules: {
        // These tests use Playwright assertions, including its optional failure message.
        'jest/valid-expect': 'off'
    }
};

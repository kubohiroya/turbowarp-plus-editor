require('./helpers.cts');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {default:reducer,LoadingState}=require('../../../src/reducers/project-state');
const {recoverProjectLoad}=require('../../../src/lib/tw-load-project-error.js');
let markExtensionLoadFailure;
before(async () => {
    const host=await import('../../../../site/gui-integration/lib/tw-extension-security-cancel.ts');
    const points=await import('../../../../site/gui-integration/lib/tw-plus-integration-points.ts');
    ({markExtensionLoadFailure}=await import('../../../../site/gui-integration/lib/tw-plus-extension-load-failure.ts'));
    globalThis.__TW_GUI_HOST__={...host, ...points};
});
after(()=>{delete globalThis.__TW_GUI_HOST__;});

test('confirmed cancellation stops loading without fetching a default or changing the routing identity',()=>{
    const dom=new JSDOM('',{url:'http://localhost/editor.html?project_url=https://example.test/project.sb3&token=secret#123'});
    globalThis.window=dom.window;
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    let state={loadingState:LoadingState.LOADING_VM_FILE_UPLOAD,projectId:'123',projectData:'old',error:new Error('old')};
    const actions=[];
    const cancelled=markExtensionLoadFailure(Object.assign(new Error('Declined'),{code:'TRUST_DENIED'}));
    assert.equal(recoverProjectLoad(action=>{
        actions.push(action);
        state=reducer(state,action);
    }, cancelled),true);
    assert.equal(state.loadingState,LoadingState.NOT_LOADED);
    assert.equal(state.projectId,'123');assert.equal(state.projectData,null);assert.equal(state.error,null);
    assert.equal(new URL(window.location.href).searchParams.has('project_url'),true);
    assert.ok(!actions.some(action=>action.type==='projectTitle/SET_PROJECT_TITLE'));
    assert.ok(!actions.some(action=>action.type.endsWith('/SET_PROJECT_ERROR')));
    assert.ok(!actions.some(action=>action.type.endsWith('/OPEN_MODAL')));
    assert.equal(dom.window.document.querySelector('[data-testid="project-load-failure"]').dataset.outcome,'cancelled');
    dom.window.close();delete globalThis.window;
});


test('an extension failure ends the busy state and shows the main outcome without another error modal',()=>{
    const dom=new JSDOM('',{url:'http://localhost/editor.html?project_url=https://example.test/failing.sb3'});
    globalThis.window=dom.window;
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    const error=markExtensionLoadFailure(new Error('Host load failed'));
    const actions=[];
    try {
        assert.equal(recoverProjectLoad(action=>actions.push(action),error),true);
        const reset=actions.findIndex(action=>action.type.endsWith('/CANCEL_SECURITY_LOAD'));
        assert.ok(reset>=0);
        assert.ok(!actions.some(action=>action.type.endsWith('/OPEN_MODAL')));
        assert.equal(dom.window.document.querySelector('[data-testid="project-load-failure"]').dataset.outcome,'failed');
    } finally {dom.window.close();delete globalThis.window;}
});

test('ordinary project errors and a GUI without a host retain native error handling',()=>{
    assert.equal(recoverProjectLoad(assert.fail,new Error('Invalid project')),false);
    const host=globalThis.__TW_GUI_HOST__;
    delete globalThis.__TW_GUI_HOST__;
    try {
        assert.equal(recoverProjectLoad(assert.fail,markExtensionLoadFailure(new Error('Failed'))),false);
    } finally {globalThis.__TW_GUI_HOST__=host;}
});

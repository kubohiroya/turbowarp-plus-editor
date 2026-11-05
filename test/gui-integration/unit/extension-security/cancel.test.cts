require('./helpers.cts');
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {default:reducer,LoadingState,onFetchedProjectData,onLoadedProject}=require('../../../src/reducers/project-state');
const {recoverProjectLoad}=require('../../../src/lib/tw-load-project-error.js');
let markExtensionLoadFailure;
before(async () => {
    const host=await import('../../../../site/gui-integration/lib/tw-extension-security-cancel.ts');
    ({markExtensionLoadFailure}=await import('../../../../site/gui-integration/lib/tw-plus-extension-load-failure.ts'));
    globalThis.__TW_GUI_HOST__=host;
});
after(()=>{delete globalThis.__TW_GUI_HOST__;});

test('confirmed cancellation resets loading state, title/handle/mode and removes project_url before fetching default',()=>{
    const dom=new JSDOM('',{url:'http://localhost/editor.html?project_url=https://example.test/project.sb3&token=secret#123'});
    globalThis.window=dom.window;
    let state={loadingState:LoadingState.LOADING_VM_FILE_UPLOAD,projectId:'123',projectData:'old',error:new Error('old')};
    const actions=[];
    const cancelled=markExtensionLoadFailure(Object.assign(new Error('Declined'),{code:'TRUST_DENIED'}));
    assert.equal(recoverProjectLoad(action=>{
        actions.push(action);
        if(action.type.endsWith('/CANCEL_SECURITY_LOAD')) assert.equal(new URL(window.location.href).searchParams.has('project_url'),false);
        state=reducer(state,action);
    }, cancelled),true);
    assert.equal(state.loadingState,LoadingState.FETCHING_NEW_DEFAULT);
    assert.equal(state.projectId,'0');assert.equal(state.projectData,null);assert.equal(state.error,null);
    assert.equal(new URL(window.location.href).searchParams.has('token'),false);
    assert.ok(actions.some(action=>action.type==='projectTitle/SET_PROJECT_TITLE'&&action.title===''));
    assert.ok(actions.some(action=>action.type.endsWith('/SET_PLAYER')&&action.isPlayerOnly===false));
    assert.ok(!actions.some(action=>action.type.endsWith('/SET_PROJECT_ERROR')));
    assert.ok(!actions.some(action=>action.type.endsWith('/OPEN_MODAL')));
    state=reducer(state,onFetchedProjectData('default-json',state.loadingState));
    assert.equal(state.loadingState,LoadingState.LOADING_VM_NEW_DEFAULT);
    state=reducer(state,onLoadedProject(state.loadingState,false,true));
    assert.equal(state.loadingState,LoadingState.SHOWING_WITHOUT_ID);
    dom.window.close();delete globalThis.window;
});


test('an extension failure resets the load before reporting the original error',()=>{
    const dom=new JSDOM('',{url:'http://localhost/editor.html?project_url=https://example.test/failing.sb3'});
    globalThis.window=dom.window;
    const error=markExtensionLoadFailure(new Error('Host load failed'));
    const actions=[];
    try {
        assert.equal(recoverProjectLoad(action=>actions.push(action),error),true);
        const reset=actions.findIndex(action=>action.type.endsWith('/CANCEL_SECURITY_LOAD'));
        const reported=actions.findIndex(action=>action.type.endsWith('/SET_PROJECT_ERROR'));
        assert.ok(reset>=0 && reported>reset);
        assert.equal(actions[reported].projectError.cause,error);
        assert.match(actions[reported].projectError.message,/Host load failed/);
        assert.equal(new URL(window.location.href).searchParams.has('project_url'),false);
        assert.ok(actions.some(action=>action.type.endsWith('/OPEN_MODAL') && action.modal==='invalidProjectModal'));
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

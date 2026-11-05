require('./helpers.cts');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');

test('host-owned dialog keyup preserves native activation without forwarding keys to the VM',()=>{
    const dom=new JSDOM('<div class="host-dialog"><input type="radio"><button>OK</button></div><button id="outside">Outside</button>',{url:'http://localhost/'});
    globalThis.document=dom.window.document;
    globalThis.location=dom.window.location;
    // GUI API registration is unrelated to the keyboard event boundary under test.
    const apiPath=require.resolve('../../../src/lib/tw-extension-gui-api');
    const previousAPI=require.cache[apiPath];
    require.cache[apiPath] = Object.assign(new (require('node:module'))(apiPath), {
        filename: apiPath, loaded: true, exports: {__esModule: true, default: () => {}}
    });
    const previousIntegration=globalThis.__TW_GUI_HOST__;
    globalThis.__TW_GUI_HOST__={hostIntegration:()=>({}),hostIgnoresKeyEvent:event=>Boolean(event.target.closest?.('.host-dialog'))};
    const VMListener=require('../../../src/lib/vm-listener-hoc.jsx').default(()=>null).WrappedComponent;
    const posted=[];
    const listener=new VMListener({vm:{on(){},runtime:{on(){}},postIOData:(...args)=>posted.push(args)}});
    document.addEventListener('keyup',listener.handleKeyUp);
    try {
        for(const target of document.querySelectorAll('.host-dialog input, .host-dialog button')) {
            const event=new dom.window.KeyboardEvent('keyup',{key:' ',keyCode:32,bubbles:true,cancelable:true});
            target.dispatchEvent(event);
            assert.equal(event.defaultPrevented,false);
        }
        assert.deepEqual(posted,[]);
        const outside=new dom.window.KeyboardEvent('keyup',{key:' ',keyCode:32,bubbles:true,cancelable:true});
        document.getElementById('outside').dispatchEvent(outside);
        assert.equal(outside.defaultPrevented,true);
        assert.deepEqual(posted,[['keyboard',{key:' ',keyCode:32,isDown:false}]]);
    } finally {
        document.removeEventListener('keyup',listener.handleKeyUp);
        if(previousAPI) require.cache[apiPath]=previousAPI;
        else delete require.cache[apiPath];
        globalThis.__TW_GUI_HOST__=previousIntegration;
        dom.window.close();delete globalThis.document;delete globalThis.location;
    }
});

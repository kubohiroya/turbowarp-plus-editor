import {yamlEditorFlags} from './feature-flags.js';
import {initializeEmbeddedYamlRootShape} from './root-shape-bootstrap.js';

const rootShapeReady = initializeEmbeddedYamlRootShape();
rootShapeReady.catch(error => {
    console.error('Could not initialize the embedded YAML root shape.', error);
});

if (yamlEditorFlags.embeddedYamlEditor) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./ui.css', import.meta.url).href;
    document.head.append(stylesheet);
    Promise.all([rootShapeReady, import('./client.js')]).then(([, {autostartYamlEditor}]) => autostartYamlEditor()).catch(error => {
        console.error('Could not initialize the embedded YAML editor.', error);
    });
}

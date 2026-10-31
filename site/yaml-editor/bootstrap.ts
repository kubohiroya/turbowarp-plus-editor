import {yamlEditorFlags} from './feature-flags.ts';
import {initializeEmbeddedYamlRootShape} from './root-shape-bootstrap.ts';

const rootShapeReady = initializeEmbeddedYamlRootShape();
rootShapeReady.catch(error => {
    console.error('Could not initialize the embedded YAML root shape.', error);
});

if (yamlEditorFlags.embeddedYamlEditor) {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = new URL('./ui.css', import.meta.url).href;
    document.head.append(stylesheet);
    Promise.all([rootShapeReady, import('./client.ts')]).then(([, {autostartYamlEditor}]) => autostartYamlEditor()).catch(error => {
        console.error('Could not initialize the embedded YAML editor.', error);
    });
}

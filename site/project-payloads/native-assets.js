import {bundleMaterials} from './codec.js';

const imageTypes = {
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg'
};
const audioTypes = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg'
};
const stage = target => target.isStage;
const original = target => stage(target) || target.isOriginal;

function mediaType(path) {
    const extension = path.split('.').pop().toLowerCase();
    if (Object.hasOwn(imageTypes, extension)) return {mime: imageTypes[extension], kinds: ['costume', 'backdrop']};
    if (Object.hasOwn(audioTypes, extension)) return {mime: audioTypes[extension], kinds: ['sound']};
    return null;
}

export function nativeAssetConversion(vm, vmModules, guard) {
    const {assetUploads, loadCostume, loadSound} = vmModules || {};
    if (!assetUploads || !loadCostume || !loadSound) return null;
    const items = bundleMaterials(JSON.parse(vm.toJSON()));
    const materials = new Map(items.flatMap(item => {
        const media = mediaType(item.path);
        return media ? [[item.key, {...item, ...media}]] : [];
    }));
    const targets = new Map(vm.runtime.targets.filter(original).map(target => [target.id, target]));
    return {
        materials: [...materials.values()].map(({key, label, kinds}) => ({key, label, kinds})),
        targets: [...targets.values()].map(target => ({id: target.id, name: target.getName(), stage: stage(target)})),
        async add({key, kind, targetId}, signal) {
            guard();
            signal.throwIfAborted();
            const material = materials.get(key);
            const target = targets.get(targetId);
            if (!material?.kinds.includes(kind) || !target || vm.runtime.getTargetById(targetId) !== target ||
                (kind !== 'sound' && stage(target) !== (kind === 'backdrop'))) {
                throw new Error('The selected material or target is unavailable.');
            }
            const {runtime} = vm;
            const file = material.bytes.slice().buffer;
            const isSound = kind === 'sound';
            const item = await new Promise((resolve, reject) => {
                const fail = error => reject(new Error(String(error || 'The media file could not be imported.')));
                if (isSound) {
                    assetUploads.soundUpload(file, material.mime, runtime.storage, resolve, fail);
                } else {
                    assetUploads.costumeUpload(file, material.mime, vm, costumes => resolve(costumes[0]), fail);
                }
            });
            if (!item) throw new Error('The media file could not be imported.');
            item.name = material.name;
            let player;
            try {
                guard();
                signal.throwIfAborted();
                if (isSound) {
                    await loadSound(item, runtime, {addSoundPlayer: decoded => { player = decoded; }});
                    // Scratch Audio substitutes one silent sample when both decoders fail.
                    if (item.broken || !(player?.buffer?.length > 1) || !target.sprite.soundBank) {
                        throw new Error('The sound could not be decoded.');
                    }
                } else {
                    await loadCostume(item.md5, item, runtime);
                    if (item.broken || item.skinId === undefined) throw new Error('The image could not be decoded.');
                }
                guard();
                signal.throwIfAborted();
                if (runtime.getTargetById(targetId) !== target) throw new Error('The selected target changed.');
            } catch (error) {
                player?.dispose();
                if (item.skinId !== undefined) runtime.renderer?.destroySkin(item.skinId);
                throw error;
            }
            if (isSound) {
                target.sprite.soundBank.addSoundPlayer(player);
                target.addSound(item);
            } else {
                target.addCostume(item);
                target.setCostume(target.getCostumes().length - 1);
            }
            vm.emitTargetsUpdate();
            return item.name;
        }
    };
}

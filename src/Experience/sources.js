import { LEVELS } from './constants.js';

export default [
    {
        name: 'levelData',
        type: 'json',
        path: LEVELS[1]
    },
    {
        name: 'rouletteModel',
        type: 'gltfModel',
        path: 'models/roulette.glb'
    },
    {
        name: 'cubeModel',
        type: 'gltfModel',
        path: 'models/cube.glb'
    },
    {
        name: 'rouletteShadowModel',
        type: 'gltfModel',
        path: 'models/roulette-shadow.glb'
    },
    {
        name: 'binModel',
        type: 'gltfModel',
        path: 'models/bin.glb'
    },
    {
        name: 'binShadowModel',
        type: 'gltfModel',
        path: 'models/bin-shadow.glb'
    },
    {
        name: 'bgm',
        type: 'audio',
        path: 'audios/BGM-1.mp3'
    }
]
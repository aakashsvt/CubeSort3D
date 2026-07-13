const levels = [
    'level data/Rubik_Cube.json',
    'level data/House.json'
];

window.currentLevelIndex = 0;

export default [
    {
        name: 'levelData',
        type: 'json',
        path: levels[0]
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
    }
]
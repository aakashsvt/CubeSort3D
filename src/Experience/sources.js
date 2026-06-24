export default [
    {
        name: 'environmentMapTexture',
        type: 'cubeTexture',
        path:
        [
            'textures/environmentMap/px.jpg',
            'textures/environmentMap/nx.jpg',
            'textures/environmentMap/py.jpg',
            'textures/environmentMap/ny.jpg',
            'textures/environmentMap/pz.jpg',
            'textures/environmentMap/nz.jpg'
        ]
    },
    {
        name: 'levelData',
        type: 'json',
        path: 'level data/level.json'
    },
    {
        name: 'rouletteModel',
        type: 'gltfModel',
        path: 'models/roulette.glb'
    },
]
import Experience from '../Experience.js'
import VoxelLevel from './VoxelLevel.js'
import Roulette from './Roulette.js'
import Environment from './Environment.js'
import * as THREE from 'three'

export default class World
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        
        // Wait for resources
        this.resources.on('ready', () =>
        {
            
            this.voxelLevel = new VoxelLevel(this.resources.items.cubeModel)
            this.voxelLevel.loadFromJSON(this.resources.items.levelData)
            this.roulette = new Roulette()
            this.environment = new Environment()
        })
    }

    update()
    {
        if(this.voxelLevel) this.voxelLevel.update()
        if(this.roulette) this.roulette.update()
    }
}
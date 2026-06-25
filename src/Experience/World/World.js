import Experience from '../Experience.js'
import VoxelLevel from './VoxelLevel.js'
import VoxelControls from './VoxelControls.js'
import Roulette from './Roulette.js'
import Bin from './Bin.js'
import Environment from './Environment.js'


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
            
            this.voxelLevel = new VoxelLevel()
            this.voxelControls = new VoxelControls(this.voxelLevel.spinGroup)
            
            this.roulette = new Roulette()
            this.bin = new Bin()
            this.environment = new Environment()
        })
    }

    update()
    {
        if(this.voxelLevel) this.voxelLevel.update?.()
        if(this.voxelControls) this.voxelControls.update()
        if(this.roulette) this.roulette.update()
    }
}
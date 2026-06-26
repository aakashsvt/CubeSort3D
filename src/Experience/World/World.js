import Experience from '../Experience.js'
import VoxelLevel from './VoxelLevel.js'
import VoxelControls from './VoxelControls.js'
import Roulette from './Roulette.js'
import BinManager from './BinManager.js'
import Environment from './Environment.js'
import PhysicsWorld from './PhysicsWorld.js'


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
            this.physicsWorld = new PhysicsWorld()
            this.voxelLevel = new VoxelLevel()
            this.voxelControls = new VoxelControls(this.voxelLevel.spinGroup, this.voxelLevel, this.physicsWorld)
            
            this.roulette = new Roulette(this.physicsWorld)
            this.binManager = new BinManager()
            this.environment = new Environment()
        })
    }

    update()
    {
        if(this.physicsWorld) this.physicsWorld.update()
        if(this.voxelLevel) this.voxelLevel.update?.()
        if(this.voxelControls) this.voxelControls.update()
        if(this.roulette) this.roulette.update()
    }
}
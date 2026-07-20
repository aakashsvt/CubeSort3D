import Experience from '../Experience.js'
import VoxelLevel from './VoxelLevel.js'
import VoxelControls from './VoxelControls.js'
import Roulette from './Roulette.js'
import BinManager from './BinManager.js'
import Environment from './Environment.js'
import PhysicsWorld from './PhysicsWorld.js'
import CubeManager from './CubeManager.js'
import TrayController from './TrayController.js'
import LevelManager from './LevelManager.js'

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
            this.binManager = new BinManager()
            this.roulette = new Roulette(this.physicsWorld)
            
            this.cubeManager = new CubeManager(this.scene, this.physicsWorld, this.binManager, this.roulette)
            this.trayController = new TrayController(this.binManager)
            
            this.voxelLevel = new VoxelLevel()
            this.voxelControls = new VoxelControls(this.voxelLevel.spinGroup, this.voxelLevel, this.physicsWorld, this.cubeManager)
            this.environment = new Environment()
            this.levelManager = new LevelManager(this)
            
            this.initAudio()
        })
    }

    initAudio()
    {
        const am = this.experience.audioManager
        if(!am) return

        if(this.resources.items.bgm) {
            am.create('bgm', { buffer: this.resources.items.bgm, loop: true, volume: 0.1 })
            am.play('bgm')
        }
    }

    update()
    {
        // Pause the entire game state if the level is failed/ended
        if (this.trayController && this.trayController.levelEnded) return;

        const dt = this.experience.time.delta / 1000 // Convert ms to seconds
        if(this.physicsWorld) this.physicsWorld.update()
        if(this.binManager) this.binManager.update(dt)
        if(this.cubeManager) this.cubeManager.update(dt)
        if(this.trayController) this.trayController.update(dt, this.cubeManager)
        if(this.voxelLevel) this.voxelLevel.update?.()
        if(this.voxelControls) this.voxelControls.update()
        if(this.roulette) this.roulette.update()
        if(this.levelManager) this.levelManager.update()
    }
}
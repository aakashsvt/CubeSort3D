import Experience from '../Experience.js'
import VoxelLevel from './VoxelLevel.js'
import VoxelControls from './VoxelControls.js'
import Roulette from './Roulette.js'
import BinManager from './BinManager.js'
import Environment from './Environment.js'
import PhysicsWorld from './PhysicsWorld.js'
import CubeManager from './CubeManager.js'
import TrayController from './TrayController.js'


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
        })
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

        // Win condition check
        if (this.voxelLevel && this.cubeManager && this.voxelControls && this.trayController) {
            if (!this.trayController.levelEnded && this.voxelLevel.cubes.length > 0) {
                const noActiveCubes = this.voxelLevel.cubes.every(c => !c.active);
                const noSpawningCubes = this.voxelControls.spawnGroups.length === 0;
                const noTrayCubes = this.cubeManager.getActiveTrayCubeCount() === 0;
                
                if (noActiveCubes && noSpawningCubes && noTrayCubes) {
                    this.trayController.levelEnded = true;
                    console.log("Player wins!");
                    this.trayController.ui.showLevelCompleteUI();
                }
            }
        }
    }

    resetLevel(newLevelData) {
        this.resources.items.levelData = newLevelData;

        // 1. Clear Voxel Controls
        this.voxelControls.spawnGroups = [];
        
        // 2. Clear Voxel Level
        this.voxelLevel.clear();
        
        // 3. Clear Cube Manager
        if (this.cubeManager.dynamicCubes) {
            for (const item of this.cubeManager.dynamicCubes) {
                if (item.body) this.physicsWorld.world.removeRigidBody(item.body);
            }
            this.cubeManager.dynamicCubes = [];
        }
        if (this.cubeManager.dynamicInstancedMesh) {
            this.scene.remove(this.cubeManager.dynamicInstancedMesh);
            this.cubeManager.dynamicInstancedMesh.geometry.dispose();
            this.cubeManager.dynamicInstancedMesh.material.dispose();
            this.cubeManager.dynamicInstancedMesh = null;
        }
        this.cubeManager.availableInstanceIds = [];
        this.cubeManager.colorRouteTimers = {};
        this.cubeManager.colorRouteBatchCounters = {};

        // 4. Clear Bin Manager
        if (this.binManager.binsGroup) {
            this.scene.remove(this.binManager.binsGroup);
            if (this.binManager.binInstancedMeshes) {
                for (const mesh of this.binManager.binInstancedMeshes) {
                    mesh.geometry.dispose();
                    if(mesh.material) mesh.material.dispose();
                }
            }
            if (this.binManager.internalCubeInstancedMesh) {
                this.binManager.internalCubeInstancedMesh.geometry.dispose();
                if(this.binManager.internalCubeInstancedMesh.material) this.binManager.internalCubeInstancedMesh.material.dispose();
            }
            if (this.binManager.shadowInstancedMeshes) {
                for (const mesh of this.binManager.shadowInstancedMeshes) {
                    mesh.geometry.dispose();
                    if(mesh.material) mesh.material.dispose();
                }
            }
            for (const item of this.binManager.spawnedBins) {
                if (item.colorBin.labelMesh) {
                    item.colorBin.labelMesh.geometry.dispose();
                    item.colorBin.labelMesh.material.dispose();
                }
            }
        }
        this.binManager.spawnedBins = [];
        this.binManager.exitingBins = [];
        this.binManager.roundRobinIndices = {};
        
        // 5. Reset Tray Controller
        this.trayController.levelEnded = false;
        this.trayController.failTimer = 0;
        this.trayController.overCapacityWarningStarted = false;
        this.trayController.isTimerActive = false;
        const dashboard = newLevelData.dashboard || {};
        this.trayController.maxTrayCapacity = dashboard.trayCapacityCubes || 50;
        this.trayController.ui.maxCountEl.innerText = this.trayController.maxTrayCapacity.toString();
        
        if (this.trayController.ui) {
            if (this.trayController.ui.failOverlay && this.trayController.ui.failOverlay.parentNode) {
                this.trayController.ui.failOverlay.parentNode.removeChild(this.trayController.ui.failOverlay);
                this.trayController.ui.failOverlay = null;
            }
            if (this.trayController.ui.completeOverlay && this.trayController.ui.completeOverlay.parentNode) {
                this.trayController.ui.completeOverlay.parentNode.removeChild(this.trayController.ui.completeOverlay);
                this.trayController.ui.completeOverlay = null;
            }
        }
        
        // 6. Re-init Level & Bins
        this.voxelLevel.setModel();
        this.binManager.configureBins();
    }
}
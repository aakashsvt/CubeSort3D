import * as THREE from 'three';
import { LEVELS } from '../constants.js';

export default class LevelManager {
    constructor(world) {
        this.world = world;
        this.experience = world.experience;
        this.scene = world.scene;
        
        this.levels = LEVELS;
        this.currentLevelIndex = 0;
    }

    update() {
        if (!this.world.trayController || !this.world.voxelLevel || !this.world.cubeManager || !this.world.voxelControls) return;

        if (!this.world.trayController.levelEnded && this.world.voxelLevel.cubes.length > 0) {
            const noActiveCubes = this.world.voxelLevel.cubes.every(c => !c.active);
            const noSpawningCubes = this.world.voxelControls.spawnGroups.length === 0;
            const noTrayCubes = this.world.cubeManager.getActiveTrayCubeCount() === 0;
            
            if (noActiveCubes && noSpawningCubes && noTrayCubes) {
                this.world.trayController.levelEnded = true;
                console.log("Player wins!");
                this.world.trayController.ui.showLevelCompleteUI();
            }
        }
    }

    loadNextLevel() {
        this.currentLevelIndex++;
        if (this.currentLevelIndex >= this.levels.length) {
            this.currentLevelIndex = 0;
        }
        this.loadLevel(this.currentLevelIndex);
    }

    retryLevel() {
        this.loadLevel(this.currentLevelIndex);
    }

    loadLevel(index) {
        const loader = new THREE.FileLoader();
        loader.load(this.levels[index], (data) => {
            const json = JSON.parse(data);
            this.resetLevel(json);
        });
    }

    resetLevel(newLevelData) {
        this.experience.resources.items.levelData = newLevelData;

        // 1. Clear Voxel Controls
        this.world.voxelControls.spawnGroups = [];
        if (this.world.voxelControls.touch) {
            this.world.voxelControls.touch.targetRotationY = 0;
        }
        if (this.world.voxelLevel.spinGroup) {
            this.world.voxelLevel.spinGroup.rotation.y = 0;
        }
        
        // 2. Clear Voxel Level
        this.world.voxelLevel.clear();
        
        // 3. Clear Cube Manager
        if (this.world.cubeManager.dynamicCubes) {
            for (const item of this.world.cubeManager.dynamicCubes) {
                if (item.body) this.world.physicsWorld.world.removeRigidBody(item.body);
            }
            this.world.cubeManager.dynamicCubes = [];
        }
        if (this.world.cubeManager.dynamicInstancedMesh) {
            this.scene.remove(this.world.cubeManager.dynamicInstancedMesh);
            this.world.cubeManager.dynamicInstancedMesh.geometry.dispose();
            this.world.cubeManager.dynamicInstancedMesh.material.dispose();
            this.world.cubeManager.dynamicInstancedMesh = null;
        }
        this.world.cubeManager.availableInstanceIds = [];
        this.world.cubeManager.colorRouteTimers = {};
        this.world.cubeManager.colorRouteBatchCounters = {};

        // 4. Clear Bin Manager
        if (this.world.binManager.binsGroup) {
            this.scene.remove(this.world.binManager.binsGroup);
            if (this.world.binManager.binInstancedMeshes) {
                for (const mesh of this.world.binManager.binInstancedMeshes) {
                    mesh.geometry.dispose();
                    if(mesh.material) mesh.material.dispose();
                }
            }
            if (this.world.binManager.internalCubeInstancedMesh) {
                this.world.binManager.internalCubeInstancedMesh.geometry.dispose();
                if(this.world.binManager.internalCubeInstancedMesh.material) this.world.binManager.internalCubeInstancedMesh.material.dispose();
            }
            if (this.world.binManager.shadowInstancedMeshes) {
                for (const mesh of this.world.binManager.shadowInstancedMeshes) {
                    mesh.geometry.dispose();
                    if(mesh.material) mesh.material.dispose();
                }
            }
            for (const item of this.world.binManager.spawnedBins) {
                if (item.colorBin.labelMesh) {
                    item.colorBin.labelMesh.geometry.dispose();
                    item.colorBin.labelMesh.material.dispose();
                }
            }
        }
        this.world.binManager.spawnedBins = [];
        this.world.binManager.exitingBins = [];
        this.world.binManager.roundRobinIndices = {};
        
        // 5. Reset Tray Controller
        this.world.trayController.levelEnded = false;
        this.world.trayController.failTimer = 0;
        this.world.trayController.overCapacityWarningStarted = false;
        this.world.trayController.isTimerActive = false;
        const dashboard = newLevelData.dashboard || {};
        this.world.trayController.maxTrayCapacity = dashboard.trayCapacityCubes || 50;
        if (this.world.trayController.ui && this.world.trayController.ui.maxCountEl) {
            this.world.trayController.ui.maxCountEl.innerText = this.world.trayController.maxTrayCapacity.toString();
        }
        
        if (this.world.trayController.ui) {
            if (this.world.trayController.ui.failOverlay && this.world.trayController.ui.failOverlay.parentNode) {
                this.world.trayController.ui.failOverlay.parentNode.removeChild(this.world.trayController.ui.failOverlay);
                this.world.trayController.ui.failOverlay = null;
            }
            if (this.world.trayController.ui.completeOverlay && this.world.trayController.ui.completeOverlay.parentNode) {
                this.world.trayController.ui.completeOverlay.parentNode.removeChild(this.world.trayController.ui.completeOverlay);
                this.world.trayController.ui.completeOverlay = null;
            }
        }
        
        // 6. Re-init Level & Bins
        this.world.voxelLevel.setModel();
        this.world.binManager.configureBins();
    }
}

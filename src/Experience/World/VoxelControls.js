import Experience from '../Experience.js'
import * as THREE from 'three'
import FloodFillSelector from './FloodFillSelector.js'
import WarningUI from '../../UI/WarningUI.js'

export default class VoxelControls {
    constructor(targetGroup, voxelLevel, physicsWorld, cubeManager) {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.targetGroup = targetGroup
        this.voxelLevel = voxelLevel
        this.physicsWorld = physicsWorld
        this.cubeManager = cubeManager
        this.debug = this.experience.debug

        this.raycaster = new THREE.Raycaster()
        this.mouse = new THREE.Vector2()
        this.isDragging = false
        this.floodFill = new FloodFillSelector(this.voxelLevel.voxelGrid)
        
        this.warningUI = new WarningUI()

        this.touch = {
            active: false,
            previousX: 0,
            rotationSpeed: 5.0, // High number because we now normalize delta by screen width
            targetRotationY: 0,
            dampingFactor: 0.1
        }
        
        this.staggerDelay = 20
        this.spawnGroups = []
        this.spawnTimer = 0

        this.setDebug()
        this.setInteraction()
    }

    setDebug() {
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('voxelControls')
            this.debugFolder.add(this.touch, 'rotationSpeed').min(0).max(20).step(0.1).name('swipeSpeed')
            this.debugFolder.add(this.touch, 'dampingFactor').min(0.01).max(1).step(0.01).name('dampingFactor')
            this.debugFolder.add(this, 'staggerDelay').min(0).max(200).step(1).name('Fall Stagger (ms)')
        }
    }

    setInteraction() {
        const canvas = this.experience.canvas

        const stopInteraction = () => {
            this.touch.active = false
        }

        // Pointer Events (works for both mouse and touch)
        canvas.addEventListener('pointerdown', (event) => {
            if (this.experience.world?.trayController?.levelEnded) return;
            this.touch.active = true
            this.touch.previousX = event.clientX
            this.isDragging = false
        }, { passive: false })

        window.addEventListener('pointermove', (event) => {
            if (this.experience.world?.trayController?.levelEnded) return;
            if (this.touch.active) {
                const deltaX = event.clientX - this.touch.previousX
                if (Math.abs(deltaX) > 2) this.isDragging = true

                this.touch.previousX = event.clientX
                
                // Only rotate the voxel group if OrbitControls is disabled
                if (!this.experience.camera.controls?.enabled) {
                    const normalizedDelta = deltaX / window.innerWidth
                    this.touch.targetRotationY += normalizedDelta * this.touch.rotationSpeed
                }
            }
        }, { passive: false })

        window.addEventListener('pointerup', (event) => {
            if (this.experience.world?.trayController?.levelEnded) {
                this.touch.active = false;
                return;
            }
            this.touch.active = false
            if (!this.isDragging) {
                this.handleClick(event)
            }
        })
        window.addEventListener('pointerleave', stopInteraction)
        window.addEventListener('pointercancel', stopInteraction)
    }

    handleClick(event) {
        if (this.experience.world?.trayController?.levelEnded) return;
        if (!this.voxelLevel.instancedMesh) return
        if (this.physicsWorld && (!this.physicsWorld.world || !this.physicsWorld.rouletteBody)) return

        // Calculate how many different colors are currently spawning or falling
        let fallingColors = new Set()
        for (const group of this.spawnGroups) {
            for (const item of group) {
                fallingColors.add(item.color.getHex())
            }
        }
        if (this.cubeManager && this.cubeManager.dynamicCubes) {
            for (const item of this.cubeManager.dynamicCubes) {
                if (item.body && item.body.translation().y >= 0.5 && !item.isRouting) {
                    fallingColors.add(item.colorHex)
                }
            }
        }

        // We need the color of the cube we just clicked to see if it's allowed
        const rect = this.experience.canvas.getBoundingClientRect()
        const x = event.clientX - rect.left
        const y = event.clientY - rect.top
        
        this.mouse.x = (x / rect.width) * 2 - 1
        this.mouse.y = -(y / rect.height) * 2 + 1

        this.raycaster.setFromCamera(this.mouse, this.experience.camera.instance)
        const intersects = this.raycaster.intersectObject(this.voxelLevel.instancedMesh)

        if (intersects.length > 0) {
            const instanceId = intersects[0].instanceId
            
            const color = new THREE.Color()
            this.voxelLevel.instancedMesh.getColorAt(instanceId, color)
            const clickedColorHex = color.getHex()

            // Block if 2 or more DIFFERENT colors are already falling, AND we clicked a new color
            if (fallingColors.size >= 2 && !fallingColors.has(clickedColorHex)) {
                this.showSettleWarning()
                return
            }

            const cube = this.voxelLevel.cubes.find(c => c.instanceId === instanceId)
            if (!cube || !cube.active) return

            const connected = this.floodFill.getConnectedGroup(cube.gridPos.x, cube.gridPos.y, cube.gridPos.z)
            
            // Need to initialize dynamic mesh if not done yet
            if (this.physicsWorld && !this.physicsWorld.dynamicInstancedMesh) {
                // We use the same geometry and material as the static mesh
                const geom = this.voxelLevel.instancedMesh.geometry
                const mat = this.voxelLevel.instancedMesh.material
                this.cubeManager.setupDynamicMesh(geom, mat, this.voxelLevel.cubes.length)
            }

            const dummy = new THREE.Object3D()
            dummy.scale.set(0, 0, 0)
            dummy.updateMatrix()

            // Sort by distance to the clicked cube so they fall radiating outward
            connected.sort((a, b) => {
                const distA = Math.abs(a.gridPos.x - cube.gridPos.x) + Math.abs(a.gridPos.y - cube.gridPos.y) + Math.abs(a.gridPos.z - cube.gridPos.z)
                const distB = Math.abs(b.gridPos.x - cube.gridPos.x) + Math.abs(b.gridPos.y - cube.gridPos.y) + Math.abs(b.gridPos.z - cube.gridPos.z)
                return distA - distB
            })

            let groupQueue = []
            for (const c of connected) {
                c.active = false
                this.voxelLevel.voxelGrid.remove(c.gridPos.x, c.gridPos.y, c.gridPos.z)

                if (this.physicsWorld) {
                    const worldMatrix = new THREE.Matrix4()
                    const position = new THREE.Vector3()
                    const quaternion = new THREE.Quaternion()
                    const scale = new THREE.Vector3()

                    this.voxelLevel.instancedMesh.getMatrixAt(c.instanceId, worldMatrix)
                    worldMatrix.premultiply(this.voxelLevel.instancedMesh.matrixWorld)
                    worldMatrix.decompose(position, quaternion, scale)
                    
                    const color = new THREE.Color()
                    this.voxelLevel.instancedMesh.getColorAt(c.instanceId, color)
                    
                    const targetScale = 0.75
                    const visualScale = scale.x * targetScale
                    const colliderSize = this.voxelLevel.cubeSize * scale.x * targetScale

                    groupQueue.push({
                        instanceId: c.instanceId,
                        position: position,
                        quaternion: quaternion,
                        color: color,
                        visualScale: visualScale,
                        colliderSize: colliderSize
                    })
                } else {
                    this.voxelLevel.instancedMesh.setMatrixAt(c.instanceId, dummy.matrix)
                }
            }

            if (groupQueue.length > 0) {
                this.spawnGroups.push(groupQueue)
            }

            if (!this.physicsWorld) {
                this.voxelLevel.instancedMesh.instanceMatrix.needsUpdate = true
            }
        }

    }
    
    showSettleWarning() {
        this.warningUI.show()
    }
    
    update() {
        if (this.targetGroup) {
            // Apply damping for smooth momentum feel
            this.targetGroup.rotation.y += (this.touch.targetRotationY - this.targetGroup.rotation.y) * this.touch.dampingFactor
        }

        if (this.spawnGroups.length > 0 && this.physicsWorld) {
            this.spawnTimer += this.experience.time.delta

            while (this.spawnGroups.length > 0 && this.spawnTimer >= this.staggerDelay) {
                if (this.staggerDelay > 0) {
                    this.spawnTimer -= this.staggerDelay
                } else {
                    this.spawnTimer = 0
                }

                // Pop one cube from each active spawn group to spawn them in parallel
                for (let i = this.spawnGroups.length - 1; i >= 0; i--) {
                    const group = this.spawnGroups[i]
                    if (group.length > 0) {
                        const item = group.shift()

                        const dummy = new THREE.Object3D()
                        dummy.scale.set(0, 0, 0)
                        dummy.updateMatrix()
                        
                        this.voxelLevel.instancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
                        this.voxelLevel.instancedMesh.instanceMatrix.needsUpdate = true
                        
                        const body = this.physicsWorld.createCubeBody(item.position, item.quaternion, item.colliderSize)
                        this.cubeManager.spawnCube(item.color, item.visualScale, body)
                    }

                    if (group.length === 0) {
                        this.spawnGroups.splice(i, 1)
                    }
                }
            }
        }
    }
}

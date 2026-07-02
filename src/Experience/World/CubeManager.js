import * as THREE from 'three'
import AnimatedRoutingStrategy from './AnimatedRoutingStrategy.js'

export default class CubeManager {
    constructor(scene, physicsWorld, binManager, rouletteGroup) {
        this.scene = scene
        this.physicsWorld = physicsWorld
        this.binManager = binManager
        this.rouletteGroup = rouletteGroup

        this.dynamicCubes = []
        this.dynamicInstancedMesh = null
        this.dummy = new THREE.Object3D()

        this.routingStrategy = new AnimatedRoutingStrategy()

        this.conveyorOmega = 2.0 // matches Roulette.js speed 
        this.availableInstanceIds = [] 
        // Staggering delay
        this.routeStaggerDelay = 0.05
        this.routeBatchSize = 3
        this.colorRouteTimers = {}
        this.colorRouteBatchCounters = {}

        // Temporary Tray Capacity Logic
        const levelData = this.binManager?.resources?.items?.levelData || {}
        const dashboard = levelData.dashboard || {}
        this.maxTrayCapacity = dashboard.trayCapacityCubes || 50
        
        this.trayUiContainer = document.createElement('div')
        this.trayUiContainer.style.position = 'absolute'
        this.trayUiContainer.style.top = '10px'
        this.trayUiContainer.style.left = '10px'
        this.trayUiContainer.style.color = 'white'
        this.trayUiContainer.style.backgroundColor = 'rgba(0,0,0,0.6)'
        this.trayUiContainer.style.padding = '10px'
        this.trayUiContainer.style.fontFamily = 'monospace'
        this.trayUiContainer.style.fontSize = '16px'
        this.trayUiContainer.style.zIndex = '99999'
        this.trayUiContainer.style.pointerEvents = 'none'
        this.trayUiContainer.innerHTML = `Roulette Capacity: 0 / ${this.maxTrayCapacity}`
        document.body.appendChild(this.trayUiContainer)
    }

    setupDynamicMesh(geometry, material, maxCubes) {
        if (this.dynamicInstancedMesh) return

        const dynMaterial = material.clone()
        dynMaterial.vertexColors = false
        this.dynamicInstancedMesh = new THREE.InstancedMesh(geometry, dynMaterial, maxCubes)
        this.dynamicInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        // OPTIMIZATION: Disable dynamic shadows for cubes on the roulette. 
        // Rendering shadows for 150+ instanced cubes dynamically every frame causes massive GPU lag.
        // This also matches the 'castShadows: false' setting in level.json.
        this.dynamicInstancedMesh.castShadow = false
        this.dynamicInstancedMesh.receiveShadow = false

        this.dummy.scale.set(0, 0, 0)
        this.dummy.updateMatrix()
        for (let i = 0; i < maxCubes; i++) {
            this.dynamicInstancedMesh.setMatrixAt(i, this.dummy.matrix)
            this.availableInstanceIds.push(i)
        }
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.dynamicInstancedMesh)
    }

    spawnCube(color, visualScale, body) {
        if (!this.dynamicInstancedMesh || this.availableInstanceIds.length === 0) return

        const instanceId = this.availableInstanceIds.shift()
        this.dynamicInstancedMesh.setColorAt(instanceId, color)
        this.dynamicInstancedMesh.instanceColor.needsUpdate = true

        this.dynamicCubes.push({
            body: body,
            instanceId: instanceId,
            scaleFactor: visualScale,
            colorHex: color.getHex(),
            timeOnRoulette: 0,
            isRouting: false
        })
    }

    getAvailableBinPositionForColor(colorHex) {
        if (!this.binManager || !this.binManager.spawnedBins) return null

        const item = this.binManager.getBinItemForColorHex(colorHex)
        if (item) {
            item.colorBin.currentCount++
            item.colorBin.updateLabelText()
            this.binManager.updateLayout()
            // console.log('Internal cubes count:', this.binManager.internalCubeInstancedMesh?.count, 'Visible:', Math.min(item.colorBin.currentCount, this.binManager.internalCubeTransforms?.length || 0))

            this.binManager.binsGroup.updateMatrixWorld(true)
            const binPos = new THREE.Vector3()
            binPos.setFromMatrixPosition(item.colorBin.matrix)
            binPos.applyMatrix4(this.binManager.binsGroup.matrixWorld)
            binPos.y += 0.5

            if (item.colorBin.currentCount >= item.colorBin.capacity) {
                this.binManager.advanceQueue(item.rIndex)
            }

            return binPos
        }
        return null
    }

    applyConveyorPhysics(item, translation, rouletteCenter, rotationQuat, dt) {
        const toObject = new THREE.Vector3(translation.x - rouletteCenter.x, 0, translation.z - rouletteCenter.z)
        const nextLocalPos = toObject.clone().applyQuaternion(rotationQuat)

        const velX = (nextLocalPos.x - toObject.x) / dt
        const velZ = (nextLocalPos.z - toObject.z) / dt

        const currentVel = item.body.linvel()
        item.body.setLinvel({ x: velX, y: currentVel.y, z: velZ }, true)

        const currentAng = item.body.angvel()
        item.body.setAngvel({ x: currentAng.x, y: this.conveyorOmega, z: currentAng.z }, true)
    }

    update(dt) {
        let currentCount = this.dynamicCubes ? this.dynamicCubes.length : 0
        if (this.trayUiContainer) {
            this.trayUiContainer.innerHTML = `Roulette Capacity: ${currentCount} / ${this.maxTrayCapacity}`
            if (currentCount > this.maxTrayCapacity) {
                this.trayUiContainer.style.color = 'red'
                this.trayUiContainer.innerHTML += '<br><b>[OVER CAPACITY! LEVEL FAILED]</b>'
            } else {
                this.trayUiContainer.style.color = 'white'
            }
        }

        if (!this.dynamicInstancedMesh) return
        if (this.dynamicCubes.length === 0) return

        for (const hex in this.colorRouteTimers) {
            if (this.colorRouteTimers[hex] > 0) {
                this.colorRouteTimers[hex] -= dt
                if (this.colorRouteTimers[hex] <= 0) {
                    this.colorRouteBatchCounters[hex] = 0
                }
            }
        }

        const rouletteCenter = this.rouletteGroup ? this.rouletteGroup.position : { x: 0, y: 0, z: 0 }
        const angleStep = this.conveyorOmega * dt
        const rotationQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleStep)

        for (let i = this.dynamicCubes.length - 1; i >= 0; i--) {
            const item = this.dynamicCubes[i]

            // 1. Routing Animation
            if (item.isRouting) {
                const isDone = this.routingStrategy.update(item, dt, this.dummy, this.dynamicInstancedMesh)
                if (isDone) {
                    this.availableInstanceIds.push(item.instanceId)
                    this.dynamicCubes.splice(i, 1)
                }
                continue
            }

            // 2. Normal Physics sync
            const translation = item.body.translation()
            const rotation = item.body.rotation()

            if (translation.y < 0.5) {
                // Let the physics engine handle the roulette rotation friction naturally

                item.timeOnRoulette += dt

                // OPTIMIZATION: Disable self-collision after cube settles on tray
                if (item.timeOnRoulette > 0.5 && !item.isOptimized) {
                    item.isOptimized = true
                    if (this.physicsWorld && this.physicsWorld.setCubeNoSelfCollision) {
                        this.physicsWorld.setCubeNoSelfCollision(item.body)
                    }
                }

                if (item.timeOnRoulette > 0.8) {
                    const timer = this.colorRouteTimers[item.colorHex] || 0
                    if (timer <= 0) {
                        const binPos = this.getAvailableBinPositionForColor(item.colorHex)
                        if (binPos) {
                            this.colorRouteBatchCounters[item.colorHex] = (this.colorRouteBatchCounters[item.colorHex] || 0) + 1
                            
                            if (this.colorRouteBatchCounters[item.colorHex] >= this.routeBatchSize) {
                                this.colorRouteTimers[item.colorHex] = this.routeStaggerDelay
                            }
                            
                            this.physicsWorld.world.removeRigidBody(item.body)
                            item.body = null
                            this.routingStrategy.startRouting(item, new THREE.Vector3(translation.x, translation.y, translation.z), binPos)
                            continue
                        }
                    }
                }
            }

            this.dummy.position.set(translation.x, translation.y, translation.z)
            this.dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
            this.dummy.scale.set(item.scaleFactor, item.scaleFactor, item.scaleFactor)
            // OPTIMIZATION: direct compose instead of dummy.updateMatrix() which avoids heavy THREE.js overhead
            this.dummy.matrix.compose(this.dummy.position, this.dummy.quaternion, this.dummy.scale)
            this.dynamicInstancedMesh.setMatrixAt(item.instanceId, this.dummy.matrix)
        }
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
    }
}
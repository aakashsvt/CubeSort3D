import * as THREE from 'three'
import AnimatedRoutingStrategy from './AnimatedRoutingStrategy.js'
import Experience from '../Experience.js'

export default class CubeManager {
    constructor(scene, physicsWorld, binManager, roulette) {
        this.experience = new Experience()
        this.scene = scene
        this.physicsWorld = physicsWorld
        this.binManager = binManager
        this.roulette = roulette
        this.rouletteGroup = roulette ? roulette.group : null

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
            isRouting: false,
            localMatrix: null  // Set when cube lands on tray
        })
    }

    getAvailableBinPositionForColor(colorHex) {
        if (!this.binManager || !this.binManager.spawnedBins) return null

        const item = this.binManager.getBinItemForColorHex(colorHex)
        if (item) {
            item.colorBin.assignedCount++

            this.binManager.binsGroup.updateMatrixWorld(true)
            const binPos = new THREE.Vector3()
            binPos.setFromMatrixPosition(item.colorBin.matrix)
            binPos.applyMatrix4(this.binManager.binsGroup.matrixWorld)
            binPos.y += 0.5

            return {
                binPos: binPos,
                binItem: item
            }
        }
        return null
    }



    getActiveTrayCubeCount() {
        return this.dynamicCubes ? this.dynamicCubes.length : 0;
    }

    hasActiveFallingCubes() {
        if (!this.dynamicCubes) return false;
        for (let i = 0; i < this.dynamicCubes.length; i++) {
            if (this.dynamicCubes[i].body && this.dynamicCubes[i].body.translation().y >= 0.5 && !this.dynamicCubes[i].isRouting) {
                return true;
            }
        }
        return false;
    }

    update(dt) {

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

        for (let i = this.dynamicCubes.length - 1; i >= 0; i--) {
            const item = this.dynamicCubes[i]

            // 1. Routing Animation
            if (item.isRouting) {
                const isDone = this.routingStrategy.update(item, dt, this.dummy, this.dynamicInstancedMesh)
                if (isDone) {
                    if (item.targetBinItem) {
                        const binItem = item.targetBinItem
                        binItem.colorBin.currentCount++
                        binItem.colorBin.updateLabelText()
                        this.binManager.updateLayout()

                        if (this.experience && this.experience.audioManager) {
                            this.experience.audioManager.playSynthCollect()
                        }

                        if (binItem.colorBin.currentCount >= binItem.colorBin.capacity) {
                            if (this.experience && this.experience.audioManager) {
                                this.experience.audioManager.playSynthBinFilled()
                            }
                            this.binManager.advanceQueue(binItem.rIndex)
                        }
                    }

                    this.availableInstanceIds.push(item.instanceId)
                    this.dynamicCubes.splice(i, 1)
                }
                continue
            }

            // 2. Cube still has a physics body (falling or just landed)
            if (item.body) {
                const translation = item.body.translation()
                const rotation = item.body.rotation()

                const linvel = item.body.linvel()
                const speed = Math.sqrt(linvel.x * linvel.x + linvel.y * linvel.y + linvel.z * linvel.z)

                // Only count time toward hard timeout when cube is near the tray, not mid-air
                if (translation.y < 1.0) {
                    item.timeAlive = (item.timeAlive || 0) + dt
                }

                // Track how long the cube has been continuously still.
                // At the peak of a bounce, speed is zero for only 1 frame — not enough.
                // On a surface, speed stays low for many frames — that's a real settle.
                if (speed < 1.5) {
                    item.settledTime = (item.settledTime || 0) + dt
                    
                    if (translation.y < 1.0 && !item.hasPlayedImpactSound) {
                        item.hasPlayedImpactSound = true
                        if (this.experience && this.experience.audioManager) {
                            this.experience.audioManager.playSynthFall()
                        }
                    }
                } else {
                    item.settledTime = 0
                }

                // Kill physics when EITHER:
                // 1. Cube has been still for 0.15s straight (natural settle), OR
                // 2. Hard timeout of 1.5s near the tray (safety net — prevents floating forever)
                const hasSettled = item.settledTime > 0.15 || (item.timeAlive || 0) > 1.5

                if (hasSettled) {
                    // === INSTANT KILL + FLAT SNAP + MATRIX PARENT ===
                    // The cube has touched the tray. Kill physics immediately.
                    // This eliminates ALL centripetal force, sliding, and tumbling.
                    this.physicsWorld.world.removeRigidBody(item.body)
                    item.body = null

                    // Convert the cube's world position into the roulette model's local space
                    this.dummy.position.set(translation.x, translation.y, translation.z)
                    // Force rotation to identity — the cube sits FLAT on the tray surface.
                    // The tray's own tilt (from roulette.model.matrixWorld) will be inherited
                    // automatically when we multiply matrices each frame.
                    this.dummy.quaternion.identity()
                    this.dummy.scale.set(item.scaleFactor, item.scaleFactor, item.scaleFactor)
                    this.dummy.updateMatrix()

                    // Compute localMatrix = inverse(rouletteModelWorld) * cubeWorldMatrix
                    // This gives us the cube's position relative to the spinning roulette model.
                    const inverseRoulette = new THREE.Matrix4().copy(this.roulette.model.matrixWorld).invert()
                    item.localMatrix = new THREE.Matrix4().copy(inverseRoulette).multiply(this.dummy.matrix)
                } else {
                    // Still falling — sync visual from physics
                    this.dummy.position.set(translation.x, translation.y, translation.z)
                    this.dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
                    this.dummy.scale.set(item.scaleFactor, item.scaleFactor, item.scaleFactor)
                    this.dummy.matrix.compose(this.dummy.position, this.dummy.quaternion, this.dummy.scale)
                    this.dynamicInstancedMesh.setMatrixAt(item.instanceId, this.dummy.matrix)
                }
                continue
            }

            // 3. Cube is parented to the roulette (no physics body)
            item.timeOnRoulette += dt

            // Recompute world matrix: rouletteModelWorld * localMatrix
            // This makes the cube orbit perfectly with the spinning tilted tray.
            this.dummy.matrix.copy(this.roulette.model.matrixWorld).multiply(item.localMatrix)
            this.dummy.matrix.decompose(this.dummy.position, this.dummy.quaternion, this.dummy.scale)

            // Check if cube should route to a bin
            if (item.timeOnRoulette >= 0) {
                const timer = this.colorRouteTimers[item.colorHex] || 0
                if (timer <= 0) {
                    const binRouteData = this.getAvailableBinPositionForColor(item.colorHex)
                    if (binRouteData) {
                        this.colorRouteBatchCounters[item.colorHex] = (this.colorRouteBatchCounters[item.colorHex] || 0) + 1
                        if (this.colorRouteBatchCounters[item.colorHex] >= this.routeBatchSize) {
                            this.colorRouteTimers[item.colorHex] = this.routeStaggerDelay
                        }

                        item.targetBinItem = binRouteData.binItem
                        this.routingStrategy.startRouting(item, new THREE.Vector3(this.dummy.position.x, this.dummy.position.y, this.dummy.position.z), binRouteData.binPos)
                        continue
                    }
                }
            }

            // Update the instanced mesh with the matrix-parented position
            this.dynamicInstancedMesh.setMatrixAt(item.instanceId, this.dummy.matrix)
        }
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
    }
}
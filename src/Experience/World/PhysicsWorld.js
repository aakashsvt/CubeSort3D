import Experience from '../Experience.js'
import * as THREE from 'three'

let RAPIER;

export default class PhysicsWorld {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        
        this.world = null
        this.dynamicCubes = [] // Array of { body, instanceId, scaleFactor }
        this.dynamicInstancedMesh = null
        
        this.physicsParams = {
            gravity: -30.0,
            restitution: 0.1,
            friction: 0.6,
            debugRender: false
        }
        
        this.debugLines = null
        
        this.setDebug()
        this.init()
    }

    setDebug() {
        this.debug = this.experience.debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('Physics')
            this.debugFolder.add(this.physicsParams, 'gravity').min(-50).max(10).step(0.1).name('Gravity Y').onChange((v) => {
                if (this.world) this.world.gravity = { x: 0, y: v, z: 0 }
            })
            this.debugFolder.add(this.physicsParams, 'restitution').min(0).max(1).step(0.01).name('Bounciness')
            this.debugFolder.add(this.physicsParams, 'friction').min(0).max(2).step(0.01).name('Friction')
            
            this.debugFolder.add(this.physicsParams, 'debugRender').name('Show Colliders').onChange((v) => {
                if (v) {
                    if (!this.debugLines) {
                        const material = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false })
                        const geometry = new THREE.BufferGeometry()
                        this.debugLines = new THREE.LineSegments(geometry, material)
                        this.debugLines.renderOrder = 999 // Render on top of everything
                        this.scene.add(this.debugLines)
                    }
                    this.debugLines.visible = true
                } else if (this.debugLines) {
                    this.debugLines.visible = false
                }
            })
        }
    }

    async init() {
        RAPIER = await import('@dimforge/rapier3d')
        
        const gravity = { x: 0.0, y: this.physicsParams.gravity, z: 0.0 }
        this.world = new RAPIER.World(gravity)
    }

    createRouletteBody(rouletteGroup, rouletteModel, netOffsetY = 0) {
        if (!this.world) return

        let bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        this.rouletteBody = this.world.createRigidBody(bodyDesc)
        this.rouletteGroup = rouletteGroup
        this.rouletteModel = rouletteModel

        rouletteModel.updateMatrixWorld(true)

        const localBox = new THREE.Box3()

        rouletteModel.traverse((child) => {
            if (child.isMesh) {
                // Compute bounds for safety net (only using visual model, not invisible wall)
                if (child.name !== 'InvisibleWall') {
                    child.geometry.computeBoundingBox()
                    const childBox = child.geometry.boundingBox.clone()
                    childBox.applyMatrix4(child.matrix)
                    localBox.union(childBox)
                }

                // Generate trimesh for EVERYTHING (both roulette and wall) to perfectly fit
                const geometry = child.geometry.clone()
                const matrix = new THREE.Matrix4()
                matrix.copy(child.matrixWorld)
                
                const modelInverse = new THREE.Matrix4().copy(rouletteModel.matrixWorld).invert()
                matrix.premultiply(modelInverse) 

                const worldScale = new THREE.Vector3()
                rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)
                const scaleMatrix = new THREE.Matrix4().makeScale(worldScale.x, worldScale.y, worldScale.z)
                scaleMatrix.multiply(matrix)
                geometry.applyMatrix4(scaleMatrix)

                const positionAttribute = geometry.attributes.position
                let vertices = positionAttribute.array
                
                let indices
                if (geometry.index) {
                    indices = geometry.index.array
                } else {
                    indices = new Uint32Array(positionAttribute.count)
                    for (let i = 0; i < positionAttribute.count; i++) indices[i] = i
                }

                const verticesFloat32 = new Float32Array(vertices)
                const indicesUint32 = new Uint32Array(indices)

                let colliderDesc = RAPIER.ColliderDesc.trimesh(verticesFloat32, indicesUint32)
                colliderDesc.setRestitution(0.1)
                
                if (child.name === 'InvisibleWall') {
                    colliderDesc.setFriction(0.0) // Slippery wall
                } else {
                    colliderDesc.setFriction(5.0) // Normal friction
                    colliderDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
                }
                
                this.world.createCollider(colliderDesc, this.rouletteBody)
            }
        })

        // ----------------------------------------------------------------
        // SAFETY NET (Thick Cylinder)
        // Placed exactly at the bottom bound of the model to catch tunneling cubes.
        // ----------------------------------------------------------------
        const size = localBox.getSize(new THREE.Vector3())
        const localRadius = Math.max(size.x, size.z) / 2
        const localMinY = localBox.min.y

        const worldScale = new THREE.Vector3()
        rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)

        const scaledRadius = localRadius * Math.max(worldScale.x, worldScale.z)
        const halfHeight = 0.5 // 1.0 unit thick safety net
        const scaledHalfHeight = halfHeight * worldScale.y
        
        // Position the top of the cylinder at the lowest point of the model + the user offset
        const cyCenterY = ((localMinY + netOffsetY) * worldScale.y) - scaledHalfHeight

        let netDesc = RAPIER.ColliderDesc.cylinder(scaledHalfHeight, scaledRadius)
        netDesc.setTranslation(0, cyCenterY, 0)
        netDesc.setRestitution(0.1)
        netDesc.setFriction(5.0)
        netDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Max)
        
        this.world.createCollider(netDesc, this.rouletteBody)
    }

    updateRouletteBody(rouletteGroup, rouletteModel, netOffsetY = 0) {
        if (!this.world) return
        if (this.rouletteBody) {
            this.world.removeRigidBody(this.rouletteBody)
            this.rouletteBody = null
        }
        this.createRouletteBody(rouletteGroup, rouletteModel, netOffsetY)
    }

    setupDynamicMesh(geometry, material, maxCubes) {
        if (this.dynamicInstancedMesh) return

        const dynMaterial = material.clone()
        dynMaterial.vertexColors = false
        this.dynamicInstancedMesh = new THREE.InstancedMesh(geometry, dynMaterial, maxCubes)
        this.dynamicInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.dynamicInstancedMesh.castShadow = true
        this.dynamicInstancedMesh.receiveShadow = true
        
        const dummy = new THREE.Object3D()
        dummy.scale.set(0, 0, 0)
        dummy.updateMatrix()
        for(let i = 0; i < maxCubes; i++) {
            this.dynamicInstancedMesh.setMatrixAt(i, dummy.matrix)
        }
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.dynamicInstancedMesh)
    }

    getAvailableBinPositionForColor(colorHex) {
        if (!this.binManager || !this.binManager.spawnedBins) return null
        
        for (const item of this.binManager.spawnedBins) {
            if (item.colorBin.color.getHex() === colorHex && item.queueIndex === 0) {
                // Ensure world matrix is up to date
                this.binManager.binsGroup.updateMatrixWorld(true)
                const binPos = new THREE.Vector3()
                binPos.setFromMatrixPosition(item.colorBin.matrix)
                binPos.applyMatrix4(this.binManager.binsGroup.matrixWorld)
                binPos.y += 0.5 // Aim for slightly above the bin entry
                return binPos
            }
        }
        return null
    }

    spawnCube(worldPos, worldQuat, color, visualScale, colliderSize) {
        if (!this.dynamicInstancedMesh) return
        
        let bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(worldPos.x, worldPos.y, worldPos.z).setRotation(worldQuat)
        bodyDesc.setCcdEnabled(true) // Enable CCD to prevent tunneling through the trimesh!
        let body = this.world.createRigidBody(bodyDesc)
        
        // Slightly shrink collider (0.48 instead of 0.5 half-extents) to prevent explosive blast-outs
        let colliderDesc = RAPIER.ColliderDesc.cuboid(colliderSize * 0.48, colliderSize * 0.48, colliderSize * 0.48)
        colliderDesc.setRestitution(this.physicsParams.restitution)
        colliderDesc.setFriction(this.physicsParams.friction)
        this.world.createCollider(colliderDesc, body)
        
        const instanceId = this.dynamicCubes.length
        this.dynamicInstancedMesh.setColorAt(instanceId, color)
        this.dynamicInstancedMesh.instanceColor.needsUpdate = true
        
        this.dynamicCubes.push({
            body: body,
            instanceId: instanceId,
            scaleFactor: visualScale,
            colorHex: color.getHex()
        })
    }

    update() {
        if (!this.world) return
        
        if (this.rouletteBody && this.rouletteModel) {
            this.rouletteModel.updateMatrixWorld(true)
            const pos = new THREE.Vector3()
            const quat = new THREE.Quaternion()
            const scale = new THREE.Vector3()
            this.rouletteModel.matrixWorld.decompose(pos, quat, scale)
            this.rouletteBody.setNextKinematicTranslation(pos)
            this.rouletteBody.setNextKinematicRotation(quat)
        }

        // Step physics
        this.world.step()
        
        // Render debug lines
        if (this.physicsParams.debugRender && this.debugLines) {
                    this.debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3))
            this.debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4))
        }

        // Sync dynamic cubes and apply ConveyorBelt circular physics / Routing
        if (this.dynamicInstancedMesh && this.dynamicCubes.length > 0) {
            const dummy = new THREE.Object3D()
            const rouletteCenter = this.rouletteGroup ? this.rouletteGroup.position : { x: 0, y: 0, z: 0 }
            const dt = 1 / 60 // Rapier fixed step
            const omega = 2.0 // matches Roulette.js this.speed
            const angleStep = omega * dt
            const rotationQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleStep)
            
            for(let i = this.dynamicCubes.length - 1; i >= 0; i--) {
                const item = this.dynamicCubes[i]
                
                // 1. If it is currently being routed via Bezier curve
                if (item.isRouting) {
                    item.routeProgress += dt / 0.35 // 0.35s duration
                    
                    if (item.routeProgress >= 1) {
                        // Reached the bin! Hide it.
                        dummy.scale.set(0, 0, 0)
                        dummy.updateMatrix()
                        this.dynamicInstancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
                        this.dynamicCubes.splice(i, 1) // Remove from physics/animation tracking
                        continue
                    }
                    
                    // Bezier interpolation (CatmullRom-style arc)
                    const t = item.routeProgress
                    const u = 1 - t
                    const tt = t * t
                    const uu = u * u
                    
                    const p = new THREE.Vector3()
                    p.x = uu * item.startPos.x + 2 * u * t * item.midPos.x + tt * item.targetPos.x
                    p.y = uu * item.startPos.y + 2 * u * t * item.midPos.y + tt * item.targetPos.y
                    p.z = uu * item.startPos.z + 2 * u * t * item.midPos.z + tt * item.targetPos.z
                    
                    dummy.position.copy(p)
                    // Random spin during flight
                    item.rotX = (item.rotX || 0) + dt * 10
                    item.rotY = (item.rotY || 0) + dt * 15
                    dummy.rotation.set(item.rotX, item.rotY, 0)
                    
                    // Squish on arrival (last 20%)
                    let scale = item.scaleFactor
                    if (t > 0.8) {
                        scale = THREE.MathUtils.lerp(item.scaleFactor, 0.1, (t - 0.8) / 0.2)
                    }
                    dummy.scale.set(scale, scale, scale)
                    dummy.updateMatrix()
                    this.dynamicInstancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
                    continue
                }

                // 2. Normal physics tracking
                const translation = item.body.translation()
                const rotation = item.body.rotation()
                
                // If the cube has fallen onto the roulette (below wall height)
                if (translation.y < 1.5) {
                    // Apply ConveyorBelt physics to keep it spinning
                    const toObject = new THREE.Vector3(translation.x - rouletteCenter.x, 0, translation.z - rouletteCenter.z)
                    
                    const nextLocalPos = toObject.clone().applyQuaternion(rotationQuat)
                    const velX = (nextLocalPos.x - toObject.x) / dt
                    const velZ = (nextLocalPos.z - toObject.z) / dt
                    
                    const currentVel = item.body.linvel()
                    item.body.setLinvel({ x: velX, y: currentVel.y, z: velZ }, true)
                    
                    const currentAng = item.body.angvel()
                    item.body.setAngvel({ x: currentAng.x, y: omega, z: currentAng.z }, true)

                    // Track how long it has been on the roulette
                    item.timeOnRoulette = (item.timeOnRoulette || 0) + dt

                    // Only try to route after it has spent at least 0.8 seconds spinning on the roulette
                    if (item.timeOnRoulette > 0.8) {
                        // Check if it matches an available bin
                        const binPos = this.getAvailableBinPositionForColor(item.colorHex)
                        if (binPos) {
                            // Start routing animation!
                            item.isRouting = true
                            item.routeProgress = 0
                            item.startPos = new THREE.Vector3(translation.x, translation.y, translation.z)
                            item.targetPos = binPos
                            
                            // Arc midpoint
                            item.midPos = new THREE.Vector3().lerpVectors(item.startPos, item.targetPos, 0.5)
                            item.midPos.y += 3.0 // Pop up into the air!

                            this.world.removeRigidBody(item.body)
                            item.body = null
                            continue
                        }
                    }
                }

                dummy.position.set(translation.x, translation.y, translation.z)
                dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
                dummy.scale.set(item.scaleFactor, item.scaleFactor, item.scaleFactor)
                dummy.updateMatrix()
                this.dynamicInstancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
            }
            this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
        }
    }
}

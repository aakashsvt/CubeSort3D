import Experience from '../Experience.js'
import * as THREE from 'three'

let RAPIER;

export default class PhysicsWorld {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        this.world = null
        this.physicsParams = {
            gravity: -60.0,
            restitution: 0.4,
            friction: 0.6,
            debugRender: false,
            enableTrimesh: true,
            enableWall: true,
            enableCone: true,
            enableSafetyNet: true,
            netRadiusOffset: 0.0,
            netHalfHeight: 3.0,
            netOffsetY: 0.12,
            ccdEnabled: false,
            solverIterations: 4
        }
        
        this.debugLines = null
        
        this.setDebug()
        this.ready = this.init()
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
            
            const collidersFolder = this.debugFolder.addFolder('Roulette Colliders')
            collidersFolder.add(this.physicsParams, 'enableTrimesh').name('Trimesh').onChange(() => this.rebuildRouletteBody())
            collidersFolder.add(this.physicsParams, 'enableWall').name('Wall').onChange(() => this.rebuildRouletteBody())
            collidersFolder.add(this.physicsParams, 'enableCone').name('Cone').onChange(() => this.rebuildRouletteBody())
            
            const safetyNetFolder = this.debugFolder.addFolder('Safety Net Collider')
            safetyNetFolder.add(this.physicsParams, 'enableSafetyNet').name('Enable').onChange(() => this.rebuildRouletteBody())
            safetyNetFolder.add(this.physicsParams, 'netRadiusOffset').min(-5).max(5).step(0.01).name('Radius Offset').onChange(() => this.rebuildRouletteBody())
            safetyNetFolder.add(this.physicsParams, 'netHalfHeight').min(0.1).max(10).step(0.01).name('Half-Height').onChange(() => this.rebuildRouletteBody())
            safetyNetFolder.add(this.physicsParams, 'netOffsetY').min(-5).max(5).step(0.01).name('Offset Y').onChange(() => this.rebuildRouletteBody())
            
            const perfFolder = this.debugFolder.addFolder('Performance & Accuracy')
            perfFolder.add(this.physicsParams, 'ccdEnabled').name('Enable CCD (Fix Tunneling)')
            perfFolder.add(this.physicsParams, 'solverIterations').min(1).max(10).step(1).name('Solver Iterations').onChange((v) => {
                if (this.world) {
                    this.world.integrationParameters.numSolverIterations = v
                    this.world.integrationParameters.numAdditionalFrictionIterations = v
                }
            })
        }
    }

    async init() {
        RAPIER = await import('@dimforge/rapier3d')
        
        const gravity = { x: 0.0, y: this.physicsParams.gravity, z: 0.0 }
        this.world = new RAPIER.World(gravity)
        
        // Setup iterations based on params
        this.world.integrationParameters.numSolverIterations = this.physicsParams.solverIterations;
        this.world.integrationParameters.numAdditionalFrictionIterations = this.physicsParams.solverIterations;
    }

    rebuildRouletteBody() {
        if (this.rouletteGroup && this.rouletteModel) {
            this.updateRouletteBody(this.rouletteGroup, this.rouletteModel)
        }
    }

    createRouletteBody(rouletteGroup, rouletteModel) {
        if (!this.world) return

        this.rouletteGroup = rouletteGroup
        this.rouletteModel = rouletteModel
        this.rouletteGroup.updateMatrixWorld(true)
        this.rouletteModel.updateMatrixWorld(true)

        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        this.rouletteModel.matrixWorld.decompose(pos, quat, scale)

        let bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(pos.x, pos.y, pos.z)
            .setRotation(quat)

        this.rouletteBody = this.world.createRigidBody(bodyDesc)

        const localBox = new THREE.Box3()

        rouletteModel.traverse((child) => {
            if (child.isMesh) {
                // Compute bounds for safety net (only using visual model, not invisible wall)
                if (child.name !== 'InvisibleWall' && child.name !== 'DeflectorCone') {
                    child.geometry.computeBoundingBox()
                    const childBox = child.geometry.boundingBox.clone()
                    childBox.applyMatrix4(child.matrix)
                    localBox.union(childBox)
                }

                // Generate colliders (skip based on physicsParams)
                if (child.name === 'InvisibleWall' && !this.physicsParams.enableWall) return
                if (child.name === 'DeflectorCone' && !this.physicsParams.enableCone) return
                if (child.name !== 'InvisibleWall' && child.name !== 'DeflectorCone' && !this.physicsParams.enableTrimesh) return
                
                const worldScale = new THREE.Vector3()
                rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)

                // OPTIMIZATION: Use a solid native primitive for the Deflector Cone instead of a hollow Trimesh shell.
                // A solid cone has volume, meaning fast-falling cubes will be pushed outward even if they penetrate deeply.
                // This prevents tunneling without needing expensive CCD!
                if (child.name === 'DeflectorCone') {
                    child.geometry.computeBoundingBox()
                    const size = child.geometry.boundingBox.getSize(new THREE.Vector3())
                    const radius = Math.max(size.x, size.z) / 2
                    const halfHeight = size.y / 2

                    let colliderDesc = RAPIER.ColliderDesc.cone(halfHeight * worldScale.y, radius * Math.max(worldScale.x, worldScale.z))
                    colliderDesc.setTranslation(child.position.x * worldScale.x, child.position.y * worldScale.y, child.position.z * worldScale.z)
                    colliderDesc.setRestitution(0.1)
                    colliderDesc.setFriction(0.0) // Slippery cone
                    colliderDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
                    
                    this.world.createCollider(colliderDesc, this.rouletteBody)
                    return // Done with the cone
                }

                // For the Roulette Tray and Invisible Wall, we must use a Trimesh because they are hollow/concave.
                const geometry = child.geometry.clone()
                const matrix = new THREE.Matrix4()
                matrix.copy(child.matrixWorld)
                
                const modelInverse = new THREE.Matrix4().copy(rouletteModel.matrixWorld).invert()
                matrix.premultiply(modelInverse) 

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
                    colliderDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min) // Force 0 friction!
                } else {
                    colliderDesc.setFriction(0.3) // Low friction — enough to settle on tilt, not enough to fling outward
                    colliderDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
                }
                
                this.world.createCollider(colliderDesc, this.rouletteBody)
            }
        })

        // ----------------------------------------------------------------
        // SAFETY NET (Thick Cylinder)
        // Placed exactly at the bottom bound of the model to catch tunneling cubes.
        // ----------------------------------------------------------------
        if (this.physicsParams.enableSafetyNet) {
            const size = localBox.getSize(new THREE.Vector3())
            const center = localBox.getCenter(new THREE.Vector3())
            const localRadius = (Math.max(size.x, size.z) / 2) + this.physicsParams.netRadiusOffset
            const localMinY = localBox.min.y

            const worldScale = new THREE.Vector3()
            rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)

            const scaledRadius = localRadius * Math.max(worldScale.x, worldScale.z)
            const halfHeight = this.physicsParams.netHalfHeight // 6.0 unit thick safety net (prevents tunneling at high -60 gravity without needing expensive CCD)
            const scaledHalfHeight = halfHeight * worldScale.y
            
            const cyCenterX = center.x * worldScale.x
            const cyCenterZ = center.z * worldScale.z
            
            // Position the top of the cylinder at the lowest point of the model + the user offset
            const cyCenterY = ((localMinY + this.physicsParams.netOffsetY) * worldScale.y) - scaledHalfHeight

            let netDesc = RAPIER.ColliderDesc.cylinder(scaledHalfHeight, scaledRadius)
            netDesc.setTranslation(cyCenterX, cyCenterY, cyCenterZ)
            netDesc.setRestitution(0.1)
            netDesc.setFriction(0.3)
            netDesc.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
            
            this.world.createCollider(netDesc, this.rouletteBody)

            // SECONDARY SAFETY NET
            // Placed at the exact same position and radius to catch anything flinging outwards
            // ----------------------------------------------------------------
            let netDesc2 = RAPIER.ColliderDesc.cylinder(scaledHalfHeight, scaledRadius)
            netDesc2.setTranslation(cyCenterX, cyCenterY, cyCenterZ)
            netDesc2.setRestitution(0.0) // 0 restitution so they splat instead of bouncing back up through the net
            netDesc2.setFriction(0.5)
            netDesc2.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Average)
            
            this.world.createCollider(netDesc2, this.rouletteBody)
        }
    }

    updateRouletteBody(rouletteGroup, rouletteModel) {
        if (!this.world) return
        if (this.rouletteBody) {
            this.world.removeRigidBody(this.rouletteBody)
            this.rouletteBody = null
        }
        this.createRouletteBody(rouletteGroup, rouletteModel)
    }

    createCubeBody(worldPos, worldQuat, colliderSize) {
        if (!this.world) return null
        
        let bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(worldPos.x, worldPos.y, worldPos.z).setRotation(worldQuat)
        
        // Use CCD based on params. CCD fixes tunneling for small/fast objects but is CPU intensive.
        bodyDesc.setCcdEnabled(this.physicsParams.ccdEnabled)
        
        let body = this.world.createRigidBody(bodyDesc)
        
        let colliderDesc = RAPIER.ColliderDesc.cuboid(colliderSize * 0.48, colliderSize * 0.48, colliderSize * 0.48)
        colliderDesc.setRestitution(this.physicsParams.restitution)
        colliderDesc.setFriction(this.physicsParams.friction)
        this.world.createCollider(colliderDesc, body)
        return body
    }

    setCubeNoSelfCollision(body) {
        if (!body || !this.world) return
        for (let i = 0; i < body.numColliders(); i++) {
            let collider = body.collider(i)
            // Rapier collisionGroups: upper 16 bits = membership, lower 16 bits = filter.
            // Membership = 2 (0x0002)
            // Filter = everything except 2 (0xFFFD)
            // Combined = 0x0002FFFD
            collider.setCollisionGroups(0x0002FFFD)
        }
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
            const buffers = this.world.debugRender()
            this.debugLines.geometry.setAttribute('position', new THREE.BufferAttribute(buffers.vertices, 3))
            this.debugLines.geometry.setAttribute('color', new THREE.BufferAttribute(buffers.colors, 4))
        }
    }
}

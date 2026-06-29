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
            gravity: -30.0,
            restitution: 0.1,
            friction: 0.6,
            debugRender: false
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

    createCubeBody(worldPos, worldQuat, colliderSize) {
        if (!this.world) return null
        
        let bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(worldPos.x, worldPos.y, worldPos.z).setRotation(worldQuat)
        bodyDesc.setCcdEnabled(true)
        let body = this.world.createRigidBody(bodyDesc)
        
        let colliderDesc = RAPIER.ColliderDesc.cuboid(colliderSize * 0.48, colliderSize * 0.48, colliderSize * 0.48)
        colliderDesc.setRestitution(this.physicsParams.restitution)
        colliderDesc.setFriction(this.physicsParams.friction)
        this.world.createCollider(colliderDesc, body)
        
        return body
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

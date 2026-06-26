import Experience from '../Experience.js'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export default class PhysicsWorld {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        
        this.world = null
        this.dynamicCubes = [] // Array of { body, instanceId, scaleFactor }
        this.dynamicInstancedMesh = null
        
        this.physicsParams = {
            gravity: -9.81,
            restitution: 0.1,
            friction: 0.6
        }
        
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
        }
    }

    async init() {
        await RAPIER.init()
        
        const gravity = { x: 0.0, y: this.physicsParams.gravity, z: 0.0 }
        this.world = new RAPIER.World(gravity)
    }

    createRouletteBody(rouletteGroup, rouletteModel) {
        if (!this.world) return

        let bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
        this.rouletteBody = this.world.createRigidBody(bodyDesc)
        this.rouletteGroup = rouletteGroup

        rouletteGroup.updateMatrixWorld(true)

        rouletteModel.traverse((child) => {
            if (child.isMesh) {
                const geometry = child.geometry.clone()
                const matrix = new THREE.Matrix4()
                matrix.copy(child.matrixWorld)
                
                const groupInverse = new THREE.Matrix4().copy(rouletteGroup.matrixWorld).invert()
                matrix.premultiply(groupInverse)
                geometry.applyMatrix4(matrix)

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
                colliderDesc.setRestitution(0.2)
                colliderDesc.setFriction(0.6)
                this.world.createCollider(colliderDesc, this.rouletteBody)
            }
        })
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

    spawnCube(worldPos, worldQuat, color, visualScale, colliderSize) {
        if (!this.dynamicInstancedMesh) return
        
        let bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(worldPos.x, worldPos.y, worldPos.z).setRotation(worldQuat)
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
            scaleFactor: visualScale
        })
    }

    update() {
        if (!this.world) return
        
        if (this.rouletteBody && this.rouletteGroup) {
            this.rouletteGroup.updateMatrixWorld(true)
            const pos = new THREE.Vector3()
            const quat = new THREE.Quaternion()
            const scale = new THREE.Vector3()
            this.rouletteGroup.matrixWorld.decompose(pos, quat, scale)
            this.rouletteBody.setNextKinematicTranslation(pos)
            this.rouletteBody.setNextKinematicRotation(quat)
        }

        // Step physics
        this.world.step()
        
        if (this.dynamicInstancedMesh && this.dynamicCubes.length > 0) {
            const dummy = new THREE.Object3D()
            for(const item of this.dynamicCubes) {
                const translation = item.body.translation()
                const rotation = item.body.rotation()
                
                dummy.position.set(translation.x, translation.y, translation.z)
                dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
                dummy.scale.set(1, 1, 1) // We already scaled the geometry to worldSize equivalents? Wait.
                // If the geometry is already scaled by `scaleFactor` during creation, its base size is `cubeSize`.
                // In world space, the object size should be `worldSize`. 
                // So if geometry is `cubeSize`, scale should be `worldSize / cubeSize`.
                // For simplicity, we can pass scale logic.
                dummy.scale.set(item.scaleFactor, item.scaleFactor, item.scaleFactor)
                dummy.updateMatrix()
                
                this.dynamicInstancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
            }
            this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
        }
    }
}

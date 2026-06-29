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
    }
    
    setupDynamicMesh(geometry, material, maxCubes) {
        if (this.dynamicInstancedMesh) return

        const dynMaterial = material.clone()
        dynMaterial.vertexColors = false
        this.dynamicInstancedMesh = new THREE.InstancedMesh(geometry, dynMaterial, maxCubes)
        this.dynamicInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
        this.dynamicInstancedMesh.castShadow = true
        this.dynamicInstancedMesh.receiveShadow = true
        
        this.dummy.scale.set(0, 0, 0)
        this.dummy.updateMatrix()
        for(let i = 0; i < maxCubes; i++) {
            this.dynamicInstancedMesh.setMatrixAt(i, this.dummy.matrix)
        }
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
        this.scene.add(this.dynamicInstancedMesh)
    }

    spawnCube(color, visualScale, body) {
        if (!this.dynamicInstancedMesh) return
        
        const instanceId = this.dynamicCubes.length
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
        
        for (const item of this.binManager.spawnedBins) {
            if (item.colorBin.color.getHex() === colorHex && item.queueIndex === 0) {
                this.binManager.binsGroup.updateMatrixWorld(true)
                const binPos = new THREE.Vector3()
                binPos.setFromMatrixPosition(item.colorBin.matrix)
                binPos.applyMatrix4(this.binManager.binsGroup.matrixWorld)
                binPos.y += 0.5 
                return binPos
            }
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
        if (!this.dynamicInstancedMesh || this.dynamicCubes.length === 0) return
        
        const rouletteCenter = this.rouletteGroup ? this.rouletteGroup.position : { x: 0, y: 0, z: 0 }
        const angleStep = this.conveyorOmega * dt
        const rotationQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), angleStep)

        for(let i = this.dynamicCubes.length - 1; i >= 0; i--) {
            const item = this.dynamicCubes[i]
            
            // 1. Routing Animation
            if (item.isRouting) {
                const isDone = this.routingStrategy.update(item, dt, this.dummy, this.dynamicInstancedMesh)
                if (isDone) {
                    this.dynamicCubes.splice(i, 1)
                }
                continue
            }
            
            // 2. Normal Physics sync
            const translation = item.body.translation()
            const rotation = item.body.rotation()
            
            if (translation.y < 1.5) {
                this.applyConveyorPhysics(item, translation, rouletteCenter, rotationQuat, dt)
                
                item.timeOnRoulette += dt
                if (item.timeOnRoulette > 0.8) {
                    const binPos = this.getAvailableBinPositionForColor(item.colorHex)
                    if (binPos) {
                        this.physicsWorld.world.removeRigidBody(item.body)
                        item.body = null
                        this.routingStrategy.startRouting(item, new THREE.Vector3(translation.x, translation.y, translation.z), binPos)
                        continue
                    }
                }
            }

            this.dummy.position.set(translation.x, translation.y, translation.z)
            this.dummy.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
            this.dummy.scale.set(item.scaleFactor, item.scaleFactor, item.scaleFactor)
            this.dummy.updateMatrix()
            this.dynamicInstancedMesh.setMatrixAt(item.instanceId, this.dummy.matrix)
        }
        this.dynamicInstancedMesh.instanceMatrix.needsUpdate = true
    }
}

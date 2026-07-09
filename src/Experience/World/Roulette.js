import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Roulette {
    constructor(physicsWorld) {
        this.experience = new Experience()
        this.physicsWorld = physicsWorld
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.resource = this.resources.items.rouletteModel
        this.shadowResource = this.resources.items.rouletteShadowModel

        this.wallParams = {
            radiusOffset: 0.0,
            height: 2.0,
            posY: 0.9,
            netOffsetY: 0.12 // Lowered slightly based on feedback
        }

        this.coneParams = {
            radius: 0.5,
            height: 1.2,
            posY: 0.4
        }

        this.speed = 2
        this.setModel()
        this.setDebug()
    }

    setModel() {
        this.group = new THREE.Group()
        this.group.position.set(0, -0.7, -1.8)
        this.group.rotation.set(0.09, 0, 0)
        this.group.scale.set(2.15, 2.15, 2.15)
        this.scene.add(this.group)

        this.model = this.resource.scene
        this.model.position.set(0, 0, 0)

        this.model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
                
                if (child.material) {
                    if (child.material.name === 'Roulette_v2') {
                        child.material.color.set('#73c1ec')
                        child.material.roughness = 1
                    }
                }
            }
        })

        this.shadowModel = this.shadowResource.scene
        this.shadowModel.position.set(0, -0.01, 0.05)
        this.shadowModel.scale.set(0.99, 1, 1)

        this.shadowModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = false
                child.receiveShadow = true
                if (child.material) {
                    child.material.transparent = true
                    child.material.alphaTest = 0
                    child.material.opacity = 0.8
                    child.material.needsUpdate = true
                }
            }
        })

        this.group.add(this.shadowModel)
        this.group.add(this.model)

        // Auto-calculate the exact outer radius of the Roulette model
        const localBox = new THREE.Box3()
        this.model.traverse(child => {
            if (child.isMesh) {
                child.geometry.computeBoundingBox()
                const childBox = child.geometry.boundingBox.clone()
                childBox.applyMatrix4(child.matrix)
                localBox.union(childBox)
            }
        })
        const size = localBox.getSize(new THREE.Vector3())
        const center = localBox.getCenter(new THREE.Vector3())
        
        // Explicitly setting radius to 1.15 as requested
        this.wallParams.radius = 1.15

        this.wallMaterial = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.0, // Invisible by default, but blocks cubes
            wireframe: true,
            side: THREE.DoubleSide // Important for physics inside hollow objects
        })

        this.wallMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(this.wallParams.radius, this.wallParams.radius, this.wallParams.height, 32, 1, true),
            this.wallMaterial
        )
        this.wallMesh.name = 'InvisibleWall'
        this.wallMesh.position.y = this.wallParams.posY
        this.model.add(this.wallMesh)

        this.coneMaterial = new THREE.MeshStandardMaterial({
            color: 0x0000ff,
            transparent: true,
            opacity: 0.0, // Invisible by default, deflects cubes
            wireframe: true
        })

        this.coneMesh = new THREE.Mesh(
            new THREE.ConeGeometry(this.coneParams.radius, this.coneParams.height, 32),
            this.coneMaterial
        )
        this.coneMesh.name = 'DeflectorCone'
        this.coneMesh.position.y = this.coneParams.posY
        this.model.add(this.coneMesh)

        if (this.physicsWorld) {
            this.physicsWorld.ready.then(() => {
                this.physicsWorld.createRouletteBody(this.group, this.model, this.wallParams.netOffsetY)
            })
        }
    }

    update() {
        if (this.model) {
            this.model.rotation.y += (this.time.delta / 1000) * this.speed
        }
    }

    setDebug() {
        this.debug = this.experience.debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('Roulette')
            
            const scaleParams = { groupScale: 2.15, modelScale: 1 }
            this.debugFolder.add(scaleParams, 'groupScale').min(0.1).max(10).step(0.01).name('Group Scale').onChange((val) => {
                this.group.scale.set(val, val, val)
            })
            this.debugFolder.add(scaleParams, 'modelScale').min(0.1).max(10).step(0.01).name('Model Scale').onChange((val) => {
                this.model.scale.set(val, val, val)
            })
            
            this.debugFolder.add(this.group.position, 'y').min(-5).max(5).step(0.01).name('Group Pos Y')
            this.debugFolder.add(this.group.position, 'z').min(-5).max(5).step(0.01).name('Group Pos Z')
            this.debugFolder.add(this.group.rotation, 'x').min(-Math.PI).max(Math.PI).step(0.01).name('Group Rot X')
            
            const wallFolder = this.debugFolder.addFolder('Invisible Wall')
            
            const updateWallVisuals = () => {
                if (this.wallMesh) {
                    this.wallMesh.geometry.dispose()
                    this.wallMesh.geometry = new THREE.CylinderGeometry(this.wallParams.radius, this.wallParams.radius, this.wallParams.height, 32, 1, true)
                    this.wallMesh.position.y = this.wallParams.posY
                }
            }
            
            const updateWallPhysics = () => {
                if (this.physicsWorld) {
                    this.physicsWorld.updateRouletteBody(this.group, this.model, this.wallParams.netOffsetY)
                }
            }

            wallFolder.add(this.wallParams, 'radius').min(1).max(10).step(0.01).name('Radius').onChange(updateWallVisuals).onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallParams, 'height').min(0.1).max(15).step(0.01).name('Height').onChange(updateWallVisuals).onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallParams, 'posY').min(-5).max(10).step(0.01).name('Height Offset (Y)').onChange(updateWallVisuals).onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallParams, 'netOffsetY').min(-5).max(5).step(0.01).name('Floor Net Offset Y').onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallMaterial, 'opacity').min(0).max(1).step(0.01).name('Debug Opacity')
            
            const coneFolder = this.debugFolder.addFolder('Deflector Cone')
            
            const updateConeVisuals = () => {
                if (this.coneMesh) {
                    this.coneMesh.geometry.dispose()
                    this.coneMesh.geometry = new THREE.ConeGeometry(this.coneParams.radius, this.coneParams.height, 32)
                    this.coneMesh.position.y = this.coneParams.posY
                }
            }

            coneFolder.add(this.coneParams, 'radius').min(0.01).max(5).step(0.01).name('Radius').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneParams, 'height').min(0.01).max(5).step(0.01).name('Height').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneParams, 'posY').min(-5).max(5).step(0.01).name('Height Offset (Y)').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneMaterial, 'opacity').min(0).max(1).step(0.01).name('Debug Opacity')
            
            const shadowFolder = this.debugFolder.addFolder('Shadow')
            shadowFolder.add(this.shadowModel.position, 'x').min(-5).max(5).step(0.001).name('posX')
            shadowFolder.add(this.shadowModel.position, 'y').min(-5).max(5).step(0.001).name('posY')
            shadowFolder.add(this.shadowModel.position, 'z').min(-5).max(5).step(0.001).name('posZ')
            
            shadowFolder.add(this.shadowModel.scale, 'x').min(0.1).max(10).step(0.01).name('scaleX')
            shadowFolder.add(this.shadowModel.scale, 'y').min(0.1).max(10).step(0.01).name('scaleY')
            shadowFolder.add(this.shadowModel.scale, 'z').min(0.1).max(10).step(0.01).name('scaleZ')

            const shadowParams = { alphaTest: 0, opacity: 0.8 }
            shadowFolder.add(shadowParams, 'alphaTest').min(0).max(1).step(0.01).name('AlphaTest').onChange((val) => {
                this.shadowModel.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        child.material.alphaTest = val
                        child.material.needsUpdate = true
                    }
                })
            })
            shadowFolder.add(shadowParams, 'opacity').min(0).max(1).step(0.01).name('Opacity').onChange((val) => {
                this.shadowModel.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        child.material.opacity = val
                        child.material.needsUpdate = true
                    }
                })
            })
        }
    }
}

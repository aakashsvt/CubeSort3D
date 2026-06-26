import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Roulette {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.resource = this.resources.items.rouletteModel
        this.shadowResource = this.resources.items.rouletteShadowModel

        this.speed = 2
        this.setModel()
        this.setDebug()
    }

    setModel() {
        this.group = new THREE.Group()
        this.group.position.set(0, -0.7, -1.5)
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

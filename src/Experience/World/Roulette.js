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
    }

    setModel() {
        this.group = new THREE.Group()
        this.group.position.set(0, -0.7, 0)
        this.group.scale.set(2, 2, 2)
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
        this.shadowModel.position.set(0, -0.016, 0)

        this.shadowModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = false
                child.receiveShadow = true
                if (child.material) {
                    child.material.transparent = true
                    child.material.alphaTest = 0
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
}

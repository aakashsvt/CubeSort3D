import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Roulette {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.resource = this.resources.items.rouletteModel

        this.speed = 2
        this.setModel()
    }

    setModel() {
        this.model = this.resource.scene

        this.model.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
            }
        })

        this.model.position.set(0, -2.5, 0)
        this.model.scale.set(1.5, 1.5, 1.5)
        this.scene.add(this.model)
    }

    update() {
        if (this.model) {
            this.model.rotation.y += (this.time.delta / 1000) * this.speed
        }
    }
}

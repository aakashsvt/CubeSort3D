import * as THREE from 'three'
import Experience from '../Experience.js'

export default class ColorBin {
    constructor(originalModel, originalShadow, colorIndex, color, capacity) {
        this.experience = new Experience()
        
        this.colorIndex = colorIndex
        this.capacity = capacity
        
        this.binClone = originalModel.clone()
        this.shadowClone = originalShadow.clone()
        
        this.group = new THREE.Group()

        this.applyColor(color)
        this.setupShadow()

        this.group.add(this.shadowClone)
        this.group.add(this.binClone)
    }

    applyColor(color) {
        this.binClone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
                if (child.material) {
                    child.material = child.material.clone()
                    child.material.color = color
                }
            }
        })
    }

    setupShadow() {
        this.shadowClone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = false
                child.receiveShadow = true
                if (child.material) {
                    child.material = child.material.clone()
                    child.material.transparent = true
                    child.material.alphaTest = 0
                    child.material.needsUpdate = true
                }
            }
        })
    }

    setPosition(x, y, z) {
        this.group.position.set(x, y, z)
    }

    setShadowY(y) {
        this.shadowClone.position.y = y
    }

    setRotationX(rotX) {
        this.binClone.rotation.x = rotX
    }

    setVisible(visible) {
        this.group.visible = visible
    }
}

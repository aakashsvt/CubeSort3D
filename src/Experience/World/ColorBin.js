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
        this.proxyCubes = []

        this.binClone.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
                
                // If it's one of the internal filling cubes (Cube001, Cube002, etc.)
                if (child.name.startsWith('Cube')) {
                    child.visible = false
                    this.proxyCubes.push(child)
                }

                if (child.material) {
                    child.material = child.material.clone()
                    child.material.color = color
                }
            }
        })
        
        // Ensure proxy cubes are sorted numerically if we want to reveal them in order later
        this.proxyCubes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
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

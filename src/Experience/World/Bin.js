import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Bin {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        
        // Setup
        this.resource = this.resources.items.binModel

        this.setModel()
    }

    setModel() {
        const levelData = this.resources.items.levelData
        const dashboard = levelData.dashboard || {}
        
        const palette = dashboard.palette || []
        const binIndicesStr = dashboard.binColorIndicesInput || ""
        const binIndices = binIndicesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))

        this.originalModel = this.resource.scene
        this.originalShadow = this.resources.items.binShadowModel.scene
        this.binsGroup = new THREE.Group()
        
        const spacing = 1.5
        const startX = -((binIndices.length - 1) * spacing) / 2

        let index = 0
        for (const colorIndex of binIndices) {
            const palColor = palette[colorIndex]
            if (!palColor) continue

            const binClone = this.originalModel.clone()
            
            const color = new THREE.Color()
            if (palColor.r !== undefined) {
                color.setRGB(palColor.r, palColor.g, palColor.b)
                color.convertSRGBToLinear() // Ensure correct display color
            } else if (typeof palColor === 'string') {
                let hexStr = palColor.startsWith('#') ? palColor : '#' + palColor
                color.set(hexStr)
            } else {
                color.setHex(0xffffff)
            }

            binClone.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true
                    child.receiveShadow = true
                    if (child.material) {
                        child.material = child.material.clone()
                        child.material.color = color
                    }
                }
            })

            const shadowClone = this.originalShadow.clone()
            shadowClone.position.set(0, -0.016, 0)
            shadowClone.traverse((child) => {
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

            const binGroup = new THREE.Group()
            binGroup.add(shadowClone)
            binGroup.add(binClone)

            // Arrange them in a line along X axis, positioned slightly forward on Z
            binGroup.position.set(startX + (index * spacing), 0, 5)
            
            this.binsGroup.add(binGroup)
            index++
        }

        this.scene.add(this.binsGroup)
    }
}
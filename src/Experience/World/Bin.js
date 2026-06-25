import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Bin {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        
        this.debugSettings = {
            scale: 2,
            rowSpacing: 0.5,
            queueSpacing: 0.5,
            shadowY: -0.016,
            binRotationX: 0
        }

        // Setup
        this.resource = this.resources.items.binModel

        this.setModel()
        this.setDebug()
    }

    setModel() {
        const levelData = this.resources.items.levelData
        const dashboard = levelData.dashboard || {}
        
        const palette = dashboard.palette || []
        const binIndicesStr = dashboard.binColorIndicesInput || ""
        const binIndices = binIndicesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
        this.activeBinCount = dashboard.activeBinCount || 4

        this.originalModel = this.resource.scene
        this.originalShadow = this.resources.items.binShadowModel.scene
        this.binsGroup = new THREE.Group()
        this.spawnedBins = []
        
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
            shadowClone.position.set(0, this.debugSettings.shadowY, 0)
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

            // Unity logic: round-robin into rows, then queue backwards
            const rIndex = index % this.activeBinCount
            const queueIndex = Math.floor(index / this.activeBinCount)

            this.spawnedBins.push({
                group: binGroup,
                bin: binClone,
                shadow: shadowClone,
                rIndex: rIndex,
                queueIndex: queueIndex
            })
            
            this.binsGroup.add(binGroup)
            index++
        }

        this.binsGroup.scale.set(this.debugSettings.scale, this.debugSettings.scale, this.debugSettings.scale)
        this.binsGroup.position.set(0, -1.0, 6)

        this.scene.add(this.binsGroup)
        this.updateLayout() // Initialize layout
    }

    updateLayout() {
        const numRows = Math.min(this.activeBinCount, this.spawnedBins.length)
        const startX = -((numRows - 1) * this.debugSettings.rowSpacing) / 2

        for (const item of this.spawnedBins) {
            const posX = startX + (item.rIndex * this.debugSettings.rowSpacing)
            const posZ = item.queueIndex * this.debugSettings.queueSpacing
            item.group.position.set(posX, 0, posZ)

            item.shadow.position.y = this.debugSettings.shadowY
            item.bin.rotation.x = this.debugSettings.binRotationX
        }
    }

    setDebug() {
        if (!this.debug.active) return

        this.debugFolder = this.debug.ui.addFolder('Bins')
        
        this.debugFolder.add(this.debugSettings, 'scale').min(0.1).max(10).step(0.01).name('Group Scale').onChange((val) => {
            this.binsGroup.scale.set(val, val, val)
        })

        this.debugFolder.add(this.debugSettings, 'rowSpacing').min(0).max(5).step(0.01).name('Row Spacing').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'queueSpacing').min(0).max(5).step(0.01).name('Queue Spacing').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowY').min(-1).max(1).step(0.001).name('Shadow Pos Y').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'binRotationX').min(-Math.PI).max(Math.PI).step(0.01).name('Bin Rotation X').onChange(() => this.updateLayout())
    }
}
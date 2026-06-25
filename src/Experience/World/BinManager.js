import * as THREE from 'three'
import Experience from '../Experience.js'
import ColorBin from './ColorBin.js'

export default class BinManager {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug
        
        this.debugSettings = {
            scale: 2,
            rowSpacing: 0.5,
            queueSpacing: 0.5,
            shadowY: 0,
            binRotationX: 0
        }

        this.originalModel = this.resources.items.binModel.scene
        this.originalShadow = this.resources.items.binShadowModel.scene

        this.configureBins()
        this.setDebug()
    }

    configureBins() {
        const levelData = this.resources.items.levelData
        const dashboard = levelData.dashboard || {}
        
        const palette = dashboard.palette || []
        const binIndicesStr = dashboard.binColorIndicesInput || ""
        const configuredColorPool = binIndicesStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
        this.activeBinCount = dashboard.activeBinCount || 4
        const targetBinCount = dashboard.targetBinCount || 24
        const maxCapacity = parseInt(dashboard.binCapacitiesInput || "50")

        // 1. Calculate cube counts per color
        const cubes = dashboard.lastGeneratedCubes || levelData.cubes || []
        const remainingCubesPerColor = {}
        cubes.forEach(c => {
            remainingCubesPerColor[c.colorIndex] = (remainingCubesPerColor[c.colorIndex] || 0) + 1
        })

        // 2. Get colors with demand
        const colorsWithDemand = []
        for (const c of configuredColorPool) {
            if (remainingCubesPerColor[c] > 0 && !colorsWithDemand.includes(c)) colorsWithDemand.push(c)
        }
        for (const c in remainingCubesPerColor) {
            const cInt = parseInt(c)
            if (remainingCubesPerColor[cInt] > 0 && !colorsWithDemand.includes(cInt)) colorsWithDemand.push(cInt)
        }

        // 3. Calculate minimum bins
        const desired = {}
        let minTotalBins = 0
        for (const c of colorsWithDemand) {
            const minBins = maxCapacity <= 0 ? 1 : Math.ceil(remainingCubesPerColor[c] / maxCapacity)
            desired[c] = minBins
            minTotalBins += minBins
        }

        // 4. Distribute extra bins
        let extraBins = targetBinCount - minTotalBins
        const expandable = [...colorsWithDemand].sort((a, b) => remainingCubesPerColor[b] - remainingCubesPerColor[a])
        let safety = 0
        while (extraBins > 0 && expandable.length > 0 && safety < 1000) {
            safety++
            for (let i = 0; i < expandable.length && extraBins > 0; i++) {
                const c = expandable[i]
                if (desired[c] < remainingCubesPerColor[c]) {
                    desired[c]++
                    extraBins--
                }
            }
            for (let i = expandable.length - 1; i >= 0; i--) {
                const c = expandable[i]
                if (desired[c] >= remainingCubesPerColor[c]) {
                    expandable.splice(i, 1)
                }
            }
        }

        // 5. Build plans by color
        const plansByColor = {}
        for (const c of colorsWithDemand) {
            let demand = remainingCubesPerColor[c]
            let dBins = desired[c] || 1
            const capacities = []
            if (maxCapacity <= 0) capacities.push(demand)
            else {
                let remainingToAllocate = demand
                let binsLeft = dBins
                while (binsLeft > 0) {
                    let cap = Math.min(remainingToAllocate, maxCapacity)
                    capacities.push(cap)
                    remainingToAllocate -= cap
                    binsLeft--
                }
            }
            plansByColor[c] = capacities.map(cap => ({ colorIndex: c, capacity: cap }))
        }

        // 6. Round robin enqueue (or explicit queue)
        const binPlans = []
        if (dashboard.binQueue && dashboard.binQueue.length > 0) {
            // Use explicit authored queue if available
            dashboard.binQueue.forEach(c => {
                binPlans.push({ colorIndex: c, capacity: maxCapacity }) // simplified capacity for visual
            })
        } else {
            let addedPlan
            do {
                addedPlan = false
                for (const c of colorsWithDemand) {
                    if (plansByColor[c] && plansByColor[c].length > 0) {
                        binPlans.push(plansByColor[c].shift())
                        addedPlan = true
                    }
                }
            } while(addedPlan)
        }

        this.binsGroup = new THREE.Group()
        this.spawnedBins = []
        
        let index = 0
        for (const plan of binPlans) {
            const palColor = palette[plan.colorIndex]
            if (!palColor) continue
            
            const color = new THREE.Color()
            if (palColor.r !== undefined) {
                color.setRGB(palColor.r, palColor.g, palColor.b)
                color.convertSRGBToLinear()
            } else if (typeof palColor === 'string') {
                let hexStr = palColor.startsWith('#') ? palColor : '#' + palColor
                color.set(hexStr)
            } else {
                color.setHex(0xffffff)
            }

            const colorBin = new ColorBin(this.originalModel, this.originalShadow, plan.colorIndex, color, plan.capacity)

            // Unity logic: round-robin into rows, then queue backwards
            const rIndex = index % this.activeBinCount
            const queueIndex = Math.floor(index / this.activeBinCount)

            this.spawnedBins.push({
                colorBin: colorBin,
                rIndex: rIndex,
                queueIndex: queueIndex
            })
            
            this.binsGroup.add(colorBin.group)
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
            item.colorBin.setPosition(posX, 0, posZ)

            item.colorBin.setShadowY(this.debugSettings.shadowY)
            item.colorBin.setRotationX(this.debugSettings.binRotationX)
            
            // Only render 2 rows at a time (queueIndex 0 and 1)
            item.colorBin.setVisible(item.queueIndex < 2)
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

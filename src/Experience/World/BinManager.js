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
            scale: 2.6,
            groupPosX: 0,
            groupPosY: -1.0,
            groupPosZ: 5,
            groupRotX: 0.45,
            groupRotY: 0,
            groupRotZ: 0,
            rowSpacing: 0.32,
            queueSpacing: 0.45,
            shadowX: 0,
            shadowY: 0.009,
            shadowZ: 0.005,
            binRotationX: 0,
            shadowScaleX: 0.98,
            shadowScaleY: 1,
            shadowScaleZ: 1,
            shadowAlphaTest: 0,
            shadowOpacity: 0.66
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

        const maxInstances = binPlans.length;
        
        this.binInstancedMeshes = [];
        this.originalModel.traverse((child) => {
            if (child instanceof THREE.Mesh && !child.name.startsWith('Cube')) {
                const material = child.material.clone()
                const instancedMesh = new THREE.InstancedMesh(child.geometry, material, maxInstances)
                instancedMesh.castShadow = false
                instancedMesh.receiveShadow = false
                instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
                this.binInstancedMeshes.push(instancedMesh)
                this.binsGroup.add(instancedMesh)
            }
        });

        this.shadowInstancedMeshes = [];
        this.originalShadow.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                const material = child.material.clone()
                material.transparent = true
                material.alphaTest = 0
                material.opacity = 0.66
                
                const instancedMesh = new THREE.InstancedMesh(child.geometry, material, maxInstances)
                instancedMesh.castShadow = false
                instancedMesh.receiveShadow = true
                instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
                this.shadowInstancedMeshes.push(instancedMesh)
                this.binsGroup.add(instancedMesh)
            }
        });

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

            const colorBin = new ColorBin(index, plan.colorIndex, color, plan.capacity)

            for (const mesh of this.binInstancedMeshes) {
                mesh.setColorAt(index, color)
            }

            // Unity logic: round-robin into rows, then queue backwards
            const rIndex = index % this.activeBinCount
            const queueIndex = Math.floor(index / this.activeBinCount)

            this.spawnedBins.push({
                colorBin: colorBin,
                rIndex: rIndex,
                queueIndex: queueIndex
            })
            
            index++
        }

        const actualCount = index;
        for (const mesh of this.binInstancedMeshes) {
            mesh.count = actualCount;
            if(actualCount > 0) mesh.instanceColor.needsUpdate = true;
        }
        for (const mesh of this.shadowInstancedMeshes) {
            mesh.count = actualCount;
        }

        this.binsGroup.scale.set(this.debugSettings.scale, this.debugSettings.scale, this.debugSettings.scale)
        this.binsGroup.position.set(this.debugSettings.groupPosX, this.debugSettings.groupPosY, this.debugSettings.groupPosZ)
        this.binsGroup.rotation.set(this.debugSettings.groupRotX, this.debugSettings.groupRotY, this.debugSettings.groupRotZ)

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

            item.colorBin.shadowOffsetX = this.debugSettings.shadowX
            item.colorBin.setShadowY(this.debugSettings.shadowY)
            item.colorBin.shadowOffsetZ = this.debugSettings.shadowZ
            item.colorBin.setShadowScale(this.debugSettings.shadowScaleX, this.debugSettings.shadowScaleY, this.debugSettings.shadowScaleZ)
            item.colorBin.setRotationX(this.debugSettings.binRotationX)
            
            // Only render 2 rows at a time (queueIndex 0 and 1)
            item.colorBin.setVisible(item.queueIndex < 2)
            
            item.colorBin.updateMatrices()

            const i = item.colorBin.instanceIndex;
            for (const mesh of this.binInstancedMeshes) {
                mesh.setMatrixAt(i, item.colorBin.matrix)
            }
            for (const mesh of this.shadowInstancedMeshes) {
                mesh.setMatrixAt(i, item.colorBin.shadowMatrix)
            }
        }

        for (const mesh of this.binInstancedMeshes) {
            mesh.instanceMatrix.needsUpdate = true
        }
        for (const mesh of this.shadowInstancedMeshes) {
            mesh.instanceMatrix.needsUpdate = true
        }
    }

    setDebug() {
        if (!this.debug.active) return

        this.debugFolder = this.debug.ui.addFolder('Bins')
        
        const groupFolder = this.debugFolder.addFolder('Group Transform')
        groupFolder.add(this.debugSettings, 'scale').min(0.1).max(10).step(0.01).name('Scale').onChange((val) => {
            this.binsGroup.scale.set(val, val, val)
        })
        groupFolder.add(this.debugSettings, 'groupPosX').min(-20).max(20).step(0.01).name('Pos X').onChange((val) => {
            this.binsGroup.position.x = val
        })
        groupFolder.add(this.debugSettings, 'groupPosY').min(-20).max(20).step(0.01).name('Pos Y').onChange((val) => {
            this.binsGroup.position.y = val
        })
        groupFolder.add(this.debugSettings, 'groupPosZ').min(-20).max(20).step(0.01).name('Pos Z').onChange((val) => {
            this.binsGroup.position.z = val
        })
        groupFolder.add(this.debugSettings, 'groupRotX').min(-Math.PI).max(Math.PI).step(0.01).name('Rot X').onChange((val) => {
            this.binsGroup.rotation.x = val
        })
        groupFolder.add(this.debugSettings, 'groupRotY').min(-Math.PI).max(Math.PI).step(0.01).name('Rot Y').onChange((val) => {
            this.binsGroup.rotation.y = val
        })
        groupFolder.add(this.debugSettings, 'groupRotZ').min(-Math.PI).max(Math.PI).step(0.01).name('Rot Z').onChange((val) => {
            this.binsGroup.rotation.z = val
        })

        this.debugFolder.add(this.debugSettings, 'rowSpacing').min(0).max(5).step(0.01).name('Row Spacing').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'queueSpacing').min(0).max(5).step(0.01).name('Queue Spacing').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowX').min(-1).max(1).step(0.001).name('Shadow Pos X').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowY').min(-1).max(1).step(0.001).name('Shadow Pos Y').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowZ').min(-1).max(1).step(0.001).name('Shadow Pos Z').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'binRotationX').min(-Math.PI).max(Math.PI).step(0.01).name('Bin Rotation X').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowScaleX').min(0.1).max(5).step(0.01).name('Shadow Scale X').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowScaleY').min(0.1).max(5).step(0.01).name('Shadow Scale Y').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowScaleZ').min(0.1).max(5).step(0.01).name('Shadow Scale Z').onChange(() => this.updateLayout())
        this.debugFolder.add(this.debugSettings, 'shadowAlphaTest').min(0).max(1).step(0.01).name('Shadow AlphaTest').onChange((val) => {
            for (const mesh of this.shadowInstancedMeshes) {
                mesh.material.alphaTest = val
                mesh.material.needsUpdate = true
            }
        })
        this.debugFolder.add(this.debugSettings, 'shadowOpacity').min(0).max(1).step(0.01).name('Shadow Opacity').onChange((val) => {
            for (const mesh of this.shadowInstancedMeshes) {
                mesh.material.opacity = val
                mesh.material.needsUpdate = true
            }
        })
    }
}

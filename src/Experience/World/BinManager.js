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
            scale: 2.80,
            groupPosX: 0.00,
            groupPosY: -1.00,
            groupPosZ: 2.85,
            groupRotX: 0.27,
            groupRotY: 0.00,
            groupRotZ: 0.00,
            rowSpacing: 0.32,
            queueSpacing: 0.43,
            shadowX: 0,
            shadowY: 0.009,
            shadowZ: 0.005,
            binRotationX: 0,
            shadowScaleX: 0.95,
            shadowScaleY: 1,
            shadowScaleZ: 1,
            shadowAlphaTest: 0,
            shadowOpacity: 0.55,
            labelScale: 0.06,
            labelPosX: 0.0,
            labelPosY: 0.26,
            labelPosZ: 0.3,
            customLabelOffsetX_0: 0.025,
            customLabelOffsetX_1: 0.01,
            customLabelOffsetX_2: -0.005,
            customLabelOffsetX_3: -0.02,
            customLabelOffsetX_4: 0.0,
            customLabelOffsetX_5: 0.0,
            customLabelRotZ_0: -0.04,
            customLabelRotZ_1: -0.02,
            customLabelRotZ_2: 0.01,
            customLabelRotZ_3: 0.04,
            customLabelRotZ_4: 0.0,
            customLabelRotZ_5: 0.0,
            customLabelOffsetY_Row0: -0.005,
            customLabelOffsetY_Row1: 0.01
        }

        this.originalModel = this.resources.items.binModel.scene
        this.originalShadow = this.resources.items.binShadowModel.scene

        this.exitingBins = []

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
            let unplannedDemand = { ...remainingCubesPerColor }
            dashboard.binQueue.forEach(c => {
                if (unplannedDemand[c] > 0) {
                    let cap = Math.min(maxCapacity, unplannedDemand[c])
                    binPlans.push({ colorIndex: c, capacity: cap })
                    unplannedDemand[c] -= cap
                }
            })

            // Add remaining unplanned demand
            for (const c of colorsWithDemand) {
                while (unplannedDemand[c] > 0) {
                    let cap = Math.min(maxCapacity, unplannedDemand[c])
                    binPlans.push({ colorIndex: c, capacity: cap })
                    unplannedDemand[c] -= cap
                }
            }
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
            } while (addedPlan)
        }

        this.binsGroup = new THREE.Group()
        this.spawnedBins = []

        const maxInstances = binPlans.length;

        this.binInstancedMeshes = [];
        this.internalCubeTransforms = [];
        let cubeGeo = null;
        let cubeMat = null;

        const cubeMeshes = [];
        this.originalModel.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                if (child.name.toLowerCase().startsWith('cube')) {
                    cubeMeshes.push(child);
                } else {
                    const material = child.material.clone()
                    const instancedMesh = new THREE.InstancedMesh(child.geometry, material, maxInstances)
                    instancedMesh.castShadow = false
                    instancedMesh.receiveShadow = false
                    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
                    this.binInstancedMeshes.push(instancedMesh)
                    this.binsGroup.add(instancedMesh)
                }
            }
        });

        // Sort internal cubes by name so they fill predictably
        cubeMeshes.sort((a, b) => a.name.localeCompare(b.name));
        this.originalModel.updateMatrixWorld(true); // Ensure all world matrices are calculated
        for (const child of cubeMeshes) {
            this.internalCubeTransforms.push(child.matrixWorld.clone());
            if (!cubeGeo) {
                cubeGeo = child.geometry;
                cubeMat = child.material.clone();
                cubeMat.visible = true;
                cubeMat.transparent = false;
                cubeMat.opacity = 1.0;
            }
        }

        if (cubeGeo) {
            this.internalCubeInstancedMesh = new THREE.InstancedMesh(cubeGeo, cubeMat, maxInstances * this.internalCubeTransforms.length)
            this.internalCubeInstancedMesh.castShadow = false
            this.internalCubeInstancedMesh.receiveShadow = false
            this.internalCubeInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
            this.binsGroup.add(this.internalCubeInstancedMesh)
        }

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
            this.binsGroup.add(colorBin.labelMesh)

            for (const mesh of this.binInstancedMeshes) {
                mesh.setColorAt(index, color)
            }

            if (this.internalCubeInstancedMesh) {
                const numCubes = this.internalCubeTransforms.length
                for (let j = 0; j < numCubes; j++) {
                    const instanceId = index * numCubes + j
                    this.internalCubeInstancedMesh.setColorAt(instanceId, color)
                    const tempMatrix = new THREE.Matrix4().makeScale(0, 0, 0)
                    this.internalCubeInstancedMesh.setMatrixAt(instanceId, tempMatrix)
                }
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
            if (actualCount > 0) mesh.instanceColor.needsUpdate = true;
        }
        if (this.internalCubeInstancedMesh) {
            this.internalCubeInstancedMesh.count = actualCount * this.internalCubeTransforms.length;
            if (actualCount > 0) this.internalCubeInstancedMesh.instanceColor.needsUpdate = true;
        }
        for (const mesh of this.shadowInstancedMeshes) {
            mesh.count = actualCount;
        }

        this.binsGroup.scale.set(this.debugSettings.scale, this.debugSettings.scale, this.debugSettings.scale)
        this.binsGroup.position.set(this.debugSettings.groupPosX, this.debugSettings.groupPosY, this.debugSettings.groupPosZ)
        this.binsGroup.rotation.set(this.debugSettings.groupRotX, this.debugSettings.groupRotY, this.debugSettings.groupRotZ)

        this.scene.add(this.binsGroup)
        this.updateLayout(true) // Initialize layout
    }

    advanceQueue(rIndex) {
        const index = this.spawnedBins.findIndex(i => i.rIndex === rIndex && i.queueIndex === 0)
        if (index !== -1) {
            const exitingItem = this.spawnedBins.splice(index, 1)[0]
            exitingItem.exitPhase = -1 // Start with 200ms wait phase
            exitingItem.exitTimer = 0
            exitingItem.startX = exitingItem.colorBin.position.x
            exitingItem.startY = exitingItem.colorBin.position.y
            exitingItem.startZ = exitingItem.colorBin.position.z
            exitingItem.advancingRowIndex = rIndex // Store which row to advance later
            this.exitingBins.push(exitingItem)
        }
    }

    updateLayout(immediate = false) {
        const numRows = this.activeBinCount
        const startX = -((numRows - 1) * this.debugSettings.rowSpacing) / 2

        for (const item of this.spawnedBins) {
            const posX = startX + (item.rIndex * this.debugSettings.rowSpacing)
            const posZ = item.queueIndex * this.debugSettings.queueSpacing
            item.colorBin.setPosition(posX, 0, posZ, immediate)

            item.colorBin.shadowOffsetX = this.debugSettings.shadowX
            item.colorBin.setShadowY(this.debugSettings.shadowY)
            item.colorBin.shadowOffsetZ = this.debugSettings.shadowZ
            item.colorBin.setShadowScale(this.debugSettings.shadowScaleX, this.debugSettings.shadowScaleY, this.debugSettings.shadowScaleZ)
            item.colorBin.setRotationX(this.debugSettings.binRotationX)

            let customOffsetX = 0
            if (item.rIndex === 0) customOffsetX = this.debugSettings.customLabelOffsetX_0
            else if (item.rIndex === 1) customOffsetX = this.debugSettings.customLabelOffsetX_1
            else if (item.rIndex === 2) customOffsetX = this.debugSettings.customLabelOffsetX_2
            else if (item.rIndex === 3) customOffsetX = this.debugSettings.customLabelOffsetX_3
            else if (item.rIndex === 4) customOffsetX = this.debugSettings.customLabelOffsetX_4
            else if (item.rIndex === 5) customOffsetX = this.debugSettings.customLabelOffsetX_5

            let customRotZ = 0
            if (item.rIndex === 0) customRotZ = this.debugSettings.customLabelRotZ_0
            else if (item.rIndex === 1) customRotZ = this.debugSettings.customLabelRotZ_1
            else if (item.rIndex === 2) customRotZ = this.debugSettings.customLabelRotZ_2
            else if (item.rIndex === 3) customRotZ = this.debugSettings.customLabelRotZ_3
            else if (item.rIndex === 4) customRotZ = this.debugSettings.customLabelRotZ_4
            else if (item.rIndex === 5) customRotZ = this.debugSettings.customLabelRotZ_5

            let customOffsetY = 0
            if (item.queueIndex === 0) customOffsetY = this.debugSettings.customLabelOffsetY_Row0
            else if (item.queueIndex === 1) customOffsetY = this.debugSettings.customLabelOffsetY_Row1

            // Save label offsets for update loop instead of setting position here
            item.colorBin.labelOffsetX = this.debugSettings.labelPosX + customOffsetX
            item.colorBin.labelOffsetY = this.debugSettings.labelPosY + customOffsetY
            item.colorBin.labelOffsetZ = this.debugSettings.labelPosZ
            item.colorBin.labelRotZ = customRotZ
            // The canvas is 256x128 (2:1 aspect ratio), so we multiply X by 2
            item.colorBin.labelMesh.scale.set(this.debugSettings.labelScale * 2, this.debugSettings.labelScale, 1)

            // Only render 2 rows at a time (queueIndex 0 and 1)
            item.colorBin.setVisible(item.queueIndex >= 0 && item.queueIndex < 2)

            item.colorBin.updateMatrices()

            const i = item.colorBin.instanceIndex;
            for (const mesh of this.binInstancedMeshes) {
                mesh.setMatrixAt(item.colorBin.instanceIndex, item.colorBin.matrix)
            }
            for (const mesh of this.shadowInstancedMeshes) {
                mesh.setMatrixAt(item.colorBin.instanceIndex, item.colorBin.shadowMatrix)
            }

            // Update internal cubes
            if (this.internalCubeInstancedMesh) {
                const numCubes = this.internalCubeTransforms.length
                const visibleCount = Math.min(item.colorBin.currentCount, numCubes)

                for (let j = 0; j < numCubes; j++) {
                    const instanceId = item.colorBin.instanceIndex * numCubes + j

                    if (item.queueIndex >= 0 && item.queueIndex < 2 && j < visibleCount) {
                        const localMat = this.internalCubeTransforms[j]
                        const finalMat = new THREE.Matrix4().multiplyMatrices(item.colorBin.matrix, localMat)
                        this.internalCubeInstancedMesh.setMatrixAt(instanceId, finalMat)
                    } else {
                        const tempMatrix = new THREE.Matrix4().makeScale(0, 0, 0)
                        this.internalCubeInstancedMesh.setMatrixAt(instanceId, tempMatrix)
                    }
                }
            }
        }

        for (const mesh of this.binInstancedMeshes) mesh.instanceMatrix.needsUpdate = true
        for (const mesh of this.shadowInstancedMeshes) mesh.instanceMatrix.needsUpdate = true
        if (this.internalCubeInstancedMesh) this.internalCubeInstancedMesh.instanceMatrix.needsUpdate = true
    }

    getBinItemForColorHex(colorHex) {
        if (!this.roundRobinIndices) {
            this.roundRobinIndices = {}
        }

        const validItems = []

        for (const item of this.spawnedBins) {
            if (item.queueIndex === 0 &&
                item.colorBin.color.getHex() === colorHex &&
                item.colorBin.assignedCount < item.colorBin.capacity) {
                validItems.push(item)
            }
        }

        if (validItems.length === 0) return null

        let lastIndex = this.roundRobinIndices[colorHex]
        if (lastIndex === undefined) {
            lastIndex = -1
        }

        lastIndex = (lastIndex + 1) % validItems.length
        this.roundRobinIndices[colorHex] = lastIndex

        return validItems[lastIndex]
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

        const labelFolder = this.debugFolder.addFolder('Label UI')
        labelFolder.add(this.debugSettings, 'labelScale').min(0.01).max(2).step(0.01).name('Scale').onChange(() => this.updateLayout())
        labelFolder.add(this.debugSettings, 'labelPosX').min(-2).max(2).step(0.01).name('Pos X').onChange(() => this.updateLayout())
        labelFolder.add(this.debugSettings, 'labelPosY').min(-2).max(2).step(0.01).name('Pos Y').onChange(() => this.updateLayout())
        labelFolder.add(this.debugSettings, 'labelPosZ').min(-2).max(2).step(0.01).name('Pos Z').onChange(() => this.updateLayout())

        const customFolder = labelFolder.addFolder('Custom Column Offsets')
        customFolder.add(this.debugSettings, 'customLabelOffsetX_0').min(-1).max(1).step(0.001).name('Column 0 X').onChange(() => this.updateLayout())
        customFolder.add(this.debugSettings, 'customLabelOffsetX_1').min(-1).max(1).step(0.001).name('Column 1 X').onChange(() => this.updateLayout())
        customFolder.add(this.debugSettings, 'customLabelOffsetX_2').min(-1).max(1).step(0.001).name('Column 2 X').onChange(() => this.updateLayout())
        customFolder.add(this.debugSettings, 'customLabelOffsetX_3').min(-1).max(1).step(0.001).name('Column 3 X').onChange(() => this.updateLayout())
        customFolder.add(this.debugSettings, 'customLabelOffsetX_4').min(-1).max(1).step(0.001).name('Column 4 X').onChange(() => this.updateLayout())
        customFolder.add(this.debugSettings, 'customLabelOffsetX_5').min(-1).max(1).step(0.001).name('Column 5 X').onChange(() => this.updateLayout())

        customFolder.add(this.debugSettings, 'customLabelOffsetY_Row0').min(-1).max(1).step(0.001).name('Row 0 Y').onChange(() => this.updateLayout())
        customFolder.add(this.debugSettings, 'customLabelOffsetY_Row1').min(-1).max(1).step(0.001).name('Row 1 Y').onChange(() => this.updateLayout())

        const rotFolder = labelFolder.addFolder('Custom Column Rotations')
        rotFolder.add(this.debugSettings, 'customLabelRotZ_0').min(-Math.PI).max(Math.PI).step(0.01).name('Column 0 Rot Z').onChange(() => this.updateLayout())
        rotFolder.add(this.debugSettings, 'customLabelRotZ_1').min(-Math.PI).max(Math.PI).step(0.01).name('Column 1 Rot Z').onChange(() => this.updateLayout())
        rotFolder.add(this.debugSettings, 'customLabelRotZ_2').min(-Math.PI).max(Math.PI).step(0.01).name('Column 2 Rot Z').onChange(() => this.updateLayout())
        rotFolder.add(this.debugSettings, 'customLabelRotZ_3').min(-Math.PI).max(Math.PI).step(0.01).name('Column 3 Rot Z').onChange(() => this.updateLayout())
        rotFolder.add(this.debugSettings, 'customLabelRotZ_4').min(-Math.PI).max(Math.PI).step(0.01).name('Column 4 Rot Z').onChange(() => this.updateLayout())
        rotFolder.add(this.debugSettings, 'customLabelRotZ_5').min(-Math.PI).max(Math.PI).step(0.01).name('Column 5 Rot Z').onChange(() => this.updateLayout())
    }

    update(dt = 1 / 60) {
        if (!this.spawnedBins || !this.experience.camera || !this.experience.camera.instance) return;

        const camera = this.experience.camera.instance;
        const target = new THREE.Vector3();
        const worldPos = new THREE.Vector3();

        let needsMatrixUpdate = false;

        for (const item of this.spawnedBins) {
            if (item.colorBin.position.distanceToSquared(item.colorBin.targetPosition) > 0.0001) {
                item.colorBin.position.lerp(item.colorBin.targetPosition, 7.5 * dt); // Adjust shift forward speed
                needsMatrixUpdate = true;
            }
        }

        for (let i = this.exitingBins.length - 1; i >= 0; i--) {
            const item = this.exitingBins[i];
            item.exitTimer += dt;
            needsMatrixUpdate = true;

            const waitDuration = 0.2; // 200ms delay
            const upDuration = 0.35; // Adjusted upward speed
            const sidewaysDuration = 0.7; // Adjusted sideways speed
            const upOffset = 0.25; // Reduced to 0.25
            const sidewaysOffset = 6.0; // Push further off screen before cleanup

            if (item.exitPhase === -1) {
                if (item.exitTimer >= waitDuration) {
                    item.exitPhase = 0;
                    item.exitTimer = 0;
                }
            } else if (item.exitPhase === 0) {
                const t = Math.min(item.exitTimer / upDuration, 1.0);
                const easeT = 1 - (1 - t) * (1 - t);
                item.colorBin.position.y = item.startY + easeT * upOffset;

                item.colorBin.shadowScale.set(1 - easeT, 1 - easeT, 1 - easeT);

                if (t >= 1.0) {
                    item.exitPhase = 1;
                    item.exitTimer = 0;
                    item.startY = item.colorBin.position.y;
                    
                    // Advance the remaining bins in this row now that the filled bin is moving out
                    if (item.advancingRowIndex !== undefined) {
                        for (const spawnedItem of this.spawnedBins) {
                            if (spawnedItem.rIndex === item.advancingRowIndex) {
                                spawnedItem.queueIndex--;
                            }
                        }
                        this.updateLayout();
                        item.advancingRowIndex = undefined;
                    }
                }
            } else if (item.exitPhase === 1) {
                const t = Math.min(item.exitTimer / sidewaysDuration, 1.0);
                const easeT = t * t;
                const direction = item.rIndex < (this.activeBinCount / 2) ? -1 : 1;
                item.colorBin.position.x = item.startX + direction * sidewaysOffset * easeT;

                if (t >= 1.0) {
                    item.exitPhase = 2;
                    item.colorBin.setVisible(false);

                    // Force the instanced matrices to 0 scale before we forget about this bin
                    item.colorBin.updateMatrices();
                    this.binInstancedMeshes.forEach(m => m.setMatrixAt(item.colorBin.instanceIndex, item.colorBin.matrix));
                    this.shadowInstancedMeshes.forEach(m => m.setMatrixAt(item.colorBin.instanceIndex, item.colorBin.shadowMatrix));

                    if (this.internalCubeInstancedMesh) {
                        const numCubes = this.internalCubeTransforms.length;
                        const tempMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
                        for (let j = 0; j < numCubes; j++) {
                            const instanceId = item.colorBin.instanceIndex * numCubes + j;
                            this.internalCubeInstancedMesh.setMatrixAt(instanceId, tempMatrix);
                        }
                    }

                    this.exitingBins.splice(i, 1);
                }
            }
        }

        if (needsMatrixUpdate || true) {
            const allItems = [...this.spawnedBins, ...this.exitingBins];
            for (const item of allItems) {
                if (item.colorBin.visible) {
                    item.colorBin.labelMesh.position.set(
                        item.colorBin.position.x + (item.colorBin.labelOffsetX || 0),
                        item.colorBin.position.y + (item.colorBin.labelOffsetY || 0),
                        item.colorBin.position.z + (item.colorBin.labelOffsetZ || 0)
                    );
                    target.copy(camera.position);
                    item.colorBin.labelMesh.getWorldPosition(worldPos);
                    target.y = worldPos.y; 
                    item.colorBin.labelMesh.lookAt(target);
                    item.colorBin.labelMesh.rotation.z = item.colorBin.labelRotZ || 0;
                }

                item.colorBin.updateMatrices();
                this.binInstancedMeshes.forEach(m => m.setMatrixAt(item.colorBin.instanceIndex, item.colorBin.matrix));
                this.shadowInstancedMeshes.forEach(m => m.setMatrixAt(item.colorBin.instanceIndex, item.colorBin.shadowMatrix));

                if (this.internalCubeInstancedMesh) {
                    const numCubes = this.internalCubeTransforms.length;
                    const visibleCount = Math.min(item.colorBin.currentCount, numCubes);
                    for (let j = 0; j < numCubes; j++) {
                        const instanceId = item.colorBin.instanceIndex * numCubes + j;
                        const isVisible = item.exitPhase !== undefined ? (item.exitPhase < 2) : (item.queueIndex >= 0 && item.queueIndex < 2);
                        if (isVisible && j < visibleCount) {
                            const localMat = this.internalCubeTransforms[j];
                            const finalMat = new THREE.Matrix4().multiplyMatrices(item.colorBin.matrix, localMat);
                            this.internalCubeInstancedMesh.setMatrixAt(instanceId, finalMat);
                        } else {
                            const tempMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
                            this.internalCubeInstancedMesh.setMatrixAt(instanceId, tempMatrix);
                        }
                    }
                }
            }
            this.binInstancedMeshes.forEach(m => m.instanceMatrix.needsUpdate = true);
            this.shadowInstancedMeshes.forEach(m => m.instanceMatrix.needsUpdate = true);
            if (this.internalCubeInstancedMesh) this.internalCubeInstancedMesh.instanceMatrix.needsUpdate = true;
        }
    }
}

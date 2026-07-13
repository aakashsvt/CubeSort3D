import * as THREE from 'three'
import Experience from '../Experience.js'
import VoxelGrid from './VoxelGrid.js'

export default class VoxelLevel {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug

        // Outer group handles the horizontal turntable spinning
        this.spinGroup = new THREE.Group()
        this.spinGroup.position.set(0, 3, -0.94)
        this.scene.add(this.spinGroup)

        // Inner container handles the scale of the model
        this.container = new THREE.Group()
        this.container.scale.set(0.335, 0.335, 0.335)
        this.container.rotation.set(0, 0, 0)
        this.spinGroup.add(this.container)

        // Model group handles the rotation from the JSON
        this.modelGroup = new THREE.Group()
        this.container.add(this.modelGroup)

        // Debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('voxelLevel')

            this.debugFolder.add(this.container.rotation, 'x').min(-Math.PI).max(Math.PI).step(0.001).name('rotationX')
            this.debugFolder.add(this.container.rotation, 'y').min(-Math.PI).max(Math.PI).step(0.001).name('rotationY')
            this.debugFolder.add(this.container.rotation, 'z').min(-Math.PI).max(Math.PI).step(0.001).name('rotationZ')
            
            this.debugFolder.add(this.spinGroup.position, 'x').min(-10).max(10).step(0.01).name('positionX')
            this.debugFolder.add(this.spinGroup.position, 'y').min(-10).max(10).step(0.01).name('positionY')
            this.debugFolder.add(this.spinGroup.position, 'z').min(-10).max(10).step(0.01).name('positionZ')

            const debugActions = {
                printRotation: () => {
                    console.log(`Current Voxel Rotation -> x: ${this.container.rotation.x}, y: ${this.container.rotation.y}, z: ${this.container.rotation.z}`)
                }
            }
            this.debugFolder.add(debugActions, 'printRotation').name('Print Rotation')
        }

        this.cubes = []
        this.voxelGrid = new VoxelGrid()
        this.instancedMesh = null
        this.debugObjects = []
        this.cubeSize = 1

        // Resources
        this.resource = this.resources.items.levelData
        this.cubeModel = this.resources.items.cubeModel

        this.setModel()
    }

    setModel() {
        this.resource = this.resources.items.levelData;
        const json = this.resource;
        this.clear();

        // Extract data based on the LevelAuthoringData JSON structure you provided
        const modelName = json.levelName || (json.dashboard && json.dashboard.modelName) || 'Unknown Level'

        // Fallback to defaults if 'dashboard' is missing
        const dashboard = json.dashboard || {}
        this.cubeSize = dashboard.cubeSize || 1
        const palette = dashboard.palette || []

        // Fallback to default scale if not specified in JSON
        const scale = dashboard.modelScale || 0.335
        this.baseScale = scale
        this.container.scale.set(scale, scale, scale)
        
        if (this.experience.zoomSlider) {
            this.experience.zoomSlider.setBaseScale(scale)
        }

        // Ensure container has 0 rotation (no isometric tilt), as requested by user
        this.container.rotation.set(0, 0, 0)

        // Apply Unity model rotation to the inner group if available (Left-Handed to Right-Handed conversion)
        if (dashboard.modelRotationEuler) {
            const rot = dashboard.modelRotationEuler
            this.modelGroup.rotation.set(
                THREE.MathUtils.degToRad(-rot.x),
                THREE.MathUtils.degToRad(-rot.y),
                THREE.MathUtils.degToRad(rot.z),
                'YXZ'
            )
        } else {
            this.modelGroup.rotation.set(0, 0, 0)
        }

        // We look for lastGeneratedCubes, but fall back to cubes just in case
        const cubesData = dashboard.lastGeneratedCubes || json.cubes || []

        console.log(`Loading Voxel Level: ${modelName}`)
        console.log(`Total Cubes: ${cubesData.length}`)

        if (cubesData.length === 0) return

        // Calculate grid bounds to perfectly center the model
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        let minZ = Infinity, maxZ = -Infinity

        for (const c of cubesData) {
            const x = c.gridPos ? c.gridPos.x : c.x
            const y = c.gridPos ? c.gridPos.y : c.y
            const z = c.gridPos ? c.gridPos.z : c.z

            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
            if (z < minZ) minZ = z
            if (z > maxZ) maxZ = z
        }

        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2
        const centerZ = (minZ + maxZ) / 2

        // Extract geometry and material from cube model
        let geometry, material
        this.cubeModel.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                geometry = child.geometry.clone()
                material = child.material.clone()
                if (Array.isArray(material)) {
                    material = material[0].clone()
                }
                material.vertexColors = false

                if (material.map) {
                    material.map.colorSpace = THREE.SRGBColorSpace
                }
            }
        })

        if (!geometry || !material) {
            console.error('Could not find mesh in cube model! Using BoxGeometry instead.')
            geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)
            material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
            })
        } else {
            geometry.computeBoundingBox()
            const center = geometry.boundingBox.getCenter(new THREE.Vector3())
            geometry.translate(-center.x, -center.y, -center.z)
            const size = geometry.boundingBox.getSize(new THREE.Vector3())
            const maxDim = Math.max(size.x, size.y, size.z)
            const scaleFactor = this.cubeSize / maxDim
            geometry.scale(scaleFactor, scaleFactor, scaleFactor)
        }

        material.roughness = 1
        material.metalness = 0
        material.needsUpdate = true

        this.instancedMesh = new THREE.InstancedMesh(geometry, material, cubesData.length)
        this.instancedMesh.castShadow = false
        this.instancedMesh.receiveShadow = false
        const dummy = new THREE.Object3D()
        const color = new THREE.Color()

        for (let i = 0; i < cubesData.length; i++) {
            const cubeData = cubesData[i]
            const x = cubeData.gridPos ? cubeData.gridPos.x : cubeData.x
            const y = cubeData.gridPos ? cubeData.gridPos.y : cubeData.y
            const z = cubeData.gridPos ? cubeData.gridPos.z : cubeData.z

            // Set Position relative to the center
            dummy.position.set(
                (x - centerX) * this.cubeSize,
                (y - centerY) * this.cubeSize,
                (centerZ - z) * this.cubeSize
            )
            // Reverted to 1, as the scale is handled by the container
            dummy.scale.set(1, 1, 1)
            dummy.updateMatrix()
            this.instancedMesh.setMatrixAt(i, dummy.matrix)

            // Parse Color
            const palColor = palette[cubeData.colorIndex]
            if (palColor) {
                if (palColor.r !== undefined) {
                    color.setRGB(palColor.r, palColor.g, palColor.b)
                    // CRITICAL: Unity exports color picker values in sRGB, but Three.js setRGB assumes Linear space.
                    // We must convert from sRGB to Linear so the final rendered colors exactly match your JSON/Unity!
                    color.convertSRGBToLinear()
                }
                // Fallback for hex string
                else if (typeof palColor === 'string') {
                    let hexStr = palColor.startsWith('#') ? palColor : '#' + palColor
                    color.set(hexStr)
                }
            } else {
                color.setHex(0xffffff) // Fallback color
            }
            this.instancedMesh.setColorAt(i, color)

            // Store logical data
            const cubeObj = {
                instanceId: i,
                gridPos: { x, y, z },
                colorIndex: cubeData.colorIndex,
                active: true
            }
            this.cubes.push(cubeObj)
            this.voxelGrid.set(x, y, z, cubeObj)
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.instanceColor.needsUpdate = true

        this.modelGroup.add(this.instancedMesh)

        // Material debug
        if (this.debug && this.debug.active && !this.materialDebugFolder) {
            this.materialDebugFolder = this.debugFolder.addFolder('Material')
            const getMat = () => this.instancedMesh && this.instancedMesh.material
            this.materialSettings = {
                get roughness() { const m = getMat(); return m && m.roughness !== undefined ? m.roughness : 1 },
                set roughness(v) { const m = getMat(); if(m && m.roughness !== undefined) { m.roughness = v; m.needsUpdate = true; } },
                get metalness() { const m = getMat(); return m && m.metalness !== undefined ? m.metalness : 0 },
                set metalness(v) { const m = getMat(); if(m && m.metalness !== undefined) { m.metalness = v; m.needsUpdate = true; } },
                get transmission() { const m = getMat(); return m && m.transmission !== undefined ? m.transmission : 0.2 },
                set transmission(v) { const m = getMat(); if(m && m.transmission !== undefined) { m.transmission = v; m.needsUpdate = true; } },
                get clearcoat() { const m = getMat(); return m && m.clearcoat !== undefined ? m.clearcoat : 0 },
                set clearcoat(v) { const m = getMat(); if(m && m.clearcoat !== undefined) { m.clearcoat = v; m.needsUpdate = true; } }
            }
            this.materialDebugFolder.add(this.materialSettings, 'roughness').min(0).max(1).step(0.001)
            this.materialDebugFolder.add(this.materialSettings, 'metalness').min(0).max(1).step(0.001)
            this.materialDebugFolder.add(this.materialSettings, 'transmission').min(0).max(1).step(0.001)
            this.materialDebugFolder.add(this.materialSettings, 'clearcoat').min(0).max(1).step(0.001)
        }

        // Debug mode
        if (this.debug && this.debug.active) {
            // Add debug single cube
            const debugCube = new THREE.Mesh(geometry, material)
            debugCube.position.set(0, 0, 0)
            this.modelGroup.add(debugCube)
            this.debugObjects.push(debugCube)

            // Add bounding box for debug cube
            const debugCubeBoxHelper = new THREE.BoxHelper(debugCube, 0xff0000)
            this.modelGroup.add(debugCubeBoxHelper)
            this.debugObjects.push(debugCubeBoxHelper)

            // Add bounding box helper for instanced mesh
            this.instancedMesh.computeBoundingSphere()
            this.instancedMesh.computeBoundingBox()
            const instancedBoxHelper = new THREE.BoxHelper(this.instancedMesh, 0x00ff00)
            this.modelGroup.add(instancedBoxHelper)
            this.debugObjects.push(instancedBoxHelper)
        }
    }

    clear() {
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose()
            if (this.instancedMesh.material) {
                if (Array.isArray(this.instancedMesh.material)) {
                    this.instancedMesh.material.forEach(m => m.dispose())
                } else {
                    this.instancedMesh.material.dispose()
                }
            }
            this.modelGroup.remove(this.instancedMesh)
            this.instancedMesh = null
        }
        // Clear debug objects
        for (const obj of this.debugObjects) {
            if (obj.geometry) obj.geometry.dispose()
            if (obj.material) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose())
                } else {
                    obj.material.dispose()
                }
            }
            this.modelGroup.remove(obj)
        }
        this.debugObjects = []
        this.cubes = []
        this.voxelGrid.clear()
    }

    destroy() {
        this.clear()
        this.scene.remove(this.container)
    }
}

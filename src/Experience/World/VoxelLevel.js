import * as THREE from 'three'
import Experience from '../Experience.js'

export default class VoxelLevel {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.debug = this.experience.debug

        // Outer group handles the horizontal turntable spinning
        this.spinGroup = new THREE.Group()
        this.spinGroup.position.set(0, 3.5, 0)
        this.scene.add(this.spinGroup)

        // Inner container handles the permanent tilt/scale of the model
        this.container = new THREE.Group()
        this.container.scale.set(0.3, 0.3, 0.3)
        this.container.rotation.set(-1.106, -0.411, -0.952)
        this.spinGroup.add(this.container)

        // Debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('voxelLevel')

            this.debugFolder.add(this.container.rotation, 'x').min(-Math.PI).max(Math.PI).step(0.001).name('rotationX')
            this.debugFolder.add(this.container.rotation, 'y').min(-Math.PI).max(Math.PI).step(0.001).name('rotationY')
            this.debugFolder.add(this.container.rotation, 'z').min(-Math.PI).max(Math.PI).step(0.001).name('rotationZ')

            const debugActions = {
                printRotation: () => {
                    console.log(`Current Voxel Rotation -> x: ${this.container.rotation.x}, y: ${this.container.rotation.y}, z: ${this.container.rotation.z}`)
                }
            }
            this.debugFolder.add(debugActions, 'printRotation').name('Print Rotation')
        }

        this.cubes = []
        this.instancedMesh = null
        this.debugObjects = []

        // Resources
        this.resource = this.resources.items.levelData
        this.cubeModel = this.resources.items.cubeModel

        this.setModel()
    }

    setModel() {
        const json = this.resource
        this.clear()

        // Extract data based on the LevelAuthoringData JSON structure you provided
        const modelName = json.levelName || (json.dashboard && json.dashboard.modelName) || 'Unknown Level'

        // Fallback to defaults if 'dashboard' is missing
        const dashboard = json.dashboard || {}
        const cubeSize = dashboard.cubeSize || 1
        const palette = dashboard.palette || []

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
            const scaleFactor = cubeSize / maxDim
            geometry.scale(scaleFactor, scaleFactor, scaleFactor)
        }

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
                (x - centerX) * cubeSize,
                (y - centerY) * cubeSize,
                (z - centerZ) * cubeSize
            )
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
            this.cubes.push({
                instanceId: i,
                gridPos: { x, y, z },
                colorIndex: cubeData.colorIndex
            })
        }

        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.instanceColor.needsUpdate = true

        this.container.add(this.instancedMesh)

        // Debug mode
        if (this.debug && this.debug.active) {
            // Add debug single cube
            const debugCube = new THREE.Mesh(geometry, material)
            debugCube.position.set(0, 0, 0)
            this.container.add(debugCube)
            this.debugObjects.push(debugCube)

            // Add bounding box for debug cube
            const debugCubeBoxHelper = new THREE.BoxHelper(debugCube, 0xff0000)
            this.container.add(debugCubeBoxHelper)
            this.debugObjects.push(debugCubeBoxHelper)

            // Add bounding box helper for instanced mesh
            this.instancedMesh.computeBoundingSphere()
            this.instancedMesh.computeBoundingBox()
            const instancedBoxHelper = new THREE.BoxHelper(this.instancedMesh, 0x00ff00)
            this.container.add(instancedBoxHelper)
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
            this.container.remove(this.instancedMesh)
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
            this.container.remove(obj)
        }
        this.debugObjects = []
        this.cubes = []
    }

    destroy() {
        this.clear()
        this.scene.remove(this.container)
    }
}

import * as THREE from 'three'
import Experience from '../Experience.js'

export default class VoxelLevel {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        
        this.container = new THREE.Group()
        this.scene.add(this.container)
        
        this.cubes = []
        this.instancedMesh = null
    }

    /**
     * Loads the voxel level from parsed JSON data matching the LevelAuthoringData format.
     */
    loadFromJSON(json) {
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

        // Use InstancedMesh for high-performance rendering of thousands of voxels
        const geometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)
        const material = new THREE.MeshStandardMaterial({ 
            color: 0xffffff,
            roughness: 0.3,
            metalness: 0.1
        })
        
        this.instancedMesh = new THREE.InstancedMesh(geometry, material, cubesData.length)
        
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
                // If it's an object with r,g,b (from Unity JsonUtility)
                if (palColor.r !== undefined) {
                    color.setRGB(palColor.r, palColor.g, palColor.b)
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
        
        // Notify Three.js that instances need an update
        this.instancedMesh.instanceMatrix.needsUpdate = true
        this.instancedMesh.instanceColor.needsUpdate = true
        
        this.container.add(this.instancedMesh)
    }

    clear() {
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose()
            this.instancedMesh.material.dispose()
            this.container.remove(this.instancedMesh)
            this.instancedMesh = null
        }
        this.cubes = []
    }

    destroy() {
        this.clear()
        this.scene.remove(this.container)
    }

    update() {
        // Future game logic (e.g., handling selected/moving cubes)
    }
}

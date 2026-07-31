import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Roulette {
    constructor(physicsWorld) {
        this.experience = new Experience()
        this.physicsWorld = physicsWorld
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        this.resource = this.resources.items.rouletteModel
        this.shadowResource = this.resources.items.rouletteShadowModel

        this.wallParams = {
            radiusOffset: 0.0,
            height: 2.0,
            posY: 0.9
        }

        this.coneParams = {
            radius: 0.5,
            height: 1.2,
            posX: 0.0,
            posY: 0.4,
            posZ: 0.0
        }
        
        this.currentFillRatio = 0

        this.config = {
            colors: {
                normal: '#73c1ec',
                warning: '#ff7300',
                critical: '#ff0000',
                criticalEmissive: '#bf0000',
                wallDebug: 0xff0000,
                coneDebug: 0x0000ff
            },
            thresholds: {
                warning: 0.8,
                critical: 1.0
            },
            nodeNames: {
                centerBorder: 'Roulette_v3_Center_Border',
                uiStrip: 'Roulette_v3_UIstrip',
                materialV2: 'Roulette_v2'
            },
            animSpeed: {
                base: 0.2, // Base speed of texture scrolling
                multiplier: 0.8 // How much faster it scrolls as it fills
            }
        }

        this.speed = 2
        this.setModel()
        this.setDebug()
    }

    setModel() {
        this.group = new THREE.Group()
        this.group.position.set(0, -1.05, -1.40)
        this.group.rotation.set(-0.1, 0, 0)
        this.group.scale.set(2.05, 2.05, 2.05)
        this.scene.add(this.group)

        this.model = this.resource.scene
        this.model.position.set(0, 0, 0)
        this.model.scale.set(1.00, 1.00, 1.00)

        this.model.traverse((child) => {
            if (child.name === this.config.nodeNames.centerBorder) {
                if (child.material) {
                    child.material.color.set(this.config.colors.normal)
                }
            }
            if (child.name === this.config.nodeNames.uiStrip) {
                this.uiStripModel = child
                if (child.material) {
                    // Clone material and textures so we don't modify shared assets used by other parts
                    child.material = child.material.clone()
                    child.material.color.set(0x000000) // Force background to be black
                    child.material.emissive.set(this.config.colors.normal)
                    child.material.emissiveIntensity = 1.0

                    if (child.material.map) {
                        child.material.map = child.material.map.clone()
                        child.material.map.wrapS = THREE.RepeatWrapping
                        child.material.map.wrapT = THREE.RepeatWrapping
                        child.material.map.needsUpdate = true
                    }
                    if (child.material.emissiveMap) {
                        child.material.emissiveMap = child.material.emissiveMap.clone()
                        child.material.emissiveMap.wrapS = THREE.RepeatWrapping
                        child.material.emissiveMap.wrapT = THREE.RepeatWrapping
                        child.material.emissiveMap.needsUpdate = true
                    } else if (child.material.map) {
                        // Use map as emissiveMap so the glow only applies to the texture's design, keeping background black
                        child.material.emissiveMap = child.material.map
                    }
                }
            }
            if (child instanceof THREE.Mesh) {
                child.castShadow = true
                child.receiveShadow = true
                
                if (child.material) {
                    if (child.material.name === this.config.nodeNames.materialV2) {
                        child.material.color.set(this.config.colors.normal)
                        child.material.roughness = 1
                    }
                }
            }
        })

        this.shadowModel = this.shadowResource.scene
        this.shadowModel.position.set(0, -0.01, 0.05)
        this.shadowModel.scale.set(0.99, 1, 1)

        this.shadowModel.traverse((child) => {
            if (child.name === this.config.nodeNames.uiStrip) {
                this.shadowUiStripModel = child
            }
            if (child instanceof THREE.Mesh) {
                child.castShadow = false
                child.receiveShadow = true
                if (child.material) {
                    child.material.transparent = true
                    child.material.alphaTest = 0
                    child.material.opacity = 0.8
                    child.material.needsUpdate = true
                }
            }
        })

        this.group.add(this.shadowModel)
        this.group.add(this.model)

        if (this.uiStripModel) {
            this.group.attach(this.uiStripModel)
            this.uiStripModel.position.z += 0.02
        }
        if (this.shadowUiStripModel) {
            this.group.attach(this.shadowUiStripModel)
            this.shadowUiStripModel.position.z += 0.02
        }

        // Auto-calculate the exact outer radius of the Roulette model
        const localBox = new THREE.Box3()
        this.model.traverse(child => {
            if (child.isMesh) {
                child.geometry.computeBoundingBox()
                const childBox = child.geometry.boundingBox.clone()
                childBox.applyMatrix4(child.matrix)
                localBox.union(childBox)
            }
        })
        const size = localBox.getSize(new THREE.Vector3())
        this.modelCenter = localBox.getCenter(new THREE.Vector3())
        
        this.setInvisibleColliders()
    }

    setInvisibleColliders() {
        this.coneParams.posX = this.modelCenter.x
        this.coneParams.posZ = this.modelCenter.z
        
        // Explicitly setting radius to 1.15 as requested
        this.wallParams.radius = 1.15

        this.wallMaterial = new THREE.MeshStandardMaterial({
            color: this.config.colors.wallDebug,
            transparent: true,
            opacity: 0.0, // Invisible by default, but blocks cubes
            wireframe: true,
            side: THREE.DoubleSide // Important for physics inside hollow objects
        })

        this.wallMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(this.wallParams.radius, this.wallParams.radius, this.wallParams.height, 32, 1, true),
            this.wallMaterial
        )
        this.wallMesh.name = 'InvisibleWall'
        this.wallMesh.position.set(this.modelCenter.x, this.wallParams.posY, this.modelCenter.z)
        this.model.add(this.wallMesh)

        this.coneMaterial = new THREE.MeshStandardMaterial({
            color: this.config.colors.coneDebug,
            transparent: true,
            opacity: 0.0, // Invisible by default, deflects cubes
            wireframe: true
        })

        this.coneMesh = new THREE.Mesh(
            new THREE.ConeGeometry(this.coneParams.radius, this.coneParams.height, 32),
            this.coneMaterial
        )
        this.coneMesh.name = 'DeflectorCone'
        this.coneMesh.position.set(this.coneParams.posX, this.coneParams.posY, this.coneParams.posZ)
        this.model.add(this.coneMesh)

        if (this.physicsWorld) {
            this.physicsWorld.ready.then(() => {
                this.physicsWorld.createRouletteBody(this.group, this.model)
            })
        }
    }

    update() {
        const dt = this.time.delta / 1000
        if (this.model) {
            this.model.rotation.y += dt * this.speed
        }

        // Handle Blinking when at critical capacity
        if (this.uiStripModel && this.uiStripModel.material) {
            if (this.currentFillRatio >= this.config.thresholds.critical) {
                // Create a Yoyo blink effect using time
                const blink = (Math.sin(Date.now() / 150) + 1) / 2 // Ranges from 0 to 1

                // Keep base background completely black
                this.uiStripModel.material.color.set(0x000000)

                // Alternate emissive glow between dark red and the critical color
                const criticalColor = new THREE.Color(this.config.colors.critical)
                const darkRed = new THREE.Color(0.25, 0, 0) // from C# blink logic
                this.uiStripModel.material.emissive.lerpColors(darkRed, criticalColor, blink)
            }
        }
    }

    updateLoadStatus(fillRatio) {
        this.currentFillRatio = fillRatio
        if (this.uiStripModel && this.uiStripModel.material) {
            let colorHex = this.config.colors.normal
            let emissiveHex = this.config.colors.normal

            if (fillRatio >= this.config.thresholds.critical) {
                colorHex = this.config.colors.critical
                emissiveHex = this.config.colors.criticalEmissive
            } else if (fillRatio >= this.config.thresholds.warning) {
                colorHex = this.config.colors.warning
                emissiveHex = this.config.colors.warning
            }

            // Only snap to static colors if not blinking (blink logic overrides this in update)
            if (fillRatio < this.config.thresholds.critical) {
                // Keep background black, only color the texture via emissive
                this.uiStripModel.material.color.set(0x000000)
                this.uiStripModel.material.emissive.set(colorHex)
            }

            // Exact static offset mapping: 0.0 is empty, -0.5 is full (inverted for Three.js UV space)
            const clampedFill = Math.min(Math.max(fillRatio, 0), 1)
            const offsetX = - (clampedFill * 0.5)

            if (this.uiStripModel.material.map) {
                this.uiStripModel.material.map.offset.x = offsetX
            }
            if (this.uiStripModel.material.emissiveMap) {
                this.uiStripModel.material.emissiveMap.offset.x = offsetX
            }
        }
    }

    setDebug() {
        this.debug = this.experience.debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('Roulette')
            
            const scaleParams = { groupScale: 2.05, modelScale: 1.00 }
            this.debugFolder.add(scaleParams, 'groupScale').min(0.1).max(10).step(0.01).name('Group Scale').onChange((val) => {
                this.group.scale.set(val, val, val)
            })
            this.debugFolder.add(scaleParams, 'modelScale').min(0.1).max(10).step(0.01).name('Model Scale').onChange((val) => {
                this.model.scale.set(val, val, val)
            })
            
            this.debugFolder.add(this.group.position, 'y').min(-5).max(5).step(0.01).name('Group Pos Y')
            this.debugFolder.add(this.group.position, 'z').min(-5).max(5).step(0.01).name('Group Pos Z')
            this.debugFolder.add(this.group.rotation, 'x').min(-Math.PI).max(Math.PI).step(0.01).name('Group Rot X')
            
            if (this.uiStripModel) {
                const uiFolder = this.debugFolder.addFolder('UI Strip')
                uiFolder.add(this.uiStripModel.position, 'y').min(-2).max(2).step(0.001).name('Pos Y')
                uiFolder.add(this.uiStripModel.position, 'z').min(-2).max(2).step(0.001).name('Pos Z')
            }
            
            const wallFolder = this.debugFolder.addFolder('Invisible Wall')
            
            const updateWallVisuals = () => {
                if (this.wallMesh) {
                    this.wallMesh.geometry.dispose()
                    this.wallMesh.geometry = new THREE.CylinderGeometry(this.wallParams.radius, this.wallParams.radius, this.wallParams.height, 32, 1, true)
                    this.wallMesh.position.set(this.modelCenter.x, this.wallParams.posY, this.modelCenter.z)
                }
            }
            
            const updateWallPhysics = () => {
                if (this.physicsWorld) {
                    this.physicsWorld.updateRouletteBody(this.group, this.model)
                }
            }

            wallFolder.add(this.wallParams, 'radius').min(1).max(10).step(0.01).name('Radius').onChange(updateWallVisuals).onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallParams, 'height').min(0.1).max(15).step(0.01).name('Height').onChange(updateWallVisuals).onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallParams, 'posY').min(-5).max(10).step(0.01).name('Height Offset (Y)').onChange(updateWallVisuals).onFinishChange(updateWallPhysics)
            wallFolder.add(this.wallMaterial, 'opacity').min(0).max(1).step(0.01).name('Debug Opacity')
            
            const coneFolder = this.debugFolder.addFolder('Deflector Cone')
            
            const updateConeVisuals = () => {
                if (this.coneMesh) {
                    this.coneMesh.geometry.dispose()
                    this.coneMesh.geometry = new THREE.ConeGeometry(this.coneParams.radius, this.coneParams.height, 32)
                    this.coneMesh.position.set(this.coneParams.posX, this.coneParams.posY, this.coneParams.posZ)
                }
            }

            coneFolder.add(this.coneParams, 'radius').min(0.01).max(5).step(0.01).name('Radius').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneParams, 'height').min(0.01).max(5).step(0.01).name('Height').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneParams, 'posX').min(-5).max(5).step(0.01).name('Pos X').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneParams, 'posY').min(-5).max(5).step(0.01).name('Pos Y').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneParams, 'posZ').min(-5).max(5).step(0.01).name('Pos Z').onChange(updateConeVisuals).onFinishChange(updateWallPhysics)
            coneFolder.add(this.coneMaterial, 'opacity').min(0).max(1).step(0.01).name('Debug Opacity')
            
            const shadowFolder = this.debugFolder.addFolder('Shadow')
            shadowFolder.add(this.shadowModel.position, 'x').min(-5).max(5).step(0.001).name('posX')
            shadowFolder.add(this.shadowModel.position, 'y').min(-5).max(5).step(0.001).name('posY')
            shadowFolder.add(this.shadowModel.position, 'z').min(-5).max(5).step(0.001).name('posZ')
            
            shadowFolder.add(this.shadowModel.scale, 'x').min(0.1).max(10).step(0.01).name('scaleX')
            shadowFolder.add(this.shadowModel.scale, 'y').min(0.1).max(10).step(0.01).name('scaleY')
            shadowFolder.add(this.shadowModel.scale, 'z').min(0.1).max(10).step(0.01).name('scaleZ')

            const shadowParams = { alphaTest: 0, opacity: 0.8 }
            shadowFolder.add(shadowParams, 'alphaTest').min(0).max(1).step(0.01).name('AlphaTest').onChange((val) => {
                this.shadowModel.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        child.material.alphaTest = val
                        child.material.needsUpdate = true
                    }
                })
            })
            shadowFolder.add(shadowParams, 'opacity').min(0).max(1).step(0.01).name('Opacity').onChange((val) => {
                this.shadowModel.traverse((child) => {
                    if (child instanceof THREE.Mesh && child.material) {
                        child.material.opacity = val
                        child.material.needsUpdate = true
                    }
                })
            })
        }
    }
}

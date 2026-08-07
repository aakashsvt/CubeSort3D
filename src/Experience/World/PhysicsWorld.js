import Experience from '../Experience.js'
import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import CannonDebugger from 'cannon-es-debugger'

export default class PhysicsWorld {
    constructor() {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.time = this.experience.time
        this.world = null
        this.physicsParams = {
            gravity: -60.0,
            restitution: 0.4,
            friction: 0.6,
            debugRender: false,
            enableTrimesh: true,
            enableWall: true,
            enableCone: true,
            enableSafetyNet: true,
            netRadiusOffset: 0.0,
            netHalfHeight: 3.0,
            netOffsetY: 0.12,
            trayOffsetY: -0.1,
            ccdEnabled: false,
            solverIterations: 10
        }
        
        this.debugLines = null
        this.cannonDebugger = null
        
        this.setDebug()
        this.ready = this.init()
    }   

    setDebug() {
        this.debug = this.experience.debug
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('Physics')
            this.debugFolder.add(this.physicsParams, 'gravity').min(-50).max(10).step(0.1).name('Gravity Y').onChange((v) => {
                if (this.world) this.world.gravity.set(0, v, 0)
            })
            this.debugFolder.add(this.physicsParams, 'restitution').min(0).max(1).step(0.01).name('Bounciness').onChange(v => {
                if (this.defaultMaterial) this.defaultMaterial.restitution = v;
            })
            this.debugFolder.add(this.physicsParams, 'friction').min(0).max(2).step(0.01).name('Friction').onChange(v => {
                if (this.defaultMaterial) this.defaultMaterial.friction = v;
            })
            
            this.debugFolder.add(this.physicsParams, 'debugRender').name('Show Colliders').onChange((v) => {
                if (v && !this.cannonDebugger) {
                    this.cannonDebugger = new CannonDebugger(this.scene, this.world, { color: 0x00ff00, autoUpdate: false })
                }
                if (this.cannonDebugger) {
                    // cannon-es-debugger doesn't have a simple toggle visibility, 
                    // it creates meshes. We will just toggle visibility of its meshes.
                    this.scene.traverse((child) => {
                        if (child.isMesh && child.material && child.material.wireframe) {
                            child.visible = v
                        }
                    })
                }
            })
            
            const collidersFolder = this.debugFolder.addFolder('Roulette Colliders')
            collidersFolder.add(this.physicsParams, 'enableTrimesh').name('Trimesh').onChange(() => this.rebuildRouletteBody())
            collidersFolder.add(this.physicsParams, 'trayOffsetY').min(-5).max(5).step(0.01).name('Tray Y Offset').onChange(() => this.rebuildRouletteBody())
            collidersFolder.add(this.physicsParams, 'enableWall').name('Wall').onChange(() => this.rebuildRouletteBody())
            collidersFolder.add(this.physicsParams, 'enableCone').name('Cone').onChange(() => this.rebuildRouletteBody())
            
            const safetyNetFolder = this.debugFolder.addFolder('Safety Net Collider')
            safetyNetFolder.add(this.physicsParams, 'enableSafetyNet').name('Enable').onChange(() => this.rebuildRouletteBody())
            safetyNetFolder.add(this.physicsParams, 'netRadiusOffset').min(-5).max(5).step(0.01).name('Radius Offset').onChange(() => this.rebuildRouletteBody())
            safetyNetFolder.add(this.physicsParams, 'netHalfHeight').min(0.1).max(10).step(0.01).name('Half-Height').onChange(() => this.rebuildRouletteBody())
            safetyNetFolder.add(this.physicsParams, 'netOffsetY').min(-5).max(5).step(0.01).name('Offset Y').onChange(() => this.rebuildRouletteBody())
            
            const perfFolder = this.debugFolder.addFolder('Performance & Accuracy')
            perfFolder.add(this.physicsParams, 'ccdEnabled').name('Enable CCD (Fix Tunneling)')
            perfFolder.add(this.physicsParams, 'solverIterations').min(1).max(20).step(1).name('Solver Iterations').onChange((v) => {
                if (this.world) {
                    this.world.solver.iterations = v;
                }
            })
        }
    }

    async init() {
        this.world = new CANNON.World({
            gravity: new CANNON.Vec3(0, this.physicsParams.gravity, 0)
        })
        this.world.solver.iterations = this.physicsParams.solverIterations
        
        // Define default material
        this.defaultMaterial = new CANNON.Material('default')
        const defaultContactMaterial = new CANNON.ContactMaterial(
            this.defaultMaterial,
            this.defaultMaterial,
            {
                friction: this.physicsParams.friction,
                restitution: this.physicsParams.restitution
            }
        )
        this.world.addContactMaterial(defaultContactMaterial)
        
        // Materials for slippery things
        this.slipperyMaterial = new CANNON.Material('slippery')
        const slipperyContact = new CANNON.ContactMaterial(
            this.defaultMaterial,
            this.slipperyMaterial,
            {
                friction: 0.0,
                restitution: 0.1
            }
        )
        this.world.addContactMaterial(slipperyContact)
        
        // Initialize debugger
        if (this.scene) {
            this.cannonDebugger = new CannonDebugger(this.scene, this.world, {
                color: 0x00ff00,
                autoUpdate: false
            })
        }
    }

    rebuildRouletteBody() {
        if (this.rouletteGroup && this.rouletteModel) {
            this.updateRouletteBody(this.rouletteGroup, this.rouletteModel)
        }
    }

    createRouletteBody(rouletteGroup, rouletteModel) {
        if (!this.world) return

        this.rouletteGroup = rouletteGroup
        this.rouletteModel = rouletteModel
        this.rouletteGroup.updateMatrixWorld(true)
        this.rouletteModel.updateMatrixWorld(true)

        const pos = new THREE.Vector3()
        const quat = new THREE.Quaternion()
        const scale = new THREE.Vector3()
        this.rouletteModel.matrixWorld.decompose(pos, quat, scale)

        this.rouletteBody = new CANNON.Body({
            type: CANNON.Body.KINEMATIC,
            position: new CANNON.Vec3(pos.x, pos.y, pos.z),
            quaternion: new CANNON.Quaternion(quat.x, quat.y, quat.z, quat.w)
        })

        const localBox = new THREE.Box3()

        rouletteModel.traverse((child) => {
            if (child.isMesh) {
                // Compute bounds for safety net (only using visual model, not invisible wall)
                if (child.name !== 'InvisibleWall' && child.name !== 'DeflectorCone') {
                    child.geometry.computeBoundingBox()
                    const childBox = child.geometry.boundingBox.clone()
                    childBox.applyMatrix4(child.matrix)
                    localBox.union(childBox)
                }

                // Generate colliders
                if (child.name === 'InvisibleWall' && !this.physicsParams.enableWall) return
                if (child.name === 'DeflectorCone' && !this.physicsParams.enableCone) return
                if (child.name !== 'InvisibleWall' && child.name !== 'DeflectorCone' && !this.physicsParams.enableTrimesh) return
                
                const worldScale = new THREE.Vector3()
                rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)



                const geometry = child.geometry.clone()
                const matrix = new THREE.Matrix4()
                matrix.copy(child.matrixWorld)
                
                const modelInverse = new THREE.Matrix4().copy(rouletteModel.matrixWorld).invert()
                matrix.premultiply(modelInverse) 

                rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)
                const scaleMatrix = new THREE.Matrix4().makeScale(worldScale.x, worldScale.y, worldScale.z)
                scaleMatrix.multiply(matrix)
                geometry.applyMatrix4(scaleMatrix)
                
                geometry.computeBoundingBox()
                const bbox = geometry.boundingBox
                const size = bbox.getSize(new THREE.Vector3())
                const center = bbox.getCenter(new THREE.Vector3())
                
                if (child.name === 'DeflectorCone') {
                    const radius = Math.max(size.x, size.z) / 2
                    const height = size.y > 0.01 ? size.y : 0.01
                    
                    // Cannon-es cylinder is ALREADY along Y axis
                    const cylinderShape = new CANNON.Cylinder(0.01, radius, height, 16)
                    const q = new CANNON.Quaternion() // No rotation needed
                    
                    this.rouletteBody.addShape(cylinderShape, new CANNON.Vec3(center.x, center.y, center.z), q)
                    cylinderShape.material = this.slipperyMaterial
                    return
                }

                if (child.name === 'InvisibleWall') {
                    const radiusX = (bbox.max.x - bbox.min.x) / 2
                    const radiusZ = (bbox.max.z - bbox.min.z) / 2
                    const radius = Math.max(radiusX, radiusZ)
                    const originalHeight = size.y
                    const heightExtension = 50.0 
                    const height = originalHeight + heightExtension
                    
                    const cy = ((bbox.max.y + bbox.min.y) / 2) + (heightExtension / 2)
                    const cx = (bbox.max.x + bbox.min.x) / 2
                    const cz = (bbox.max.z + bbox.min.z) / 2
                    
                    const segments = 16
                    const thickness = 4.0 
                    const angleStep = (Math.PI * 2) / segments
                    
                    for (let i = 0; i < segments; i++) {
                        const angle = i * angleStep
                        const centerDist = radius + (thickness / 2)
                        const px = cx + Math.cos(angle) * centerDist
                        const pz = cz + Math.sin(angle) * centerDist
                        
                        const width = (Math.PI * 2 * centerDist) / segments
                        
                        // Cannon uses half-extents for boxes
                        const boxShape = new CANNON.Box(new CANNON.Vec3(width / 2 + 0.1, height / 2, thickness / 2))
                        
                        const q = new CANNON.Quaternion()
                        q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), -angle - Math.PI/2)
                        
                        boxShape.material = this.slipperyMaterial
                        this.rouletteBody.addShape(boxShape, new CANNON.Vec3(px, cy, pz), q)
                    }
                    return
                }

                const radiusX = size.x / 2
                const radiusZ = size.z / 2
                const radius = Math.max(radiusX, radiusZ)
                const height = size.y > 0.01 ? size.y : 0.01
                
                const cylinderShape = new CANNON.Cylinder(radius, radius, height, 16)
                const q = new CANNON.Quaternion() // Cannon-es cylinders are Y-up
                
                this.rouletteBody.addShape(cylinderShape, new CANNON.Vec3(center.x, center.y + this.physicsParams.trayOffsetY, center.z), q)
            }
        })

        // SAFETY NET
        if (this.physicsParams.enableSafetyNet) {
            const size = localBox.getSize(new THREE.Vector3())
            const center = localBox.getCenter(new THREE.Vector3())
            const localRadius = (Math.max(size.x, size.z) / 2) + this.physicsParams.netRadiusOffset
            const localMinY = localBox.min.y

            const worldScale = new THREE.Vector3()
            rouletteModel.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale)

            const scaledRadius = localRadius * Math.max(worldScale.x, worldScale.z)
            const halfHeight = this.physicsParams.netHalfHeight
            const scaledHalfHeight = halfHeight * worldScale.y
            
            const cyCenterX = center.x * worldScale.x
            const cyCenterZ = center.z * worldScale.z
            const cyCenterY = ((localMinY + this.physicsParams.netOffsetY) * worldScale.y) - scaledHalfHeight

            const cylinderShape = new CANNON.Cylinder(scaledRadius, scaledRadius, scaledHalfHeight * 2, 16)
            const q = new CANNON.Quaternion() // Cannon-es cylinders are Y-up
            
            this.rouletteBody.addShape(cylinderShape, new CANNON.Vec3(cyCenterX, cyCenterY, cyCenterZ), q)
        }

        this.world.addBody(this.rouletteBody)
    }

    updateRouletteBody(rouletteGroup, rouletteModel) {
        if (!this.world) return
        if (this.rouletteBody) {
            this.world.removeBody(this.rouletteBody)
            this.rouletteBody = null
        }
        this.createRouletteBody(rouletteGroup, rouletteModel)
    }

    createCubeBody(worldPos, worldQuat, colliderSize) {
        if (!this.world) return null
        
        const halfExtents = new CANNON.Vec3(colliderSize * 0.48, colliderSize * 0.48, colliderSize * 0.48)
        const boxShape = new CANNON.Box(halfExtents)
        
        const body = new CANNON.Body({
            mass: 1, // Dynamic
            position: new CANNON.Vec3(worldPos.x, worldPos.y, worldPos.z),
            quaternion: new CANNON.Quaternion(worldQuat.x, worldQuat.y, worldQuat.z, worldQuat.w),
            material: this.defaultMaterial
        })
        
        if (this.physicsParams.ccdEnabled) {
            body.ccdSpeedThreshold = 0.001
            body.ccdIterations = 10
        }
        
        body.addShape(boxShape)
        this.world.addBody(body)
        
        return body
    }

    setCubeNoSelfCollision(body) {
        if (!body || !this.world) return
        // Cannon collision filter groups
        body.collisionFilterGroup = 2
        body.collisionFilterMask = ~2 // Collide with everything except group 2
    }

    update() {
        if (!this.world) return
        
        if (this.rouletteBody && this.rouletteModel) {
            this.rouletteModel.updateMatrixWorld(true)
            const pos = new THREE.Vector3()
            const quat = new THREE.Quaternion()
            const scale = new THREE.Vector3()
            this.rouletteModel.matrixWorld.decompose(pos, quat, scale)
            
            this.rouletteBody.position.copy(pos)
            this.rouletteBody.quaternion.copy(quat)
        }

        // Step physics
        this.world.step(1 / 60, this.time.delta / 1000, 3)
        
        if (this.physicsParams.debugRender && this.cannonDebugger) {
            this.cannonDebugger.update()
        }
    }
}

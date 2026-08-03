import * as THREE from 'three'

const dummy = new THREE.Object3D()

export default class ColorBin {
    constructor(instanceIndex, colorIndex, color, capacity) {
        this.instanceIndex = instanceIndex
        this.colorIndex = colorIndex
        this.capacity = capacity
        this.color = color
        this.currentCount = 0
        this.assignedCount = 0
        
        this.position = new THREE.Vector3()
        this.targetPosition = new THREE.Vector3()
        this.rotationX = 0
        this.shadowOffsetX = 0
        this.shadowY = 0
        this.shadowOffsetZ = 0
        this.shadowScale = new THREE.Vector3(1, 1, 1)
        this.visible = true

        this.matrix = new THREE.Matrix4()
        this.shadowMatrix = new THREE.Matrix4()

        const canvas = document.createElement('canvas')
        canvas.width = 512
        canvas.height = 256
        this.canvasContext = canvas.getContext('2d')
        this.labelTexture = new THREE.CanvasTexture(canvas)
        
        const material = new THREE.MeshBasicMaterial({ map: this.labelTexture, transparent: true })
        const geometry = new THREE.PlaneGeometry(1, 1)
        this.labelMesh = new THREE.Mesh(geometry, material)
        
        this.updateLabelText()
        
        if (document.fonts) {
            document.fonts.ready.then(() => {
                this.updateLabelText()
            })
        }
    }

    updateLabelText() {
        const percent = Math.floor((this.currentCount / this.capacity) * 100)
        this.canvasContext.fillStyle = 'black'
        this.canvasContext.fillRect(0, 0, 512, 256)
        this.canvasContext.fillStyle = 'white'
        this.canvasContext.font = 'normal 150px "LilitaOne"'
        this.canvasContext.textAlign = 'center'
        this.canvasContext.textBaseline = 'middle'
        
        const text = `${percent}%`
        
        // Visually thin the bold font by drawing a black outline over it
        this.canvasContext.lineWidth = 8
        this.canvasContext.strokeStyle = 'black'
        this.canvasContext.strokeText(text, 256, 128)
        
        // Fill the white text
        this.canvasContext.fillText(text, 256, 128)
        this.labelTexture.needsUpdate = true
    }

    setPosition(x, y, z, immediate = false) {
        this.targetPosition.set(x, y, z)
        if (immediate) {
            this.position.copy(this.targetPosition)
        }
    }

    setShadowY(y) {
        this.shadowY = y
    }

    setShadowScale(x, y, z) {
        this.shadowScale.set(x, y, z)
    }

    setRotationX(rotX) {
        this.rotationX = rotX
    }

    setVisible(visible) {
        this.visible = visible
        if (this.labelMesh) this.labelMesh.visible = visible
    }

    updateMatrices() {
        if (this.visible) {
            dummy.position.copy(this.position)
            dummy.rotation.x = this.rotationX
            dummy.scale.set(1, 1, 1)
            dummy.updateMatrix()
            this.matrix.copy(dummy.matrix)

            dummy.rotation.x = this.rotationX
            dummy.position.x = this.position.x + this.shadowOffsetX
            dummy.position.y = this.shadowY
            dummy.position.z = this.position.z + this.shadowOffsetZ
            dummy.scale.copy(this.shadowScale)
            dummy.updateMatrix()
            this.shadowMatrix.copy(dummy.matrix)
        } else {
            dummy.scale.set(0, 0, 0)
            dummy.updateMatrix()
            this.matrix.copy(dummy.matrix)
            this.shadowMatrix.copy(dummy.matrix)
        }
    }
}

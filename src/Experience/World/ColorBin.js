import * as THREE from 'three'

const dummy = new THREE.Object3D()

export default class ColorBin {
    constructor(instanceIndex, colorIndex, color, capacity) {
        this.instanceIndex = instanceIndex
        this.colorIndex = colorIndex
        this.capacity = capacity
        this.color = color
        
        this.position = new THREE.Vector3()
        this.rotationX = 0
        this.shadowOffsetX = 0
        this.shadowY = 0
        this.shadowOffsetZ = 0
        this.shadowScale = new THREE.Vector3(1, 1, 1)
        this.visible = true

        this.matrix = new THREE.Matrix4()
        this.shadowMatrix = new THREE.Matrix4()
    }

    setPosition(x, y, z) {
        this.position.set(x, y, z)
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
    }

    updateMatrices() {
        if (this.visible) {
            dummy.position.copy(this.position)
            dummy.rotation.x = this.rotationX
            dummy.scale.set(1, 1, 1)
            dummy.updateMatrix()
            this.matrix.copy(dummy.matrix)

            dummy.rotation.x = 0
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

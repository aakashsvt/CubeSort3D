import * as THREE from 'three'

export default class AnimatedRoutingStrategy {
    constructor() {
        this.duration = 0.35
        this.arcHeight = 1.0
    }

    startRouting(item, startPos, targetPos) {
        item.isRouting = true
        item.routeProgress = 0
        item.startPos = startPos.clone()
        item.targetPos = targetPos.clone()
        
        item.midPos = new THREE.Vector3().lerpVectors(item.startPos, item.targetPos, 0.5)
        item.midPos.y += this.arcHeight
        
        item.rotX = 0
        item.rotY = 0
    }

    update(item, dt, dummy, instancedMesh) {
        item.routeProgress += dt / this.duration
        
        if (item.routeProgress >= 1) {
            dummy.scale.set(0, 0, 0)
            dummy.updateMatrix()
            instancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
            return true
        }
        
        const t = item.routeProgress
        const u = 1 - t
        const tt = t * t
        const uu = u * u
        
        const p = new THREE.Vector3()
        p.x = uu * item.startPos.x + 2 * u * t * item.midPos.x + tt * item.targetPos.x
        p.y = uu * item.startPos.y + 2 * u * t * item.midPos.y + tt * item.targetPos.y
        p.z = uu * item.startPos.z + 2 * u * t * item.midPos.z + tt * item.targetPos.z
        
        dummy.position.copy(p)
        
        item.rotX += dt * 10
        item.rotY += dt * 15
        dummy.rotation.set(item.rotX, item.rotY, 0)
        
        let scale = item.scaleFactor
        if (t > 0.8) {
            scale = THREE.MathUtils.lerp(item.scaleFactor, 0.1, (t - 0.8) / 0.2)
        }
        dummy.scale.set(scale, scale, scale)
        dummy.updateMatrix()
        instancedMesh.setMatrixAt(item.instanceId, dummy.matrix)
        
        return false
    }
}

import Experience from '../Experience.js'

export default class VoxelControls {
    constructor(targetGroup) {
        this.experience = new Experience()
        this.targetGroup = targetGroup
        this.debug = this.experience.debug

        this.touch = {
            active: false,
            previousX: 0,
            rotationSpeed: 5.0, // High number because we now normalize delta by screen width
            targetRotationY: 0,
            dampingFactor: 0.1
        }

        this.setDebug()
        this.setInteraction()
    }

    setDebug() {
        if (this.debug.active) {
            this.debugFolder = this.debug.ui.addFolder('voxelControls')
            this.debugFolder.add(this.touch, 'rotationSpeed').min(0).max(20).step(0.1).name('swipeSpeed')
            this.debugFolder.add(this.touch, 'dampingFactor').min(0.01).max(1).step(0.01).name('dampingFactor')
        }
    }

    setInteraction() {
        const canvas = this.experience.canvas

        const stopInteraction = () => {
            this.touch.active = false
        }

        // Pointer Events (works for both mouse and touch)
        canvas.addEventListener('pointerdown', (event) => {
            this.touch.active = true
            this.touch.previousX = event.clientX
        }, { passive: false })

        window.addEventListener('pointermove', (event) => {
            if (this.touch.active) {
                const deltaX = event.clientX - this.touch.previousX
                this.touch.previousX = event.clientX
                
                // Normalize by screen width so mobile and PC rotate the exact same amount
                const normalizedDelta = deltaX / window.innerWidth
                this.touch.targetRotationY += normalizedDelta * this.touch.rotationSpeed
            }
        }, { passive: false })

        window.addEventListener('pointerup', stopInteraction)
        window.addEventListener('pointerleave', stopInteraction)
        window.addEventListener('pointercancel', stopInteraction)
    }

    update() {
        if (this.targetGroup) {
            // Apply damping for smooth momentum feel
            this.targetGroup.rotation.y += (this.touch.targetRotationY - this.targetGroup.rotation.y) * this.touch.dampingFactor
        }
    }
}

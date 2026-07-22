import * as THREE from 'three'
import Experience from './Experience.js'

export default class Camera
{
    constructor()
    {
        this.experience = new Experience()
        this.sizes = this.experience.sizes
        this.scene = this.experience.scene
        this.canvas = this.experience.canvas
        this.debug = this.experience.debug

        this.setInstance()
        this.setDebug()
    }

    setDebug()
    {
        if (this.debug.active)
        {
            this.debugFolder = this.debug.ui.addFolder('camera')
            this.debugFolder.add(this.instance.position, 'x').min(-50).max(50).step(0.1).name('positionX')
            
            this.debugFolder.add(this.instance.position, 'y').min(-50).max(50).step(0.1).name('positionY')
            
            this.debugFolder.add(this.instance.position, 'z').min(-50).max(50).step(0.1).name('positionZ')
            
            this.debugFolder.add(this.instance.rotation, 'x').min(-Math.PI).max(Math.PI).step(0.01).name('rotationX')
        }
    }

    setInstance()
    {
        this.instance = new THREE.PerspectiveCamera(35, this.sizes.width / this.sizes.height, 0.1, 100)
        this.instance.position.set(0.00, 5.80, 16.00)
        this.instance.rotation.x = -0.25
        this.scene.add(this.instance)
    }

    resize()
    {
        this.instance.aspect = this.sizes.width / this.sizes.height
        this.instance.updateProjectionMatrix()
    }

    update()
    {
        // Removed controls.update()
    }
}
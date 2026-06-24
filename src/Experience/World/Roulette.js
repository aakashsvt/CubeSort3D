import * as THREE from 'three'
import Experience from '../Experience.js'

export default class Roulette
{
    constructor()
    {
        this.experience = new Experience()
        this.scene = this.experience.scene
        this.resources = this.experience.resources
        this.time = this.experience.time
        
        // Speed in radians per second (e.g., 2 is about 1/3 of a full rotation every second)
        this.speed = 2

        // Reference to the loaded GLTF resource
        this.resource = this.resources.items.rouletteModel

        this.setModel()
    }

    setModel()
    {
        this.model = this.resource.scene

        // Traverse the model to enable shadows on all its meshes
        this.model.traverse((child) =>
        {
            if(child instanceof THREE.Mesh)
            {
                child.castShadow = true
                child.receiveShadow = true
                // Note: The environment map will be automatically applied to these meshes 
                // by the Environment class when we call updateMaterials() in World.js
            }
        })

        // Restore custom position and scale
        this.model.position.set(0, -2.5, 0)
        this.model.scale.set(1.5, 1.5, 1.5)

        // Add it to the scene
        this.scene.add(this.model)
    }

    update()
    {
        // Rotate the roulette counter-clockwise along the Y-axis
        if(this.model)
        {
            // time.delta is in milliseconds. Divide by 1000 to get seconds, 
            // then multiply by your readable speed!
            this.model.rotation.y += (this.time.delta / 1000) * this.speed 
        }
    }
}

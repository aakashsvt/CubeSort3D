import GUI from 'lil-gui'
import Stats from 'three/examples/jsm/libs/stats.module.js'

export default class Debug
{
    constructor()
    {
        this.active = window.location.hash === '#debug'

        if(this.active)
        {
            this.ui = new GUI()

            // Initialize FPS checker (Stats)
            this.stats = new Stats()
            this.stats.showPanel(0) // 0: fps, 1: ms, 2: mb, 3+: custom
            document.body.appendChild(this.stats.dom)

            // Add toggle folder for FPS stats
            this.statsFolder = this.ui.addFolder('FPS Counter')
            this.debugSettings = {
                showFPS: true
            }
            this.statsFolder
                .add(this.debugSettings, 'showFPS')
                .name('Show FPS')
                .onChange((visible) => {
                    this.stats.dom.style.display = visible ? 'block' : 'none'
                })
        }
    }

    update()
    {
        if(this.stats)
        {
            this.stats.update()
        }
    }

    destroy()
    {
        if(this.ui)
        {
            this.ui.destroy()
        }
        if(this.stats)
        {
            this.stats.dom.remove()
        }
    }
}
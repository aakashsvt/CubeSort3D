export default class LoadingScreen {
    constructor(experience) {
        this.experience = experience;
        
        // Create HTML elements
        this.container = document.createElement('div');
        this.container.classList.add('loading-screen');
        
        this.barContainer = document.createElement('div');
        this.barContainer.classList.add('loading-bar-container');
        
        this.bar = document.createElement('div');
        this.bar.classList.add('loading-bar');
        
        this.barContainer.appendChild(this.bar);
        this.container.appendChild(this.barContainer);
        document.body.appendChild(this.container);
        
        // Initialize bar width based on current progress
        this.updateBar();

        // Listen to resource progress
        this.experience.resources.on('progress', () => {
            this.updateBar();
        });
        
        this.experience.resources.on('ready', () => {
            this.updateBar();
            // Fade out and remove
            this.container.style.opacity = '0';
            setTimeout(() => {
                this.container.remove();
            }, 500); // Wait for CSS transition
        });
    }

    updateBar() {
        const toLoad = this.experience.resources.toLoad;
        const loaded = this.experience.resources.loaded;
        const progress = toLoad > 0 ? loaded / toLoad : 1;
        this.bar.style.width = `${progress * 100}%`;
    }
}

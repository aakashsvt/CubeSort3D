export default class LoadingScreen {
    constructor(experience) {
        this.experience = experience;
        
        // Find existing HTML elements from index.html
        this.container = document.querySelector('.loading-screen');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.classList.add('loading-screen');
            document.body.appendChild(this.container);
        }
        
        this.barContainer = this.container.querySelector('.loading-bar-container');
        if (!this.barContainer) {
            this.barContainer = document.createElement('div');
            this.barContainer.classList.add('loading-bar-container');
            this.container.appendChild(this.barContainer);
        }
        
        this.bar = this.container.querySelector('.loading-bar');
        if (!this.bar) {
            this.bar = document.createElement('div');
            this.bar.classList.add('loading-bar');
            this.barContainer.appendChild(this.bar);
        }
        
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

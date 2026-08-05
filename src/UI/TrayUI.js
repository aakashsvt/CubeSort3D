import * as THREE from 'three';

export default class TrayUI {
    constructor() {
        // UI overlay initialized when needed
    }

    showLevelFailedUI() {
        if (this.failOverlay) return;

        this.failOverlay = document.createElement('div');
        this.failOverlay.className = 'level-fail-overlay';
        
        const banner = document.createElement('div');
        banner.className = 'level-fail-banner';
        banner.innerText = 'FAILED';
        
        const retryBtn = document.createElement('button');
        retryBtn.className = 'level-fail-retry-btn';
        retryBtn.innerText = 'RETRY';
        let isRetryClicked = false;
        retryBtn.onclick = () => {
            if (isRetryClicked) return;
            isRetryClicked = true;
            retryBtn.innerText = 'LOADING...';
            retryBtn.style.opacity = '0.7';
            retryBtn.style.cursor = 'wait';
            if (window.experience && window.experience.world && window.experience.world.levelManager) {
                setTimeout(() => {
                    window.experience.world.levelManager.retryLevel();
                }, 50);
            }
        };
        
        this.failOverlay.appendChild(banner);
        this.failOverlay.appendChild(retryBtn);
        document.body.appendChild(this.failOverlay);
        
        // Force reflow
        void this.failOverlay.offsetWidth;
        this.failOverlay.classList.add('visible');
    }

    showLevelCompleteUI(levelNumber = 1) {
        if (this.completeOverlay) return;

        this.completeOverlay = document.createElement('div');
        this.completeOverlay.className = 'level-complete-overlay';
        
        const header = document.createElement('div');
        header.className = 'level-complete-header';
        header.innerText = `LEVEL ${levelNumber}`;
        
        const banner = document.createElement('div');
        banner.className = 'level-complete-banner';
        banner.innerText = 'SUCCESS!';
        
        const btnContainer = document.createElement('div');
        btnContainer.className = 'level-complete-btn-container';
        
        const nextBtn = document.createElement('button');
        nextBtn.className = 'level-complete-next-btn';
        nextBtn.innerText = 'NEXT LEVEL';
        let isNextClicked = false;
        nextBtn.onclick = () => {
            if (isNextClicked) return;
            isNextClicked = true;
            nextBtn.innerText = 'LOADING...';
            nextBtn.style.opacity = '0.7';
            nextBtn.style.cursor = 'wait';
            if (window.experience && window.experience.world && window.experience.world.levelManager) {
                setTimeout(() => {
                    window.experience.world.levelManager.loadNextLevel();
                }, 50);
            }
        };
        
        btnContainer.appendChild(nextBtn);
        
        this.completeOverlay.appendChild(header);
        this.completeOverlay.appendChild(banner);
        this.completeOverlay.appendChild(btnContainer);
        document.body.appendChild(this.completeOverlay);
        
        // Force reflow
        void this.completeOverlay.offsetWidth;
        this.completeOverlay.classList.add('visible');
    }
}

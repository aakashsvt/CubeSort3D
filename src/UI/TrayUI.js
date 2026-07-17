import * as THREE from 'three';

export default class TrayUI {
    constructor() {
        this.createCounterUI();
    }

    createCounterUI() {
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'tray-counter-wrapper';
        
        this.circle = document.createElement('div');
        this.circle.className = 'tray-counter-circle';
        
        this.currentCountEl = document.createElement('div');
        this.currentCountEl.className = 'tray-counter-current';
        this.currentCountEl.innerText = '0';
        
        const divider = document.createElement('div');
        divider.className = 'tray-counter-divider';
        
        this.maxCountEl = document.createElement('div');
        this.maxCountEl.className = 'tray-counter-max';
        
        this.circle.appendChild(this.currentCountEl);
        this.circle.appendChild(divider);
        this.circle.appendChild(this.maxCountEl);
        
        this.warningEl = document.createElement('div');
        this.warningEl.className = 'tray-counter-warning';
        
        this.wrapper.appendChild(this.circle);
        this.wrapper.appendChild(this.warningEl);
        
        document.body.appendChild(this.wrapper);
    }

    updateCounter(currentCount, maxCapacity, isOverCapacity) {
        this.currentCountEl.innerText = currentCount.toString();
        this.maxCountEl.innerText = maxCapacity.toString();
        
        const progressPct = Math.min(100, (currentCount / maxCapacity) * 100);
        this.circle.style.setProperty('--progress', `${progressPct}%`);
        
        if (isOverCapacity) {
            this.circle.classList.add('over-capacity');
        } else {
            this.circle.classList.remove('over-capacity');
            this.warningEl.innerHTML = '';
        }
    }

    setWarningText(text) {
        this.warningEl.innerHTML = text;
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
        retryBtn.onclick = () => {
            if (window.experience && window.experience.world && window.experience.world.levelManager) {
                window.experience.world.levelManager.retryLevel();
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
        nextBtn.onclick = () => {
            if (window.experience && window.experience.world && window.experience.world.levelManager) {
                window.experience.world.levelManager.loadNextLevel();
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

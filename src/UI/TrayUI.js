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
            window.location.reload();
        };
        
        this.failOverlay.appendChild(banner);
        this.failOverlay.appendChild(retryBtn);
        document.body.appendChild(this.failOverlay);
        
        // Force reflow
        void this.failOverlay.offsetWidth;
        this.failOverlay.classList.add('visible');
    }
}

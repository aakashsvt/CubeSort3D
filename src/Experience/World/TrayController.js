export default class TrayController {
    constructor(binManager) {
        this.failTimer = 0;
        this.isTimerActive = false;
        this.overCapacityFailDelay = 3.0;
        this.levelEnded = false;
        this.overCapacityWarningStarted = false;

        const levelData = binManager?.resources?.items?.levelData || {};
        const dashboard = levelData.dashboard || {};
        this.maxTrayCapacity = dashboard.trayCapacityCubes || 50;

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
        this.maxCountEl.innerText = this.maxTrayCapacity.toString();
        
        this.circle.appendChild(this.currentCountEl);
        this.circle.appendChild(divider);
        this.circle.appendChild(this.maxCountEl);
        
        this.warningEl = document.createElement('div');
        this.warningEl.className = 'tray-counter-warning';
        
        this.wrapper.appendChild(this.circle);
        this.wrapper.appendChild(this.warningEl);
        
        document.body.appendChild(this.wrapper);
    }

    update(dt, cubeManager) {
        if (!cubeManager) return;
        
        let currentCount = cubeManager.getActiveTrayCubeCount();
        
        if (!this.levelEnded) {
            const isOverCapacity = currentCount > this.maxTrayCapacity;
            
            this.currentCountEl.innerText = currentCount.toString();
            
            if (isOverCapacity) {
                this.circle.classList.add('over-capacity');
                let activeFalling = cubeManager.hasActiveFallingCubes();

                if (!this.overCapacityWarningStarted && activeFalling) {
                    this.failTimer = 0;
                } else {
                    if (!this.isTimerActive) {
                        this.isTimerActive = true;
                        this.failTimer = 0;
                    }
                    this.overCapacityWarningStarted = true;
                    this.failTimer += dt;
                    
                    if (this.failTimer >= this.overCapacityFailDelay) {
                        this.levelEnded = true;
                        console.log("[TrayController] Tray capacity exceeded. Level Failed.");
                        this.warningEl.innerHTML = `OVER CAPACITY!<br>LEVEL FAILED`;
                    } else {
                        this.warningEl.innerHTML = `WARNING:<br>OVER CAPACITY!`;
                    }
                }
            } else {
                this.circle.classList.remove('over-capacity');
                this.warningEl.innerHTML = '';
                this.overCapacityWarningStarted = false;
                this.isTimerActive = false;
                this.failTimer = 0;
            }
        }
    }
}

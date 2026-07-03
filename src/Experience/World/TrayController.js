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

        this.trayUiContainer = document.createElement('div');
        this.trayUiContainer.style.position = 'absolute';
        this.trayUiContainer.style.top = '10px';
        this.trayUiContainer.style.left = '10px';
        this.trayUiContainer.style.color = 'white';
        this.trayUiContainer.style.backgroundColor = 'rgba(0,0,0,0.6)';
        this.trayUiContainer.style.padding = '10px';
        this.trayUiContainer.style.fontFamily = 'monospace';
        this.trayUiContainer.style.fontSize = '16px';
        this.trayUiContainer.style.zIndex = '99999';
        this.trayUiContainer.style.pointerEvents = 'none';
        this.trayUiContainer.innerHTML = `Roulette Capacity: 0 / ${this.maxTrayCapacity}`;
        document.body.appendChild(this.trayUiContainer);
    }

    update(dt, cubeManager) {
        if (!cubeManager) return;
        
        let currentCount = cubeManager.getActiveTrayCubeCount();
        
        if (!this.levelEnded) {
            const isOverCapacity = currentCount > this.maxTrayCapacity;
            
            if (isOverCapacity) {
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
                        if (this.trayUiContainer) {
                            this.trayUiContainer.style.color = 'red';
                            this.trayUiContainer.innerHTML = `Roulette Capacity: ${currentCount} / ${this.maxTrayCapacity}<br><b>[OVER CAPACITY! LEVEL FAILED]</b>`;
                        }
                    } else {
                        if (this.trayUiContainer) {
                            this.trayUiContainer.style.color = 'red';
                            this.trayUiContainer.innerHTML = `Roulette Capacity: ${currentCount} / ${this.maxTrayCapacity}<br><b>[WARNING: OVER CAPACITY!]</b>`;
                        }
                    }
                }
            } else {
                this.overCapacityWarningStarted = false;
                this.isTimerActive = false;
                this.failTimer = 0;
                if (this.trayUiContainer) {
                    this.trayUiContainer.style.color = 'white';
                    this.trayUiContainer.innerHTML = `Roulette Capacity: ${currentCount} / ${this.maxTrayCapacity}`;
                }
            }
        }
    }
}

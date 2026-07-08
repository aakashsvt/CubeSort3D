import TrayUI from '../../UI/TrayUI.js';

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

        this.ui = new TrayUI();
        this.ui.maxCountEl.innerText = this.maxTrayCapacity.toString();
    }

    update(dt, cubeManager) {
        if (!cubeManager) return;
        
        let currentCount = cubeManager.getActiveTrayCubeCount();
        
        if (!this.levelEnded) {
            const isOverCapacity = currentCount > this.maxTrayCapacity;
            this.ui.updateCounter(currentCount, this.maxTrayCapacity, isOverCapacity);
            
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
                        this.ui.setWarningText('');
                        this.ui.showLevelFailedUI();
                    } else {
                        // this.ui.setWarningText(`WARNING:<br>OVER CAPACITY!`);
                    }
                }
            } else {
                this.overCapacityWarningStarted = false;
                this.isTimerActive = false;
                this.failTimer = 0;
            }
        }
    }
}

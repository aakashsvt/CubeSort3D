export default class WarningUI {
    constructor() {
        this.popup = document.createElement('div');
        this.popup.className = 'settle-warning-popup';
        this.popup.innerText = 'WAIT FOR CUBES TO SETTLE';
        document.body.appendChild(this.popup);
        this.timeout = null;
    }

    show() {
        // Force reflow so CSS transition can re-trigger if needed
        void this.popup.offsetWidth;
        this.popup.classList.add('visible');
        
        if (this.timeout) clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            this.popup.classList.remove('visible');
        }, 1500);
    }
}

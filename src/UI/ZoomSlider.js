export default class ZoomSlider {
    constructor(experience) {
        this.experience = experience;
        this.track = document.querySelector('.slider-track');
        this.thumb = document.querySelector('.slider-thumb');
        this.topBackground = document.querySelector('.slider-top');
        this.bottomBackground = document.querySelector('.slider-bottom');
        
        if (!this.track || !this.thumb) return;

        this.isDragging = false;
        this.currentPercent = 50; // Default to middle
        this.minScale = 0.295;
        this.maxScale = 0.375;

        this.bindEvents();
        this.updateUI();
    }

    bindEvents() {
        // Bind context to event handlers to preserve 'this'
        this.onPointerDown = this.onPointerDown.bind(this);
        this.onPointerMove = this.onPointerMove.bind(this);
        this.onPointerUp = this.onPointerUp.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);

        this.track.addEventListener('pointerdown', this.onPointerDown);
        this.track.addEventListener('touchstart', (e) => {
            e.preventDefault(); // Prevent double firing with pointerdown
            this.onPointerDown(e);
        }, { passive: false });
    }

    updateScale() {
        const scale = this.minScale + ((100 - this.currentPercent) / 100) * (this.maxScale - this.minScale);
        
        // Safely traverse down to the voxel container using optional chaining
        const voxelContainer = this.experience.world?.voxelLevel?.container;
        if (voxelContainer) {
            voxelContainer.scale.set(scale, scale, scale);
        }
    }

    updateUI() {
        this.thumb.style.top = `${this.currentPercent}%`;
        
        if (this.topBackground && this.bottomBackground) {
            this.topBackground.style.height = `${this.currentPercent}%`;
            this.bottomBackground.style.height = `${100 - this.currentPercent}%`;
        }
        
        this.updateScale();
    }

    handleEventUpdate(e) {
        const rect = this.track.getBoundingClientRect();
        const clientY = e.clientY ?? (e.touches?.length > 0 ? e.touches[0].clientY : 0);
        
        // Clamp the Y position strictly inside the track bounds
        const y = Math.max(0, Math.min(clientY - rect.top, rect.height));
        this.currentPercent = (y / rect.height) * 100;
        
        this.updateUI();
    }

    onPointerDown(e) {
        this.isDragging = true;
        this.handleEventUpdate(e);
        
        // Attach move and up events to window for seamless dragging outside the element
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.onPointerUp);
        window.addEventListener('touchmove', this.onTouchMove, { passive: false });
        window.addEventListener('touchend', this.onPointerUp);
        
        this.track.style.cursor = 'grabbing';
        this.thumb.style.cursor = 'grabbing';
    }

    onPointerMove(e) {
        if (this.isDragging) {
            this.handleEventUpdate(e);
        }
    }

    onTouchMove(e) {
        if (this.isDragging) {
            e.preventDefault(); // Prevent mobile scrolling while sliding
            this.handleEventUpdate(e);
        }
    }

    onPointerUp() {
        this.isDragging = false;
        
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.onPointerUp);
        window.removeEventListener('touchmove', this.onTouchMove);
        window.removeEventListener('touchend', this.onPointerUp);
        
        this.track.style.cursor = 'pointer';
        this.thumb.style.cursor = 'pointer';
    }
}

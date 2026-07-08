import Experience from './Experience/Experience.js'

const experience = new Experience(document.querySelector('canvas.webgl'))

// UI Logic
const sliderTrack = document.querySelector('.slider-track');
const sliderThumb = document.querySelector('.slider-thumb');
const sliderTop = document.querySelector('.slider-top');
const sliderBottom = document.querySelector('.slider-bottom');

let isDragging = false;
let currentPercent = 50; // default middle

const updateZoom = (percent) => {
    // percent is 0 (top, +) to 100 (bottom, -)
    // Map percent inversely so dragging up (+) increases scale
    const minScale = 0.295; // even more reduced range
    const maxScale = 0.375; // even more reduced range
    const scale = minScale + ((100 - percent) / 100) * (maxScale - minScale);
    
    if(experience.world && experience.world.voxelLevel && experience.world.voxelLevel.container) {
        experience.world.voxelLevel.container.scale.set(scale, scale, scale);
    }
};

const updateSliderFromEvent = (e) => {
    const rect = sliderTrack.getBoundingClientRect();
    // Allow touch events as well
    const clientY = e.clientY ?? (e.touches && e.touches.length > 0 ? e.touches[0].clientY : 0);
    
    let y = clientY - rect.top;
    
    // clamp between 0 and rect.height
    y = Math.max(0, Math.min(y, rect.height));
    
    currentPercent = (y / rect.height) * 100;
    sliderThumb.style.top = `${currentPercent}%`;
    
    // Dynamically adjust track colors based on thumb position
    if(sliderTop && sliderBottom) {
        sliderTop.style.height = `${currentPercent}%`;
        sliderBottom.style.height = `${100 - currentPercent}%`;
    }
    
    updateZoom(currentPercent);
};

const onPointerDown = (e) => {
    isDragging = true;
    updateSliderFromEvent(e);
    
    // Use pointer events for seamless mouse/touch tracking outside the element
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    
    // Fallback for older mobile browsers just in case
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onPointerUp);
    
    sliderTrack.style.cursor = 'grabbing';
    sliderThumb.style.cursor = 'grabbing';
};

const onPointerMove = (e) => {
    if (!isDragging) return;
    updateSliderFromEvent(e);
};

const onTouchMove = (e) => {
    if (!isDragging) return;
    e.preventDefault(); // Prevent scrolling while dragging slider
    updateSliderFromEvent(e);
};

const onPointerUp = () => {
    isDragging = false;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onPointerUp);
    
    sliderTrack.style.cursor = 'pointer';
    sliderThumb.style.cursor = 'pointer';
};

// Listen for both pointerdown and touchstart for max compatibility
if(sliderTrack) {
    sliderTrack.addEventListener('pointerdown', onPointerDown);
    sliderTrack.addEventListener('touchstart', (e) => {
        e.preventDefault(); // prevent double firing with pointerdown
        onPointerDown(e);
    }, { passive: false });

    // Initialize
    sliderThumb.style.top = `${currentPercent}%`;
    updateZoom(currentPercent);
}
import * as THREE from 'three'
import Experience from '../Experience.js'

export const SYNTH_VOLUMES = {
    tap: 1.0,
    fall: 0.3,
    collect: 0.15,   
    binFilled: 0.5
}

export default class AudioManager {
    constructor() { 
        this.experience = new Experience()
        this.camera = this.experience.camera.instance
        this.listener = new THREE.AudioListener()
        this.camera.add(this.listener)

        this.sounds = new Map()

        this.masterVolume = 1
        this.muted = false

        this.maxPositional = 64
        this.currentPositionalCount = 0

        // Resume audio on first user interaction (mobile autoplay policy)
        window.addEventListener('pointerdown', () => this.resumeAudioContext(), { once: true })
    }

    /** Resume audio context (mobile + browser autoplay policy) */
    resumeAudioContext() {
        const ctx = this.listener.context
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
            ctx.resume()
        }
    }

    /**
     * Create a sound entry from a preloaded AudioBuffer
     * @param {string} id unique id
     * @param {object} options
     *   - buffer: AudioBuffer (from Resources)
     *   - type: 'global' | 'positional'
     *   - volume, loop, refDistance, rolloffFactor
     */
    create(id, options = {}) {
        const { buffer, type = 'global', volume = 1, loop = false } = options

        if (!buffer) {
            console.warn(`AudioManager.create: Missing AudioBuffer for '${id}'`)
            return null
        }

        let audio
        if (type === 'positional') {
            if (this.currentPositionalCount >= this.maxPositional) {
                console.warn(`AudioManager: positional limit reached, fallback to global for '${id}'`)
                audio = new THREE.Audio(this.listener)
            } else {
                audio = new THREE.PositionalAudio(this.listener)
                audio.setRefDistance(options.refDistance ?? 20)
                audio.setRolloffFactor(options.rolloffFactor ?? 1)
                this.currentPositionalCount++
            }
        } else {
            audio = new THREE.Audio(this.listener)
        }

        audio.setBuffer(buffer)
        audio.setLoop(loop)
        audio.setVolume(volume)

        this.sounds.set(id, { audio, options })
        return audio
    }

    /** Attach positional audio to a 3D object */
    attach(id, object3d) {
        const entry = this.sounds.get(id)
        if (!entry) {
            console.warn(`AudioManager.attach: unknown id '${id}'`)
            return
        }
        object3d.add(entry.audio)
    }

    playSynthTap() {
        const ctx = this.listener.context
        if (ctx.state !== 'running') {
            ctx.resume()
        }

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        
        // Solid tap: very fast pitch drop creates a punchy "click" or "thud" (like hard plastic)
        osc.frequency.setValueAtTime(600, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.03)

        gain.gain.setValueAtTime(SYNTH_VOLUMES.tap, ctx.currentTime)
        // Extremely fast decay for a solid, tight tap (50ms total)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)

        osc.connect(gain)
        gain.connect(this.listener.getInput())

        osc.start()
        osc.stop(ctx.currentTime + 0.05)
    }

    playSynthFall() {
        const ctx = this.listener.context
        if (ctx.state !== 'running') return

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        // Bassy pop
        osc.frequency.setValueAtTime(400, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.05)

        gain.gain.setValueAtTime(SYNTH_VOLUMES.fall, ctx.currentTime) // reduced volume
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05)

        osc.connect(gain)
        gain.connect(this.listener.getInput())

        osc.start()
        osc.stop(ctx.currentTime + 0.05)
    }

    playSynthCollect() {
        const ctx = this.listener.context
        if (ctx.state !== 'running') return

        const osc = ctx.createOscillator()
        const gain = ctx.createGain()

        osc.type = 'sine'
        // Quick subtle lower pitched chirp for collecting a single cube
        osc.frequency.setValueAtTime(400, ctx.currentTime)
        osc.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + 0.08)

        gain.gain.setValueAtTime(SYNTH_VOLUMES.collect, ctx.currentTime) // reduced volume
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)

        osc.connect(gain)
        gain.connect(this.listener.getInput())

        osc.start()
        osc.stop(ctx.currentTime + 0.08)
    }

    playSynthBinFilled() {
        // Coin: Sharp Classic (Sine with instantaneous attack)
        const ctx = this.listener.context
        if (ctx.state !== 'running') return
        const now = ctx.currentTime
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        
        osc.frequency.setValueAtTime(987.77, now) // B5
        osc.frequency.setValueAtTime(1318.51, now + 0.06) // E6 (faster jump)
        
        gain.gain.setValueAtTime(SYNTH_VOLUMES.binFilled * 0.9, now) // instant attack
        gain.gain.setValueAtTime(SYNTH_VOLUMES.binFilled * 0.9, now + 0.06)
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
        
        osc.connect(gain)
        gain.connect(this.listener.getInput())
        osc.start(now)
        osc.stop(now + 0.4)
    }

    /** Play an existing sound */
    play(id, opts = {}) {
        const entry = this.sounds.get(id)
        if (!entry) return
        const { audio } = entry
        if (typeof opts.volume === 'number') audio.setVolume(opts.volume)
        if (typeof opts.loop === 'boolean') audio.setLoop(opts.loop)

        try {
            if (!audio.isPlaying) audio.play()
        } catch (err) {
            console.warn(`AudioManager.play error for '${id}':`, err)
        }
    }

    /** Stop a specific sound */
    stop(id) {
        const entry = this.sounds.get(id)
        if (!entry) return
        try {
            entry.audio.stop()
        } catch { /* ignore */ }
    }

    /** Stop all sounds */
    stopAll() {
        for (const [id, entry] of this.sounds) {
            try { entry.audio.stop() } catch { /* ignore */ }
        }
    }

    /** Set master volume (0–1) */
    setMasterVolume(v) {
        this.masterVolume = Math.max(0, Math.min(1, v))
        this.listener.setMasterVolume(this.masterVolume * (this.muted ? 0 : 1))
    }

    /** Mute/unmute all audio */
    setMuted(flag) {
        this.muted = !!flag
        this.listener.setMasterVolume(this.muted ? 0 : this.masterVolume)
    }

    /** Smooth fade a sound in/out */
    fade(id, { from = null, to = 0, duration = 1, onComplete = null } = {}) {
        const entry = this.sounds.get(id)
        if (!entry) return
        
        const audio = entry.audio
        const start = from ?? audio.getVolume()
        const target = Math.max(0, Math.min(1, to))
        
        if (from !== null) audio.setVolume(start)
        
        // Web Audio API built-in fading
        const gainNode = audio.gain
        gainNode.gain.cancelScheduledValues(audio.context.currentTime)
        gainNode.gain.setValueAtTime(start, audio.context.currentTime)
        gainNode.gain.linearRampToValueAtTime(target, audio.context.currentTime + duration)

        if (onComplete) {
            setTimeout(onComplete, duration * 1000)
        }
    }

    /** Completely remove a sound */
    dispose(id) {
        const entry = this.sounds.get(id)
        if (!entry) return
        try { entry.audio.stop() } catch { /* ignore */ }
        if (entry.audio.isPositionalAudio) this.currentPositionalCount--
        this.sounds.delete(id)
    }

    /** Get THREE.Audio or THREE.PositionalAudio instance */
    get(id) {
        const entry = this.sounds.get(id)
        return entry ? entry.audio : null
    }
}

import * as THREE from 'three'
import Experience from '../Experience.js'

export const SYNTH_VOLUMES = {
    tap: 1.0,
    fall: 0.3,
    collect: 0.3,   
    binFilled: 0.2
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
        const ctx = this.listener.context
        if (ctx.state !== 'running') return

        const now = ctx.currentTime

        // "Ti" - short first note
        const osc1 = ctx.createOscillator()
        const gain1 = ctx.createGain()
        osc1.type = 'sine'
        osc1.frequency.setValueAtTime(900, now)
        gain1.gain.setValueAtTime(SYNTH_VOLUMES.binFilled, now)
        gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1)
        
        osc1.connect(gain1)
        gain1.connect(this.listener.getInput())
        osc1.start(now)
        osc1.stop(now + 0.15)

        // "Dingggggg" - higher second note that rings out
        const osc2 = ctx.createOscillator()
        const gain2 = ctx.createGain()
        osc2.type = 'sine'
        osc2.frequency.setValueAtTime(1200, now + 0.1)
        
        gain2.gain.setValueAtTime(0, now)
        gain2.gain.setValueAtTime(SYNTH_VOLUMES.binFilled, now + 0.1)
        gain2.gain.exponentialRampToValueAtTime(0.01, now + 1.2)
        
        osc2.connect(gain2)
        gain2.connect(this.listener.getInput())
        osc2.start(now + 0.1)
        osc2.stop(now + 1.2)

        // Add a faint high-pitched metallic overtone for the "ding"
        const osc3 = ctx.createOscillator()
        const gain3 = ctx.createGain()
        osc3.type = 'triangle'
        osc3.frequency.setValueAtTime(2400, now + 0.1)
        
        gain3.gain.setValueAtTime(0, now)
        gain3.gain.setValueAtTime(0.2, now + 0.1)
        gain3.gain.exponentialRampToValueAtTime(0.01, now + 1.0)
        
        osc3.connect(gain3)
        gain3.connect(this.listener.getInput())
        osc3.start(now + 0.1)
        osc3.stop(now + 1.2)
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

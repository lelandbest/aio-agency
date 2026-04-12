/**
 * Audio Service for AIO CRM VoIP System
 * Provides DTMF tones, dial tones, busy signals, and ringers using Web Audio API.
 */

let audioCtx = null;
let activeLoop = null;

const getCtx = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
};

const stopActiveLoop = () => {
    if (activeLoop) {
        activeLoop.stop();
        activeLoop = null;
    }
};

/**
 * Plays a DTMF tone for a specific digit.
 * @param {string} digit - The digit (0-9, *, #)
 * @param {string} style - The sound style (military, retro, etc.)
 */
export const playDigitTone = (digit, style = 'military') => {
    const ctx = getCtx();
    const now = ctx.currentTime;

    // DTMF Frequencies
    const dtmfFreqs = {
        '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
        '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
        '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
        '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
    };

    const freqs = dtmfFreqs[digit] || [350, 440]; // Fallback to dial tone freqs if digit invalid

    // Apply Style Logic
    if (style === 'military') {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(freqs[0], now);
        osc2.frequency.setValueAtTime(freqs[1], now);
        osc1.type = 'sine';
        osc2.type = 'sine';

        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.1);
        osc2.stop(now + 0.1);
    } else if (style === 'retro') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freqs[0], now);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
    } else {
        // Soft/Default
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freqs[0], now);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.15);
    }
};

/**
 * Plays a continuous dial tone.
 */
export const playDialTone = () => {
    stopActiveLoop();
    const ctx = getCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.frequency.setValueAtTime(350, now);
    osc2.frequency.setValueAtTime(440, now);
    osc1.type = 'sine';
    osc2.type = 'sine';

    gain.gain.setValueAtTime(0.05, now);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);

    activeLoop = {
        stop: () => {
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
            osc1.stop(ctx.currentTime + 0.2);
            osc2.stop(ctx.currentTime + 0.2);
        }
    };
};

/**
 * Plays a busy signal (beeping).
 */
export const playBusySignal = () => {
    stopActiveLoop();
    const ctx = getCtx();
    
    const playBeep = () => {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(480, now);
        osc2.frequency.setValueAtTime(620, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.setValueAtTime(0.1, now + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);
    };

    playBeep();
    const interval = setInterval(playBeep, 1000);

    activeLoop = {
        stop: () => {
            clearInterval(interval);
        }
    };
};

/**
 * Plays a ringer (long ring-ring pattern).
 */
export const playRinger = () => {
    stopActiveLoop();
    const ctx = getCtx();

    const playRing = () => {
        const now = ctx.currentTime;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.08, now + 1.95);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
    };

    playRing();
    const interval = setInterval(playRing, 6000);

    activeLoop = {
        stop: () => {
            clearInterval(interval);
        }
    };
};

export const stopAudio = () => {
    stopActiveLoop();
};

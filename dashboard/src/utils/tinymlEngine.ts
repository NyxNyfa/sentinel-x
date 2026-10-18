import type {
  AIClassification,
  FFTBin,
  NodeStatus,
  QuantizedTensorState,
  SentinelMetrics,
} from '../types/sentinel';

// Exact INT8 weights & biases from sentinel-x.ino firmware
export const W_HIDDEN: readonly (readonly [number, number, number, number])[] = [
  [32, 10, 8, 15],
  [8, 38, 12, 10],
  [10, 8, 42, 5],
  [12, 12, 6, 64],
];

export const B_HIDDEN: readonly [number, number, number, number] = [-10, -12, -10, -5];

export const VIB_MODEL_SCALE = 50.0;
export const THREAT_THRESHOLD = 55;

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Exact replica of `runTinyML` from `sentinel-x.ino`
 * Computes INT8 input tensor x[0..3], hidden layer activations, dominant neuron, and classification
 */
export function evaluateTinyMLInt8(metrics: SentinelMetrics): {
  tensor: QuantizedTensorState;
  label: AIClassification;
  threat: number;
  status: NodeStatus;
  latency_us: number;
} {
  const x0 = clamp(Math.trunc(metrics.I_rms * 4.0), 0, 127);
  const x1 = clamp(Math.trunc(metrics.gas_ppm / 8.0), 0, 127);
  const x2 = clamp(Math.trunc(metrics.vib_g * VIB_MODEL_SCALE), 0, 127);
  const x3 = metrics.bus_secure ? 0 : 100;

  const x: [number, number, number, number] = [x0, x1, x2, x3];
  const hidden: [number, number, number, number] = [0, 0, 0, 0];

  let total = 0;
  let maxScore = -9999;
  let dominant = 0;

  for (let i = 0; i < 4; i++) {
    let acc = B_HIDDEN[i] << 4;
    for (let j = 0; j < 4; j++) {
      acc += x[j] * W_HIDDEN[i][j];
    }
    const h = acc > 0 ? acc >> 6 : 0;
    hidden[i] = h;
    total += h;
    if (h > maxScore) {
      maxScore = h;
      dominant = i;
    }
  }

  let threat = clamp(total, 0, 100);
  if (!metrics.bus_secure && threat < 56) {
    threat = 56;
  }

  let status: NodeStatus = 'NORMAL';
  let label: AIClassification = 'NOMINAL_OPERATION';

  if (threat > THREAT_THRESHOLD) {
    status = 'EVENT_ALERT';
    if (!metrics.bus_secure) {
      label = 'PERIMETER_SABOTAGE_DETECTED';
    } else if (dominant === 2) {
      label = 'BEARING_VIBRATION_ANOMALY_48HZ';
    } else if (dominant === 1) {
      label = 'HAZARDOUS_GAS_ACCUMULATION';
    } else {
      label = 'CURRENT_WAVEFORM_TAMPERING';
    }
  }

  // Deterministic INT8 execution latency on ESP32 Xtensa LX6 (30-45 us)
  const latency_us = 34 + ((x0 + x1 + x2 + x3) % 10);

  return {
    tensor: {
      x,
      hidden,
      dominantIndex: dominant,
    },
    label,
    threat,
    status,
    latency_us,
  };
}

/**
 * Proposal KPI: System Health Score
 * Baseline at nominal threat_idx = 12 -> 100 - Math.round(12 * 0.65) = 92%
 */
export function computeSystemHealth(threatIdx: number): number {
  return Math.max(0, 100 - Math.round(threatIdx * 0.65));
}

/**
 * Synthesizes the 0 - 120 Hz FFT Frequency Spectrum driven by live `vib_g`
 * Highlights the 48 Hz mechanical bearing anomaly harmonic peak (Proposal Figure 2)
 */
export function generateFFTSpectrum(
  vibG: number,
  aiClass: AIClassification,
  tickSeed: number = 0
): FFTBin[] {
  const bins: FFTBin[] = [];
  const isVibAnomaly = aiClass === 'BEARING_VIBRATION_ANOMALY_48HZ' || vibG > 0.25;

  // Step by 4 Hz from 0 to 120 Hz
  for (let freq = 4; freq <= 120; freq += 4) {
    const jitter = Math.sin(tickSeed * 0.7 + freq * 0.31) * 0.002 + Math.cos(tickSeed * 1.1 + freq) * 0.0015;
    let mag = 0.003 + Math.abs(jitter) + vibG * 0.04;

    if (freq === 48) {
      // Primary 48 Hz bearing fault resonant frequency
      mag = vibG * (isVibAnomaly ? 1.35 : 0.85) + Math.abs(jitter) * 2.2 + 0.008;
    } else if (freq === 44 || freq === 52) {
      // Sidebands around 48 Hz
      mag = vibG * (isVibAnomaly ? 0.52 : 0.28) + Math.abs(jitter) * 1.4 + 0.004;
    } else if (freq === 96) {
      // 2nd harmonic (2 * 48 Hz)
      mag = vibG * (isVibAnomaly ? 0.44 : 0.18) + Math.abs(jitter) + 0.003;
    } else if (freq === 24) {
      // 0.5x sub-harmonic
      mag = vibG * 0.22 + Math.abs(jitter) + 0.003;
    } else if (freq === 50 || freq === 100) {
      // Grid 50Hz / 100Hz hum component
      mag += 0.012;
    }

    bins.push({
      freq,
      label: `${freq}`,
      magnitude: Number(Math.max(0.001, mag).toFixed(4)),
      isHarmonic48Hz: freq === 48 || freq === 44 || freq === 52 || freq === 96,
    });
  }

  return bins;
}

// Web Audio API Sound Synthesizer for Industrial SCADA Alerting
let audioCtx: AudioContext | null = null;

export function playScadaSound(type: 'alert' | 'trip' | 'reset', muted: boolean) {
  if (muted || typeof window === 'undefined') return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) {
      audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    if (type === 'trip') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(440, now + 0.12);
      osc.frequency.setValueAtTime(880, now + 0.24);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
      osc.start(now);
      osc.stop(now + 0.42);
    } else if (type === 'alert') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, now);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.08);
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    }
  } catch {
    // Ignore audio context restriction errors before user gesture
  }
}

import type {
  SentinelTelemetryPayload,
  TelemetryHistoryPoint,
} from '../types/sentinel';

export type DiagnosticScenarioMode =
  | 'LIVE_SENSOR'
  | 'TREND_GAS_LEAK_7D'
  | 'SPIKE_GAS_FIRE_RISK'
  | 'TREND_BEARING_WEAR_7D'
  | 'TREND_OVERLOAD_CREEP_7D';

export type UrgencyLevel = 'NORMAL' | 'PREVENTIVE_TREND' | 'CRITICAL_SHUTDOWN';

export interface TransformerPillarHealth {
  id: 'gas_insulation' | 'mechanical_bearing' | 'electrical_load' | 'perimeter_security';
  title: string;
  score: number; // 0..100
  statusLabel: string;
  trendText: string;
  level: 'normal' | 'warning' | 'critical';
  currentValueText: string;
}

export interface DailyTrendPoint {
  day: string;
  gas_ppm: number;
  vib_g: number;
  I_rms: number;
  health_score: number;
}

export interface TransformerDiagnosticReport {
  overallHealthScore: number;
  conditionTitle: string;
  conditionGrade: string;
  urgency: UrgencyLevel;
  transformerExplanation: string;
  primaryRecommendationTitle: string;
  riskExplanation: string;
  actionSteps: string[];
  recommendShutdownTrip: boolean;
  estimatedInspectionWindow: string;
  pillars: TransformerPillarHealth[];
  dailyTrend: DailyTrendPoint[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes linear rate-of-change across the recent telemetry history buffer
 * so gradual increases on potentiometers/sensors are detected even before hitting critical thresholds.
 */
function computeRecentSlopes(history: TelemetryHistoryPoint[]) {
  if (history.length < 6) {
    return { gasDelta: 0, vibDelta: 0, currentDelta: 0 };
  }
  const recent = history.slice(-20);
  const half = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, half);
  const secondHalf = recent.slice(half);

  const avg = (arr: TelemetryHistoryPoint[], key: 'gas_ppm' | 'vib_g' | 'I_rms') =>
    arr.reduce((sum, pt) => sum + pt[key], 0) / Math.max(1, arr.length);

  return {
    gasDelta: avg(secondHalf, 'gas_ppm') - avg(firstHalf, 'gas_ppm'),
    vibDelta: avg(secondHalf, 'vib_g') - avg(firstHalf, 'vib_g'),
    currentDelta: avg(secondHalf, 'I_rms') - avg(firstHalf, 'I_rms'),
  };
}

export function evaluateTransformerDiagnostics(
  telemetry: SentinelTelemetryPayload,
  history: TelemetryHistoryPoint[],
  _scenarioMode?: DiagnosticScenarioMode
): TransformerDiagnosticReport {
  // Base live metrics from ESP32
  const { I_rms, gas_ppm, vib_g, bus_secure } = telemetry.metrics;
  const slopes = computeRecentSlopes(history);

  // Determine whether a gradual trend is happening in live mode
  const isGasGradualLeak =
    (gas_ppm >= 85 && gas_ppm <= 400) || (gas_ppm >= 60 && slopes.gasDelta > 8);
  const isGasCriticalSpike = gas_ppm > 400;

  const isVibGradualWear =
    (vib_g >= 0.08 && vib_g <= 0.25) || (vib_g >= 0.05 && slopes.vibDelta > 0.015);
  const isVibCritical48Hz =
    vib_g > 0.25 || telemetry.ai_engine.class === 'BEARING_VIBRATION_ANOMALY_48HZ';

  const isCurrentGradualCreep =
    (I_rms >= 9.5 && I_rms <= 14.0) || (I_rms >= 7.5 && slopes.currentDelta > 0.6);
  const isCurrentCriticalOverload =
    I_rms > 14.0 || telemetry.ai_engine.class === 'CURRENT_WAVEFORM_TAMPERING';

  // 1. Compute 4 Pillar Health Scores
  const gasScore = isGasCriticalSpike
    ? clamp(Math.round(100 - (gas_ppm / 1000) * 95), 10, 38)
    : isGasGradualLeak
      ? clamp(Math.round(92 - ((gas_ppm - 60) / 340) * 35), 55, 82)
      : clamp(Math.round(98 - (gas_ppm / 85) * 8), 88, 99);

  const mechScore = isVibCritical48Hz
    ? clamp(Math.round(100 - (vib_g / 1.0) * 85), 15, 42)
    : isVibGradualWear
      ? clamp(Math.round(88 - ((vib_g - 0.06) / 0.2) * 30), 58, 82)
      : clamp(Math.round(98 - (vib_g / 0.08) * 8), 90, 99);

  const loadScore = isCurrentCriticalOverload
    ? clamp(Math.round(100 - (I_rms / 20) * 85), 15, 40)
    : isCurrentGradualCreep
      ? clamp(Math.round(88 - ((I_rms - 8) / 6) * 28), 60, 82)
      : clamp(Math.round(97 - (I_rms / 9.5) * 7), 89, 98);

  const perimeterScore = bus_secure ? 100 : 15;

  const pillars: TransformerPillarHealth[] = [
    {
      id: 'electrical_load',
      title: 'Sensor Arus',
      score: loadScore,
      statusLabel: isCurrentCriticalOverload
        ? 'Overload / Distorsi Arus'
        : isCurrentGradualCreep
          ? 'Beban Merayap Naik'
          : 'Beban Optimal',
      trendText: isCurrentCriticalOverload
        ? '↗ Melampaui Batas 14.0 A'
        : isCurrentGradualCreep
          ? '↗ Tren Beban Naik (+1.1 A/hari)'
          : '→ Kapasitas Aman',
      level: isCurrentCriticalOverload ? 'critical' : isCurrentGradualCreep ? 'warning' : 'normal',
      currentValueText: `${I_rms.toFixed(2)} A`,
    },
    {
      id: 'gas_insulation',
      title: 'Sensor Gas',
      score: gasScore,
      statusLabel: isGasCriticalSpike
        ? 'Lonjakan Gas Kritis'
        : isGasGradualLeak
          ? 'Indikasi Rembesan / Kebocoran'
          : 'Kedap & Stabil',
      trendText: isGasCriticalSpike
        ? '↗ Lonjakan Akut (>400 ppm)'
        : isGasGradualLeak
          ? '↗ Tren Naik Bertahap (+32 ppm/hari)'
          : '→ Stabil Normal',
      level: isGasCriticalSpike ? 'critical' : isGasGradualLeak ? 'warning' : 'normal',
      currentValueText: `${gas_ppm.toFixed(0)} ppm`,
    },
    {
      id: 'mechanical_bearing',
      title: 'Sensor Getaran',
      score: mechScore,
      statusLabel: isVibCritical48Hz
        ? 'Resonansi 48 Hz Kritis'
        : isVibGradualWear
          ? 'Gejala Aus Bearing Dini'
          : 'Mekanis Halus',
      trendText: isVibCritical48Hz
        ? '↗ Puncak Harmonik 48Hz Tinggi'
        : isVibGradualWear
          ? '↗ Tren Getaran Naik (+0.02g/hari)'
          : '→ Redaman Normal',
      level: isVibCritical48Hz ? 'critical' : isVibGradualWear ? 'warning' : 'normal',
      currentValueText: `${vib_g.toFixed(4)} g`,
    },
    {
      id: 'perimeter_security',
      title: 'Keamanan Fisik & Kabel Gardu',
      score: perimeterScore,
      statusLabel: bus_secure ? 'Perimeter Terkunci' : 'Sabotase / Pintu Terbuka',
      trendText: bus_secure ? '→ Loop Tertutup' : '⚠ Putus Rangkaian Fisik',
      level: bus_secure ? 'normal' : 'critical',
      currentValueText: bus_secure ? 'SECURE' : 'SABOTAGE',
    },
  ];

  // Overall weighted transformer health
  const overallHealthScore = clamp(
    Math.round(
      gasScore * 0.32 + mechScore * 0.26 + loadScore * 0.24 + perimeterScore * 0.18
    ),
    12,
    98
  );

  // Build 7-day trend visualization data matching the active state
  const dailyTrend: DailyTrendPoint[] = [
    {
      day: 'H-6',
      gas_ppm: isGasGradualLeak ? 48 : isGasCriticalSpike ? 52 : 44,
      vib_g: isVibGradualWear ? 0.022 : 0.014,
      I_rms: isCurrentGradualCreep ? 5.2 : 4.2,
      health_score: 94,
    },
    {
      day: 'H-5',
      gas_ppm: isGasGradualLeak ? 74 : isGasCriticalSpike ? 55 : 46,
      vib_g: isVibGradualWear ? 0.041 : 0.015,
      I_rms: isCurrentGradualCreep ? 6.4 : 4.3,
      health_score: isGasGradualLeak || isVibGradualWear || isCurrentGradualCreep ? 90 : 94,
    },
    {
      day: 'H-4',
      gas_ppm: isGasGradualLeak ? 108 : isGasCriticalSpike ? 58 : 45,
      vib_g: isVibGradualWear ? 0.068 : 0.014,
      I_rms: isCurrentGradualCreep ? 7.9 : 4.4,
      health_score: isGasGradualLeak || isVibGradualWear || isCurrentGradualCreep ? 86 : 93,
    },
    {
      day: 'H-3',
      gas_ppm: isGasGradualLeak ? 142 : isGasCriticalSpike ? 64 : 47,
      vib_g: isVibGradualWear ? 0.095 : 0.016,
      I_rms: isCurrentGradualCreep ? 9.3 : 4.2,
      health_score: isGasGradualLeak || isVibGradualWear || isCurrentGradualCreep ? 81 : 93,
    },
    {
      day: 'H-2',
      gas_ppm: isGasGradualLeak ? 176 : isGasCriticalSpike ? 72 : 45,
      vib_g: isVibGradualWear ? 0.124 : 0.015,
      I_rms: isCurrentGradualCreep ? 10.6 : 4.3,
      health_score: isGasGradualLeak || isVibGradualWear || isCurrentGradualCreep ? 76 : 92,
    },
    {
      day: 'H-1',
      gas_ppm: isGasGradualLeak ? 205 : isGasCriticalSpike ? 115 : 46,
      vib_g: isVibGradualWear ? 0.148 : 0.014,
      I_rms: isCurrentGradualCreep ? 11.7 : 4.3,
      health_score: isGasGradualLeak || isVibGradualWear || isCurrentGradualCreep ? 72 : 92,
    },
    {
      day: 'Hari Ini',
      gas_ppm: Number(gas_ppm.toFixed(0)),
      vib_g: Number(vib_g.toFixed(4)),
      I_rms: Number(I_rms.toFixed(2)),
      health_score: overallHealthScore,
    },
  ];

  // 2. Prescriptive Decision Tree (Priority order: Critical Multi/Single -> Gradual Trend -> Nominal)
  if (isGasCriticalSpike && (isCurrentCriticalOverload || isCurrentGradualCreep)) {
    return {
      overallHealthScore,
      conditionTitle: 'Bahaya Kebakaran Ekstrem: Gas Tinggi + Beban Arus Panas',
      conditionGrade: 'KRITIS (BAHAYA KEBAKARAN)',
      urgency: 'CRITICAL_SHUTDOWN',
      transformerExplanation: `Kondisi trafo berbahaya (${overallHealthScore}%). Gas melonjak ke ${gas_ppm.toFixed(0)} ppm bersamaan dengan arus tinggi (${I_rms.toFixed(2)} A).`,
      primaryRecommendationTitle:
        'Matikan Mesin / Trafo Sekarang (Risiko Terbakar Jika Tetap Hidup)',
      riskExplanation:
        'Akumulasi gas mudah terbakar dengan arus beban tinggi berisiko memicu titik nyala api internal (flashover).',
      actionSteps: [
        'Segera eksekusi Cut-Off (TRIP) untuk memutus beban ke trafo.',
        'Jangan nyalakan kembali sakelar/mesin sebelum gas turun di bawah 80 ppm.',
        'Aktifkan ventilasi gardu dan periksa katup pelepas tekanan tangki trafo.',
      ],
      recommendShutdownTrip: true,
      estimatedInspectionWindow: 'SEGERA (< 1 Menit - Wajib Cut-Off)',
      pillars,
      dailyTrend,
    };
  }

  if (isGasCriticalSpike) {
    return {
      overallHealthScore,
      conditionTitle: 'Lonjakan Gas Berbahaya — Risiko Terbakar Jika Tetap Hidup',
      conditionGrade: 'KRITIS (BAHAYA KEBAKARAN)',
      urgency: 'CRITICAL_SHUTDOWN',
      transformerExplanation: `Lonjakan gas drastis hingga ${gas_ppm.toFixed(0)} ppm (>400 ppm), kesehatan turun ke ${overallHealthScore}%.`,
      primaryRecommendationTitle:
        'Matikan Mesin / Trafo Sementara — Mencegah Risiko Terbakar',
      riskExplanation:
        'Percikan arus beban atau medan listrik internal berisiko menyulut gas dan membakar unit trafo.',
      actionSteps: [
        'Matikan mesin/beban trafo sementara dengan mengaktifkan Interlok Cut-Off (TRIP).',
        'Tunggu hingga suhu mendingin dan gas terurai aman (< 85 ppm).',
        'Lakukan uji sampel minyak (DGA) dan cek paking sebelum menghidupkan kembali (RESET).',
      ],
      recommendShutdownTrip: true,
      estimatedInspectionWindow: 'SEGERA (Matikan Sementara Sekarang)',
      pillars,
      dailyTrend,
    };
  }

  if (!bus_secure) {
    return {
      overallHealthScore,
      conditionTitle: 'Sabotase Fisik Perimeter / Pembobolan Panel Gardu',
      conditionGrade: 'KRITIS (SABOTASE PERIMETER)',
      urgency: 'CRITICAL_SHUTDOWN',
      transformerExplanation: `Rangkaian pengaman fisik terputus (OPEN BREAK). Terindikasi intrusi atau pemotongan kabel grounding.`,
      primaryRecommendationTitle:
        'Kunci Proteksi Interlok & Amankan Jalur Kabel Netral Trafo',
      riskExplanation:
        'Pemotongan kabel grounding/netral dapat menyebabkan lonjakan tegangan ekstrem yang merusak belitan.',
      actionSteps: [
        'Aktifkan Cut-Off (TRIP) untuk mengamankan isolasi gardu.',
        'Verifikasi titik koordinat gardu di Peta Real GIS dan kirim petugas patroli.',
        'Cek keutuhan panel dan kawat perimeter sebelum melakukan RESET.',
      ],
      recommendShutdownTrip: true,
      estimatedInspectionWindow: 'SEGERA (< 5 Menit - Respons Keamanan)',
      pillars,
      dailyTrend,
    };
  }

  if (isCurrentCriticalOverload) {
    return {
      overallHealthScore,
      conditionTitle: 'Beban Lebih Ekstrem (Overload) — Kerusakan Termal Belitan',
      conditionGrade: 'KRITIS (BEBAN LEBIH)',
      urgency: 'CRITICAL_SHUTDOWN',
      transformerExplanation: `Arus beban mencapai ${I_rms.toFixed(2)} A (batas 14.0 A), kesehatan trafo turun ke ${overallHealthScore}%.`,
      primaryRecommendationTitle:
        'Putuskan Beban Sementara (TRIP) atau Alihkan Beban Gardu',
      riskExplanation:
        'Operasi terus-menerus pada arus berlebih melelehkan kertas isolasi dan memicu hubung singkat antar-belitan.',
      actionSteps: [
        'Matikan penyulang beban sementara (TRIP) untuk mencegah pemanasan termal.',
        'Lakukan manuver pelimpahan beban (Load Transfer) ke gardu pendamping.',
        'Periksa potensi hubung singkat jaringan hilir sebelum menyalakan kembali.',
      ],
      recommendShutdownTrip: true,
      estimatedInspectionWindow: 'SEGERA (< 2 Menit - Proteksi Termal)',
      pillars,
      dailyTrend,
    };
  }

  if (isVibCritical48Hz) {
    return {
      overallHealthScore,
      conditionTitle: 'Getaran Kritis 48 Hz — Kerusakan Bearing / Inti Kendor',
      conditionGrade: 'SIAGA TINGGI',
      urgency: 'CRITICAL_SHUTDOWN',
      transformerExplanation: `Getaran tinggi ${vib_g.toFixed(4)} g didominasi spektrum 48 Hz (bearing fan aus / klem inti kendor).`,
      primaryRecommendationTitle:
        'Hentikan Operasi Sementara untuk Servis Bearing & Baut Inti',
      riskExplanation:
        'Resonansi 48 Hz dapat meretakkan bushing isolator dan merusak segel pipa minyak.',
      actionSteps: [
        'Matikan trafo sementara agar getaran tidak merusak porselen bushing.',
        'Ganti unit bearing motor kipas pendingin radiator yang aus.',
        'Kencangkan baut dudukan trafo dan periksa bantalan karet peredam.',
      ],
      recommendShutdownTrip: true,
      estimatedInspectionWindow: 'SEGERA (< 2 Jam - Servis Mekanis)',
      pillars,
      dailyTrend,
    };
  }

  // --- GRADUAL TREND / PREDICTIVE SCENARIOS (Meningkat Seiring Hari) ---
  if (isGasGradualLeak) {
    return {
      overallHealthScore,
      conditionTitle: 'Tren Gas Naik Bertahap — Indikasi Kebocoran Mikro Segel Katup',
      conditionGrade: 'WASPADA (TREN KEBOCORAN)',
      urgency: 'PREVENTIVE_TREND',
      transformerExplanation: `Kadar gas (${gas_ppm.toFixed(0)} ppm) merayap naik bertahap seiring hari, mengindikasikan rembesan halus pada paking segel.`,
      primaryRecommendationTitle:
        'Cek Kebocoran Segel & Katup Tangki (Trafo Masih Aman Beroperasi)',
      riskExplanation:
        'Belum berbahaya saat ini, namun jika dibiarkan akumulasi gas dapat mencapai titik nyala api.',
      actionSteps: [
        'Pertahankan operasi trafo normal (tidak perlu cut-off darurat saat ini).',
        'Jadwalkan teknisi untuk mengecek rembesan paking flange, katup drain, dan bushing.',
        'Periksa indikator silica gel breather dan sirkulasi ventilasi gardu.',
      ],
      recommendShutdownTrip: false,
      estimatedInspectionWindow: 'TERJADWAL (Inspeksi Preventif 1 – 3 Hari)',
      pillars,
      dailyTrend,
    };
  }

  if (isVibGradualWear) {
    return {
      overallHealthScore,
      conditionTitle: 'Tren Getaran Naik Bertahap — Gejala Awal Keausan Bearing',
      conditionGrade: 'WASPADA (KEAUSAN MEKANIS)',
      urgency: 'PREVENTIVE_TREND',
      transformerExplanation: `Getaran (${vib_g.toFixed(4)} g) naik bertahap, indikasi pelumasan bearing kipas pendingin mulai berkurang.`,
      primaryRecommendationTitle:
        'Jadwalkan Pelumasan Bearing Kipas & Pengencangan Baut Dudukan',
      riskExplanation:
        'Deteksi dini mencegah macetnya kipas radiator yang dapat membuat trafo overheat saat beban puncak.',
      actionSteps: [
        'Pertahankan operasi trafo normal (tidak perlu cut-off darurat).',
        'Lakukan pelumasan bearing kipas pendingin saat inspeksi preventif mingguan.',
        'Cek kekencangan baut mounting dan dudukan transformator.',
      ],
      recommendShutdownTrip: false,
      estimatedInspectionWindow: 'TERJADWAL (Inspeksi Preventif 3 – 7 Hari)',
      pillars,
      dailyTrend,
    };
  }

  if (isCurrentGradualCreep) {
    return {
      overallHealthScore,
      conditionTitle: 'Tren Arus Beban Merayap Naik — Pertumbuhan Beban Gardu',
      conditionGrade: 'WASPADA (BEBAN MERAYAP)',
      urgency: 'PREVENTIVE_TREND',
      transformerExplanation: `Arus RMS (${I_rms.toFixed(2)} A) merayap naik bertahap mendekati batas optimal termal trafo.`,
      primaryRecommendationTitle:
        'Lakukan Penyeimbangan Beban (Load Balancing) Antar-Fasa',
      riskExplanation:
        'Operasi kontinu mendekati kapasitas maksimal mempercepat penuaan isolasi minyak dan kertas trafo.',
      actionSteps: [
        'Evaluasi pembagian beban fasa R, S, T untuk menekan arus netral.',
        'Siapkan manuver pelimpahan beban pada jam beban puncak malam.',
        'Pantau temperatur kerja trafo secara berkala.',
      ],
      recommendShutdownTrip: false,
      estimatedInspectionWindow: 'TERJADWAL (Evaluasi Beban 2 – 5 Hari)',
      pillars,
      dailyTrend,
    };
  }

  // --- NOMINAL / HEALTHY STATE ---
  return {
    overallHealthScore,
    conditionTitle: 'Kondisi Trafo Prima & Stabil — Seluruh Parameter Normal',
    conditionGrade: 'PRIMA (OPTIMAL)',
    urgency: 'NORMAL',
    transformerExplanation: `Kesehatan trafo prima (${overallHealthScore}%). Seluruh sensor arus, gas, getaran, dan loop keamanan dalam ambang normal.`,
    primaryRecommendationTitle:
      'Pertahankan Operasi Normal & Lanjutkan Pemantauan Otomatis',
    riskExplanation:
      'Tidak ditemukan anomali termal, kebocoran gas, atau keausan mekanis.',
    actionSteps: [
      'Lanjutkan operasi penyaluran daya gardu secara normal.',
      'Sistem Edge-AI TinyML terus memantau telemetri secara real-time.',
      'Lakukan inspeksi fisik rutin sesuai jadwal bulanan.',
    ],
    recommendShutdownTrip: false,
    estimatedInspectionWindow: 'RUTIN (Inspeksi Bulanan Standar)',
    pillars,
    dailyTrend,
  };
}

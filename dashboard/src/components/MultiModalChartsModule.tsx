import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  Zap,
  Flame,
  Activity,
  BarChart3,
  MapPin,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Cpu,
  Check,
  X,
} from 'lucide-react';
import type {
  FFTBin,
  PrototypeNode,
  SentinelTelemetryPayload,
  TelemetryHistoryPoint,
} from '../types/sentinel';
import type { AddPrototypeInput } from '../hooks/useSentinelTelemetry';

interface MultiModalChartsModuleProps {
  telemetry: SentinelTelemetryPayload;
  history: TelemetryHistoryPoint[];
  fftSpectrum: FFTBin[];
  systemHealthScore: number;
  prototypes: PrototypeNode[];
  activeNodeId: string;
  selectNode: (nodeId: string) => void;
  addPrototype: (input: AddPrototypeInput) => void;
  removePrototype: (nodeId: string) => void;
}

export const MultiModalChartsModule: React.FC<MultiModalChartsModuleProps> = ({
  telemetry,
  history,
  fftSpectrum,
  systemHealthScore,
  prototypes,
  activeNodeId,
  selectNode,
  addPrototype,
  removePrototype,
}) => {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'fft' | 'gis'>('telemetry');
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const [nodeIdInput, setNodeIdInput] = useState('');
  const [substationInput, setSubstationInput] = useState('');
  const [bayInput, setBayInput] = useState('');

  const { I_rms, gas_ppm, vib_g, bus_secure } = telemetry.metrics;
  const isVib48Hz =
    telemetry.ai_engine.class === 'BEARING_VIBRATION_ANOMALY_48HZ' || vib_g > 0.25;

  const peak48HzMag = fftSpectrum.find((b) => b.freq === 48)?.magnitude ?? 0;
  const connectedCount = prototypes.filter((p) => p.connected).length;

  const handleOpenInlineAdd = () => {
    const nextNum = prototypes.length + 1;
    setNodeIdInput(`SENTINEL-X-0${nextNum}`);
    setSubstationInput(`GI 150kV Gardu-${nextNum}`);
    setBayInput(`Bay-0${nextNum}`);
    setShowInlineAdd(true);
  };

  const handleInlineAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIdInput.trim()) return;
    addPrototype({
      nodeId: nodeIdInput,
      substationName: substationInput || 'Gardu Induk 150kV',
      bayName: bayInput || 'Bay-01',
    });
    setShowInlineAdd(false);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ROW 1: 4 Clean DESIGN.md Instrumentation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Arus Beban (I_rms) */}
        <div className="scada-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Arus Listrik (RMS)
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                I_rms > 14
                  ? 'bg-[#D97706]/10 text-[#D97706]'
                  : 'bg-[#16A34A]/10 text-[#16A34A]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  I_rms > 14 ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                }`}
              />
              {I_rms > 14 ? 'OVERLOAD' : 'NOMINAL'}
            </span>
          </div>

          <div className="my-1 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[28px] leading-8 font-semibold tracking-[-0.02em] text-[#172B4D]">
              {I_rms.toFixed(2)}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              A
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
            <span>Batas Aman</span>
            <span className="font-semibold text-[#172B4D] tabular-nums">&lt; 14.0 A</span>
          </div>
        </div>

        {/* Card 2: Kadar Gas (gas_ppm) */}
        <div className="scada-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Kadar Gas (PPM)
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                gas_ppm > 400
                  ? 'bg-[#D97706]/10 text-[#D97706]'
                  : 'bg-[#16A34A]/10 text-[#16A34A]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  gas_ppm > 400 ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                }`}
              />
              {gas_ppm > 400 ? 'WASPADA' : 'AMAN'}
            </span>
          </div>

          <div className="my-1 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[28px] leading-8 font-semibold tracking-[-0.02em] text-[#172B4D]">
              {gas_ppm.toFixed(0)}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              PPM
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B]">
            <span>Ambang Bahaya</span>
            <span className="font-semibold text-[#172B4D] tabular-nums">&lt; 400 ppm</span>
          </div>
        </div>

        {/* Card 3: Getaran Mekanis (vib_g) */}
        <div className="scada-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Getaran MPU-6050
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                isVib48Hz
                  ? 'bg-[#D97706]/10 text-[#D97706]'
                  : 'bg-[#16A34A]/10 text-[#16A34A]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isVib48Hz ? 'bg-[#D97706]' : 'bg-[#16A34A]'
                }`}
              />
              {isVib48Hz ? '48HZ PEAK' : 'STABIL'}
            </span>
          </div>

          <div className="my-1 flex items-baseline gap-1.5 tabular-nums">
            <span className="text-[28px] leading-8 font-semibold tracking-[-0.02em] text-[#172B4D]">
              {vib_g.toFixed(4)}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              g
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] tabular-nums">
            <span>Mag 48 Hz</span>
            <span className="font-semibold text-[#006972]">{peak48HzMag.toFixed(3)} g</span>
          </div>
        </div>

        {/* Card 4: Keamanan Loop (bus_secure) & Health */}
        <div
          className={`scada-card p-4 flex flex-col justify-between ${
            !bus_secure ? 'border-[#DC2626] bg-[#ffdad6]/20' : ''
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Perimeter Loop
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                bus_secure
                  ? 'bg-[#16A34A]/10 text-[#16A34A]'
                  : 'bg-[#DC2626]/10 text-[#DC2626]'
              }`}
            >
              {bus_secure ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              {bus_secure ? 'SECURE' : 'SABOTAGE'}
            </span>
          </div>

          <div className="my-1 flex items-baseline gap-1.5 tabular-nums">
            <span
              className={`text-[22px] leading-8 font-bold tracking-[-0.01em] ${
                bus_secure ? 'text-[#16A34A]' : 'text-[#DC2626]'
              }`}
            >
              {bus_secure ? 'CLOSED' : 'OPEN BREAK'}
            </span>
          </div>

          <div className="mt-2 pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#64748B] tabular-nums">
            <span>Health Score</span>
            <span className="font-semibold text-[#15345B]">{systemHealthScore}%</span>
          </div>
        </div>
      </div>

      {/* ROW 2: Tabbed Main Visualization Panel (#FFFFFF Surface Card) */}
      <div className="scada-card p-5">
        {/* Card Header with Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-[#E2E8F0]">
          <div>
            <h2 className="text-base font-semibold text-[#172B4D]">
              Analitik Gelombang Sensor &amp; Spektrum FFT 48 Hz
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              Telemetri real-time 500 ms dari prototype aktif ({telemetry.node})
            </p>
          </div>

          <div className="inline-flex rounded bg-[#F5F8FC] p-1 border border-[#E2E8F0] text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('telemetry')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all cursor-pointer ${
                activeTab === 'telemetry'
                  ? 'bg-[#15345B] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172B4D]'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Arus &amp; Gas</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('fft')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all cursor-pointer ${
                activeTab === 'fft'
                  ? 'bg-[#15345B] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172B4D]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Getaran &amp; FFT 48Hz</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('gis')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded font-semibold transition-all cursor-pointer ${
                activeTab === 'gis'
                  ? 'bg-[#15345B] text-white shadow-xs'
                  : 'text-[#64748B] hover:text-[#172B4D]'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" />
              <span>Peta GIS Gardu ({prototypes.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Arus (I_rms) & Gas (gas_ppm) */}
        {activeTab === 'telemetry' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Arus Listrik */}
            <div className="rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#16B8C8]" />
                  Gelombang Arus RMS (0 – 20 A)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#16B8C8]/15 text-[#006972] text-xs font-bold tabular-nums">
                  {I_rms.toFixed(2)} A
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="designCurrent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16B8C8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#16B8C8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fill: '#64748B', fontSize: 10 }}
                      minTickGap={30}
                    />
                    <YAxis domain={[0, 20]} tick={{ fill: '#64748B', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#172B4D',
                      }}
                    />
                    <ReferenceLine
                      y={14}
                      stroke="#DC2626"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Batas Cut-Off (14A)',
                        position: 'insideTopRight',
                        fill: '#DC2626',
                        fontSize: 10,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="I_rms"
                      stroke="#16B8C8"
                      strokeWidth={2.5}
                      fill="url(#designCurrent)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Konsentrasi Gas */}
            <div className="rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-[#D97706]" />
                  Konsentrasi Gas Berbahaya (15 – 1000 ppm)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#D97706]/10 text-[#D97706] text-xs font-bold tabular-nums">
                  {gas_ppm.toFixed(1)} ppm
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                    <defs>
                      <linearGradient id="designGas" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#15345B" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#15345B" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fill: '#64748B', fontSize: 10 }}
                      minTickGap={30}
                    />
                    <YAxis domain={[0, 1000]} tick={{ fill: '#64748B', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#172B4D',
                      }}
                    />
                    <ReferenceLine
                      y={400}
                      stroke="#D97706"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Waspada (400 ppm)',
                        position: 'insideTopRight',
                        fill: '#D97706',
                        fontSize: 10,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="gas_ppm"
                      stroke="#15345B"
                      strokeWidth={2.5}
                      fill="url(#designGas)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Getaran Mekanis & Spektrum FFT 48 Hz */}
        {activeTab === 'fft' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Time Domain Vibration */}
            <div className="rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#16A34A]" />
                  Akselerasi Getaran MPU-6050 (Domain Waktu)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#16A34A]/10 text-[#16A34A] text-xs font-bold tabular-nums">
                  {vib_g.toFixed(4)} g
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="designVib" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#16B8C8" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#16B8C8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fill: '#64748B', fontSize: 10 }}
                      minTickGap={30}
                    />
                    <YAxis domain={[0, 'auto']} tick={{ fill: '#64748B', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#172B4D',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="vib_g"
                      stroke="#16B8C8"
                      strokeWidth={2.5}
                      fill="url(#designVib)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 48 Hz FFT Frequency Spectrum */}
            <div className="rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[#172B4D] flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-[#15345B]" />
                  Spektrum Frekuensi FFT (0 – 120 Hz)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#eff4ff] border border-[#d3e4fe] text-[#15345B] text-xs font-bold tabular-nums">
                  48 Hz Peak: {peak48HzMag.toFixed(3)} g
                </span>
              </div>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={fftSpectrum} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                    <XAxis
                      dataKey="freq"
                      tickFormatter={(v) => `${v}Hz`}
                      tick={{ fill: '#64748B', fontSize: 10 }}
                      interval={2}
                    />
                    <YAxis tick={{ fill: '#64748B', fontSize: 10 }} />
                    <Tooltip
                      formatter={(val) => [`${Number(val ?? 0).toFixed(4)} g`, 'Magnitudo']}
                      labelFormatter={(label) => `Frekuensi: ${label} Hz`}
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#E2E8F0',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#172B4D',
                      }}
                    />
                    <Bar dataKey="magnitude" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                      {fftSpectrum.map((entry) => (
                        <Cell
                          key={`bin-${entry.freq}`}
                          fill={
                            entry.freq === 48
                              ? isVib48Hz
                                ? '#DC2626'
                                : '#D97706'
                              : entry.isHarmonic48Hz
                                ? '#16B8C8'
                                : '#15345B'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Dynamic Multi-Prototype GIS Substation Map */}
        {activeTab === 'gis' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#172B4D] font-semibold">
                    Topologi GIS Gardu Induk (Sesuai Prototype ESP32)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#eff4ff] border border-[#d3e4fe] text-[#15345B] font-semibold tabular-nums">
                    {connectedCount} Online / {prototypes.length} Terdaftar
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleOpenInlineAdd}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-[#67ecfd]" />
                  <span>Tambah Prototype ESP32</span>
                </button>
              </div>

              {/* Inline Add Prototype Form inside GIS Tab */}
              {showInlineAdd && (
                <form
                  onSubmit={handleInlineAddSubmit}
                  className="mb-4 p-3.5 rounded-lg bg-white border border-[#d3e4fe] grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end text-xs"
                >
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Node ID ESP32
                    </label>
                    <input
                      type="text"
                      value={nodeIdInput}
                      onChange={(e) => setNodeIdInput(e.target.value)}
                      placeholder="SENTINEL-X-02"
                      className="w-full h-8 px-2.5 rounded border border-[#E2E8F0] font-mono font-semibold text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Nama Gardu Induk
                    </label>
                    <input
                      type="text"
                      value={substationInput}
                      onChange={(e) => setSubstationInput(e.target.value)}
                      placeholder="GI 150kV Pandean"
                      className="w-full h-8 px-2.5 rounded border border-[#E2E8F0] text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                      Unit Bay
                    </label>
                    <input
                      type="text"
                      value={bayInput}
                      onChange={(e) => setBayInput(e.target.value)}
                      placeholder="Bay-02"
                      className="w-full h-8 px-2.5 rounded border border-[#E2E8F0] text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="submit"
                      className="flex-1 h-8 px-3 rounded bg-[#16A34A] hover:bg-[#15803d] text-white font-semibold flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInlineAdd(false)}
                      className="h-8 px-2.5 rounded bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#64748B] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              )}

              {/* Dynamic SVG GIS Topology Map */}
              <svg
                viewBox="0 0 600 220"
                className="w-full h-56 rounded-lg bg-[#eff4ff] border border-[#d3e4fe]"
              >
                <defs>
                  <pattern id="lightGisGrid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path
                      d="M 30 0 L 0 0 0 30"
                      fill="none"
                      stroke="#cbdbf5"
                      strokeWidth="0.8"
                    />
                  </pattern>
                </defs>
                <rect width="600" height="220" fill="url(#lightGisGrid)" />

                {/* Dynamic Transmission Links between registered ESP32 prototypes */}
                {prototypes.length > 1 &&
                  prototypes.map((node, idx) => {
                    if (idx === 0) return null;
                    const prevNode = prototypes[idx - 1];
                    const anyAlert =
                      node.telemetry.relay_trip ||
                      node.telemetry.status === 'EVENT_ALERT' ||
                      prevNode.telemetry.relay_trip ||
                      prevNode.telemetry.status === 'EVENT_ALERT';
                    return (
                      <line
                        key={`link-${prevNode.nodeId}-${node.nodeId}`}
                        x1={prevNode.mapX}
                        y1={prevNode.mapY}
                        x2={node.mapX}
                        y2={node.mapY}
                        stroke={anyAlert ? '#DC2626' : '#16B8C8'}
                        strokeWidth="2.5"
                        strokeDasharray={node.connected && prevNode.connected ? undefined : '5 4'}
                      />
                    );
                  })}

                {/* Render each registered/connected ESP32 prototype node */}
                {prototypes.map((node) => {
                  const isSelected = node.nodeId === activeNodeId;
                  const nodeAlert =
                    node.telemetry.relay_trip ||
                    node.telemetry.status === 'EVENT_ALERT' ||
                    node.telemetry.ai_engine.threat_idx > 55;
                  const fillColor = nodeAlert
                    ? '#DC2626'
                    : node.connected
                      ? '#16A34A'
                      : '#15345B';

                  return (
                    <g
                      key={node.nodeId}
                      onClick={() => selectNode(node.nodeId)}
                      className="cursor-pointer"
                    >
                      {(isSelected || node.connected) && (
                        <circle
                          cx={node.mapX}
                          cy={node.mapY}
                          r={22}
                          fill="none"
                          stroke={fillColor}
                          strokeWidth="2"
                          opacity="0.6"
                        >
                          <animate
                            attributeName="r"
                            values="10;30;10"
                            dur="2.4s"
                            repeatCount="indefinite"
                          />
                        </circle>
                      )}
                      <circle
                        cx={node.mapX}
                        cy={node.mapY}
                        r={isSelected ? 8 : 6.5}
                        fill={fillColor}
                        stroke="#FFFFFF"
                        strokeWidth="2.5"
                      />
                      <text
                        x={node.mapX}
                        y={node.mapY - 16}
                        textAnchor="middle"
                        fill="#0b1c30"
                        fontSize="11"
                        fontWeight="bold"
                        fontFamily="Inter"
                      >
                        {node.nodeId} ({node.substationName})
                      </text>
                      <text
                        x={node.mapX}
                        y={node.mapY + 22}
                        textAnchor="middle"
                        fill={nodeAlert ? '#DC2626' : node.connected ? '#16A34A' : '#64748B'}
                        fontSize="10"
                        fontWeight="600"
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {node.telemetry.relay_trip
                          ? 'CUT-OFF AKTIF'
                          : node.connected
                            ? `ONLINE • ${node.telemetry.metrics.I_rms.toFixed(1)}A • Threat ${node.telemetry.ai_engine.threat_idx}%`
                            : `${node.bayName} • MENUNGGU ESP32`}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Registered Prototype Nodes Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prototypes.map((node) => {
                const isSelected = node.nodeId === activeNodeId;
                const nodeAlert =
                  node.telemetry.relay_trip ||
                  node.telemetry.status === 'EVENT_ALERT' ||
                  node.telemetry.ai_engine.threat_idx > 55;

                return (
                  <div
                    key={node.nodeId}
                    onClick={() => selectNode(node.nodeId)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#eff4ff] border-[#15345B]'
                        : 'bg-white border-[#E2E8F0] hover:border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`p-2 rounded border shrink-0 ${
                          nodeAlert
                            ? 'bg-[#DC2626]/10 border-[#DC2626]/30 text-[#DC2626]'
                            : node.connected
                              ? 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#16A34A]'
                              : 'bg-[#F5F8FC] border-[#E2E8F0] text-[#64748B]'
                        }`}
                      >
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#172B4D] font-mono">
                            {node.nodeId}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              node.connected
                                ? 'bg-[#16A34A]/15 text-[#16A34A]'
                                : 'bg-[#64748B]/15 text-[#64748B]'
                            }`}
                          >
                            {node.connected ? 'ONLINE' : 'OFFLINE / MENUNGGU'}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded bg-[#15345B] text-white text-[10px] font-semibold">
                              Ditampilkan
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#64748B] truncate mt-0.5">
                          {node.substationName} • {node.bayName} ({node.coordinatesText})
                        </div>
                        <div className="text-[11px] font-mono text-[#172B4D] mt-1 tabular-nums">
                          I_rms: {node.telemetry.metrics.I_rms.toFixed(2)}A | Gas:{' '}
                          {node.telemetry.metrics.gas_ppm.toFixed(0)}ppm | Threat:{' '}
                          {node.telemetry.ai_engine.threat_idx}% | Paket: {node.packetsCount}
                        </div>
                      </div>
                    </div>

                    {prototypes.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removePrototype(node.nodeId);
                        }}
                        className="p-1.5 rounded bg-white hover:bg-[#ffdad6]/40 border border-[#E2E8F0] text-[#64748B] hover:text-[#DC2626] transition-colors cursor-pointer shrink-0"
                        title={`Hapus ${node.nodeId}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

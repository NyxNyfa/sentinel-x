import React, { useState } from 'react';
import { createPortal } from 'react-dom';
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
  Edit2,
  Compass,
} from 'lucide-react';
import type {
  FFTBin,
  PrototypeNode,
  SentinelTelemetryPayload,
  TelemetryHistoryPoint,
} from '../types/sentinel';
import { isSameNode, type AddPrototypeInput } from '../hooks/useSentinelTelemetry';
import { RealGisMap } from './RealGisMap';

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
  updatePrototypeCoordinates: (
    nodeId: string,
    latitude: number,
    longitude: number,
    substationName?: string,
    bayName?: string
  ) => void;
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
  updatePrototypeCoordinates,
}) => {
  const [activeTab, setActiveTab] = useState<'telemetry' | 'fft' | 'gis'>('telemetry');

  // Inline Add Prototype state in GIS tab
  const [showInlineAdd, setShowInlineAdd] = useState(false);
  const [nodeIdInput, setNodeIdInput] = useState('');
  const [substationInput, setSubstationInput] = useState('');
  const [bayInput, setBayInput] = useState('');
  const [latInput, setLatInput] = useState('-6.9844');
  const [lngInput, setLngInput] = useState('110.3625');
  const [pickModeActive, setPickModeActive] = useState(false);

  // Edit Prototype Coordinates Modal state
  const [editingNode, setEditingNode] = useState<PrototypeNode | null>(null);
  const [editLat, setEditLat] = useState<string>('');
  const [editLng, setEditLng] = useState<string>('');
  const [editSubstation, setEditSubstation] = useState<string>('');
  const [editBay, setEditBay] = useState<string>('');

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
    setLatInput('-7.0033');
    setLngInput('110.4417');
    setShowInlineAdd(true);
    setPickModeActive(true);
  };

  const handleInlineAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nodeIdInput.trim()) return;
    const lat = Number(latInput);
    const lng = Number(lngInput);
    addPrototype({
      nodeId: nodeIdInput,
      substationName: substationInput || 'Gardu Induk 150kV',
      bayName: bayInput || 'Bay-01',
      latitude: !isNaN(lat) ? lat : -6.9844,
      longitude: !isNaN(lng) ? lng : 110.3625,
    });
    setShowInlineAdd(false);
    setPickModeActive(false);
  };

  // Called when clicking anywhere on the RealGisMap
  const handleMapPickCoordinates = (lat: number, lng: number) => {
    if (editingNode) {
      setEditLat(lat.toString());
      setEditLng(lng.toString());
    } else if (showInlineAdd) {
      setLatInput(lat.toString());
      setLngInput(lng.toString());
    }
  };

  // Open Edit Coordinates modal
  const handleOpenEditModal = (prototype: PrototypeNode) => {
    setEditingNode(prototype);
    setEditLat(prototype.latitude.toString());
    setEditLng(prototype.longitude.toString());
    setEditSubstation(prototype.substationName);
    setEditBay(prototype.bayName);
    setPickModeActive(true);
  };

  const handleSaveEditCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNode) return;
    const lat = Number(editLat);
    const lng = Number(editLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      updatePrototypeCoordinates(
        editingNode.nodeId,
        lat,
        lng,
        editSubstation,
        editBay
      );
    }
    setEditingNode(null);
    setPickModeActive(false);
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
              <MapPin className="w-3.5 h-3.5 text-[#006972]" />
              <span>Peta Real GIS ({prototypes.length})</span>
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

        {/* TAB 3: Real GIS OpenStreetMap Indonesia Map with Custom Coordinates */}
        {activeTab === 'gis' && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#172B4D] font-semibold flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-[#006972]" />
                    Peta Real GIS Gardu Induk (OpenStreetMap Indonesia)
                  </span>
                  <span className="px-2 py-0.5 rounded bg-[#eff4ff] border border-[#d3e4fe] text-[#15345B] font-semibold tabular-nums">
                    {connectedCount} Online / {prototypes.length} Terdaftar
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenInlineAdd}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5 text-[#67ecfd]" />
                    <span>Tambah Prototype</span>
                  </button>
                </div>
              </div>

              {/* Inline Add Prototype Form with Lat/Lng Manual Input */}
              {showInlineAdd && (
                <form
                  onSubmit={handleInlineAddSubmit}
                  className="mb-4 p-4 rounded-lg bg-white border border-[#d3e4fe] shadow-xs text-xs space-y-3 animate-in fade-in"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-[#E2E8F0]">
                    <span className="font-semibold text-[#15345B] flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-[#006972]" />
                      Tambah Prototype Baru (Input Manual Garis Lintang &amp; Bujur)
                    </span>
                    <span className="text-[11px] text-[#64748B]">
                      *Anda juga dapat mengklik langsung peta di bawah untuk mengisi titik koordinat
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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
                        Unit / Bay
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
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                        Garis Lintang (Latitude)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={latInput}
                        onChange={(e) => setLatInput(e.target.value)}
                        placeholder="-6.9844"
                        className="w-full h-8 px-2.5 rounded border border-[#E2E8F0] font-mono font-semibold text-[#15345B] focus:outline-none focus:border-[#16B8C8]"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                        Garis Bujur (Longitude)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={lngInput}
                        onChange={(e) => setLngInput(e.target.value)}
                        placeholder="110.3625"
                        className="w-full h-8 px-2.5 rounded border border-[#E2E8F0] font-mono font-semibold text-[#15345B] focus:outline-none focus:border-[#16B8C8]"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-[11px] font-mono text-[#006972]">
                      Titik Peta: [{Number(latInput).toFixed(4)}, {Number(lngInput).toFixed(4)}]
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineAdd(false)}
                        className="px-3 h-8 rounded bg-[#F8FAFC] hover:bg-[#E2E8F0] border border-[#E2E8F0] text-[#64748B] font-semibold cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-4 h-8 rounded bg-[#16A34A] hover:bg-[#15803d] text-white font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Simpan Prototype</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {/* Real Leaflet Map of Indonesia with Real Coordinates */}
              <RealGisMap
                prototypes={prototypes}
                activeNodeId={activeNodeId}
                selectNode={selectNode}
                onPickCoordinates={handleMapPickCoordinates}
                pickModeActive={pickModeActive}
                onOpenEditCoordsModal={handleOpenEditModal}
              />
            </div>

            {/* Registered Prototype Nodes Cards with Coordinates & Edit Button */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {prototypes.map((node) => {
                const isSelected = isSameNode(node.nodeId, activeNodeId);
                const nodeAlert =
                  node.telemetry.relay_trip ||
                  node.telemetry.status === 'EVENT_ALERT' ||
                  node.telemetry.ai_engine.threat_idx > 55;

                const latLabel = `${Math.abs(node.latitude).toFixed(4)}°${node.latitude < 0 ? 'S' : 'N'}`;
                const lngLabel = `${Math.abs(node.longitude).toFixed(4)}°${node.longitude < 0 ? 'W' : 'E'}`;

                return (
                  <div
                    key={node.nodeId}
                    onClick={() => selectNode(node.nodeId)}
                    className={`p-3.5 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#eff4ff] border-[#15345B] shadow-xs'
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
                              : node.packetsCount > 0
                                ? 'bg-[#D97706]/10 border-[#D97706]/30 text-[#D97706]'
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
                                : node.packetsCount > 0
                                  ? 'bg-[#D97706]/15 text-[#D97706]'
                                  : 'bg-[#64748B]/15 text-[#64748B]'
                            }`}
                          >
                            {node.connected
                              ? 'ONLINE'
                              : node.packetsCount > 0
                                ? 'OFFLINE'
                                : 'MENUNGGU'}
                          </span>
                          {isSelected && (
                            <span className="px-1.5 py-0.5 rounded bg-[#15345B] text-white text-[10px] font-semibold">
                              Ditampilkan
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#64748B] truncate mt-0.5">
                          {node.substationName} • {node.bayName}
                        </div>
                        <div className="text-[11px] font-mono text-[#006972] font-semibold mt-0.5 tabular-nums">
                          📍 Lat: {node.latitude} ({latLabel}) | Lng: {node.longitude} ({lngLabel})
                        </div>
                        <div className="text-[11px] font-mono text-[#172B4D] mt-1 tabular-nums">
                          I_rms: {node.telemetry.metrics.I_rms.toFixed(2)}A | Gas:{' '}
                          {node.telemetry.metrics.gas_ppm.toFixed(0)}ppm | Threat:{' '}
                          {node.telemetry.ai_engine.threat_idx}% | Paket: {node.packetsCount}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Edit Coordinates Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEditModal(node);
                        }}
                        className="p-1.5 rounded bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#15345B] hover:border-[#15345B] transition-colors cursor-pointer"
                        title={`Edit Titik Garis Lintang & Bujur ${node.nodeId}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Remove Prototype Button */}
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
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Edit Coordinates Modal rendered via Portal */}
      {editingNode &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
            style={{ backgroundColor: 'rgba(21, 52, 91, 0.45)' }}
            onClick={() => setEditingNode(null)}
          >
            <div
              className="scada-modal w-full max-w-md my-auto overflow-hidden text-[#172B4D]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 bg-[#15345B] text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-semibold">
                  <MapPin className="w-4 h-4 text-[#67ecfd]" />
                  <span>Edit Titik Koordinat ({editingNode.nodeId})</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingNode(null)}
                  className="text-[#d5e3ff] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveEditCoordinates} className="p-6 space-y-4 text-xs bg-white">
                <p className="text-[#64748B] leading-relaxed">
                  Masukkan nilai titik <strong>Garis Lintang (Latitude)</strong> dan{' '}
                  <strong>Garis Bujur (Longitude)</strong> dalam format desimal untuk wilayah Indonesia.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#172B4D] font-semibold mb-1">
                      Garis Lintang (Latitude)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editLat}
                      onChange={(e) => setEditLat(e.target.value)}
                      placeholder="-6.9844"
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] font-mono text-[#15345B] font-semibold focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                    <span className="text-[10px] text-[#64748B] mt-0.5 block">
                      Negatif (-) untuk Lintang Selatan
                    </span>
                  </div>
                  <div>
                    <label className="block text-[#172B4D] font-semibold mb-1">
                      Garis Bujur (Longitude)
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={editLng}
                      onChange={(e) => setEditLng(e.target.value)}
                      placeholder="110.3625"
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] font-mono text-[#15345B] font-semibold focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                    <span className="text-[10px] text-[#64748B] mt-0.5 block">
                      Positif (+) untuk Bujur Timur
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-[#172B4D] font-semibold mb-1">
                    Nama Gardu Induk
                  </label>
                  <input
                    type="text"
                    value={editSubstation}
                    onChange={(e) => setEditSubstation(e.target.value)}
                    placeholder="GI 150kV Krapyak Semarang"
                    className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[#172B4D] font-semibold mb-1">
                    Unit / Bay
                  </label>
                  <input
                    type="text"
                    value={editBay}
                    onChange={(e) => setEditBay(e.target.value)}
                    placeholder="Bay-01 Penghantar"
                    className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                    required
                  />
                </div>

                <div className="p-3 rounded bg-[#eff4ff] border border-[#d3e4fe] text-[11px] font-mono space-y-1">
                  <div className="text-[#15345B] font-semibold">Preview Koordinat:</div>
                  <div className="text-[#006972]">
                    [{editLat || '0'}, {editLng || '0'}]
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setEditingNode(null)}
                    className="px-4 py-2 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#172B4D] font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold cursor-pointer transition-colors shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Perubahan</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

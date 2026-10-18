import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Radio,
  Settings,
  Volume2,
  VolumeX,
  ShieldCheck,
  ShieldAlert,
  Check,
  X,
  Cpu,
  RefreshCw,
  Plus,
  Layers,
} from 'lucide-react';
import type {
  ConnectionState,
  MqttBrokerConfig,
  PrototypeNode,
  SentinelTelemetryPayload,
} from '../types/sentinel';
import type { AddPrototypeInput } from '../hooks/useSentinelTelemetry';

interface TopScadaBarProps {
  telemetry: SentinelTelemetryPayload;
  systemHealthScore: number;
  connectionState: ConnectionState;
  mqttConfig: MqttBrokerConfig;
  setMqttConfig: React.Dispatch<React.SetStateAction<MqttBrokerConfig>>;
  connectMqtt: (cfg?: MqttBrokerConfig) => void;
  audioMuted: boolean;
  setAudioMuted: React.Dispatch<React.SetStateAction<boolean>>;
  packetsReceived: number;
  lastPacketTime: string;
  prototypes: PrototypeNode[];
  activeNodeId: string;
  selectNode: (nodeId: string) => void;
  addPrototype: (input: AddPrototypeInput) => void;
}

const EMQX_URL_PRESETS = [
  {
    label: 'wss://broker.emqx.io:8084/mqtt (SSL)',
    url: 'wss://broker.emqx.io:8084/mqtt',
  },
  {
    label: 'ws://broker.emqx.io:8083/mqtt (Tanpa SSL)',
    url: 'ws://broker.emqx.io:8083/mqtt',
  },
];

export const TopScadaBar: React.FC<TopScadaBarProps> = ({
  telemetry,
  connectionState,
  mqttConfig,
  setMqttConfig,
  connectMqtt,
  audioMuted,
  setAudioMuted,
  packetsReceived,
  lastPacketTime,
  prototypes,
  activeNodeId,
  selectNode,
  addPrototype,
}) => {
  const [showBrokerModal, setShowBrokerModal] = useState(false);
  const [draftConfig, setDraftConfig] = useState<MqttBrokerConfig>(mqttConfig);

  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [newNodeId, setNewNodeId] = useState('');
  const [newSubstation, setNewSubstation] = useState('');
  const [newBay, setNewBay] = useState('');
  const [newCoords, setNewCoords] = useState('');

  const isAlert = telemetry.status === 'EVENT_ALERT' || telemetry.ai_engine.threat_idx > 55;
  const isTripped = telemetry.relay_trip;

  const activePrototype =
    prototypes.find((p) => p.nodeId === activeNodeId) || prototypes[0];
  const connectedCount = prototypes.filter((p) => p.connected).length;

  const handleConnectBroker = (e: React.FormEvent) => {
    e.preventDefault();
    setMqttConfig(draftConfig);
    connectMqtt(draftConfig);
    setShowBrokerModal(false);
  };

  const openAddNodeModal = () => {
    const nextIdx = prototypes.length + 1;
    setNewNodeId(`SENTINEL-X-0${nextIdx}`);
    setNewSubstation(`GI 150kV Gardu-${nextIdx}`);
    setNewBay(`Bay-0${nextIdx}`);
    setNewCoords('7°00′12″S 110°26′30″E');
    setShowAddNodeModal(true);
  };

  const handleAddPrototypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeId.trim()) return;
    addPrototype({
      nodeId: newNodeId,
      substationName: newSubstation || 'Gardu Induk 150kV',
      bayName: newBay || 'Bay-01',
      coordinatesText: newCoords || '6°59′04″S 110°21′45″E',
    });
    setShowAddNodeModal(false);
  };

  return (
    <header className="sticky top-0 z-40 shadow-sm">
      {/* Top Primary Brand Navy Global Bar (#15345B per DESIGN.md) */}
      <div className="bg-[#15345B] text-white border-b border-[#001f40]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 h-14 flex items-center justify-between gap-4">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center justify-center w-8 h-8 rounded bg-[#001f40] border border-[#829dca]/30 text-[#67ecfd]">
              {isTripped || isAlert ? (
                <ShieldAlert className="w-4 h-4 text-[#ffdad6]" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-[#67ecfd]" />
              )}
            </div>
            <div className="flex items-baseline tracking-tight select-none">
              <span className="text-white text-lg font-bold tracking-tight">SENTINEL-</span>
              <span className="text-[#67ecfd] text-lg font-extrabold tracking-wide">X</span>
            </div>
            <div className="h-4 w-[1px] bg-[#829dca]/30 mx-1 hidden sm:block" />
            <span className="hidden sm:inline-block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#d5e3ff]">
              Industrial SCADA &amp; Edge-AI Telemetry
            </span>
          </div>

          {/* Right Status Badges in Navy Header */}
          <div className="flex items-center gap-2.5">
            <div className="hidden md:flex items-center gap-3 px-3 py-1 rounded bg-[#001f40]/70 border border-[#829dca]/25 text-xs">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    connectionState === 'CONNECTED'
                      ? 'bg-[#16A34A]'
                      : connectionState === 'CONNECTING'
                        ? 'bg-[#D97706] animate-pulse'
                        : 'bg-[#DC2626]'
                  }`}
                />
                <span className="text-[#829dca] text-[11px]">MQTT:</span>
                <span className="text-white font-semibold text-[11px] font-mono tabular-nums">
                  {connectionState === 'CONNECTED'
                    ? mqttConfig.brokerUrl
                    : connectionState}
                </span>
              </div>
              <div className="w-[1px] h-3 bg-[#829dca]/30" />
              <div className="flex items-center gap-1.5 tabular-nums text-[11px]">
                <span className="text-[#829dca]">ESP32 Aktif:</span>
                <span className="text-[#67ecfd] font-bold">
                  {connectedCount}/{prototypes.length}
                </span>
              </div>
              <div className="w-[1px] h-3 bg-[#829dca]/30" />
              <div className="flex items-center gap-1.5 tabular-nums text-[11px]">
                <span className="text-[#829dca]">Paket:</span>
                <span className="text-white font-semibold">{packetsReceived}</span>
              </div>
            </div>

            {/* Live Status Chip */}
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                isTripped
                  ? 'bg-[#DC2626] text-white'
                  : isAlert
                    ? 'bg-[#D97706] text-white'
                    : 'bg-[#16A34A] text-white'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              {isTripped ? 'CUT-OFF AKTIF' : telemetry.status}
            </span>
          </div>
        </div>
      </div>

      {/* Subheader Operational Control Bar (#FFFFFF surface with #E2E8F0 border per DESIGN.md) */}
      <div className="bg-white border-b border-[#E2E8F0]">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          {/* Left: Node Identity & Heartbeat */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#eff4ff] border border-[#d3e4fe] flex items-center justify-center text-[#15345B]">
              <Cpu className="w-4 h-4 text-[#006972]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold text-[#0b1c30]">{telemetry.node}</span>
                <span className="text-xs text-[#64748B]">
                  ({activePrototype?.substationName || 'GI 150kV Semarang'} •{' '}
                  {activePrototype?.bayName || 'Bay-01'})
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                    activePrototype?.connected
                      ? 'bg-[#16A34A]/10 text-[#16A34A]'
                      : 'bg-[#64748B]/10 text-[#64748B]'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      activePrototype?.connected ? 'bg-[#16A34A]' : 'bg-[#94A3B8]'
                    }`}
                  />
                  {activePrototype?.connected ? 'ESP32 ONLINE' : 'MENUNGGU TELEMETRI'}
                </span>
              </div>
              <p className="text-xs text-[#64748B] tabular-nums mt-0.5">
                Update Terakhir: <strong className="text-[#172B4D]">{lastPacketTime}</strong> • Daya Node:{' '}
                <strong className="text-[#172B4D]">1.18 W</strong> • Efisiensi Bandwidth:{' '}
                <strong className="text-[#006972]">&gt; 85.4%</strong>
              </p>
            </div>
          </div>

          {/* Right: Prototype Selector + Tambah Prototype + MQTT Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Prototype Selector */}
            <div className="flex items-center gap-1.5 bg-[#F5F8FC] border border-[#E2E8F0] rounded px-2 py-1">
              <Layers className="w-3.5 h-3.5 text-[#15345B]" />
              <select
                value={activeNodeId}
                onChange={(e) => selectNode(e.target.value)}
                className="bg-transparent text-xs font-semibold text-[#172B4D] focus:outline-none cursor-pointer pr-1"
                title="Pilih Prototype ESP32"
              >
                {prototypes.map((p) => (
                  <option key={p.nodeId} value={p.nodeId}>
                    {p.nodeId} ({p.connected ? 'Online' : 'Menunggu'})
                  </option>
                ))}
              </select>
            </div>

            {/* + Tambah Prototype Button */}
            <button
              type="button"
              onClick={openAddNodeModal}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-[#eff4ff] hover:bg-[#d3e4fe]/70 border border-[#d3e4fe] text-xs font-semibold text-[#15345B] transition-colors cursor-pointer"
              title="Tambah Prototype ESP32 Baru ke GIS & MQTT"
            >
              <Plus className="w-3.5 h-3.5 text-[#006972]" />
              <span>Tambah Prototype</span>
            </button>

            {/* Reconnect MQTT Button */}
            <button
              type="button"
              onClick={() => connectMqtt(mqttConfig)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#15345B] hover:bg-[#001f40] text-white text-xs font-semibold transition-colors cursor-pointer"
              title="Hubungkan ulang ke Broker MQTT"
            >
              <Radio className="w-3.5 h-3.5 text-[#67ecfd]" />
              <span>MQTT</span>
              <RefreshCw
                className={`w-3 h-3 ml-0.5 opacity-80 ${
                  connectionState === 'CONNECTING' ? 'animate-spin' : ''
                }`}
              />
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => {
                setDraftConfig(mqttConfig);
                setShowBrokerModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-xs font-medium text-[#172B4D] transition-colors cursor-pointer"
              title="Pengaturan MQTT"
            >
              <Settings className="w-3.5 h-3.5 text-[#006972]" />
              <span>Pengaturan MQTT</span>
            </button>

            {/* Audio Mute Button */}
            <button
              type="button"
              onClick={() => setAudioMuted((m) => !m)}
              className={`p-1.5 rounded border transition-colors cursor-pointer ${
                audioMuted
                  ? 'bg-white border-[#E2E8F0] text-[#94A3B8] hover:text-[#172B4D]'
                  : 'bg-[#16A34A]/10 border-[#16A34A]/30 text-[#16A34A]'
              }`}
              title={audioMuted ? 'Suara Alarm Mati' : 'Suara Alarm Aktif'}
            >
              {audioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostic Alert Banner (No GPIO/pin text) */}
      {(isTripped || isAlert) && (
        <div className="max-w-7xl mx-auto mt-3 px-4 sm:px-8">
          <div
            className={`px-4 py-2.5 rounded bg-white border border-[#E2E8F0] border-l-[3px] flex items-center justify-between gap-2 text-xs ${
              isTripped
                ? 'border-l-[#DC2626] bg-[#ffdad6]/35 text-[#93000a]'
                : 'border-l-[#D97706] bg-[#ffdcbe]/40 text-[#653e11]'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                {isTripped
                  ? `INTERLOK PROTEKSI DARURAT AKTIF: Software Cut-Off ${activePrototype?.bayName || 'Bay-01'} Terbuka (TRIPPED)`
                  : `PERINGATAN TINYML: ${telemetry.ai_engine.class} (Threat Index: ${telemetry.ai_engine.threat_idx}%)`}
              </span>
            </div>
            <span className="font-mono text-[11px] font-semibold">NODE: {telemetry.node}</span>
          </div>
        </div>
      )}

      {/* Modal 1: Pengaturan Koneksi MQTT */}
      {showBrokerModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
            style={{ backgroundColor: 'rgba(21, 52, 91, 0.4)' }}
            onClick={() => setShowBrokerModal(false)}
          >
            <div
              className="scada-modal w-full max-w-lg my-auto overflow-hidden text-[#172B4D]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 bg-[#15345B] text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-semibold">
                  <Radio className="w-4 h-4 text-[#67ecfd]" />
                  <span>Pengaturan Koneksi MQTT</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBrokerModal(false)}
                  className="text-[#d5e3ff] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleConnectBroker} className="p-6 space-y-4 text-xs bg-white">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B] mb-2">
                    Pilih Cepat Broker URL
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    {EMQX_URL_PRESETS.map((preset) => {
                      const isSelected = draftConfig.brokerUrl === preset.url;
                      return (
                        <button
                          key={preset.url}
                          type="button"
                          onClick={() =>
                            setDraftConfig((prev) => ({
                              ...prev,
                              brokerUrl: preset.url,
                            }))
                          }
                          className={`px-3.5 py-2.5 rounded border text-left font-mono cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? 'bg-[#eff4ff] border-[#15345B] text-[#15345B] font-semibold'
                              : 'bg-white border-[#E2E8F0] text-[#43474e] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]'
                          }`}
                        >
                          <span>{preset.label}</span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded bg-[#15345B] text-white text-[10px] font-sans">
                              Aktif
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[#172B4D] font-semibold">Broker URL</label>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
                        connectionState === 'CONNECTED'
                          ? 'bg-[#16A34A]/10 text-[#16A34A]'
                          : connectionState === 'CONNECTING'
                            ? 'bg-[#D97706]/10 text-[#D97706]'
                            : 'bg-[#DC2626]/10 text-[#DC2626]'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          connectionState === 'CONNECTED'
                            ? 'bg-[#16A34A]'
                            : connectionState === 'CONNECTING'
                              ? 'bg-[#D97706]'
                              : 'bg-[#DC2626]'
                        }`}
                      />
                      {connectionState}
                    </span>
                  </div>
                  <input
                    type="text"
                    value={draftConfig.brokerUrl}
                    onChange={(e) =>
                      setDraftConfig((prev) => ({ ...prev, brokerUrl: e.target.value }))
                    }
                    placeholder="wss://broker.emqx.io:8084/mqtt"
                    className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] font-mono focus:outline-none focus:border-[#16B8C8]"
                    required
                  />
                </div>

                <div className="p-4 rounded-lg bg-[#F5F8FC] border border-[#E2E8F0] space-y-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
                    Subscribed &amp; Publish Topics (Sesuai Firmware ESP32)
                  </div>

                  <div>
                    <label className="block text-[#64748B] font-medium mb-1">
                      Subscribed Topic 1 (Telemetry)
                    </label>
                    <input
                      type="text"
                      value={draftConfig.subscribeTelemetryTopic}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          subscribeTelemetryTopic: e.target.value,
                        }))
                      }
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#16A34A] font-mono font-medium focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[#64748B] font-medium mb-1">
                      Subscribed Topic 2 (Event)
                    </label>
                    <input
                      type="text"
                      value={draftConfig.subscribeEventTopic}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          subscribeEventTopic: e.target.value,
                        }))
                      }
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#16A34A] font-mono font-medium focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[#64748B] font-medium mb-1">
                      Publish Topic (Command TRIP / RESET / STATUS)
                    </label>
                    <input
                      type="text"
                      value={draftConfig.publishCommandTopic}
                      onChange={(e) =>
                        setDraftConfig((prev) => ({
                          ...prev,
                          publishCommandTopic: e.target.value,
                        }))
                      }
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#15345B] font-mono font-semibold focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setShowBrokerModal(false)}
                    className="px-4 py-2 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#172B4D] font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan &amp; Connect</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Modal 2: Tambah Prototype ESP32 Baru ke GIS & MQTT */}
      {showAddNodeModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
            style={{ backgroundColor: 'rgba(21, 52, 91, 0.4)' }}
            onClick={() => setShowAddNodeModal(false)}
          >
            <div
              className="scada-modal w-full max-w-md my-auto overflow-hidden text-[#172B4D]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 bg-[#15345B] text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-sm font-semibold">
                  <Plus className="w-4 h-4 text-[#67ecfd]" />
                  <span>Tambah Prototype ESP32 Baru</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddNodeModal(false)}
                  className="text-[#d5e3ff] hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleAddPrototypeSubmit} className="p-6 space-y-4 text-xs bg-white">
                <p className="text-[#64748B] leading-relaxed">
                  Tambahkan Node ESP32 baru ke Peta GIS Gardu. Sistem juga otomatis mendeteksi ESP32
                  yang mengirim topik <code className="text-[#15345B] font-mono">sentinelx/&lt;NODE_ID&gt;/telemetry</code>.
                </p>

                <div>
                  <label className="block text-[#172B4D] font-semibold mb-1">
                    Node ID (Sesuai <code className="font-mono">NODE_ID</code> di Firmware ESP32)
                  </label>
                  <input
                    type="text"
                    value={newNodeId}
                    onChange={(e) => setNewNodeId(e.target.value)}
                    placeholder="Contoh: SENTINEL-X-02"
                    className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] font-mono font-semibold focus:outline-none focus:border-[#16B8C8]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[#172B4D] font-semibold mb-1">
                    Nama Lokasi Gardu Induk (GIS)
                  </label>
                  <input
                    type="text"
                    value={newSubstation}
                    onChange={(e) => setNewSubstation(e.target.value)}
                    placeholder="Contoh: GI 150kV Pandean Lamper"
                    className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[#172B4D] font-semibold mb-1">
                      Unit / Bay
                    </label>
                    <input
                      type="text"
                      value={newBay}
                      onChange={(e) => setNewBay(e.target.value)}
                      placeholder="Contoh: Bay-02"
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] focus:outline-none focus:border-[#16B8C8]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[#172B4D] font-semibold mb-1">
                      Koordinat GIS
                    </label>
                    <input
                      type="text"
                      value={newCoords}
                      onChange={(e) => setNewCoords(e.target.value)}
                      placeholder="7°00′12″S 110°26′30″E"
                      className="w-full h-9 px-3 rounded bg-white border border-[#E2E8F0] text-[#172B4D] font-mono focus:outline-none focus:border-[#16B8C8]"
                    />
                  </div>
                </div>

                <div className="p-3 rounded bg-[#F5F8FC] border border-[#E2E8F0] font-mono text-[11px] text-[#64748B] space-y-1">
                  <div>
                    SUB Telemetry:{' '}
                    <span className="text-[#16A34A]">
                      sentinelx/{newNodeId.trim() || 'SENTINEL-X-02'}/telemetry
                    </span>
                  </div>
                  <div>
                    PUB Command:{' '}
                    <span className="text-[#15345B]">
                      sentinelx/{newNodeId.trim() || 'SENTINEL-X-02'}/command
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
                  <button
                    type="button"
                    onClick={() => setShowAddNodeModal(false)}
                    className="px-4 py-2 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] text-[#172B4D] font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-4 py-2 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold cursor-pointer transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Simpan Prototype</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
};

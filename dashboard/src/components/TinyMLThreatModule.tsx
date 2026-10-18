import React from 'react';
import {
  Cpu,
  ShieldAlert,
  ShieldCheck,
  Power,
  RotateCcw,
  Terminal,
} from 'lucide-react';
import type { QuantizedTensorState, SentinelTelemetryPayload } from '../types/sentinel';
import { THREAT_THRESHOLD } from '../utils/tinymlEngine';

interface TinyMLThreatModuleProps {
  telemetry: SentinelTelemetryPayload;
  tensorState: QuantizedTensorState;
  systemHealthScore: number;
  autoTripEnabled: boolean;
  setAutoTripEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  sendCommand: (cmd: string) => void;
}

const SIMPLE_TENSOR_BARS = [
  { idx: 0, label: 'x[0] Arus Beban', color: 'bg-[#16B8C8]' },
  { idx: 1, label: 'x[1] Kadar Gas', color: 'bg-[#D97706]' },
  { idx: 2, label: 'x[2] Getaran MPU', color: 'bg-[#15345B]' },
  { idx: 3, label: 'x[3] Loop Keamanan', color: 'bg-[#DC2626]' },
];

export const TinyMLThreatModule: React.FC<TinyMLThreatModuleProps> = ({
  telemetry,
  tensorState,
  systemHealthScore,
  autoTripEnabled,
  setAutoTripEnabled,
  sendCommand,
}) => {
  const threat = telemetry.ai_engine.threat_idx;
  const isAlert = telemetry.status === 'EVENT_ALERT' || threat > THREAT_THRESHOLD;
  const isTripped = telemetry.relay_trip;

  return (
    <div className="flex flex-col gap-5">
      {/* CARD 1: Edge-AI TinyML Status & Threat Gauge */}
      <div className="scada-card p-5">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded bg-[#eff4ff] border border-[#d3e4fe] text-[#15345B]">
              <Cpu className="w-4 h-4 text-[#006972]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#172B4D]">Edge-AI TinyML INT8</h2>
              <p className="text-xs text-[#64748B] tabular-nums">
                Latensi {telemetry.ai_engine.latency_us} µs • Health {systemHealthScore}%
              </p>
            </div>
          </div>

          <div className="text-right tabular-nums">
            <span
              className={`text-[24px] leading-7 font-bold ${
                threat > 75
                  ? 'text-[#DC2626]'
                  : threat > THREAT_THRESHOLD
                    ? 'text-[#D97706]'
                    : 'text-[#16A34A]'
              }`}
            >
              {threat}%
            </span>
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Threat Index
            </div>
          </div>
        </div>

        {/* Threat Progress Bar */}
        <div className="mb-4">
          <div className="relative h-2.5 w-full rounded-full bg-[#eff4ff] overflow-hidden border border-[#d3e4fe]">
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#D97706] z-10"
              style={{ left: `${THREAT_THRESHOLD}%` }}
              title="Ambang Batas 55%"
            />
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                threat > 75
                  ? 'bg-[#DC2626]'
                  : threat > THREAT_THRESHOLD
                    ? 'bg-[#D97706]'
                    : 'bg-[#16A34A]'
              }`}
              style={{ width: `${Math.min(100, Math.max(3, threat))}%` }}
            />
          </div>
          <div className="flex justify-between text-[11px] font-medium text-[#64748B] mt-1.5 tabular-nums">
            <span>Aman (0%)</span>
            <span className="text-[#D97706] font-semibold">Threshold 55%</span>
            <span>Kritis (100%)</span>
          </div>
        </div>

        {/* Diagnostic Classification Banner (3px solid left border per DESIGN.md) */}
        <div
          className={`p-3 rounded border border-[#E2E8F0] border-l-[3px] flex items-center gap-3 mb-4 ${
            isAlert
              ? 'border-l-[#DC2626] bg-[#ffdad6]/30 text-[#93000a]'
              : 'border-l-[#16A34A] bg-[#16A34A]/5 text-[#172B4D]'
          }`}
        >
          {isAlert ? (
            <ShieldAlert className="w-5 h-5 text-[#DC2626] shrink-0" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-[#16A34A] shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Klasifikasi AI Saat Ini
            </div>
            <div className="text-xs font-mono font-bold truncate text-[#172B4D]">
              {telemetry.ai_engine.class}
            </div>
          </div>
        </div>

        {/* INT8 Input Tensor Bars */}
        <div className="space-y-2.5 pt-3 border-t border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[#64748B]">
              Input Tensor Terkuantisasi (INT8)
            </span>
            <span className="font-mono text-[11px] text-[#64748B] tabular-nums">0–127</span>
          </div>
          {SIMPLE_TENSOR_BARS.map((item) => {
            const val = tensorState.x[item.idx];
            const pct = Math.round((val / 127) * 100);
            return (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-xs tabular-nums">
                  <span className="text-[#172B4D] font-medium">{item.label}</span>
                  <span className="font-mono text-[#64748B] font-semibold">{val} / 127</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#eff4ff] border border-[#d3e4fe] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${item.color}`}
                    style={{ width: `${Math.max(2, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* CARD 2: Interlok Proteksi SCADA (Software Cut-Off) */}
      <div
        className={`scada-card p-5 ${
          isTripped ? 'border-[#DC2626] bg-[#ffdad6]/15' : ''
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded border ${
                isTripped
                  ? 'bg-[#DC2626]/10 border-[#DC2626]/30 text-[#DC2626]'
                  : 'bg-[#eff4ff] border-[#d3e4fe] text-[#15345B]'
              }`}
            >
              <Power className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#172B4D]">
                Interlok Proteksi SCADA
              </h2>
              <p className="text-xs text-[#64748B]">
                Software Cut-Off &amp; Sinkronisasi Status {telemetry.node}
              </p>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold uppercase tracking-[0.04em] ${
              isTripped
                ? 'bg-[#DC2626]/10 text-[#DC2626]'
                : 'bg-[#16A34A]/10 text-[#16A34A]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isTripped ? 'bg-[#DC2626]' : 'bg-[#16A34A]'
              }`}
            />
            {isTripped ? 'CUT-OFF AKTIF' : 'TERHUBUNG'}
          </span>
        </div>

        {/* Status Feedback Box */}
        <div
          className={`p-2.5 rounded border text-xs mb-3 flex items-center justify-between ${
            isTripped
              ? 'bg-[#ffdad6]/40 border-[#DC2626]/30 text-[#93000a]'
              : 'bg-[#F5F8FC] border-[#E2E8F0] text-[#64748B]'
          }`}
        >
          <span>Status Interlok Sistem:</span>
          <strong className="font-mono">
            {isTripped ? 'EMERGENCY_DISCONNECT (TRIP)' : 'BAY_NORMAL (CLOSED)'}
          </strong>
        </div>

        {/* Auto-Trip Switch (Checkbox style per DESIGN.md) */}
        <label className="flex items-center justify-between p-3 rounded bg-[#F5F8FC] border border-[#E2E8F0] mb-3 cursor-pointer hover:border-[#CBD5E1] transition-colors">
          <span className="text-xs font-medium text-[#172B4D]">
            Auto-Cut-Off Otonom saat Threat &gt; 75%
          </span>
          <input
            type="checkbox"
            checked={autoTripEnabled}
            onChange={(e) => setAutoTripEnabled(e.target.checked)}
            className="w-4 h-4 accent-[#15345B] cursor-pointer"
          />
        </label>

        {/* Action Buttons per DESIGN.md (Destructive #DC2626, Accent #16B8C8, Secondary Outlined) */}
        <div className="space-y-2 text-xs font-semibold">
          <button
            type="button"
            onClick={() => sendCommand('TRIP')}
            className="w-full py-2.5 px-4 rounded bg-[#DC2626] hover:bg-[#b91c1c] text-white transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Aktifkan Cut-Off Darurat (TRIP)</span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => sendCommand('RESET')}
              className="py-2 px-3 rounded bg-[#16B8C8] hover:bg-[#006972] text-white transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Interlok</span>
            </button>

            <button
              type="button"
              onClick={() => sendCommand('STATUS')}
              className="py-2 px-3 rounded bg-white hover:bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#CBD5E1] text-[#172B4D] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-[#15345B]" />
              <span>Cek Status</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Power,
  RotateCcw,
  TrendingUp,
  Clock,
  CheckCircle2,
  Activity,
  Radio,
} from 'lucide-react';
import type {
  SentinelTelemetryPayload,
  TelemetryHistoryPoint,
} from '../types/sentinel';
import { evaluateTransformerDiagnostics } from '../utils/transformerDiagnosticEngine';

interface TransformerAdvisorModuleProps {
  telemetry: SentinelTelemetryPayload;
  history: TelemetryHistoryPoint[];
  sendCommand: (cmd: string) => void;
}

export const TransformerAdvisorModule: React.FC<TransformerAdvisorModuleProps> = ({
  telemetry,
  history,
  sendCommand,
}) => {
  const report = useMemo(
    () => evaluateTransformerDiagnostics(telemetry, history),
    [telemetry, history]
  );

  const isCritical = report.urgency === 'CRITICAL_SHUTDOWN';
  const isPreventive = report.urgency === 'PREVENTIVE_TREND';
  const isTripped = telemetry.relay_trip;

  // Theme helpers
  const statusColor = isCritical
    ? 'text-[#DC2626]'
    : isPreventive
      ? 'text-[#D97706]'
      : 'text-[#16A34A]';

  const badgeBg = isCritical
    ? 'bg-[#DC2626] text-white'
    : isPreventive
      ? 'bg-[#D97706] text-white'
      : 'bg-[#16A34A] text-white';

  const borderColor = isCritical
    ? 'border-[#DC2626]'
    : isPreventive
      ? 'border-[#D97706]'
      : 'border-[#16B8C8]/50';

  return (
    <section className={`scada-card overflow-hidden border-2 transition-all ${borderColor}`}>
      {/* 1. Header Bar: Clean & Minimal */}
      <div className="px-5 py-3 bg-[#15345B] text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#001f40] border border-[#67ecfd]/40 flex items-center justify-center text-[#67ecfd] shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold tracking-tight text-white flex items-center gap-2">
              <span>Kesehatan Trafo &amp; Rekomendasi Preskriptif</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#001f40] text-[#67ecfd] border border-[#67ecfd]/30">
                {telemetry.node}
              </span>
            </h2>
          </div>
        </div>

        {/* Realtime Live Telemetry Indicator */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-[#001f40] border border-[#67ecfd]/40 text-[#67ecfd] text-xs font-mono font-bold tracking-wide">
            <Radio className="w-3.5 h-3.5 animate-pulse text-[#67ecfd]" />
            <span>TELEMETRI REALTIME</span>
          </div>
        </div>
      </div>

      {/* 2. Main Content: Direct Health Percentage & Direct Recommendations */}
      <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch bg-white">
        {/* LEFT (5 COLS): Persentase Kesehatan Trafo & 4 Pilar Ringkas */}
        <div className="lg:col-span-5 p-4 rounded-xl bg-[#F5F8FC] border border-[#E2E8F0] flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#64748B] mb-2 flex items-center justify-between">
              <span>Indeks Kesehatan Trafo</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${badgeBg}`}>
                {report.conditionGrade}
              </span>
            </div>

            {/* Big Health Number Hero */}
            <div className="flex items-baseline gap-3 my-2">
              <div className={`text-5xl font-black tracking-tight tabular-nums ${statusColor}`}>
                {report.overallHealthScore}%
              </div>
              <div className="text-xs font-semibold text-[#172B4D] leading-tight">
                <div className="font-bold text-sm text-[#15345B]">{report.conditionTitle}</div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  {report.overallHealthScore >= 85
                    ? 'Kondisi operasional trafo sangat prima dan stabil'
                    : report.overallHealthScore >= 60
                      ? 'Gejala penurunan isolasi atau keausan terdeteksi'
                      : 'Kondisi kritis, diperlukan tindakan perlindungan segera'}
                </div>
              </div>
            </div>
          </div>

          {/* 4 Pilar Diagnostik: Compact visual progress bars */}
          <div className="mt-4 pt-3 border-t border-[#E2E8F0] space-y-2.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
              4 Pilar Kondisi Sensor
            </div>
            <div className="grid grid-cols-2 gap-2">
              {report.pillars.map((pillar) => {
                const barColor =
                  pillar.level === 'critical'
                    ? 'bg-[#DC2626]'
                    : pillar.level === 'warning'
                      ? 'bg-[#D97706]'
                      : 'bg-[#16A34A]';

                return (
                  <div
                    key={pillar.id}
                    className="p-2 rounded-lg bg-white border border-[#E2E8F0] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-[#172B4D] truncate">{pillar.title}</span>
                      <span className="font-mono font-bold text-[#15345B]">{pillar.score}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-[#E2E8F0] rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${pillar.score}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono mt-1 text-[#64748B]">
                      <span>{pillar.currentValueText}</span>
                      <span
                        className={`font-semibold ${
                          pillar.level === 'critical'
                            ? 'text-[#DC2626]'
                            : pillar.level === 'warning'
                              ? 'text-[#D97706]'
                              : 'text-[#16A34A]'
                        }`}
                      >
                        {pillar.statusLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT (7 COLS): Rekomendasi Tindakan Langsung & 1-Click Execution */}
        <div
          className={`lg:col-span-7 p-4 rounded-xl border flex flex-col justify-between gap-4 ${
            isCritical
              ? 'bg-[#FEF2F2] border-[#DC2626]'
              : isPreventive
                ? 'bg-[#FFFBEB] border-[#D97706]'
                : 'bg-[#F0FDF4] border-[#16A34A]/40'
          }`}
        >
          <div>
            {/* Header: Target Respons */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-black/10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#172B4D] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#15345B]" />
                <span>Rekomendasi Tindakan:</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isCritical
                    ? 'bg-[#DC2626] text-white'
                    : isPreventive
                      ? 'bg-[#D97706] text-white'
                      : 'bg-[#16A34A] text-white'
                }`}
              >
                {report.estimatedInspectionWindow}
              </span>
            </div>

            {/* Direct Recommendation Title */}
            <div className="mt-3">
              <h3
                className={`text-base sm:text-lg font-black leading-snug flex items-start gap-2 ${
                  isCritical
                    ? 'text-[#991B1B]'
                    : isPreventive
                      ? 'text-[#92400E]'
                      : 'text-[#166534]'
                }`}
              >
                {isCritical ? (
                  <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5 text-[#DC2626]" />
                ) : isPreventive ? (
                  <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#D97706]" />
                ) : (
                  <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-[#16A34A]" />
                )}
                <span>{report.primaryRecommendationTitle}</span>
              </h3>
            </div>

            {/* Direct Action Checklist (Clean & Concise, no bloated paragraphs) */}
            <div className="mt-3 space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Langkah yang Harus Dilakukan:
              </div>
              <ul className="space-y-1.5 text-xs text-[#172B4D]">
                {report.actionSteps.map((step, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 bg-white/90 px-3 py-2 rounded-lg border border-[#E2E8F0] shadow-2xs font-medium"
                  >
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        isCritical
                          ? 'text-[#DC2626]'
                          : isPreventive
                            ? 'text-[#D97706]'
                            : 'text-[#16A34A]'
                      }`}
                    />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 1-Click Action Button (If Shutdown Recommended or Tripped) */}
          {(report.recommendShutdownTrip || isTripped) && (
            <div className="pt-2">
              {!isTripped ? (
                <button
                  type="button"
                  onClick={() => sendCommand('TRIP')}
                  className="w-full py-3 px-4 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-xs sm:text-sm font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all active:scale-[0.99]"
                >
                  <Power className="w-4 h-4" />
                  <span>Matikan Mesin / Trafo Sementara (Eksekusi TRIP)</span>
                </button>
              ) : (
                <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-2.5 bg-white border border-[#16A34A] p-2.5 rounded-xl shadow-xs">
                  <span className="text-xs font-bold text-[#16A34A] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4" />
                    Mesin Telah Dimatikan Sementara (Kondisi Aman dari Percikan)
                  </span>
                  <button
                    type="button"
                    onClick={() => sendCommand('RESET')}
                    className="w-full sm:w-auto px-3.5 py-1.5 rounded-lg bg-[#15345B] hover:bg-[#001f40] text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Hidupkan Kembali (RESET)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Mini 7-Day Trend Chart: Clean Sparkline */}
          <div className="p-2.5 rounded-lg bg-white border border-[#E2E8F0]">
            <div className="flex items-center justify-between mb-1 text-[11px]">
              <span className="font-bold text-[#172B4D] flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-[#006972]" />
                <span>Trajektori Tren 7-Hari</span>
              </span>
              <span className="font-mono text-[#64748B]">
                Gas:{' '}
                <strong className="text-[#172B4D]">
                  {report.dailyTrend[report.dailyTrend.length - 1]?.gas_ppm} ppm
                </strong>{' '}
                • Skor: <strong className={statusColor}>{report.overallHealthScore}%</strong>
              </span>
            </div>

            <div className="h-24 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={report.dailyTrend}
                  margin={{ top: 2, right: 6, left: -25, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="advisorTrendGasClean" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={isCritical ? '#DC2626' : isPreventive ? '#D97706' : '#16B8C8'}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={isCritical ? '#DC2626' : isPreventive ? '#D97706' : '#16B8C8'}
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#64748B', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#64748B', fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      borderColor: '#E2E8F0',
                      borderRadius: '6px',
                      fontSize: '10px',
                      color: '#172B4D',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="gas_ppm"
                    name="Gas (ppm)"
                    stroke={isCritical ? '#DC2626' : isPreventive ? '#D97706' : '#16B8C8'}
                    strokeWidth={2}
                    fill="url(#advisorTrendGasClean)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

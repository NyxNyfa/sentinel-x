import React, { useState } from 'react';
import { Terminal, Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { AuditLogEntry, MqttBrokerConfig } from '../types/sentinel';

interface ScadaAuditTerminalProps {
  logs: AuditLogEntry[];
  clearLogs: () => void;
  sendCommand: (cmd: string) => void;
  mqttConfig: MqttBrokerConfig;
}

export const ScadaAuditTerminal: React.FC<ScadaAuditTerminalProps> = ({
  logs,
  clearLogs,
  sendCommand,
  mqttConfig,
}) => {
  const [cmdInput, setCmdInput] = useState('');
  const [expanded, setExpanded] = useState(true);

  const handleSubmitCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim()) return;
    sendCommand(cmdInput);
    setCmdInput('');
  };

  return (
    <section className="scada-card overflow-hidden">
      {/* Table Header style from DESIGN.md (#F8FAFC with 1px bottom border #E2E8F0) */}
      <div className="px-5 py-3 bg-[#F8FAFC] border-b border-[#E2E8F0] flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Terminal className="w-4 h-4 text-[#15345B]" />
          <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-[#172B4D]">
            Log Telemetri MQTT &amp; Perintah SCADA
          </h2>
          <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-0.5 rounded bg-[#16A34A]/10 text-[#16A34A] font-medium">
              SUB: {mqttConfig.subscribeTelemetryTopic} &amp; {mqttConfig.subscribeEventTopic}
            </span>
            <span className="px-2 py-0.5 rounded bg-[#eff4ff] border border-[#d3e4fe] text-[#15345B] font-medium">
              PUB: {mqttConfig.publishCommandTopic}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clearLogs}
            className="p-1.5 rounded bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-[#64748B] hover:text-[#DC2626] transition-colors cursor-pointer"
            title="Bersihkan Log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-white hover:bg-[#F1F5F9] border border-[#E2E8F0] text-xs font-medium text-[#172B4D] cursor-pointer"
          >
            <span>{expanded ? 'Sembunyikan' : 'Tampilkan'}</span>
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <>
          {/* Compact Log Stream */}
          <div className="h-36 overflow-y-auto p-3.5 bg-white font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <div className="text-[#94A3B8] text-center py-8">
                Menunggu paket JSON MQTT dari ESP32...
              </div>
            ) : (
              logs.slice(0, 40).map((item) => {
                const rowColor =
                  item.level === 'critical'
                    ? 'text-[#DC2626] font-semibold'
                    : item.level === 'warn'
                      ? 'text-[#D97706] font-medium'
                      : item.level === 'emerald'
                        ? 'text-[#16A34A] font-medium'
                        : 'text-[#172B4D]';

                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 py-1 px-2 rounded hover:bg-[#F1F5F9] transition-colors tabular-nums"
                  >
                    <span className="text-[#64748B] shrink-0">{item.timestamp}</span>
                    <span className="text-[#15345B] shrink-0 font-semibold">
                      [{item.direction}:{item.source}]
                    </span>
                    <span className="text-[#006972] shrink-0 hidden sm:inline">
                      [{item.topicOrPort}]
                    </span>
                    <code className={`break-all ${rowColor}`}>{item.rawPayload}</code>
                  </div>
                );
              })
            )}
          </div>

          {/* Command Input Bar */}
          <form
            onSubmit={handleSubmitCommand}
            className="px-4 py-2.5 bg-[#F8FAFC] border-t border-[#E2E8F0] flex items-center gap-2 text-xs"
          >
            <input
              type="text"
              value={cmdInput}
              onChange={(e) => setCmdInput(e.target.value)}
              placeholder={`Publish ke ${mqttConfig.publishCommandTopic} ("TRIP", "RESET", "STATUS")...`}
              className="flex-1 h-9 bg-white border border-[#E2E8F0] rounded px-3.5 text-[#172B4D] font-mono placeholder:text-[#94A3B8] focus:outline-none focus:border-[#16B8C8] focus:ring-2 focus:ring-[#16B8C8]/20"
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 h-9 px-4 rounded bg-[#15345B] hover:bg-[#001f40] text-white font-semibold cursor-pointer transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publish</span>
            </button>
          </form>
        </>
      )}
    </section>
  );
};

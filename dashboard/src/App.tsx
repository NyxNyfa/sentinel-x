import { useSentinelTelemetry } from './hooks/useSentinelTelemetry';
import { TopScadaBar } from './components/TopScadaBar';
import { TinyMLThreatModule } from './components/TinyMLThreatModule';
import { MultiModalChartsModule } from './components/MultiModalChartsModule';
import { ScadaAuditTerminal } from './components/ScadaAuditTerminal';

export function App() {
  const {
    telemetry,
    tensorState,
    fftSpectrum,
    history,
    systemHealthScore,
    connectionState,
    mqttConfig,
    setMqttConfig,
    connectMqtt,
    sendCommand,
    logs,
    clearLogs,
    autoTripEnabled,
    setAutoTripEnabled,
    audioMuted,
    setAudioMuted,
    packetsReceived,
    lastPacketTime,
    prototypes,
    activeNodeId,
    selectNode,
    addPrototype,
    removePrototype,
    updatePrototypeCoordinates,
  } = useSentinelTelemetry();

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-[#172B4D] flex flex-col">
      {/* Top Navigation & Connection Bar */}
      <TopScadaBar
        telemetry={telemetry}
        systemHealthScore={systemHealthScore}
        connectionState={connectionState}
        mqttConfig={mqttConfig}
        setMqttConfig={setMqttConfig}
        connectMqtt={connectMqtt}
        audioMuted={audioMuted}
        setAudioMuted={setAudioMuted}
        packetsReceived={packetsReceived}
        lastPacketTime={lastPacketTime}
        prototypes={prototypes}
        activeNodeId={activeNodeId}
        selectNode={selectNode}
        addPrototype={addPrototype}
      />

      {/* Main 12-Column SCADA Operational Layout on #F5F8FC Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 Columns: 4 Instrumentation Cards + Tabbed Charts/GIS */}
          <div className="lg:col-span-8">
            <MultiModalChartsModule
              telemetry={telemetry}
              history={history}
              fftSpectrum={fftSpectrum}
              systemHealthScore={systemHealthScore}
              prototypes={prototypes}
              activeNodeId={activeNodeId}
              selectNode={selectNode}
              addPrototype={addPrototype}
              removePrototype={removePrototype}
              updatePrototypeCoordinates={updatePrototypeCoordinates}
            />
          </div>

          {/* Right 4 Columns: TinyML Threat Engine + Software Cut-Off Interlock Control */}
          <div className="lg:col-span-4">
            <TinyMLThreatModule
              telemetry={telemetry}
              tensorState={tensorState}
              systemHealthScore={systemHealthScore}
              autoTripEnabled={autoTripEnabled}
              setAutoTripEnabled={setAutoTripEnabled}
              sendCommand={sendCommand}
            />
          </div>
        </div>

        {/* Bottom Collapsible Audit Log & Command Bar */}
        <ScadaAuditTerminal
          logs={logs}
          clearLogs={clearLogs}
          sendCommand={sendCommand}
          mqttConfig={mqttConfig}
        />
      </main>

      {/* Clean Industrial SCADA Footer */}
      <footer className="w-full bg-white border-t border-[#E2E8F0] py-3.5 px-4 sm:px-8 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between text-xs text-[#64748B] gap-2">
          <div>
            <strong className="text-[#15345B]">SENTINEL-X</strong> © 2026 Smart Edge-Native AIoT SCADA Console
          </div>
          <div className="flex items-center gap-4 tabular-nums">
            <span>Node Aktif: {telemetry.node}</span>
            <span>Prototype Terdaftar: {prototypes.length}</span>
            <span>TinyML Latency: {telemetry.ai_engine.latency_us} µs</span>
            <span className="flex items-center gap-1.5 text-[#16A34A] font-semibold">
              <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
              System Active
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;

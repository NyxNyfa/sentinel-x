import { useCallback, useEffect, useRef, useState } from 'react';
import mqtt from 'mqtt';
import type { MqttClient } from 'mqtt';
import type {
  AuditLogEntry,
  ConnectionState,
  FFTBin,
  MqttBrokerConfig,
  PrototypeNode,
  QuantizedTensorState,
  SentinelInterlockEventPayload,
  SentinelMetrics,
  SentinelTelemetryPayload,
  TelemetryHistoryPoint,
} from '../types/sentinel';
import {
  computeSystemHealth,
  evaluateTinyMLInt8,
  generateFFTSpectrum,
  playScadaSound,
} from '../utils/tinymlEngine';

const INITIAL_METRICS: SentinelMetrics = {
  I_rms: 4.25,
  gas_ppm: 45.0,
  vib_g: 0.0124,
  bus_secure: true,
};

const INITIAL_TELEMETRY: SentinelTelemetryPayload = {
  node: 'SENTINEL-X-01',
  metrics: INITIAL_METRICS,
  ai_engine: {
    class: 'NOMINAL_OPERATION',
    threat_idx: 12,
    latency_us: 42,
  },
  status: 'NORMAL',
  relay_trip: false,
};

const DEFAULT_MQTT_CONFIG: MqttBrokerConfig = {
  brokerUrl: 'wss://broker.emqx.io:8084/mqtt',
  nodeId: 'SENTINEL-X-01',
  subscribeTelemetryTopic: 'sentinelx/SENTINEL-X-01/telemetry',
  subscribeEventTopic: 'sentinelx/SENTINEL-X-01/event',
  publishCommandTopic: 'sentinelx/SENTINEL-X-01/command',
};

// Preset GIS coordinates for auto-discovered or newly added prototypes
const GIS_SLOT_POSITIONS: Array<{
  mapX: number;
  mapY: number;
  substationName: string;
  bayName: string;
  coordinatesText: string;
}> = [
  {
    mapX: 170,
    mapY: 110,
    substationName: 'GI 150kV Krapyak Semarang',
    bayName: 'Bay-01 Penghantar',
    coordinatesText: '6°59′04″S 110°21′45″E',
  },
  {
    mapX: 370,
    mapY: 72,
    substationName: 'GI 150kV Pandean Lamper',
    bayName: 'Bay-02 Trafo',
    coordinatesText: '7°00′12″S 110°26′30″E',
  },
  {
    mapX: 340,
    mapY: 162,
    substationName: 'GI 150kV Ungaran',
    bayName: 'Bay-03 Kopel',
    coordinatesText: '7°08′21″S 110°24′18″E',
  },
  {
    mapX: 495,
    mapY: 115,
    substationName: 'GI 150kV Tanjung Jati',
    bayName: 'Bay-04 Feeder',
    coordinatesText: '6°57′40″S 110°29′10″E',
  },
  {
    mapX: 115,
    mapY: 168,
    substationName: 'GI 150kV Kaliwungu',
    bayName: 'Bay-05 Distribusi',
    coordinatesText: '6°57′18″S 110°15′09″E',
  },
];

function formatTimeHMS(date: Date): string {
  return date.toTimeString().split(' ')[0] + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

function createInitialHistory(): TelemetryHistoryPoint[] {
  const now = Date.now();
  const pts: TelemetryHistoryPoint[] = [];
  for (let i = 59; i >= 0; i--) {
    const t = new Date(now - i * 500);
    pts.push({
      timestamp: t.toTimeString().split(' ')[0],
      timeMs: t.getTime(),
      I_rms: INITIAL_METRICS.I_rms,
      gas_ppm: INITIAL_METRICS.gas_ppm,
      vib_g: INITIAL_METRICS.vib_g,
      threat_idx: 12,
      health_score: 92,
      latency_us: 42,
      bus_secure: 1,
    });
  }
  return pts;
}

export interface AddPrototypeInput {
  nodeId: string;
  substationName: string;
  bayName: string;
  coordinatesText?: string;
}

export function useSentinelTelemetry() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('DISCONNECTED');
  const [mqttConfig, setMqttConfig] = useState<MqttBrokerConfig>(DEFAULT_MQTT_CONFIG);

  const [activeNodeId, setActiveNodeId] = useState<string>('SENTINEL-X-01');
  const [prototypes, setPrototypes] = useState<PrototypeNode[]>(() => [
    {
      nodeId: 'SENTINEL-X-01',
      substationName: GIS_SLOT_POSITIONS[0].substationName,
      bayName: GIS_SLOT_POSITIONS[0].bayName,
      coordinatesText: GIS_SLOT_POSITIONS[0].coordinatesText,
      mapX: GIS_SLOT_POSITIONS[0].mapX,
      mapY: GIS_SLOT_POSITIONS[0].mapY,
      connected: false,
      lastSeenMs: null,
      lastSeenLabel: 'MENUNGGU...',
      packetsCount: 0,
      telemetry: INITIAL_TELEMETRY,
    },
  ]);

  const [telemetry, setTelemetry] = useState<SentinelTelemetryPayload>(INITIAL_TELEMETRY);
  const [tensorState, setTensorState] = useState<QuantizedTensorState>(() =>
    evaluateTinyMLInt8(INITIAL_METRICS).tensor
  );
  const [fftSpectrum, setFftSpectrum] = useState<FFTBin[]>(() =>
    generateFFTSpectrum(INITIAL_METRICS.vib_g, 'NOMINAL_OPERATION', 0)
  );
  const [historyByNode, setHistoryByNode] = useState<Record<string, TelemetryHistoryPoint[]>>(() => ({
    'SENTINEL-X-01': createInitialHistory(),
  }));

  const [logs, setLogs] = useState<AuditLogEntry[]>(() => [
    {
      id: 'init-1',
      timestamp: formatTimeHMS(new Date()),
      direction: 'SYS',
      source: 'SCADA',
      topicOrPort: 'MQTT//INIT',
      rawPayload:
        'SENTINEL-X SCADA Ready [Broker: wss://broker.emqx.io:8084/mqtt | SUB: sentinelx/+/telemetry & event | PUB: sentinelx/SENTINEL-X-01/command]',
      level: 'emerald',
    },
  ]);

  // Protection & Audio settings
  const [autoTripEnabled, setAutoTripEnabled] = useState<boolean>(false);
  const [audioMuted, setAudioMuted] = useState<boolean>(false);
  const [packetsReceived, setPacketsReceived] = useState<number>(0);
  const [lastPacketTime, setLastPacketTime] = useState<string>('WAITING...');

  // Refs for mutable access inside MQTT callbacks
  const mqttClientRef = useRef<MqttClient | null>(null);
  const relayTripByNodeRef = useRef<Record<string, boolean>>({ 'SENTINEL-X-01': false });
  // Holds software cut-off lock when user clicks TRIP/RESET so in-flight 500ms telemetry doesn't revert UI
  const commandOverrideByNodeRef = useRef<
    Record<string, { desiredTrip: boolean; timestampMs: number }>
  >({});
  const tickCounterRef = useRef<number>(1);
  const audioMutedRef = useRef<boolean>(false);
  const mqttConfigRef = useRef<MqttBrokerConfig>(mqttConfig);
  const activeNodeIdRef = useRef<string>(activeNodeId);

  useEffect(() => {
    audioMutedRef.current = audioMuted;
  }, [audioMuted]);

  useEffect(() => {
    mqttConfigRef.current = mqttConfig;
  }, [mqttConfig]);

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId;
  }, [activeNodeId]);

  // Liveness checker: mark ESP32 node as offline if no telemetry received for > 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPrototypes((prev) =>
        prev.map((node) => {
          if (node.connected && node.lastSeenMs && now - node.lastSeenMs > 10000) {
            return { ...node, connected: false };
          }
          return node;
        })
      );
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const appendLog = useCallback(
    (
      direction: AuditLogEntry['direction'],
      source: AuditLogEntry['source'],
      topicOrPort: string,
      rawPayload: string,
      level: AuditLogEntry['level'] = 'info'
    ) => {
      const entry: AuditLogEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: formatTimeHMS(new Date()),
        direction,
        source,
        topicOrPort,
        rawPayload,
        level,
      };
      setLogs((prev) => [entry, ...prev.slice(0, 149)]);
    },
    []
  );

  // Extract nodeId from topic if missing in payload (e.g., sentinelx/SENTINEL-X-02/telemetry)
  const extractNodeFromTopic = (topic: string): string | null => {
    const parts = topic.split('/');
    if (parts.length >= 3 && parts[0] === 'sentinelx') {
      if (parts[1] === 'daniyal' && parts.length >= 4) {
        return parts[2];
      }
      if (parts[1] !== '+' && parts[1] !== 'command') {
        return parts[1];
      }
    }
    return null;
  };

  // Unified packet ingestion handler for MQTT
  const ingestTelemetryPayload = useCallback(
    (payload: SentinelTelemetryPayload, topicOrPort: string, rawString?: string) => {
      tickCounterRef.current += 1;
      const tick = tickCounterRef.current;

      const topicNode = extractNodeFromTopic(topicOrPort);
      const nodeId = (payload.node || topicNode || mqttConfigRef.current.nodeId || 'SENTINEL-X-01').trim();

      const normalizedMetrics: SentinelMetrics = {
        I_rms: Number(payload.metrics?.I_rms ?? 4.25),
        gas_ppm: Number(payload.metrics?.gas_ppm ?? 45.0),
        vib_g: Number(payload.metrics?.vib_g ?? 0.0124),
        bus_secure: Boolean(payload.metrics?.bus_secure ?? true),
      };

      const evalResult = evaluateTinyMLInt8(normalizedMetrics);
      const aiEngine = payload.ai_engine ?? {
        class: evalResult.label,
        threat_idx: evalResult.threat,
        latency_us: evalResult.latency_us,
      };

      const nowMs = Date.now();
      const now = new Date(nowMs);
      const formattedTime = formatTimeHMS(now);
      const timeLabel = now.toTimeString().split(' ')[0];

      // Check if user recently triggered a Software Cut-Off command (TRIP / RESET)
      let effectiveRelayTrip = Boolean(payload.relay_trip);
      const override = commandOverrideByNodeRef.current[nodeId];
      if (override) {
        if (effectiveRelayTrip === override.desiredTrip) {
          // Hardware has confirmed and synced with our desired state!
          delete commandOverrideByNodeRef.current[nodeId];
        } else if (nowMs - override.timestampMs < 4000) {
          // Grace period: prevent in-flight telemetry from reverting software cut-off state
          effectiveRelayTrip = override.desiredTrip;
        } else {
          // Re-publish command to ESP32 once if it still hasn't synced, and keep software override
          effectiveRelayTrip = override.desiredTrip;
          if (mqttClientRef.current && mqttClientRef.current.connected) {
            mqttClientRef.current.publish(
              `sentinelx/${nodeId}/command`,
              override.desiredTrip ? 'TRIP' : 'RESET',
              { qos: 0 }
            );
          }
          override.timestampMs = nowMs;
        }
      }

      const cleanPayload: SentinelTelemetryPayload = {
        node: nodeId,
        metrics: normalizedMetrics,
        ai_engine: {
          class: aiEngine.class,
          threat_idx: Number(aiEngine.threat_idx),
          latency_us: Number(aiEngine.latency_us || evalResult.latency_us),
        },
        status: payload.status || evalResult.status,
        relay_trip: effectiveRelayTrip,
      };

      relayTripByNodeRef.current[nodeId] = cleanPayload.relay_trip;

      // Update or auto-register this ESP32 prototype in `prototypes`
      setPrototypes((prev) => {
        const existingIdx = prev.findIndex((p) => p.nodeId === nodeId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          const existing = updated[existingIdx];
          updated[existingIdx] = {
            ...existing,
            connected: true,
            lastSeenMs: nowMs,
            lastSeenLabel: formattedTime,
            packetsCount: existing.packetsCount + 1,
            telemetry: cleanPayload,
          };
          return updated;
        } else {
          const slot = GIS_SLOT_POSITIONS[prev.length % GIS_SLOT_POSITIONS.length];
          const newNode: PrototypeNode = {
            nodeId,
            substationName: slot.substationName,
            bayName: `Bay-0${prev.length + 1}`,
            coordinatesText: slot.coordinatesText,
            mapX: slot.mapX,
            mapY: slot.mapY,
            connected: true,
            lastSeenMs: nowMs,
            lastSeenLabel: formattedTime,
            packetsCount: 1,
            telemetry: cleanPayload,
          };
          return [...prev, newNode];
        }
      });

      const healthScore = computeSystemHealth(cleanPayload.ai_engine.threat_idx);

      setHistoryByNode((prev) => {
        const nodeHistory = prev[nodeId] || createInitialHistory();
        const nextPoint: TelemetryHistoryPoint = {
          timestamp: timeLabel,
          timeMs: nowMs,
          I_rms: Number(normalizedMetrics.I_rms.toFixed(2)),
          gas_ppm: Number(normalizedMetrics.gas_ppm.toFixed(1)),
          vib_g: Number(normalizedMetrics.vib_g.toFixed(4)),
          threat_idx: cleanPayload.ai_engine.threat_idx,
          health_score: healthScore,
          latency_us: cleanPayload.ai_engine.latency_us,
          bus_secure: normalizedMetrics.bus_secure ? 1 : 0,
        };
        return {
          ...prev,
          [nodeId]: [...nodeHistory.slice(-59), nextPoint],
        };
      });

      setPacketsReceived((c) => c + 1);
      setLastPacketTime(formattedTime);

      // Update primary view if this packet belongs to the currently selected prototype
      if (nodeId === activeNodeIdRef.current) {
        setTelemetry(cleanPayload);
        setTensorState(evalResult.tensor);
        setFftSpectrum(
          generateFFTSpectrum(normalizedMetrics.vib_g, cleanPayload.ai_engine.class, tick)
        );
      }

      const serialized = rawString || JSON.stringify(cleanPayload);
      const isAlert =
        cleanPayload.status === 'EVENT_ALERT' || cleanPayload.ai_engine.threat_idx > 55;

      appendLog(
        'RX',
        'MQTT',
        topicOrPort,
        serialized,
        cleanPayload.relay_trip ? 'critical' : isAlert ? 'warn' : 'info'
      );

      if (isAlert && tick % 3 === 0) {
        playScadaSound('alert', audioMutedRef.current);
      }
    },
    [appendLog]
  );

  // Unified Interlock Event handler ({"scada_cmd":"EMERGENCY_DISCONNECT_EXECUTED","relay_trip":true})
  const ingestInterlockEvent = useCallback(
    (
      eventObj: SentinelInterlockEventPayload,
      source: 'MQTT' | 'SCADA',
      topicOrPort: string,
      rawString?: string
    ) => {
      const tripped = Boolean(eventObj.relay_trip);
      const topicNode = extractNodeFromTopic(topicOrPort) || activeNodeIdRef.current;

      relayTripByNodeRef.current[topicNode] = tripped;
      commandOverrideByNodeRef.current[topicNode] = {
        desiredTrip: tripped,
        timestampMs: Date.now(),
      };

      setPrototypes((prev) =>
        prev.map((p) =>
          p.nodeId === topicNode
            ? { ...p, telemetry: { ...p.telemetry, relay_trip: tripped } }
            : p
        )
      );

      if (topicNode === activeNodeIdRef.current) {
        setTelemetry((prev) => ({
          ...prev,
          relay_trip: tripped,
        }));
      }

      appendLog(
        'ALERT',
        source,
        topicOrPort,
        rawString || JSON.stringify(eventObj),
        tripped ? 'critical' : 'emerald'
      );
      playScadaSound(tripped ? 'trip' : 'reset', audioMutedRef.current);
    },
    [appendLog]
  );

  // Parse incoming MQTT payload
  const handleRawIncomingMessage = useCallback(
    (rawLine: string, topic: string) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === 'object') {
            if ('scada_cmd' in parsed) {
              ingestInterlockEvent(
                parsed as SentinelInterlockEventPayload,
                'MQTT',
                topic,
                trimmed
              );
              return;
            }
            if ('metrics' in parsed && 'ai_engine' in parsed) {
              ingestTelemetryPayload(
                parsed as SentinelTelemetryPayload,
                topic,
                trimmed
              );
              return;
            }
          }
        } catch {
          // Fall through to plain text log
        }
      }

      appendLog(
        'RX',
        'MQTT',
        topic,
        trimmed,
        trimmed.includes('GAGAL') || trimmed.includes('TRIP') ? 'warn' : 'emerald'
      );
    },
    [appendLog, ingestInterlockEvent, ingestTelemetryPayload]
  );

  // Send command ("TRIP" | "RESET" | "STATUS" | custom) via MQTT
  const sendCommand = useCallback(
    (rawCmd: string) => {
      const cmd = rawCmd.trim().toUpperCase();
      if (!cmd) return;

      const cfg = mqttConfigRef.current;
      const targetNode = activeNodeIdRef.current || cfg.nodeId || 'SENTINEL-X-01';

      // Publish to firmware standard topic `sentinelx/<NODE_ID>/command` AND configured command topic
      const publishTopics = Array.from(
        new Set([
          `sentinelx/${targetNode}/command`,
          cfg.publishCommandTopic?.trim(),
          `sentinelx/daniyal/${targetNode}/command`,
        ].filter(Boolean))
      );

      let sentMqtt = false;
      if (mqttClientRef.current && mqttClientRef.current.connected) {
        for (const t of publishTopics) {
          mqttClientRef.current.publish(t, cmd, { qos: 0 });
        }
        sentMqtt = true;
        appendLog(
          'TX',
          'MQTT',
          `sentinelx/${targetNode}/command`,
          cmd,
          cmd === 'TRIP' ? 'critical' : 'emerald'
        );
      }

      if (cmd === 'TRIP') {
        relayTripByNodeRef.current[targetNode] = true;
        commandOverrideByNodeRef.current[targetNode] = {
          desiredTrip: true,
          timestampMs: Date.now(),
        };
        const interlockMsg: SentinelInterlockEventPayload = {
          scada_cmd: 'EMERGENCY_DISCONNECT_EXECUTED',
          relay_trip: true,
        };
        setTelemetry((prev) => ({ ...prev, relay_trip: true }));
        setPrototypes((prev) =>
          prev.map((p) =>
            p.nodeId === targetNode
              ? { ...p, telemetry: { ...p.telemetry, relay_trip: true } }
              : p
          )
        );
        appendLog(
          'ALERT',
          'SCADA',
          `SCADA//INTERLOCK/${targetNode}`,
          JSON.stringify(interlockMsg),
          'critical'
        );
        playScadaSound('trip', audioMutedRef.current);
      } else if (cmd === 'RESET') {
        relayTripByNodeRef.current[targetNode] = false;
        commandOverrideByNodeRef.current[targetNode] = {
          desiredTrip: false,
          timestampMs: Date.now(),
        };
        const interlockMsg: SentinelInterlockEventPayload = {
          scada_cmd: 'BAY_RECONNECTED',
          relay_trip: false,
        };
        setTelemetry((prev) => ({ ...prev, relay_trip: false }));
        setPrototypes((prev) =>
          prev.map((p) =>
            p.nodeId === targetNode
              ? { ...p, telemetry: { ...p.telemetry, relay_trip: false } }
              : p
          )
        );
        appendLog(
          'ALERT',
          'SCADA',
          `SCADA//INTERLOCK/${targetNode}`,
          JSON.stringify(interlockMsg),
          'emerald'
        );
        playScadaSound('reset', audioMutedRef.current);
      } else if (!sentMqtt) {
        appendLog(
          'SYS',
          'SCADA',
          'MQTT//OFFLINE',
          `Gagal mengirim "${cmd}" — MQTT belum terhubung ke ${cfg.brokerUrl}`,
          'warn'
        );
      }
    },
    [appendLog]
  );

  // Select active prototype node to view/control
  const selectNode = useCallback(
    (nodeId: string) => {
      setActiveNodeId(nodeId);
      activeNodeIdRef.current = nodeId;

      setPrototypes((prev) => {
        const found = prev.find((p) => p.nodeId === nodeId);
        if (found) {
          setTelemetry(found.telemetry);
          const evalRes = evaluateTinyMLInt8(found.telemetry.metrics);
          setTensorState(evalRes.tensor);
          setFftSpectrum(
            generateFFTSpectrum(
              found.telemetry.metrics.vib_g,
              found.telemetry.ai_engine.class,
              tickCounterRef.current
            )
          );
        }
        return prev;
      });

      setMqttConfig((prev) => ({
        ...prev,
        nodeId,
        subscribeTelemetryTopic: `sentinelx/${nodeId}/telemetry`,
        subscribeEventTopic: `sentinelx/${nodeId}/event`,
        publishCommandTopic: `sentinelx/${nodeId}/command`,
      }));
    },
    []
  );

  // Manually register or update a prototype node for GIS & MQTT tracking
  const addPrototype = useCallback(
    (input: AddPrototypeInput) => {
      const cleanId = input.nodeId.trim().toUpperCase();
      if (!cleanId) return;

      setPrototypes((prev) => {
        const existingIdx = prev.findIndex((p) => p.nodeId === cleanId);
        if (existingIdx >= 0) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            substationName: input.substationName.trim() || updated[existingIdx].substationName,
            bayName: input.bayName.trim() || updated[existingIdx].bayName,
            coordinatesText:
              input.coordinatesText?.trim() || updated[existingIdx].coordinatesText,
          };
          return updated;
        }

        const slot = GIS_SLOT_POSITIONS[prev.length % GIS_SLOT_POSITIONS.length];
        const newPayload: SentinelTelemetryPayload = {
          ...INITIAL_TELEMETRY,
          node: cleanId,
        };
        const newNode: PrototypeNode = {
          nodeId: cleanId,
          substationName: input.substationName.trim() || slot.substationName,
          bayName: input.bayName.trim() || `Bay-0${prev.length + 1}`,
          coordinatesText: input.coordinatesText?.trim() || slot.coordinatesText,
          mapX: slot.mapX,
          mapY: slot.mapY,
          connected: false,
          lastSeenMs: null,
          lastSeenLabel: 'MENUNGGU...',
          packetsCount: 0,
          telemetry: newPayload,
        };
        return [...prev, newNode];
      });

      setHistoryByNode((prev) => {
        if (prev[cleanId]) return prev;
        return { ...prev, [cleanId]: createInitialHistory() };
      });

      // Subscribe to the new node's topics if MQTT is connected
      if (mqttClientRef.current && mqttClientRef.current.connected) {
        mqttClientRef.current.subscribe(
          [`sentinelx/${cleanId}/telemetry`, `sentinelx/${cleanId}/event`],
          { qos: 0 }
        );
      }

      appendLog(
        'SYS',
        'SCADA',
        `GIS//ADD-NODE`,
        `Prototype ${cleanId} (${input.substationName} • ${input.bayName}) ditambahkan ke topologi GIS & pemantauan MQTT`,
        'emerald'
      );

      selectNode(cleanId);
    },
    [appendLog, selectNode]
  );

  // Remove a prototype node (keep at least 1 prototype)
  const removePrototype = useCallback(
    (nodeId: string) => {
      setPrototypes((prev) => {
        if (prev.length <= 1) return prev;
        const filtered = prev.filter((p) => p.nodeId !== nodeId);
        if (activeNodeIdRef.current === nodeId && filtered.length > 0) {
          const nextNode = filtered[0];
          setActiveNodeId(nextNode.nodeId);
          activeNodeIdRef.current = nextNode.nodeId;
          setTelemetry(nextNode.telemetry);
        }
        return filtered;
      });
    },
    []
  );

  // Auto-Trip Policy evaluation whenever threat_idx exceeds 75
  useEffect(() => {
    if (
      autoTripEnabled &&
      telemetry.ai_engine.threat_idx > 75 &&
      !telemetry.relay_trip &&
      !relayTripByNodeRef.current[activeNodeId]
    ) {
      appendLog(
        'ALERT',
        'SCADA',
        'AUTO-TRIP//POLICY',
        `Threat Index (${telemetry.ai_engine.threat_idx}%) > 75% -> Mengaktifkan Interlok Proteksi SCADA (TRIP) otomatis`,
        'critical'
      );
      sendCommand('TRIP');
    }
  }, [
    autoTripEnabled,
    telemetry.ai_engine.threat_idx,
    telemetry.relay_trip,
    activeNodeId,
    appendLog,
    sendCommand,
  ]);

  // Connect to MQTT Broker over WebSockets (wss:// or ws://)
  const connectMqtt = useCallback(
    (customConfig?: MqttBrokerConfig) => {
      const cfg = customConfig || mqttConfigRef.current;
      if (mqttClientRef.current) {
        try {
          mqttClientRef.current.end(true);
        } catch {
          // Ignore cleanup errors
        }
        mqttClientRef.current = null;
      }

      setConnectionState('CONNECTING');
      appendLog(
        'SYS',
        'MQTT',
        cfg.brokerUrl,
        `Menghubungkan ke Broker MQTT (${cfg.brokerUrl})...`,
        'info'
      );

      try {
        const client = mqtt.connect(cfg.brokerUrl, {
          clientId: `sentinelx-web-${Math.random().toString(16).slice(2, 9)}`,
          clean: true,
          connectTimeout: 8000,
          reconnectPeriod: 4000,
        });

        mqttClientRef.current = client;

        client.on('connect', () => {
          setConnectionState('CONNECTED');
          // Subscribe to configured topics + wildcard discovery for multi-prototype ESP32 support
          const subTopics = Array.from(
            new Set([
              cfg.subscribeTelemetryTopic.trim(),
              cfg.subscribeEventTopic.trim(),
              'sentinelx/+/telemetry',
              'sentinelx/+/event',
              'sentinelx/daniyal/+/telemetry',
              'sentinelx/daniyal/+/event',
            ].filter(Boolean))
          );

          client.subscribe(subTopics, { qos: 0 }, (err) => {
            if (err) {
              appendLog(
                'SYS',
                'MQTT',
                cfg.brokerUrl,
                `Gagal subscribe topik: ${err.message}`,
                'warn'
              );
            } else {
              appendLog(
                'SYS',
                'MQTT',
                cfg.brokerUrl,
                `MQTT Terhubung! SUB: ${cfg.subscribeTelemetryTopic}, ${cfg.subscribeEventTopic} (& wildcard sentinelx/+/telemetry) | PUB: ${cfg.publishCommandTopic}`,
                'emerald'
              );
            }
          });
        });

        client.on('message', (topic, payloadBuffer) => {
          const rawText = payloadBuffer.toString();
          handleRawIncomingMessage(rawText, topic);
        });

        client.on('error', (err) => {
          setConnectionState('ERROR');
          appendLog(
            'SYS',
            'MQTT',
            cfg.brokerUrl,
            `MQTT Error: ${err.message}`,
            'warn'
          );
        });

        client.on('offline', () => {
          setConnectionState('DISCONNECTED');
        });
      } catch (err) {
        setConnectionState('ERROR');
        appendLog(
          'SYS',
          'MQTT',
          cfg.brokerUrl,
          `MQTT Exception: ${err instanceof Error ? err.message : String(err)}`,
          'critical'
        );
      }
    },
    [appendLog, handleRawIncomingMessage]
  );

  // Auto-connect on initial mount
  useEffect(() => {
    connectMqtt(DEFAULT_MQTT_CONFIG);
    return () => {
      if (mqttClientRef.current) {
        mqttClientRef.current.end(true);
      }
    };
  }, [connectMqtt]);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const systemHealthScore = computeSystemHealth(telemetry.ai_engine.threat_idx);
  const history = historyByNode[activeNodeId] || createInitialHistory();

  return {
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
  };
}

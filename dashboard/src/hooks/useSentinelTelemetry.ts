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
  latitude: number;
  longitude: number;
  substationName: string;
  bayName: string;
  coordinatesText: string;
  mapX: number;
  mapY: number;
}> = [
  {
    latitude: -6.9844,
    longitude: 110.3625,
    substationName: 'GI 150kV Krapyak Semarang',
    bayName: 'Bay-01 Penghantar',
    coordinatesText: '6°59′04″S 110°21′45″E',
    mapX: 170,
    mapY: 110,
  },
  {
    latitude: -7.0033,
    longitude: 110.4417,
    substationName: 'GI 150kV Pandean Lamper',
    bayName: 'Bay-02 Trafo',
    coordinatesText: '7°00′12″S 110°26′30″E',
    mapX: 370,
    mapY: 72,
  },
  {
    latitude: -7.1392,
    longitude: 110.4050,
    substationName: 'GI 150kV Ungaran',
    bayName: 'Bay-03 Kopel',
    coordinatesText: '7°08′21″S 110°24′18″E',
    mapX: 340,
    mapY: 162,
  },
  {
    latitude: -6.4475,
    longitude: 110.7431,
    substationName: 'GI 150kV Tanjung Jati',
    bayName: 'Bay-04 Feeder',
    coordinatesText: '6°26′51″S 110°44′35″E',
    mapX: 495,
    mapY: 115,
  },
  {
    latitude: -6.9550,
    longitude: 110.2525,
    substationName: 'GI 150kV Kaliwungu',
    bayName: 'Bay-05 Distribusi',
    coordinatesText: '6°57′18″S 110°15′09″E',
    mapX: 115,
    mapY: 168,
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

export { isSameNode, extractNodeFromTopic } from '../utils/sentinelNodeUtils';
import { isSameNode, extractNodeFromTopic } from '../utils/sentinelNodeUtils';

export interface AddPrototypeInput {
  nodeId: string;
  substationName: string;
  bayName: string;
  latitude?: number;
  longitude?: number;
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
      latitude: GIS_SLOT_POSITIONS[0].latitude,
      longitude: GIS_SLOT_POSITIONS[0].longitude,
      coordinatesText: GIS_SLOT_POSITIONS[0].coordinatesText,
      mapX: GIS_SLOT_POSITIONS[0].mapX,
      mapY: GIS_SLOT_POSITIONS[0].mapY,
      connected: false,
      lastSeenMs: null,
      lastSeenLabel: 'MENUNGGU...',
      packetsCount: 0,
      telemetry: INITIAL_TELEMETRY,
    },
    {
      nodeId: 'SENTINEL-X-02',
      substationName: GIS_SLOT_POSITIONS[1].substationName,
      bayName: GIS_SLOT_POSITIONS[1].bayName,
      latitude: GIS_SLOT_POSITIONS[1].latitude,
      longitude: GIS_SLOT_POSITIONS[1].longitude,
      coordinatesText: GIS_SLOT_POSITIONS[1].coordinatesText,
      mapX: GIS_SLOT_POSITIONS[1].mapX,
      mapY: GIS_SLOT_POSITIONS[1].mapY,
      connected: false,
      lastSeenMs: null,
      lastSeenLabel: 'MENUNGGU...',
      packetsCount: 0,
      telemetry: {
        ...INITIAL_TELEMETRY,
        node: 'SENTINEL-X-02',
      },
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
    'SENTINEL-X-02': createInitialHistory(),
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
  const relayTripByNodeRef = useRef<Record<string, boolean>>({
    'SENTINEL-X-01': false,
    'SENTINEL-X-02': false,
  });
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

  // Liveness checker: mark ESP32 node as offline if no telemetry received for > 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPrototypes((prev) =>
        prev.map((node) => {
          if (node.connected && node.lastSeenMs && now - node.lastSeenMs > 30000) {
            return { ...node, connected: false };
          }
          return node;
        })
      );
    }, 4000);
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

  // Unified packet ingestion handler for MQTT
  const ingestTelemetryPayload = useCallback(
    (payload: SentinelTelemetryPayload, topicOrPort: string, rawString?: string) => {
      tickCounterRef.current += 1;
      const tick = tickCounterRef.current;

      const topicNode = extractNodeFromTopic(topicOrPort);
      // Prioritize topicNode over payload.node.
      // Why: Prototype 2 firmware commonly has hardcoded `doc["node"] = "SENTINEL-X-01"` in its JSON body,
      // but correctly publishes to `sentinelx/SENTINEL-X-02/telemetry`.
      // Using topicNode first prevents Prototype 2 packets from being mistakenly attributed to Prototype 1.
      const resolvedNodeId = (topicNode || payload.node || mqttConfigRef.current.nodeId || 'SENTINEL-X-01').trim();
      const nodeId = resolvedNodeId.toUpperCase();

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
        const existingIdx = prev.findIndex((p) => isSameNode(p.nodeId, nodeId));
        if (existingIdx >= 0) {
          const updated = [...prev];
          const existing = updated[existingIdx];
          const canonicalNodeId = existing.nodeId;
          const finalPayload: SentinelTelemetryPayload = { ...cleanPayload, node: canonicalNodeId };
          updated[existingIdx] = {
            ...existing,
            connected: true,
            lastSeenMs: nowMs,
            lastSeenLabel: formattedTime,
            packetsCount: existing.packetsCount + 1,
            telemetry: finalPayload,
          };
          return updated;
        } else {
          const slot = GIS_SLOT_POSITIONS[prev.length % GIS_SLOT_POSITIONS.length];
          const newNode: PrototypeNode = {
            nodeId,
            substationName: slot.substationName,
            bayName: `Bay-0${prev.length + 1}`,
            latitude: slot.latitude,
            longitude: slot.longitude,
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
        const existingKey = Object.keys(prev).find((k) => isSameNode(k, nodeId)) || nodeId;
        const nodeHistory = prev[existingKey] || createInitialHistory();
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
          [existingKey]: [...nodeHistory.slice(-59), nextPoint],
        };
      });

      setPacketsReceived((c) => c + 1);
      setLastPacketTime(formattedTime);

      // Update primary view if this packet belongs to the currently selected prototype
      if (isSameNode(nodeId, activeNodeIdRef.current)) {
        setTelemetry({ ...cleanPayload, node: activeNodeIdRef.current });
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
      const topicNode =
        extractNodeFromTopic(topicOrPort) || activeNodeIdRef.current || 'SENTINEL-X-01';

      relayTripByNodeRef.current[topicNode] = tripped;
      commandOverrideByNodeRef.current[topicNode] = {
        desiredTrip: tripped,
        timestampMs: Date.now(),
      };

      setPrototypes((prev) =>
        prev.map((p) =>
          isSameNode(p.nodeId, topicNode)
            ? { ...p, telemetry: { ...p.telemetry, relay_trip: tripped } }
            : p
        )
      );

      if (isSameNode(topicNode, activeNodeIdRef.current)) {
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

      // Filter out command echoes from wildcard subscriptions (e.g. sentinelx/<NODE>/command)
      if (topic.endsWith('/command') || topic.includes('/command/')) {
        return;
      }

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
            const hasNestedMetrics = 'metrics' in parsed;
            const hasFlatMetrics =
              'I_rms' in parsed ||
              'i_rms' in parsed ||
              'gas_ppm' in parsed ||
              'vib_g' in parsed ||
              'threat_idx' in parsed;

            if (hasNestedMetrics || hasFlatMetrics || 'ai_engine' in parsed) {
              const incomingNode =
                parsed.node || parsed.nodeId || parsed.node_id || parsed.id;
              const normalizedPayload: SentinelTelemetryPayload = {
                node: incomingNode,
                metrics: hasNestedMetrics
                  ? {
                      I_rms: Number(
                        parsed.metrics?.I_rms ??
                          parsed.metrics?.i_rms ??
                          parsed.metrics?.irms ??
                          4.25
                      ),
                      gas_ppm: Number(
                        parsed.metrics?.gas_ppm ??
                          parsed.metrics?.gas ??
                          parsed.metrics?.gasPpm ??
                          45.0
                      ),
                      vib_g: Number(
                        parsed.metrics?.vib_g ??
                          parsed.metrics?.vib ??
                          parsed.metrics?.vibG ??
                          0.0124
                      ),
                      bus_secure: Boolean(
                        parsed.metrics?.bus_secure ??
                          parsed.metrics?.secure ??
                          parsed.metrics?.busSecure ??
                          true
                      ),
                    }
                  : {
                      I_rms: Number(
                        parsed.I_rms ?? parsed.i_rms ?? parsed.irms ?? 4.25
                      ),
                      gas_ppm: Number(
                        parsed.gas_ppm ?? parsed.gas ?? parsed.gasPpm ?? 45.0
                      ),
                      vib_g: Number(
                        parsed.vib_g ?? parsed.vib ?? parsed.vibG ?? 0.0124
                      ),
                      bus_secure: Boolean(
                        parsed.bus_secure ??
                          parsed.secure ??
                          parsed.busSecure ??
                          true
                      ),
                    },
                ai_engine: parsed.ai_engine,
                status: parsed.status,
                relay_trip: Boolean(parsed.relay_trip ?? parsed.trip ?? false),
              };

              ingestTelemetryPayload(
                normalizedPayload,
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
            isSameNode(p.nodeId, targetNode)
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
            isSameNode(p.nodeId, targetNode)
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
      const cleanNodeId = nodeId.trim().toUpperCase();
      setActiveNodeId(cleanNodeId);
      activeNodeIdRef.current = cleanNodeId;

      setPrototypes((prev) => {
        const found = prev.find((p) => isSameNode(p.nodeId, cleanNodeId));
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
        nodeId: cleanNodeId,
        subscribeTelemetryTopic: `sentinelx/${cleanNodeId}/telemetry`,
        subscribeEventTopic: `sentinelx/${cleanNodeId}/event`,
        publishCommandTopic: `sentinelx/${cleanNodeId}/command`,
      }));

      // Ensure MQTT subscription for the selected node
      if (mqttClientRef.current && mqttClientRef.current.connected) {
        mqttClientRef.current.subscribe(
          [
            `sentinelx/${cleanNodeId}/telemetry`,
            `sentinelx/${cleanNodeId}/event`,
            `sentinelx/daniyal/${cleanNodeId}/telemetry`,
            `sentinelx/daniyal/${cleanNodeId}/event`,
          ],
          { qos: 0 }
        );
      }
    },
    []
  );

  // Manually register or update a prototype node for GIS & MQTT tracking
  const addPrototype = useCallback(
    (input: AddPrototypeInput) => {
      const cleanId = input.nodeId.trim().toUpperCase();
      if (!cleanId) return;

      setPrototypes((prev) => {
        const existingIdx = prev.findIndex((p) => isSameNode(p.nodeId, cleanId));
        if (existingIdx >= 0) {
          const updated = [...prev];
          const lat =
            input.latitude !== undefined && !isNaN(Number(input.latitude))
              ? Number(input.latitude)
              : updated[existingIdx].latitude;
          const lng =
            input.longitude !== undefined && !isNaN(Number(input.longitude))
              ? Number(input.longitude)
              : updated[existingIdx].longitude;
          const latDir = lat < 0 ? 'S' : 'N';
          const lngDir = lng < 0 ? 'W' : 'E';
          const coordsLabel =
            input.coordinatesText?.trim() ||
            `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;

          updated[existingIdx] = {
            ...updated[existingIdx],
            substationName: input.substationName.trim() || updated[existingIdx].substationName,
            bayName: input.bayName.trim() || updated[existingIdx].bayName,
            latitude: lat,
            longitude: lng,
            coordinatesText: coordsLabel,
          };
          return updated;
        }

        const slot = GIS_SLOT_POSITIONS[prev.length % GIS_SLOT_POSITIONS.length];
        const lat =
          input.latitude !== undefined && !isNaN(Number(input.latitude))
            ? Number(input.latitude)
            : slot.latitude;
        const lng =
          input.longitude !== undefined && !isNaN(Number(input.longitude))
            ? Number(input.longitude)
            : slot.longitude;
        const latDir = lat < 0 ? 'S' : 'N';
        const lngDir = lng < 0 ? 'W' : 'E';
        const coordsLabel =
          input.coordinatesText?.trim() ||
          `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;

        const newPayload: SentinelTelemetryPayload = {
          ...INITIAL_TELEMETRY,
          node: cleanId,
        };
        const newNode: PrototypeNode = {
          nodeId: cleanId,
          substationName: input.substationName.trim() || slot.substationName,
          bayName: input.bayName.trim() || `Bay-0${prev.length + 1}`,
          latitude: lat,
          longitude: lng,
          coordinatesText: coordsLabel,
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
        const existingKey = Object.keys(prev).find((k) => isSameNode(k, cleanId));
        if (existingKey) return prev;
        return { ...prev, [cleanId]: createInitialHistory() };
      });

      // Subscribe to the new node's topics if MQTT is connected
      if (mqttClientRef.current && mqttClientRef.current.connected) {
        mqttClientRef.current.subscribe(
          [
            `sentinelx/${cleanId}/telemetry`,
            `sentinelx/${cleanId}/event`,
            `sentinelx/daniyal/${cleanId}/telemetry`,
            `sentinelx/daniyal/${cleanId}/event`,
          ],
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
        const filtered = prev.filter((p) => !isSameNode(p.nodeId, nodeId));
        if (isSameNode(activeNodeIdRef.current, nodeId) && filtered.length > 0) {
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

  // Update real geographical coordinates (Latitude & Longitude) for an existing prototype
  const updatePrototypeCoordinates = useCallback(
    (
      nodeId: string,
      latitude: number,
      longitude: number,
      substationName?: string,
      bayName?: string
    ) => {
      const lat = Number(latitude);
      const lng = Number(longitude);
      if (isNaN(lat) || isNaN(lng)) return;

      const latDir = lat < 0 ? 'S' : 'N';
      const lngDir = lng < 0 ? 'W' : 'E';
      const coordsLabel = `${Math.abs(lat).toFixed(4)}°${latDir} ${Math.abs(lng).toFixed(4)}°${lngDir}`;

      setPrototypes((prev) =>
        prev.map((p) => {
          if (isSameNode(p.nodeId, nodeId)) {
            return {
              ...p,
              latitude: lat,
              longitude: lng,
              coordinatesText: coordsLabel,
              substationName: substationName?.trim() || p.substationName,
              bayName: bayName?.trim() || p.bayName,
            };
          }
          return p;
        })
      );

      appendLog(
        'SYS',
        'SCADA',
        `GIS//COORDS`,
        `Koordinat ${nodeId} berhasil diperbarui: Lintang ${lat}, Bujur ${lng} (${coordsLabel})`,
        'emerald'
      );
    },
    [appendLog]
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
              'sentinelx/#',
              'sentinel-x/#',
              'sentinelx/+/telemetry',
              'sentinelx/+/event',
              'sentinelx/+/data',
              'sentinelx/daniyal/#',
              'sentinelx/daniyal/+/telemetry',
              'sentinelx/daniyal/+/event',
              'sentinelx/SENTINEL-X-01/telemetry',
              'sentinelx/SENTINEL-X-02/telemetry',
              'sentinelx/SENTINEL-X-01/event',
              'sentinelx/SENTINEL-X-02/event',
              'sentinelx/daniyal/SENTINEL-X-01/telemetry',
              'sentinelx/daniyal/SENTINEL-X-02/telemetry',
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
  const activeHistoryKey =
    Object.keys(historyByNode).find((k) => isSameNode(k, activeNodeId)) || activeNodeId;
  const history = historyByNode[activeHistoryKey] || createInitialHistory();

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
    updatePrototypeCoordinates,
  };
}

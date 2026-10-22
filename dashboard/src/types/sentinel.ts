export type AIClassification =
  | 'NOMINAL_OPERATION'
  | 'PERIMETER_SABOTAGE_DETECTED'
  | 'BEARING_VIBRATION_ANOMALY_48HZ'
  | 'HAZARDOUS_GAS_ACCUMULATION'
  | 'CURRENT_WAVEFORM_TAMPERING';

export type NodeStatus = 'NORMAL' | 'EVENT_ALERT';

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface SentinelMetrics {
  I_rms: number;
  gas_ppm: number;
  vib_g: number;
  bus_secure: boolean;
}

export interface SentinelAIEngine {
  class: AIClassification;
  threat_idx: number;
  latency_us: number;
}

export interface SentinelTelemetryPayload {
  node: string;
  metrics: SentinelMetrics;
  ai_engine: SentinelAIEngine;
  status: NodeStatus;
  relay_trip: boolean;
}

export interface SentinelInterlockEventPayload {
  scada_cmd: 'EMERGENCY_DISCONNECT_EXECUTED' | 'BAY_RECONNECTED' | string;
  relay_trip: boolean;
}

export interface TelemetryHistoryPoint {
  timestamp: string;
  timeMs: number;
  I_rms: number;
  gas_ppm: number;
  vib_g: number;
  threat_idx: number;
  health_score: number;
  latency_us: number;
  bus_secure: number; // 1 or 0 for chart
}

export interface FFTBin {
  freq: number;
  label: string;
  magnitude: number;
  isHarmonic48Hz: boolean;
}

export interface QuantizedTensorState {
  x: [number, number, number, number]; // INT8 [0..127]
  hidden: [number, number, number, number]; // ReLU quantized activations
  dominantIndex: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  direction: 'RX' | 'TX' | 'SYS' | 'ALERT';
  source: 'MQTT' | 'SCADA';
  topicOrPort: string;
  rawPayload: string;
  level: 'info' | 'warn' | 'critical' | 'emerald';
}

export interface MqttBrokerConfig {
  brokerUrl: string;
  nodeId: string;
  subscribeTelemetryTopic: string;
  subscribeEventTopic: string;
  publishCommandTopic: string;
}

export interface PrototypeNode {
  nodeId: string;
  substationName: string;
  bayName: string;
  latitude: number;
  longitude: number;
  coordinatesText?: string;
  mapX?: number; // SVG 0..600 (legacy/fallback)
  mapY?: number; // SVG 0..220 (legacy/fallback)
  connected: boolean;
  lastSeenMs: number | null;
  lastSeenLabel: string;
  packetsCount: number;
  telemetry: SentinelTelemetryPayload;
}

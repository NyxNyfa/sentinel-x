# SENTINEL-X

> **Smart Edge-Native Node Based on Multi-Task TinyML INT8 and Low-Power Computing Architecture for Electrical Diagnostics, Mechanical-Environmental Integrity, and Critical Energy Infrastructure Perimeter Security**

---

## 📌 Project Overview

SENTINEL-X is an edge-native cyber-physical monitoring and SCADA interlock system designed for electrical substations and critical energy infrastructure. It features:
- **L1 Digitalization:** High-contrast Industrial SCADA Console with GIS Substation Topology, RMS Current ($I_{rms}$) monitoring, 48 Hz FFT vibration spectrum analyzer, hazardous gas ($gas_{ppm}$) detection, and perimeter loop security.
- **L2 Edge-AI TinyML:** Quantized INT8 deterministic neural inference on ESP32 Xtensa LX6 architecture (30–45 µs inference latency), Threat Index calculation (0–100%), and bidirectional SCADA interlock control (Software Cut-Off / Emergency TRIP).
- **Communication:** Real-time MQTT over WebSockets with broker presets (EMQX / custom), auto-discovery of multiple ESP32 edge prototypes, and low-latency command publish/subscribe.

---

## 📂 Repository Structure

```
sentinel-x/
├── dashboard/                  # Industrial SCADA Web Console (React, Vite, TypeScript, Tailwind CSS)
│   ├── src/
│   │   ├── components/         # TopScadaBar, MultiModalChartsModule, TinyMLThreatModule, ScadaAuditTerminal
│   │   ├── hooks/              # useSentinelTelemetry (MQTT, Multi-Node Discovery, State Sync)
│   │   ├── types/              # Sentinel SCADA TypeScript schemas
│   │   └── utils/              # INT8 inference engine & FFT spectrum synthesizer
│   └── package.json
├── sentinel-x/                 # ESP32 Edge Node Firmware (Arduino / C++)
│   └── sentinel-x.ino
├── tinyml/                     # TinyML model implementation & training scripts
│   └── tinyml.ino
└── TinyML_V2/                  # Enhanced Edge-AI firmware revision
    └── TinyML_V2.ino
```

---

## 🚀 Getting Started

### 1. Dashboard (SCADA Console)
```bash
cd dashboard
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 2. ESP32 Firmware
- Open `sentinel-x/sentinel-x.ino` or `TinyML_V2/TinyML_V2.ino` in Arduino IDE or PlatformIO.
- Configure your Wi-Fi credentials (`WIFI_SSID`, `WIFI_PASS`).
- Default MQTT Broker: `broker.emqx.io` (Port 1883 for hardware, Port 8084 WSS for Web Dashboard).
- Flash to **ESP32 DevKit V1**.

---

## 📡 MQTT Topics

| Topic | Direction | Description |
|---|---|---|
| `sentinelx/<NODE_ID>/telemetry` | ESP32 → SCADA | 500 ms JSON telemetry stream |
| `sentinelx/<NODE_ID>/event` | ESP32 → SCADA | Interlock execution confirmation |
| `sentinelx/<NODE_ID>/command` | SCADA → ESP32 | Commands: `"TRIP"`, `"RESET"`, `"STATUS"` |

---

## 🛡️ License

MIT License. Developed for Smart-X Hackathon 2026.

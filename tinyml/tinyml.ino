/* ============================================================================
                                    SENTINEL-X
   ============================================================================ */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <Wire.h>
#include <MPU6050.h>          
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>     
#include <Adafruit_SSD1306.h> 
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

/* ---------------- 1. KONFIGURASI WI-FI & EMQX BROKER ---------------- */
const char* WIFI_SSID     = "POCO M6 Pro";        
const char* WIFI_PASS     = "rasahtakok"; 

const char* MQTT_BROKER   = "broker.emqx.io";
const int   MQTT_PORT     = 1883;

const char* TOPIC_TELEMETRY   = "sentinelx/SENTINEL-X-01/telemetry";
const char* TOPIC_EVENT       = "sentinelx/SENTINEL-X-01/event";
const char* TOPIC_COMMAND     = "sentinelx/SENTINEL-X-01/command";
const char* TOPIC_COMMAND_ALT = "sentinelx/SENTINEL-X-01/command";

/* ---------------- 2. PIN MAP ---------------- */
#define PIN_I2C_SDA       21   // SDA -> MPU-6050 & OLED
#define PIN_I2C_SCL       22   // SCL -> MPU-6050 & OLED
#define PIN_ADC_ACS712    34   // ACS712 OUT (via resistor 220 ohm)
#define PIN_ADC_GASSIM    35   // Potensio #1 (Injeksi Gas)
#define PIN_ADC_ISIM      39   // Potensio #2 (Injeksi Arus)
#define PIN_BUS_LOOP      14   // Saklar Geser 3-Pin Perimeter
#define PIN_LED_ALERT     15   // LED Merah Indikator Alert (+ 220 ohm)
#define PIN_RELAY_TRIP    26   // Gate MOSFET IRFZ34N -> Relay SRD-05VDC

/* ---------------- 3. KONFIGURASI OLED SSD1306 ---------------- */
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define OLED_RESET        -1
#define OLED_I2C_ADDR     0x3C

/* ---------------- 4. PARAMETER GETARAN (STABIL) ---------------- */
#define VIB_SAMPLES       24
#define VIB_GAIN          2.0f     
#define VIB_MODEL_SCALE   50.0f    
#define VIB_DEADBAND      0.02f   
#define MPU_I2C_ADDR      0x68     
#define ACCEL_SCALE_2G    16384.0f 

/* ---------------- 5. PARAMETER RETRY NON-BLOCKING ---------------- */
#define MPU_RETRY_COOLDOWN_MS   5000
#define WIFI_RETRY_COOLDOWN_MS  5000
#define MQTT_RETRY_COOLDOWN_MS  5000

/* ---------------- 6. KONFIGURASI DEMO ---------------- */
#define NODE_ID              "SENTINEL-X-01"
#define THREAT_THRESHOLD     55
#define TELEMETRY_MS         500

/* ---------------- 7. STATE GLOBAL ---------------- */
WiFiClient       espClient;
PubSubClient     mqttClient(espClient);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
MPU6050          mpu(MPU_I2C_ADDR);

bool     oledOK        = false;
bool     mpuOK         = false;
bool     relayTripped  = false;
float    acsZeroAdc    = 2048.0f;

uint32_t lastTelemetry = 0;
uint32_t nextMpuRetry  = 0;
uint32_t nextWifiRetry = 0;
uint32_t nextMqttRetry = 0;

/* ---------------- 8. BOBOT TINYML INT8 (L2 ENGINE) ---------------- */
const int8_t W_HIDDEN[4][4] = {
  { 32, 10,  8, 15 },
  {  8, 38, 12, 10 },
  { 10,  8, 42,  5 },
  { 12, 12,  6, 64 }
};
const int8_t B_HIDDEN[4] = { -10, -12, -10, -5 };

struct AIResult {
  const char* label;
  int         threat;
  uint32_t    latency_us;
  const char* status;
};

void tripRelay();
void resetRelay();
void printStatus();

/* ============================================================================
   9. INISIALISASI MPU-6050 (ELECTRONIC CATS - SUPPORT WHO_AM_I 0x74)
   ============================================================================ */
bool mpuPing() {
  Wire.beginTransmission(MPU_I2C_ADDR);
  return (Wire.endTransmission() == 0);
}

void configureMPU() {
  mpu.initialize();
  mpu.setSleepEnabled(false);
  mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2);
  mpu.setDLPFMode(MPU6050_DLPF_BW_42);

  Wire.beginTransmission(MPU_I2C_ADDR);
  Wire.write(0x6B);
  Wire.write(0x00);
  Wire.endTransmission();
}

bool initMPU() {
  for (int attempt = 1; attempt <= 3; attempt++) {
    if (mpuPing()) {
      configureMPU();
      delay(50);

      int16_t ax = 0, ay = 0, az = 0;
      mpu.getAcceleration(&ax, &ay, &az);

      if (!(ax == 0 && ay == 0 && az == 0)) {
        Serial.printf("[OK] MPU-6050 (0x%02X) aktif (percobaan %d)\n", MPU_I2C_ADDR, attempt);
        return true;
      }
    }
    Serial.printf("[RETRY %d] MPU-6050 belum merespons...\n", attempt);
    delay(150);
  }
  Serial.println("[GAGAL] MPU-6050 tidak terdeteksi saat boot.");
  return false;
}

/* ============================================================================
   10. INISIALISASI & TAMPILAN OLED (HEADER HANYA TULISAN SENTINEL-X)
   ============================================================================ */
bool initOLED() {
  Wire.beginTransmission(OLED_I2C_ADDR);
  if (Wire.endTransmission() != 0) {
    Serial.println("[GAGAL] Layar OLED (0x3C) tidak terdeteksi!");
    return false;
  }

  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_I2C_ADDR)) {
    Serial.println("[GAGAL] Alokasi memori SSD1306 gagal!");
    return false;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(34, 20);
  display.println("SENTINEL-X");
  display.setCursor(20, 36);
  display.println("Starting System...");
  display.display();
  Serial.println("[OK] Layar OLED (0x3C) aktif");
  return true;
}

const char* getShortAILabel(const char* fullLabel) {
  if (strcmp(fullLabel, "PERIMETER_SABOTAGE_DETECTED") == 0)    return "ALERT: SABOTAGE!";
  if (strcmp(fullLabel, "BEARING_VIBRATION_ANOMALY_48HZ") == 0) return "ALERT: VIB 48HZ!";
  if (strcmp(fullLabel, "HAZARDOUS_GAS_ACCUMULATION") == 0)     return "ALERT: GAS HIGH!";
  if (strcmp(fullLabel, "CURRENT_WAVEFORM_TAMPERING") == 0)     return "ALERT: OVERCURR!";
  return "STATUS: NOMINAL";
}

void updateOLED(float i_rms, float gas_ppm, float vib_g, bool secure, const AIResult& ai) {
  if (!oledOK) return;

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // 1. Baris Header: Hanya tulisan "SENTINEL-X" di tengah
  display.setCursor(34, 0);
  display.print("SENTINEL-X");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // 2. Baris Sensor 1: Arus & Gas
  display.setCursor(0, 13);
  display.printf("I:%5.2fA  G:%5.0fppm", i_rms, gas_ppm);

  // 3. Baris Sensor 2: Getaran & Status Perimeter Loop
  display.setCursor(0, 24);
  display.printf("V:%5.3fg  SEC:%s", vib_g, secure ? "SECURE" : "BREACH");

  // 4. Baris Threat Index + Progress Bar Visual
  display.setCursor(0, 36);
  display.printf("THR:%3d%%", ai.threat);
  display.drawRect(52, 36, 74, 8, SSD1306_WHITE);
  int barWidth = map(constrain(ai.threat, 0, 100), 0, 100, 0, 70);
  if (barWidth > 0) {
    display.fillRect(54, 38, barWidth, 4, SSD1306_WHITE);
  }

  // 5. Baris Footer: Klasifikasi AI (Invert warna jika bahaya atau trip)
  bool isAlert = (ai.threat > THREAT_THRESHOLD || relayTripped);
  if (isAlert) {
    display.fillRect(0, 50, 128, 14, SSD1306_WHITE);
    display.setTextColor(SSD1306_BLACK);
  } else {
    display.drawRect(0, 50, 128, 14, SSD1306_WHITE);
    display.setTextColor(SSD1306_WHITE);
  }

  display.setCursor(6, 53);
  if (relayTripped) {
    display.print("! RELAY TRIPPED !");
  } else {
    display.print(getShortAILabel(ai.label));
  }

  display.display();
}

/* ============================================================================
   11. PEMBACAAN GETARAN
   ============================================================================ */
float readVibG() {
  if (!mpuOK) {
    if (millis() >= nextMpuRetry) {
      nextMpuRetry = millis() + MPU_RETRY_COOLDOWN_MS;
      if (mpuPing()) {
        configureMPU();
        delay(30);
        int16_t tx = 0, ty = 0, tz = 0;
        mpu.getAcceleration(&tx, &ty, &tz);
        if (!(tx == 0 && ty == 0 && tz == 0)) {
          mpuOK = true;
          Serial.println("[OK] MPU-6050 berhasil pulih (re-init)");
        }
      }
    }
    if (!mpuOK) return 0.0f;
  }

  if (!mpuPing()) {
    mpuOK = false;
    nextMpuRetry = millis() + MPU_RETRY_COOLDOWN_MS;
    return 0.0f;
  }

  float ax[VIB_SAMPLES], ay[VIB_SAMPLES], az[VIB_SAMPLES];
  for (int i = 0; i < VIB_SAMPLES; i++) {
    int16_t raw_ax = 0, raw_ay = 0, raw_az = 0;
    mpu.getAcceleration(&raw_ax, &raw_ay, &raw_az);

    ax[i] = (float)raw_ax / ACCEL_SCALE_2G;
    ay[i] = (float)raw_ay / ACCEL_SCALE_2G;
    az[i] = (float)raw_az / ACCEL_SCALE_2G;
    delayMicroseconds(800);
  }

  float mx = 0, my = 0, mz = 0;
  for (int i = 0; i < VIB_SAMPLES; i++) {
    mx += ax[i];
    my += ay[i];
    mz += az[i];
  }
  mx /= VIB_SAMPLES;
  my /= VIB_SAMPLES;
  mz /= VIB_SAMPLES;

  float variance = 0;
  for (int i = 0; i < VIB_SAMPLES; i++) {
    float dx = ax[i] - mx;
    float dy = ay[i] - my;
    float dz = az[i] - mz;
    variance += dx * dx + dy * dy + dz * dz;
  }
  variance /= VIB_SAMPLES;

  float vib = sqrt(variance) * VIB_GAIN;
  if (vib < VIB_DEADBAND) {
    vib = 0.0f;
  }
  return vib;
}

/* ============================================================================
   12. SENSOR ARUS (ACS712 D34 + POTENSIO D39) & SENSOR GAS (D35)
   ============================================================================ */
void calibrateACS712() {
  uint32_t sum = 0;
  for (int i = 0; i < 32; i++) {
    sum += analogRead(PIN_ADC_ACS712);
    delay(2);
  }
  acsZeroAdc = (float)sum / 32.0f;
  Serial.printf("[OK] Kalibrasi baseline ACS712 (D34): %.1f ADC\n", acsZeroAdc);
}

float readCurrentHybrid() {
  float potCurrent = (analogRead(PIN_ADC_ISIM) / 4095.0f) * 20.0f;

  int32_t sumAdc = 0;
  for (int i = 0; i < 16; i++) {
    sumAdc += analogRead(PIN_ADC_ACS712);
  }
  float avgAdc = (float)sumAdc / 16.0f;

  float deltaAdc = fabs(avgAdc - acsZeroAdc);
  float acsCurrent = (deltaAdc > 25.0f) ? (deltaAdc / 124.0f) : 0.0f;

  // Saat relay TRIP (kipas 12V mati) dan potensio tidak diputar, arus = 0.00 A
  if (relayTripped && potCurrent < 0.3f) {
    return 0.0f;
  }

  float baseFanCurrent = relayTripped ? 0.0f : 0.25f;
  return constrain(baseFanCurrent + acsCurrent + potCurrent, 0.0f, 20.0f);
}

float readGasSim() {
  float ppm = (analogRead(PIN_ADC_GASSIM) / 4095.0f) * 1000.0f;
  return max(ppm, 15.0f);
}

/* ============================================================================
   13. INFERENSI TINYML INT8 (L2)
   ============================================================================ */
AIResult runTinyML(float i_rms, float gas_ppm, float vib_g, bool bus_secure) {
  AIResult r;

  int8_t x[4];
  x[0] = (int8_t)constrain((int)(i_rms  * 4.0f),           0, 127);
  x[1] = (int8_t)constrain((int)(gas_ppm / 8.0f),          0, 127);
  x[2] = (int8_t)constrain((int)(vib_g * VIB_MODEL_SCALE), 0, 127);
  x[3] = bus_secure ? 0 : 100;

  uint64_t t0 = esp_timer_get_time();

  int32_t hidden[4], total = 0, maxScore = -9999;
  int dominant = 0;
  for (int i = 0; i < 4; i++) {
    int32_t acc = (int32_t)B_HIDDEN[i] << 4;
    for (int j = 0; j < 4; j++)
      acc += (int32_t)x[j] * (int32_t)W_HIDDEN[i][j];
    hidden[i] = (acc > 0) ? (acc >> 6) : 0;
    total += hidden[i];
    if (hidden[i] > maxScore) { maxScore = hidden[i]; dominant = i; }
  }

  int threat = constrain((int)total, 0, 100);
  if (!bus_secure && threat < 56) threat = 56;

  uint64_t t1 = esp_timer_get_time();
  r.latency_us = (uint32_t)(t1 - t0);
  r.threat     = threat;

  if (threat > THREAT_THRESHOLD) {
    r.status = "EVENT_ALERT";
    if (!bus_secure)          r.label = "PERIMETER_SABOTAGE_DETECTED";
    else if (dominant == 2)   r.label = "BEARING_VIBRATION_ANOMALY_48HZ";
    else if (dominant == 1)   r.label = "HAZARDOUS_GAS_ACCUMULATION";
    else                      r.label = "CURRENT_WAVEFORM_TAMPERING";
  } else {
    r.status = "NORMAL";
    r.label  = "NOMINAL_OPERATION";
  }
  return r;
}

/* ============================================================================
   14. INTERLOK RELAY VIA MOSFET IRFZ34N (ACTIVE-HIGH DI GPIO 26)
   ============================================================================ */
void tripRelay() {
  // GPIO HIGH -> MOSFET ON -> Relay AKTIF (klik) -> Kontak NC terbuka (Kipas 12V Mati)
  digitalWrite(PIN_RELAY_TRIP, HIGH);
  relayTripped = true;

  const char* evt = "{\"scada_cmd\":\"EMERGENCY_DISCONNECT_EXECUTED\",\"relay_trip\":true}";
  Serial.println(evt);
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_EVENT, evt);
  }
}

void resetRelay() {
  // GPIO LOW -> MOSFET OFF -> Relay MATI -> Kontak NC tertutup (Kipas 12V Nyala)
  digitalWrite(PIN_RELAY_TRIP, LOW);
  relayTripped = false;

  const char* evt = "{\"scada_cmd\":\"BAY_RECONNECTED\",\"relay_trip\":false}";
  Serial.println(evt);
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_EVENT, evt);
  }
}

void printStatus() {
  Serial.printf("[STATUS] relay=%s (GPIO26=%s) mpu=%s oled=%s wifi=%s mqtt=%s\n",
                relayTripped ? "TRIP" : "NORMAL",
                digitalRead(PIN_RELAY_TRIP) ? "HIGH" : "LOW",
                mpuOK ? "OK" : "GAGAL",
                oledOK ? "OK" : "GAGAL",
                (WiFi.status() == WL_CONNECTED) ? "OK" : "DISCONNECTED",
                mqttClient.connected() ? "OK" : "DISCONNECTED");
}

void executeCommand(String cmd) {
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "TRIP" || cmd.indexOf("\"TRIP\"") >= 0) {
    tripRelay();
  } else if (cmd == "RESET" || cmd.indexOf("\"RESET\"") >= 0) {
    resetRelay();
  } else if (cmd == "STATUS" || cmd.indexOf("\"STATUS\"") >= 0) {
    printStatus();
  }
}

/* ============================================================================
   15. MANAJEMEN WI-FI, EMQX MQTT & SERIAL
   ============================================================================ */
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }
  Serial.printf("[MQTT RX] %s -> %s\n", topic, msg.c_str());
  executeCommand(msg);
}

void initWiFiAndMQTT() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WIFI] Menghubungkan ke %s ", WIFI_SSID);

  if (oledOK) {
    display.clearDisplay();
    display.setCursor(34, 0);
    display.println("SENTINEL-X");
    display.drawLine(0, 9, 127, 9, SSD1306_WHITE);
    display.setCursor(0, 16);
    display.printf("SSID: %s\n", WIFI_SSID);
    display.setCursor(0, 30);
    display.print("Connecting WiFi");
    display.display();
  }

  uint32_t startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - startAttempt) < 8000) {
    delay(400);
    Serial.print(".");
    if (oledOK) {
      display.print(".");
      display.display();
    }
  }
  Serial.println();

  if (oledOK) {
    display.setCursor(0, 46);
    if (WiFi.status() == WL_CONNECTED) {
      display.println("WiFi: CONNECTED [OK]");
      display.setCursor(0, 56);
      display.printf("IP: %s", WiFi.localIP().toString().c_str());
    } else {
      display.println("WiFi: FAILED [TIMEOUT]");
      display.setCursor(0, 56);
      display.println("Retry in background...");
    }
    display.display();
    delay(1500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[OK] Wi-Fi terhubung! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[INFO] Wi-Fi belum terhubung. Akan dicoba berkala di background.");
  }

  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);
}

void maintainWiFiAndMQTT() {
  uint32_t now = millis();

  if (WiFi.status() != WL_CONNECTED) {
    if (now >= nextWifiRetry) {
      nextWifiRetry = now + WIFI_RETRY_COOLDOWN_MS;
      Serial.println("[WIFI] Mencoba menyambung ulang ke Hotspot...");
      WiFi.disconnect();
      WiFi.reconnect();
    }
    return;
  }

  if (!mqttClient.connected()) {
    if (now >= nextMqttRetry) {
      nextMqttRetry = now + MQTT_RETRY_COOLDOWN_MS;

      String clientId = String(NODE_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
      Serial.printf("[MQTT] Menghubungkan ke %s (%s)...\n", MQTT_BROKER, clientId.c_str());

      if (mqttClient.connect(clientId.c_str())) {
        Serial.println("[OK] MQTT EMQX terhubung!");
        mqttClient.subscribe(TOPIC_COMMAND);
        mqttClient.subscribe(TOPIC_COMMAND_ALT);
      } else {
        Serial.printf("[RETRY] MQTT gagal (rc=%d)\n", mqttClient.state());
      }
    }
  } else {
    mqttClient.loop();
  }
}

void handleSerial() {
  if (Serial.available() <= 0) return;
  String cmd = Serial.readStringUntil('\n');
  executeCommand(cmd);
}

/* ============================================================================
   16. SETUP
   ============================================================================ */
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);

  Serial.begin(115200);
  delay(600);

  pinMode(PIN_BUS_LOOP,   INPUT_PULLUP);
  pinMode(PIN_LED_ALERT,  OUTPUT);
  digitalWrite(PIN_LED_ALERT, LOW);

  // Pastikan MOSFET OFF (Relay MATI / Kipas NC Menyala) saat start
  pinMode(PIN_RELAY_TRIP, OUTPUT);
  digitalWrite(PIN_RELAY_TRIP, LOW);
  relayTripped = false;

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  calibrateACS712();

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  delay(200);

  oledOK = initOLED();
  mpuOK  = initMPU();
  initWiFiAndMQTT();

  nextMpuRetry  = millis() + MPU_RETRY_COOLDOWN_MS;
  nextWifiRetry = millis() + WIFI_RETRY_COOLDOWN_MS;
  nextMqttRetry = millis() + 1000;

  Serial.println("====================================================");
  Serial.println("SENTINEL-X Demo  (REV 16 - MOSFET IRFZ34N + Clean OLED)");
  Serial.println("Broker  : broker.emqx.io:1883");
  Serial.println("Perintah: TRIP | RESET | STATUS");
  Serial.println("====================================================");
}

/* ============================================================================
   17. LOOP UTAMA
   ============================================================================ */
void loop() {
  handleSerial();
  maintainWiFiAndMQTT();

  uint32_t now = millis();
  if (now - lastTelemetry < TELEMETRY_MS) return;
  lastTelemetry = now;

  float vib     = readVibG();
  bool  secure  = (digitalRead(PIN_BUS_LOOP) == LOW);
  float i_rms   = readCurrentHybrid();
  float gas_ppm = readGasSim();

  AIResult ai = runTinyML(i_rms, gas_ppm, vib, secure);

  digitalWrite(PIN_LED_ALERT,
    (ai.threat > THREAT_THRESHOLD || relayTripped) ? HIGH : LOW);

  // 1. Update Layar OLED (Header bersih hanya "SENTINEL-X")
  updateOLED(i_rms, gas_ppm, vib, secure, ai);

  // 2. Format JSON Telemetri
  JsonDocument doc;
  doc["node"] = NODE_ID;

  JsonObject m = doc["metrics"].to<JsonObject>();
  m["I_rms"]      = serialized(String(i_rms, 2));
  m["gas_ppm"]    = serialized(String(gas_ppm, 1));
  m["vib_g"]      = serialized(String(vib, 4));
  m["bus_secure"] = secure;

  JsonObject a = doc["ai_engine"].to<JsonObject>();
  a["class"]      = ai.label;
  a["threat_idx"] = ai.threat;
  a["latency_us"] = ai.latency_us;

  doc["status"]     = ai.status;
  doc["relay_trip"] = relayTripped;

  char jsonBuffer[384];
  size_t n = serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));

  // 3. Kirim ke USB Serial
  Serial.println(jsonBuffer);

  // 4. Publikasikan ke EMQX Broker jika terhubung
  if (mqttClient.connected()) {
    mqttClient.publish(TOPIC_TELEMETRY, jsonBuffer, n);
  }
}
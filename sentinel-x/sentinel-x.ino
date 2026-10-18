/* ============================================================================
   SENTINEL-X — DEMO FIRMWARE (OLED + RELAY) [REV 10 - CLEAN HEADER SENTINEL-X]
   Board   : ESP32 DOIT DevKit V1
   Library : ElectronicCats MPU6050, ArduinoJson, Adafruit SSD1306, Adafruit GFX
   ============================================================================ */

#include <Arduino.h>
#include <Wire.h>
#include <MPU6050.h>          // ElectronicCats MPU6050
#include <ArduinoJson.h>
#include <Adafruit_GFX.h>     // Library Grafis OLED
#include <Adafruit_SSD1306.h> // Library Driver OLED SSD1306

/* ---------------- 1. PIN MAP ---------------- */
#define PIN_I2C_SDA       21
#define PIN_I2C_SCL       22
#define PIN_ADC_GASSIM    35
#define PIN_ADC_ISIM      39
#define PIN_BUS_LOOP      14
#define PIN_LED_ALERT     15
#define PIN_RELAY_TRIP    26

/* ---------------- 2. KONFIGURASI OLED SSD1306 ---------------- */
#define SCREEN_WIDTH      128
#define SCREEN_HEIGHT     64
#define OLED_RESET        -1
#define OLED_I2C_ADDR     0x3C

/* ---------------- 3. PARAMETER SENSITIVITAS GETARAN ---------------- */
#define VIB_SAMPLES       24
#define VIB_GAIN          2.0f
#define VIB_MODEL_SCALE   50.0f
#define MPU_I2C_ADDR      0x68     // Alamat I2C terdeteksi (0x68)
#define ACCEL_SCALE_2G    16384.0f // Skala LSB/g untuk rentang +-2g

/* ---------------- 4. PARAMETER RETRY MPU ---------------- */
#define MPU_RETRY_COOLDOWN_MS  5000

/* ---------------- 5. KONFIGURASI DEMO ---------------- */
#define NODE_ID              "SENTINEL-X-01"
#define THREAT_THRESHOLD     55
#define TELEMETRY_MS         500

/* ---------------- 6. STATE GLOBAL ---------------- */
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);
MPU6050  mpu(MPU_I2C_ADDR);

bool     oledOK        = false;
bool     mpuOK         = false;
bool     relayTripped  = false;
uint32_t lastTelemetry = 0;
uint32_t nextMpuRetry  = 0;

/* ---------------- 7. BOBOT TINYML INT8 ---------------- */
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

/* ============================================================================
   8. INISIALISASI MPU-6050 (ELECTRONIC CATS - SUPPORT WHO_AM_I 0x74)
   ============================================================================ */
bool mpuPing() {
  Wire.beginTransmission(MPU_I2C_ADDR);
  return (Wire.endTransmission() == 0);
}

void configureMPU() {
  mpu.initialize();
  mpu.setSleepEnabled(false);
  mpu.setFullScaleAccelRange(MPU6050_ACCEL_FS_2); // +-2G
  mpu.setDLPFMode(MPU6050_DLPF_BW_256);           // Bandwidth ~256 Hz

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
   9. INISIALISASI & TAMPILAN OLED SSD1306
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
  display.setCursor(34, 16);
  display.println("SENTINEL-X");
  display.setCursor(16, 32);
  display.println("Initializing...");
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

  // 1. Baris Header: Hanya teks "SENTINEL-X" di posisi tengah
  display.setCursor(34, 0);
  display.print("SENTINEL-X");
  display.drawLine(0, 9, 127, 9, SSD1306_WHITE);

  // 2. Baris Sensor 1: Arus & Gas
  display.setCursor(0, 13);
  display.printf("I:%5.2fA  G:%5.0fppm", i_rms, gas_ppm);

  // 3. Baris Sensor 2: Getaran & Status Loop Security
  display.setCursor(0, 24);
  display.printf("V:%5.3fg  SEC:%s", vib_g, secure ? "SECURE" : "BREACH");

  // 4. Baris Threat Index + Progress Bar
  display.setCursor(0, 36);
  display.printf("THR:%3d%%", ai.threat);
  display.drawRect(52, 36, 74, 8, SSD1306_WHITE);
  int barWidth = map(constrain(ai.threat, 0, 100), 0, 100, 0, 70);
  if (barWidth > 0) {
    display.fillRect(54, 38, barWidth, 4, SSD1306_WHITE);
  }

  // 5. Baris Footer: Status / Klasifikasi AI
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
   10. PEMBACAAN GETARAN (ELECTRONIC CATS getAcceleration)
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
  return vib;
}

/* ============================================================================
   11. SENSOR LAIN
   ============================================================================ */
float readCurrentSim() {
  return (analogRead(PIN_ADC_ISIM) / 4095.0f) * 20.0f;
}

float readGasSim() {
  float ppm = (analogRead(PIN_ADC_GASSIM) / 4095.0f) * 1000.0f;
  return max(ppm, 15.0f);
}

/* ============================================================================
   12. INFERENSI TINYML INT8 (L2)
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
   13. INTERLOK RELAY
   ============================================================================ */
void tripRelay() {
  if (relayTripped) return;
  digitalWrite(PIN_RELAY_TRIP, HIGH);
  relayTripped = true;
  Serial.println("{\"scada_cmd\":\"EMERGENCY_DISCONNECT_EXECUTED\",\"relay_trip\":true}");
}

void resetRelay() {
  if (!relayTripped) return;
  digitalWrite(PIN_RELAY_TRIP, LOW);
  relayTripped = false;
  Serial.println("{\"scada_cmd\":\"BAY_RECONNECTED\",\"relay_trip\":false}");
}

/* ============================================================================
   14. PERINTAH SERIAL
   ============================================================================ */
void handleSerial() {
  if (Serial.available() <= 0) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim(); cmd.toUpperCase();

  if      (cmd == "TRIP")   tripRelay();
  else if (cmd == "RESET")  resetRelay();
  else if (cmd == "STATUS") Serial.printf("[STATUS] relay=%s mpu=%s oled=%s\n",
                                relayTripped ? "TRIP" : "NORMAL",
                                mpuOK ? "OK" : "GAGAL",
                                oledOK ? "OK" : "GAGAL");
}

/* ============================================================================
   15. SETUP
   ============================================================================ */
void setup() {
  Serial.begin(115200);
  delay(600);

  pinMode(PIN_BUS_LOOP,   INPUT_PULLUP);
  pinMode(PIN_LED_ALERT,  OUTPUT);
  pinMode(PIN_RELAY_TRIP, OUTPUT);
  digitalWrite(PIN_LED_ALERT,  LOW);
  digitalWrite(PIN_RELAY_TRIP, LOW);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(100000);
  delay(200);

  oledOK = initOLED();
  mpuOK  = initMPU();
  nextMpuRetry = millis() + MPU_RETRY_COOLDOWN_MS;

  Serial.println("====================================================");
  Serial.println("SENTINEL-X Demo  (REV 10 - Clean Header OLED)");
  Serial.println("Perintah: TRIP | RESET | STATUS");
  Serial.println("====================================================");
}

/* ============================================================================
   16. LOOP UTAMA
   ============================================================================ */
void loop() {
  handleSerial();

  uint32_t now = millis();
  if (now - lastTelemetry < TELEMETRY_MS) return;
  lastTelemetry = now;

  float vib     = readVibG();
  bool  secure  = (digitalRead(PIN_BUS_LOOP) == LOW);
  float i_rms   = readCurrentSim();
  float gas_ppm = readGasSim();

  AIResult ai = runTinyML(i_rms, gas_ppm, vib, secure);

  digitalWrite(PIN_LED_ALERT,
    (ai.threat > THREAT_THRESHOLD || relayTripped) ? HIGH : LOW);

  updateOLED(i_rms, gas_ppm, vib, secure, ai);

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

  serializeJson(doc, Serial);
  Serial.println();
}
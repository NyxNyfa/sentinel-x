# SENTINEL-X Demo Simpel — List Wiring Lengkap per Part

Berikut daftar sambungan **setiap komponen** untuk konfigurasi demo paling simpel (relay-only, tanpa MOSFET, tanpa LED hijau, 1 fan).

---

## 1. ESP32 DevKit V1 (di breadboard)

| Pin ESP32 | Terhubung ke | Fungsi |
|---|---|---|
| **3V3** | Rel 3,3V breadboard | Suplai MPU-6050, potensio |
| **VIN** | Rel 5V breadboard | Suplai relay, ACS712, MQ-135 |
| **GND** (kiri) | Rel GND | Ground bersama |
| **GND** (kanan) | Rel GND | Ground bersama |

> Satukan kedua GND ke rel negatif breadboard. Semua komponen berbagi ground ini.

---

## 2. MPU-6050 (tempel di bodi fan)

| Pin Modul | Terhubung ke | Tegangan |
|---|---|---:|
| VCC | Rel 3,3V | 3,3V |
| GND | Rel GND | 0V |
| SDA | ESP32 **D21** | 3,3V I2C |
| SCL | ESP32 **D22** | 3,3V I2C |

> Kabel pendek (≤15 cm). Jika error saat fan berputar, tambah pull-up 10kΩ SDA→3,3V dan SCL→3,3V.

---

## 3. Potensio #1 — Knob INJEKSI GAS

| Kaki Potensio | Terhubung ke | Keterangan |
|---|---|---|
| Kaki kiri | Rel **3,3V** | ⚠️ 3,3V, bukan 5V |
| Kaki kanan | Rel GND | — |
| Kaki tengah (wiper) | ESP32 **D35** | `gas_ppm` injeksi |

> Disuplai 3,3V → wiper tidak pernah melebihi 3,3V → aman tanpa divider.

---

## 4. Potensio #2 — Knob INJEKSI ARUS

| Kaki Potensio | Terhubung ke | Keterangan |
|---|---|---|
| Kaki kiri | Rel **3,3V** | ⚠️ 3,3V, bukan 5V |
| Kaki kanan | Rel GND | — |
| Kaki tengah (wiper) | ESP32 **D39 / VN** | `i_rms_sim` injeksi |

---

## 5. Saklar Geser 3-Pin — Perimeter

| Kaki Saklar | Terhubung ke | Keterangan |
|---|---|---|
| Kaki **tengah** | ESP32 **D14** | `INPUT_PULLUP` |
| Kaki pinggir 1 | Rel GND (via kabel loop) | Bisa digeser juri |
| Kaki pinggir 2 | **Kosong** | Tidak dipakai |

```
Loop tertutup → D14 LOW  → bus_secure = true  → NORMAL
Loop terbuka  → D14 HIGH → bus_secure = false → PERIMETER_SABOTAGE
```

---

## 6. LED Merah — Indikator Alert

| Komponen | Terhubung ke |
|---|---|
| ESP32 **D15** | Resistor **220Ω** |
| Resistor 220Ω | LED kaki panjang (anoda +) |
| LED kaki pendek (katoda −) | Rel GND |

> ⚠️ Katoda wajib ke GND. Jangan dibalik (D15 strapping pin — konfigurasi sink yang aman saat boot).

---

## 7. PC817 2-Channel — HANYA Channel 1 Dipakai

### Sisi Input (dari ESP32)

| Lubang PC817 | Terhubung ke | Tegangan |
|---|---|---:|
| **in1** | ESP32 **D26** | 3,3V |
| **g** (sebelah in1) | Rel GND | 0V |
| in2 | **Kosong** | — |
| g (sebelah in2) | **Kosong** | — |

### Sisi Output (ke Relay)

| Lubang PC817 | Terhubung ke | Tegangan |
|---|---|---:|
| **v1** | Relay pin **IN** | 0/5V |
| **g** (sebelah v1) | Rel GND | 0V |
| v2 | **Kosong** | — |
| g (sebelah v2) | **Kosong** | — |

### Tambahan wajib

| Titik | Terhubung ke | Alasan |
|---|---|---|
| Relay IN | Resistor **10kΩ** → Rel 5V | Pull-up agar IN tidak floating |

---

## 8. Relay 1-Channel 5V — Emergency Trip

| Pin Relay | Terhubung ke | Tegangan |
|---|---|---:|
| **VCC** | Rel 5V (VIN) | 5V |
| **GND** | Rel GND | 0V |
| **IN** | Lubang **v1** PC817 | 0/5V |
| **COM** | Kabel **+12V** dari adaptor | 12V |
| **NC** | Kabel **merah (+)** Fan 12V | 12V |
| **NO** | **Kosong** | Tidak dipakai |

> Gunakan **NC** (Normally Closed): normal = fan nyala, TRIP = fan mati.

---

## 9. Fan 12V — Beban (1 unit saja)

| Kabel Fan | Terhubung ke | Keterangan |
|---|---|---|
| Merah (+) | Relay **NC** | Dari relay |
| Hitam (−) | **GND adaptor 12V** | Langsung, tanpa MOSFET |

### Jalur daya lengkap

```
+12V Adaptor ──> Relay COM
                 Relay NC ──> Fan merah (+)
                 Fan hitam (−) ──> GND Adaptor 12V
```

> **MOSFET dilepas.** Fan(−) langsung ke GND.

---

## 10. ACS712 20A — OPSIONAL (jika mau arus riil)

| Pin ACS712 | Terhubung ke | Tegangan |
|---|---|---:|
| VCC | Rel 5V (VIN) | 5V |
| GND | Rel GND | 0V |
| OUT | Resistor **220Ω** → ESP32 **D34** | ~2,5V |
| **IP+** | Kabel **+12V** adaptor | 12V |
| **IP−** | Relay **COM** | 12V |

> Jika ACS712 dipasang, jalur daya jadi:
> ```
> +12V → ACS712 IP+ → IP− → Relay COM → NC → Fan(+)
> ```
> Jika tidak dipasang, langsung:
> ```
> +12V → Relay COM → NC → Fan(+)
> ```

---

## 11. MQ-135 — OPSIONAL (jika mau gas riil)

| Pin MQ-135 | Terhubung ke | Tegangan |
|---|---|---:|
| VCC | Rel 5V (VIN) | 5V |
| GND | Rel GND | 0V |
| AO | Resistor **10kΩ** → node **D32** → **10kΩ** → GND | ≤2,5V |
| DO | **Kosong** | Tidak dipakai |

Skema divider:

```
MQ-135 AO ──[10kΩ]──┬── ESP32 D32
                     │
                  [10kΩ]
                     │
                    GND
```

> MQ-135 butuh preheat 30+ menit. Untuk demo cepat, potensio #1 sudah cukup.

---

## Ringkasan Pinout Final

| Fungsi | Pin ESP32 | Komponen |
|---|---:|---|
| I2C SDA | D21 | MPU-6050 |
| I2C SCL | D22 | MPU-6050 |
| Injeksi gas | D35 | Potensio #1 |
| Injeksi arus | D39/VN | Potensio #2 |
| Arus riil (opsional) | D34 | ACS712 via 220Ω |
| Gas riil (opsional) | D32 | MQ-135 via divider |
| Perimeter | D14 | Saklar 3-pin |
| LED alert | D15 | LED merah + 220Ω |
| Relay trip | D26 | PC817 Ch1 |
| 3V3 | 3V3 | MPU, potensio |
| 5V | VIN | Relay, ACS712, MQ |
| GND | GND | Semua ground |

> ⛔ **Jangan sentuh:** D0, D2, D5, D12 (strapping pin). D25 tidak dipakai (MOSFET dilepas).

---

## Anggaran Resistor

| Resistor | Dipakai untuk | Jumlah |
|---|---|---:|
| **220Ω** | LED merah | 1 |
| **220Ω** | ACS712 OUT → D34 (opsional) | 1 |
| **10kΩ** | Pull-up Relay IN | 1 |
| **10kΩ** | Divider MQ-135 atas (opsional) | 1 |
| **10kΩ** | Divider MQ-135 bawah (opsional) | 1 |
| | **Total minimal** | **2× 220Ω + 3× 10kΩ** |

---

## Grounding

```
GND ESP32 (USB) ──┬── GND relay
                  ├── GND ACS712 / MQ-135
                  ├── GND potensio / saklar / LED
                  └── GND adaptor 12V
                  
        ──── SATU TITIK (star ground) ────
```

> Semua ground disatukan di satu titik dekat terminal adaptor 12V.

---

## Checklist Sebelum Colok USB

| # | Cek | Hasil |
|---|---|---|
| 1 | Relay COM ↔ NC (power OFF) | Tersambung ~0Ω |
| 2 | Fan(−) langsung ke GND, bukan ke MOSFET | ✅ |
| 3 | Potensio disuplai 3,3V, bukan 5V | ✅ |
| 4 | Pull-up 10kΩ di Relay IN | ✅ |
| 5 | LED katoda ke GND | ✅ |
| 6 | MPU-6050 VCC ke 3,3V, bukan 5V | ✅ |
| 7 | Semua GND disatukan | ✅ |

Setelah semua ceklis hijau, urutan uji:
1. Upload firmware → Serial Monitor 115200
2. Putar potensio → `gas_ppm` / `i_rms` naik
3. Geser saklar → `PERIMETER_SABOTAGE_DETECTED` + LED merah
4. Ketik `TRIP` → relay KLIK, fan mati
5. Ketik `RESET` → fan nyala lagi

Mau saya buatkan firmware final untuk konfigurasi simpel ini?
# Pran Rekha — Pi deployment, demo logins & wiring

Single reference for the Raspberry Pi 3 B+ deployment of Pran Rekha: the public
URL, the demo account credentials, the Arduino Uno + RC522 + LCD wiring, and the
services that keep it running. **Synthetic demo data only — not a clinical system.**

> ⚠️ These are well-known demo passwords on a public URL. Fine for a demo; never
> put real patient data behind them.

## Live URL

- Web portal: **https://pranrekha.rabidahal.com.np** (opens on `/patient`)
- Portals by path: `/patient`, `/paramedic`, `/lab`, `/hospital`

## Demo logins

Password pattern for the portal accounts is `pran-demo-<username>`.

| Portal (URL)            | Username         | Password                | Role / notes                          |
| ----------------------- | ---------------- | ----------------------- | ------------------------------------- |
| Patient (`/patient`)    | `siddharth`      | `pran-demo-siddharth`   | patient — owns demo profile PR-9042-8819 |
| Patient (`/patient`)    | `maya.patient`   | `pran-demo-patient`     | patient                               |
| Paramedic (`/paramedic`)| `paramedic`      | `pran-demo-paramedic`   | field/paramedic — bound to reader-pi-uno |
| Lab (`/lab`)            | `lab`            | `pran-demo-lab`         | lab clinician                         |
| Hospital (`/hospital`)  | `hospital`       | `pran-demo-hospital`    | hospital clinician                    |
| Hospital (`/hospital`)  | `approver`       | `pran-demo-approver`    | hospital clinician (approver)         |
| Hospital (`/hospital`)  | `demo.clinician` | `pran-demo-clinician`   | clinician                             |
| Admin (API only)        | `admin`          | `pran-demo-admin`       | admin — no dedicated page             |

The 7-card demo batch (`demo-rfid-<uid>`) uses passwords generated at enrollment
time into an ignored `.data/<batch>-credentials.json`; not fixed in code.

## Hardware wiring (Arduino Uno R3)

Power off before changing wires. **RC522 is 3.3 V, never 5 V.**

### RC522 RFID reader → Uno (SPI)

| RC522    | Uno Pin | Notes                          |
| -------- | ------- | ------------------------------ |
| 3.3V     | 3.3V    | ⚠️ not 5V                       |
| GND      | GND     |                                |
| SDA / SS | D10     | SPI chip-select (not I²C SDA)  |
| SCK      | D13     |                                |
| MOSI     | D11     |                                |
| MISO     | D12     |                                |
| RST      | D9      |                                |
| IRQ      | —       | unconnected                    |

Code: `MFRC522 reader(10, 9);` → SS=10, RST=9. Use a 5 V→3.3 V level translator on
the Uno output signals to the RC522 (SS, SCK, MOSI, RST).

### 16×2 I²C LCD → Uno

| LCD | Uno Pin | Notes                                 |
| --- | ------- | ------------------------------------- |
| VCC | 5V      |                                       |
| GND | GND     | a flaky ground causes movement-garbage |
| SDA | A4      | I²C data                              |
| SCL | A5      | I²C clock                             |

I²C address auto-detected at **0x27** or **0x3F**. If the display shows random
symbols, it's usually the contrast trimmer or a loose SDA/SCL/GND wire.

### Healthy status line

```
Arduino STATUS   RFID=OK   VERSION=92   LCD=0x27
```

- `RFID=MISSING` / `VERSION=00` or `FF` → RC522 power or SPI wiring.
- `LCD=MISSING` → LCD not answering on I²C (check SDA/A4, SCL/A5, VCC, GND).
- Firmware re-probes and re-inits the LCD every ~10 s, so a reconnected or
  glitched LCD recovers on its own within ~10 s (no reset needed).

## Architecture (all on the Pi; no laptop at runtime)

```
RFID card → Uno → USB serial → Pi bridge (scanner.py) → Pi API :4100
Browser → Cloudflare → cloudflared tunnel → Pi web :5173 → /api → :4100
```

## Services (systemd --user, lingering enabled → auto-start on boot)

| Service                     | Purpose                               |
| --------------------------- | ------------------------------------- |
| `patient-scanner.service`   | Arduino serial bridge (`scanner.py`)  |
| `pran-rekha-api.service`    | API server, port 4100                 |
| `pran-rekha-web.service`    | Next.js web app, port 5173            |
| `cloudflared.service`       | Cloudflare tunnel → public URL        |

Common commands (run on the Pi as `scanner`):

```bash
systemctl --user status pran-rekha-api.service
systemctl --user restart patient-scanner.service
systemctl --user status patient-scanner.service -l | grep STATUS   # Arduino health
```

## Rebuilding after code changes

Day-to-day reboots need nothing (compiled output persists on the SD card).
Rebuild only when the web/server source changes:

- **API:** `npm run build --workspace @pran-rekha/server` on the Pi (fast), then
  `systemctl --user restart pran-rekha-api.service`.
- **Web:** build on a laptop (`npm run build --workspace @pran-rekha/web`), copy
  `apps/web/.next` (minus `.next/cache`) to the Pi, then
  `systemctl --user restart pran-rekha-web.service`. The Pi 3's 1 GB RAM makes an
  on-device `next build` unreliable.
- **Firmware:** stop the bridge, `arduino-cli compile` + `upload` from
  `~/patient-scanner`, restart the bridge.

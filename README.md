# 🛡️ SoberWatch

> **Real-Time IoT Alcohol Biometrics, Emergency SOS & Family Safety Platform**

SoberWatch is a production-ready mobile and web telemetry application designed for road safety and personal health monitoring in Rwanda and beyond. It connects to IoT smartbands (MQ-3 BrAC sensor & PPG biometric heart rate), streams telemetry in real-time, provides AI-driven safety insights, and automatically coordinates emergency SOS calls and notifications.

---

## ✨ Key Features

- **📊 Real-Time Biometrics Dashboard**:
  - Live BrAC (Breath Alcohol Concentration) monitoring with dynamic gauge & safe/caution/danger thresholds.
  - Heart rate (BPM) tracking with historical smoothing.
  - Real-time responsive charts using Recharts.

- **🚨 Automated & Manual SOS Emergency Engine**:
  - Emergency call coordination with Rwanda National Emergency (112) & custom primary/secondary family contacts.
  - Automatic crash detection & fall detection simulation.
  - 10-second cancelable emergency countdown with audio/visual feedback.

- **📸 Profile Management & Modern Instagram-Style UI**:
  - Profile photo upload with live preview and instant local persistence.
  - Glowing luxury story ring for active user status in header and menu.
  - Instagram-style bell notification triggers and modal-based user logout flow.

- **🌍 Multilingual Localization**:
  - Native, punchy Kinyarwanda (`rw`) localization.
  - English (`en`), French (`fr`), and Swahili (`sw`) support.

- **📱 Cross-Platform Web & Native Android**:
  - Fully responsive React + Vite + Tailwind CSS web interface.
  - Capacitor Android bridge with pre-configured native assets and permissions.

---

## 🚀 Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Motion (framer-motion), Lucide React
- **Visuals & Charts**: Recharts, D3
- **Mobile Bridge**: Capacitor (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`)
- **Build Tool**: Vite

---

## 🛠️ Getting Started

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/YOUR_USERNAME/SoberWatch.git
cd SoberWatch
npm install
```

### 2. Development Server

```bash
npm run dev
```
The application will start on `http://localhost:3000`.

### 3. Production Build

```bash
npm run build
```

### 4. Android Build (Capacitor)

```bash
# Sync web build to Android native project
npm run build
npx cap copy android
npx cap open android
```

---

## 📁 Project Structure

```
├── android/                 # Native Android Capacitor project
├── public/                  # Public assets and icons
├── src/
│   ├── components/          # Reusable UI widgets (Navbar, BottomNav, SOSButton, Charts, etc.)
│   ├── i18n/                # Localization files (rw, en, fr, sw)
│   ├── services/            # Telemetry, Emergency, LocalStorage services
│   ├── views/               # Screen views (Dashboard, History, Alerts, Settings, Login, Register)
│   ├── types.ts             # Global TypeScript definitions
│   ├── App.tsx              # Root application router & state coordinator
│   └── main.tsx             # React DOM entry point
├── capacitor.config.json    # Capacitor configuration
├── package.json
└── vite.config.ts
```

---

## 📄 License & Ownership

© 2026 SoberWatch Ltd. All rights reserved.

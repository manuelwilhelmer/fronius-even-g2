# Fronius Solar.web to Even Realities G2 HUD

This project bridges **Fronius Solar.web** PV system data directly into the **Even Realities G2** smart glasses. It provides a real-time, hands-free heads-up display (HUD) of your solar power production, grid usage, load, and battery status.

## ⚠️ Prerequisites

Before using this application, you **must enable the Solar API** locally on your Fronius Inverter/Datamanager. 

1. Connect to your Fronius inverter's local web interface.
2. Go to **Communication** -> **Solar API**.
3. Enable **Communication via Solar API**.
4. Save the settings.

*Note: The app interfaces with the Solar.web Cloud via an internal JWT API, but the local Solar API setting is often required for the datalogger to push comprehensive high-frequency flow data to the cloud in the first place.*

## Features

### 📱 Mobile Application (React UI)
The mobile companion app (opened via a browser on your smartphone) serves as the configuration and authentication bridge:
- **Authentication**: Securely log in using your standard Fronius Solar.web Email and Password.
- **Fronius Branding**: Designed following the official Fronius Corporate Identity (Red/White/Gray) with a high-resolution SVG logo and premium typography (Inter / Publico Headline fonts).
- **Internationalization**: Full dual-language support for English (EN) and German (DE).
- **Auto-Discovery**: Automatically fetches your primary PV System ID (`pvSystemId`) from your Solar.web account.
- **Persistent Login**: Credentials can be saved locally (`localStorage`) for quick reconnections.

### 🕶️ HUD Application (Even Realities G2)
Once connected, your smartphone streams live data to the glasses every ~3.5 seconds. The G2 HUD features a **5-page layout** that you can navigate by using vertical swipe gestures on the touch panels of your glasses.

#### Page 1: Live Data ⚡️
Presents a clean, real-time snapshot of the current power flows:
- **System Name**: The actual name of your PV System (e.g., "Home Solar").
- **PV Gen**: Real-time solar production formatted automatically (e.g., `1.25 kW` or `850 W`).
- **Load**: Current household power consumption.
- **Grid**: Live grid interaction, shown as `+` for drawing power (import) and `-` for feeding power (export).
- **Battery** (if applicable): Displays the exact real-time charge/discharge power alongside the exact State of Charge (SOC) percentage. 
  - *Example (Discharging to load):* `Battery: -500 W (45%)`
  - *Example (Charging from PV):* `Battery: +1.25 kW (85%)`

#### Page 2: Today's Production ☀️
A daily summary of your energy generation and self-consumption:
- **Production**: Total energy produced today (kWh).
- **Self-Consumption rate**: Percentage of generated solar energy consumed directly by the household (%).
- **Self-Consumption**: Total generated solar energy consumed directly today (kWh).
- **Grid Feed-In**: Total solar energy exported to the power grid today (kWh).

#### Page 3: Today's Consumption 🏠
A daily summary of your energy usage and grid independence:
- **Consumption**: Total energy consumed by the household today (kWh).
- **Self-Sufficiency**: Percentage of your consumption that was covered by your PV system / battery (%).
- **Self-Supplied**: Amount of your consumption covered by your own system (kWh).
- **Grid Import**: Amount of energy pulled from the grid today (kWh).

#### Page 4: Monthly Production 📅
A comprehensive monthly summary of production data. Features an interactive selection menu:
- **Double-Tap**: Double tap the glasses touch panel to open the interactive **Month Selection Menu**.
- **Scroll**: Swipe up or down to scroll through a list of the last 12 months.
- **Confirm**: Double tap again on your desired month to close the menu and load the newly selected month's production data.

#### Page 5: Monthly Consumption 🗓️
A comprehensive monthly summary of consumption and grid independence. Features the same interactive selection menu as Page 4:
- Identical layout and gesture commands as Page 4 (Double-tap to open the selection menu, scroll, confirm).
- Displays total Consumption, Self-Sufficiency, Self-Supplied, and Grid Import for the selected month.

## Technical Stack
- **Frontend**: React 19, TypeScript, Vite
- **Styling**: Tailwind CSS v4
- **Hardware Integration**: `@evenrealities/even_hub_sdk` (Even SDK)
- **Data Source**: Fronius Solar.web Query API (`swqapi.solarweb.com`)

## Running Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```
3. Open the provided `localhost` or local network URL on your smartphone.
4. Input your Solar.web credentials and click **Log In**.

*Ensure your smartphone is actively paired via Bluetooth to the Even Realities G2 glasses via the Even App before initiating the connection.*

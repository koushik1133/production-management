# 📱 Lane Trailers — Find My Tablet Companion App (Android / Play Store)

This native Android Companion App guarantees that shop-floor tablets ring at **MAX alarm volume 24/7**, even when:
* The tablet screen is completely turned off or locked.
* The web browser is closed or suspended by Android power management.
* The tablet was recently rebooted (auto-starts on boot).

---

## 🏗️ Architecture & Features

1. **Foreground Service with WakeLock**:
   - Runs a persistent background service with `PARTIAL_WAKE_LOCK` so Android never suspends the WebSocket thread.
   - Holds an open connection to Supabase Realtime permanent channel `tablet_alarm_global_v8`.

2. **Full-Screen Screen Wake Overlay (`AlarmRingingActivity`)**:
   - When the manager triggers `PLAY_SOUND` for this tablet's slot (`T1`, `T2`, or `T3`):
     1. Turns the screen **ON** (`SCREEN_BRIGHT_WAKE_LOCK` + `ACQUIRE_CAUSES_WAKEUP`).
     2. Sets audio volume to **100% on `STREAM_ALARM`** (bypasses silent/vibrate switches).
     3. Plays looping loud sonar/alarm sound.
     4. Displays a full-screen high-visibility overlay with a 1-tap **"Stop Sound"** button.

3. **Auto-Start on Boot (`BootReceiver`)**:
   - Automatically starts the listener service as soon as the tablet powers on (`BOOT_COMPLETED`).

---

## 🚀 How to Build & Install

### Option A: Direct APK Sideload (Instant 2-Minute Setup on Shop Tablets)

1. Open the `android-companion/` project in **Android Studio**.
2. Click **Build** $\to$ **Build Bundle(s) / APK(s)** $\to$ **Build APK(s)**.
3. Transfer the generated `app-debug.apk` to each tablet (via USB, Google Drive, or email).
4. On the tablet:
   - Tap to install the APK.
   - Open the app, select the tablet's slot (`T1`, `T2`, or `T3`), and tap **Save Device Slot**.
   - Tap **"Disable Battery Optimization"** so Android gives it unrestricted 24/7 background execution.
   - Done! The tablet is now permanently reachable.

---

### Option B: Publishing to Google Play Store

1. In Android Studio, go to **Build** $\to$ **Generate Signed Bundle / APK**.
2. Select **Android App Bundle (.aab)**.
3. Create/select your release keystore.
4. Log into [Google Play Console](https://play.google.com/console).
5. Create an App named **"Lane Trailers Find My Companion"** (internal/closed testing or production track).
6. Upload the `.aab` file and complete the store listing.

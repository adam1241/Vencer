# App icon and QR code
eas build -p android --profile preview

## 1. Use your logo as the app icon

Your logo is at: `C:\Users\lagss\Downloads\Ziel_logo` (file or folder).

### Option A: Your file is `Ziel_logo.png` (or similar)

1. **Resize to 1024×1024** (required by Expo). You can use:
   - [Squoosh](https://squoosh.app/) (resize then export as PNG), or
   - Any image editor (e.g. Paint, GIMP, Photopea).

2. **Copy into the project:**
   - Copy the 1024×1024 PNG to:
     - `Ziel/assets/icon.png` (replaces the current icon)
     - `Ziel/assets/adaptive-icon.png` (same file is fine for Android adaptive icon)

3. **Splash (optional):**  
   Replace `Ziel/assets/splash-icon.png` with the same logo (can be same 1024×1024 or a version with padding).

4. **Clear cache and rebuild:**
   ```bash
   npx expo start --clear
   ```
   For a development build:
   ```bash
   npx expo prebuild --clean
   ```

### Option B: Your logo is in a folder (e.g. `Ziel_logo\logo.png`)

- Use the main logo file (e.g. `C:\Users\lagss\Downloads\Ziel_logo\logo.png`).
- Follow the same steps as Option A: resize to 1024×1024, then copy to `assets/icon.png` and `assets/adaptive-icon.png`.

### Current config (no code change needed)

Your `app.json` already points to:

- `./assets/icon.png` — main app icon  
- `./assets/adaptive-icon.png` — Android adaptive icon  
- `./assets/splash-icon.png` — splash screen  

Replacing those files with your logo is enough.

---

## 2. QR code to download the app (after building with Expo)

After you **build** the app with EAS (Expo Application Services), Expo gives you a **build page** with a QR code. Anyone who scans it can download and install the app (no app store required for internal/preview builds).

### Step 1: Build the app

From the project folder:

```bash
cd c:\Users\lagss\Ziel
eas build --platform android
```

For iOS as well:

```bash
eas build --platform all
```

- First time: run `eas login` if needed, and accept creating the project on EAS.
- Wait for the build to finish on Expo’s servers (link is printed in the terminal).

### Step 2: Get the build page URL

When the build finishes, the terminal prints a URL like:

```
https://expo.dev/accounts/YOUR_ACCOUNT/projects/Ziel/builds/BUILD_ID
```

Or list recent builds:

```bash
eas build:list
```

Open the build URL in your browser.

### Step 3: Use or download the QR code

- On the **build page** in the browser, Expo shows a **QR code** for that build.
- **Android:** Users scan the QR with their phone → they get a link to download the APK (or open in Play Store if you submitted there).
- **iOS:** Scan opens the build in TestFlight (after you’ve set up TestFlight and added testers).

To **save the QR as an image**:

1. Open the build page in Chrome or Edge.
2. Right‑click the QR code on the page → **“Save image as…”** (or “Copy image” then paste into Paint and save).
3. If the QR isn’t a direct image: use **Snipping Tool** (Win + Shift + S), select the QR area, and save as PNG.

You can share this PNG (e.g. by email or web) so others can print it or scan it from a screen to download the app.

### Summary

| Step | Command / action |
|------|-------------------|
| 1. Build | `eas build --platform android` (or `all`) |
| 2. Get link | Use the build URL from the terminal or `eas build:list` |
| 3. Open build page | Open that URL in the browser |
| 4. Save QR | Right‑click QR → “Save image as…” or use Snipping Tool |

For **production** (store) builds, the QR/link from EAS is for TestFlight/Internal Testing; for public download you’d use the App Store / Play Store link instead.

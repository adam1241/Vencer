# Build Vencer

This project is an Expo app with a native Android folder already checked in.

For long-term testing, Android is the practical target here because the app includes native on-device AI code under `android/`.

## 1. Prerequisites

Install these first:

- Node.js 20 or newer
- npm
- Java 17
- Android Studio
- Android SDK with:
  - Platform Tools
  - Build Tools
  - Android API 36 or whatever Android Studio asks for from this project

Make sure these work in PowerShell:

```powershell
node -v
npm -v
java -version
adb version
```

## 2. Install Dependencies

From the project root:

```powershell
npm install
```

## 3. Fast Local Test Build

If you want to run it on your own phone or emulator quickly:

```powershell
npm run android
```

That uses Expo’s native Android run flow.

## 4. Build a Debug APK

This is the easiest APK for direct testing:

```powershell
cd android
./gradlew.bat :app:assembleDebug
```

Output:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Install it on a connected device:

```powershell
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

## 5. Build a Release APK For Internal Testing

For longer testing, use a release build:

```powershell
cd android
$env:NODE_ENV='production'
./gradlew.bat :app:assembleRelease --stacktrace
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

Install it:

```powershell
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

## 6. Recommended Long-Term Signing Setup

For long-term testing, use one real Android release keystore and keep it forever.

This project now supports a local `android/keystore.properties` file.

Create your keystore:

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore android/app/my-release-key.keystore -alias vencer-release -keyalg RSA -keysize 2048 -validity 10000
```

Create:

```text
android/keystore.properties
```

Use this template:

```properties
storeFile=app/my-release-key.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=vencer-release
keyPassword=YOUR_KEY_PASSWORD
```

There is also an example file here:

```text
android/keystore.properties.example
```

How release signing works now:

1. If `android/keystore.properties` exists, release builds use that real keystore.
2. If it does not exist, release builds fall back to the debug key.

That fallback is convenient for local testing, but for other testers you should use the real keystore path above.

Important:

- never lose the keystore file
- never lose the passwords
- keep using the same keystore for every future update

If you change signing keys later, testers usually need to uninstall the old app first.

## 7. Versioning For Updates

To let testers update cleanly, increase these in `android/app/build.gradle` before each distributed release:

- `versionCode`
- `versionName`

Example:

```gradle
versionCode 2
versionName "1.0.1"
```

Rules:

- `versionCode` must always go up
- `versionName` is what humans see

## 8. Best Option For Other Testers

For other people testing over time, I recommend this flow:

1. Build `app-release.apk`
2. Share that APK privately
3. Keep using the same signing key for every update
4. Ask testers to install new APKs with `-r` update behavior instead of uninstalling

## 9. First Launch Notes

The app uses local on-device AI. On first use, the model may download on the phone and take a while to initialize.

So tell testers:

- keep internet on for first setup
- leave enough free storage on the device
- expect the first AI run to be slower than later runs

## 10. If Build Fails

Common reset steps:

```powershell
npm install
cd android
./gradlew.bat clean
./gradlew.bat :app:assembleDebug
```

If `adb` does not see the phone:

```powershell
adb devices
```

Then enable:

- Developer Options
- USB Debugging

## 11. Recommended Commands Summary

Install deps:

```powershell
npm install
```

Run directly:

```powershell
npm run android
```

Build debug APK:

```powershell
cd android
./gradlew.bat :app:assembleDebug
```

Build release APK:

```powershell
cd android
$env:NODE_ENV='production'
./gradlew.bat :app:assembleRelease --stacktrace
```

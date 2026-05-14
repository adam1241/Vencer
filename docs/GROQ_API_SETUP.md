# Legacy Groq API Setup

This document describes the older remote AI proxy setup that existed before Vencer moved to on-device Gemma 4 inference.

For the Gemma 4 Good Hackathon submission, the main AI implementation is:

- `src/services/aiService.ts`
- `android/app/src/main/java/vencer/v01/goalsbuildingapp/GemmaLocalAiModule.kt`
- Gemma 4 E4B through Google LiteRT-LM on Android

See `README.md` for the current project idea, architecture, Gemma 4 usage, and technical rationale.

## When This File Is Relevant

Use this only if you are intentionally testing or maintaining the legacy `server/` folder. It is not the primary competition path.

## Legacy Setup

The legacy server can use a Groq API key through environment variables:

```powershell
GROQ_API_KEY=gsk_your_actual_key_here
```

Then run:

```powershell
npm run server
```

The Android app should not need this legacy server for the Gemma 4 local-first demo.


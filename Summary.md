# Vencer Repository Summary

Vencer is a React Native / Expo Android app that uses Gemma 4 E4B locally through Google LiteRT-LM. It helps users turn broad personal goals into realistic plans, revise those plans with natural language, and adapt daily tasks based on recent progress.

## Core Product

The app acts as a private on-device AI coach:

- collects goal, motivation, current level, schedule, difficulty, and constraints
- generates milestones, weekly focus blocks, and light/standard/intense daily routines
- lets the user review and manually edit the plan
- lets the user ask Gemma to refine targeted parts of the plan
- creates daily tasks from the current milestone, weekly focus, user history, and time budget
- can produce weekly reviews and recommend easier or harder routines

## Architecture

- **Frontend:** Expo / React Native with Expo Router.
- **Language:** TypeScript for app logic and Kotlin for the Android Gemma bridge.
- **Local AI:** Gemma 4 E4B instruction-tuned LiteRT-LM model.
- **Runtime:** Google LiteRT-LM Android dependency.
- **Native bridge:** `NativeModules.GemmaLocalAi`.
- **Storage:** AsyncStorage/local app state, with Supabase services present for auth/data flows.
- **Fallback:** deterministic planner when local AI is unavailable or returns unusable JSON.

## Gemma 4 Integration

Key files:

- `src/services/aiService.ts`
- `src/services/planningEngine.ts`
- `app/vision-setup.tsx`
- `app/strategy-review.tsx`
- `android/app/src/main/java/vencer/v01/goalsbuildingapp/GemmaLocalAiModule.kt`

Gemma is used for:

- initial strategy generation
- natural-language plan refinement
- daily adaptive task planning
- weekly progress review

The app asks Gemma for JSON-only responses, parses and normalizes the output, records debug snapshots, and falls back to deterministic planning when needed.

## Competition Story

Vencer is positioned around Future of Education, Digital Equity, and Safety & Trust:

- users can get structured coaching without a human coach
- sensitive personal goals can be processed on-device
- the app is less dependent on constant cloud AI access after model setup
- local inference plus deterministic fallback makes the product more trustworthy


# Vencer App Context

This file is a quick orientation guide for contributors and AI coding assistants. The fuller competition-facing explanation is in `README.md`.

## Product Summary

Vencer is a minimalist goal-planning and progress app powered by on-device Gemma 4 E4B on Android. Users describe a goal and their real constraints; the app generates a realistic plan, lets them revise it, and turns it into daily tasks.

## Current AI Direction

The primary AI path is local Gemma 4 inference through LiteRT-LM, not a cloud planning proxy.

- Model label in the app: `Gemma 4 E4B`
- LiteRT-LM model bundle: `litert-community/gemma-4-E4B-it-litert-lm`
- Native module name: `GemmaLocalAi`
- Native module file: `android/app/src/main/java/vencer/v01/goalsbuildingapp/GemmaLocalAiModule.kt`
- TypeScript AI service: `src/services/aiService.ts`

The `server/` folder is legacy remote-AI infrastructure and should not be presented as the main Gemma 4 hackathon implementation.

## Key User Flows

1. **Goal setup**
   - `app/vision-setup.tsx`
   - Collects goal, motivation, current level, current activities, deadline, reminders, difficulty, preferred days, and constraints.
   - Calls Gemma through `generateAIPlan`.

2. **Strategy review**
   - `app/strategy-review.tsx`
   - Shows the generated plan.
   - Allows manual editing.
   - Lets the user revise targeted sections with Gemma through `refineAIPlan`.

3. **Daily planning**
   - `src/services/planningEngine.ts`
   - Builds a snapshot from the strategy, recent history, missed task patterns, streaks, current milestone, and current weekly focus.
   - Uses Gemma for today's task plan when enabled, otherwise falls back to deterministic tasks.

4. **Weekly review**
   - `src/services/planningEngine.ts`
   - Uses Gemma to summarize what worked, what failed, and which routine intensity should come next.

## Data Model

Core goal types are defined in:

- `src/types/goal.ts`
- `src/types/task.ts`

Important plan fields include:

- `goal`
- `northStar`
- `milestones`
- `weeklyFocus`
- `dayRoutines`
- `ifThenRules`
- `recommendedTools`
- `pointsPerDay`

## Reliability Pattern

The app treats Gemma output as powerful but not automatically trusted:

- prompts require one JSON object only
- JSON is parsed and normalized before rendering
- possible truncation is detected
- debug snapshots can show prompt and raw output
- deterministic fallback plans keep the user moving if Gemma fails

## Design Direction

The UI is intentionally minimal: high-contrast, focused, and utility-first. The product should feel like a serious personal planning tool rather than a decorative chatbot.

## Files To Check First

- `README.md`
- `src/services/aiService.ts`
- `src/services/planningEngine.ts`
- `app/vision-setup.tsx`
- `app/strategy-review.tsx`
- `app/(main)/home.tsx`
- `android/app/src/main/java/vencer/v01/goalsbuildingapp/GemmaLocalAiModule.kt`


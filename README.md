# Vencer

Vencer is a private, local-first AI coach for turning personal goals into realistic daily action plans. It uses Gemma 4 E4B on Android through Google LiteRT-LM, so the core planning experience can run on the user's device instead of depending on a remote AI server.

The project was built for the Gemma 4 Good Hackathon around a simple idea: people who most need guidance often have the least reliable access to paid coaching, cloud AI, or stable internet. Vencer gives them a practical planning assistant that understands constraints, builds a plan, adapts after missed days, and keeps sensitive goals private.

## Project Idea

Most goal apps ask users to manually create habits, streaks, and reminders. That works for simple routines, but it fails when the user needs a plan that responds to their real life: limited time, low energy, changing schedules, missed days, or a goal that is too broad to convert into today's next step.

Vencer uses Gemma 4 as an on-device planning coach. The user describes a goal, current level, motivation, schedule, preferred difficulty, reminders, and constraints. Gemma turns that context into a structured plan with:

- a short goal title and identity-based north star
- progressive milestones
- detailed weekly focus blocks
- light, standard, and intense daily routines
- if-then recovery rules
- optional recommended tools
- daily plans that adapt to recent completion history
- weekly reviews that adjust the user's routine intensity

The product is intentionally small and focused: build a plan, review it, revise it with natural language, then execute today's tasks.

## Why It Matters

Vencer targets the intersection of Future of Education, Digital Equity, and Safety & Trust.

- **Future of Education:** users can create a self-directed learning or self-improvement plan without needing a coach or tutor.
- **Digital Equity:** after the model is downloaded, the AI planning layer is local-first and less dependent on constant connectivity.
- **Safety & Trust:** sensitive goals can be processed on-device, with deterministic fallbacks when model output is not valid.

## Architecture

```text
React Native / Expo app
        |
        v
Goal setup, strategy review, home, progress screens
        |
        v
TypeScript planning services
src/services/aiService.ts
src/services/planningEngine.ts
src/services/goalBuilder.ts
        |
        v
React Native native module bridge
NativeModules.GemmaLocalAi
        |
        v
Android Kotlin LiteRT-LM module
android/app/src/main/java/vencer/v01/goalsbuildingapp/GemmaLocalAiModule.kt
        |
        v
Gemma 4 E4B instruction-tuned LiteRT-LM model
litert-community/gemma-4-E4B-it-litert-lm
```

The app keeps the user experience in React Native while moving Gemma inference into a native Android module. The TypeScript layer builds compact structured prompts, calls the native module, parses JSON responses, normalizes the result, and falls back to deterministic planning if the model output is unavailable or invalid.

## How Gemma 4 Is Used

Vencer uses the LiteRT-LM packaged instruction-tuned Gemma 4 E4B model:

- Model bundle: [`litert-community/gemma-4-E4B-it-litert-lm`](https://huggingface.co/litert-community/gemma-4-E4B-it-litert-lm)
- Base model reference: [`google/gemma-4-E4B`](https://huggingface.co/google/gemma-4-E4B)
- Android runtime: `com.google.ai.edge.litertlm:litertlm-android`

Gemma 4 powers four core behaviors:

1. **Initial plan generation**
   - The app asks Gemma for a structured JSON overview and detailed first planning layer.
   - The result becomes milestones, weekly focus, daily routines, if-then rules, and recommended tools.

2. **Natural-language plan refinement**
   - On the strategy review screen, the user can ask for changes such as "make this easier," "generate month 2," or "only fix the daily routines."
   - The app asks Gemma for a targeted patch and merges it into the existing plan.

3. **Daily adaptive planning**
   - The planning engine builds a snapshot of recent history, missed tasks, streaks, time budget, current milestone, and current weekly focus.
   - Gemma can create today's task list within the user's time budget.

4. **Weekly review**
   - After enough history exists, Gemma can summarize what worked, what failed, and whether the next week should be light, standard, or intense.

All model-facing prompts require JSON-only output. The app records debug snapshots and detects likely truncation or parse failures so the user is never blocked by malformed output.

## Technical Choices

### Local-first Gemma instead of a cloud-only AI API

The competition emphasizes local intelligence, privacy, and edge deployment. Running Gemma 4 E4B through LiteRT-LM makes the project more aligned with that goal than a standard server-side chatbot.

### React Native with a Kotlin native module

React Native keeps the product iteration speed high, while Kotlin gives direct access to Android memory checks, disk checks, model download, backend selection, and LiteRT-LM inference.

### Structured JSON planning

The app does not use free-form chat output directly. Gemma returns structured objects, then TypeScript normalizes them into the app's `StrategyPlan` data model. This makes the AI output inspectable, editable, and safe to render.

### Deterministic fallbacks

If Gemma is still downloading, fails to initialize, returns invalid JSON, or produces a truncated response, Vencer keeps working with a deterministic planner. This is important for trust: the user should get a plan even on a weaker device or unstable first launch.

### Progressive planning

Instead of asking the model to generate an enormous plan in one pass, the app separates overview planning, detailed planning, refinement, daily plans, and weekly reviews. This reduces output length pressure and makes failures easier to recover from.

## Challenges Solved

- **Large on-device model setup:** the Android module checks memory and free storage before downloading and initializing Gemma 4 E4B.
- **Model download reliability:** downloads are written to a temporary `.part` file and only finalized after size validation.
- **Backend compatibility:** the native module attempts GPU first and falls back to CPU if needed.
- **Malformed model output:** the TypeScript layer extracts JSON, estimates truncation risk, records debug snapshots, and falls back gracefully.
- **Personalization without overpromising:** prompts ask Gemma to respect time budget, difficulty, schedule, constraints, and deadline realism.
- **Daily adaptation:** the planning engine uses recent completion history and missed task patterns instead of treating every day as a fresh blank slate.

## Key Files

- `src/services/aiService.ts` - Gemma prompt construction, local model calls, parsing, normalization, debug snapshots, and fallback handling.
- `src/services/planningEngine.ts` - daily planning context, recent history, missed-task analysis, and weekly review flow.
- `src/services/goalBuilder.ts` - deterministic strategy generation fallback.
- `app/vision-setup.tsx` - goal intake flow and initial AI plan generation.
- `app/strategy-review.tsx` - editable plan review and Gemma-powered plan refinement.
- `android/app/src/main/java/vencer/v01/goalsbuildingapp/GemmaLocalAiModule.kt` - Android LiteRT-LM integration, model download, backend initialization, generation, and diagnostics.
- `android/app/build.gradle` - Android dependency configuration, including LiteRT-LM.

## Running The App

Install dependencies:

```powershell
npm install
```

Run an Android development build:

```powershell
npm run android
```

Build a release APK:

```powershell
cd android
$env:NODE_ENV='production'
./gradlew.bat :app:assembleRelease --stacktrace
```

The release APK is generated at:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## First Launch Notes

- Android is the primary target because the Gemma 4 integration is native Android code.
- The first model setup downloads the Gemma 4 E4B LiteRT-LM bundle from Hugging Face.
- Keep at least 5.2 GB of free device storage before first setup.
- The native module requires an Android device with enough memory for Gemma 4 E4B.
- The first generation can be slower because the model may need to download and initialize.

## Legacy Server Note

The `server/` folder contains an older remote AI proxy used before the app moved to local Gemma inference. The competition path for this project is the Android on-device Gemma 4 implementation.


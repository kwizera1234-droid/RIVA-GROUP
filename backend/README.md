# SoberWatch backend

This backend provides the SoberWatch API, voice assistant routing, and telemetry handling.

## Required environment

Set the backend runtime environment with:

- `SOBERWATCH_API_KEY1`
- `OPENROUTER_MODEL` (default: `openrouter/free`)

The API key is server-side only and is never exposed to the frontend or Android app.

## Start locally

1. Copy `.env.example` to `.env` and fill in the required values.
2. Install dependencies with `npm install`.
3. Start the server with `npm start`.

## Voice and AI flow

- Frontend sends final transcript to the backend voice API.
- Backend sends the request to OpenRouter.
- Optional current-information requests may trigger server-side web search.
- The backend returns the reply and any sources metadata to the frontend.
- The frontend handles TTS and Android actions only after the backend confirms the result.

## Download SoberWatch APK

[Download SoberWatch.apk](apk/SoberWatch.apk)

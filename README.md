# Sentinel Agent

Mobile app for Sentinel field agents. An agent signs in, submits the result for
the polling stream they are posted to, photographs the declaration form, and
talks to the command centre.

It is an offline-tolerant client over the same Django API and the same database
as the web Command Center. It holds no business logic of its own: validation,
verification and the tally are all server-side.

> Sentinel is an internal campaign tool. It is not an IEBC system, is not
> certified or endorsed by the IEBC, and figures recorded in it are the
> campaign's own record rather than official results.

## What the app does

| Screen | Purpose |
|---|---|
| **Sign in** | Email and password only. No self-registration. |
| **My Station** | The agent's stream, IEBC code, registered voters, race, ballot, and the state of their submission. |
| **Submit** | Photograph the form, enter the figures, see the arithmetic checked live, send. |
| **Messages** | Chat with the command centre: text, photos and voice notes. |

There is deliberately no dashboard and no tally. The API will not serve those to
a field agent, and an agent watching a running total is an agent under pressure
to report a helpful number.

## Deliberate omissions

- **No "create account".** Agents are registered by an admin in the web app,
  which is what binds a person to a polling stream. Self-registration would let
  anyone with the app claim to be an agent.
- **No password reset in the app.** An agent locked out at 5am needs a person,
  not an email link. The screen tells them to call the command centre.
- **No agent-to-agent messaging.** Agents comparing figures before submitting is
  exactly the coordination the platform exists to make unnecessary.
- **No editing after sending.** A correction is a new version authorised by the
  command centre, so the original record survives.

## Running it

The backend must be running first (see `../backend`), with data loaded:

```bash
cd ../backend
python restore_geography.py
python manage.py shell -c "exec(open('bootstrap_local.py', encoding='utf-8-sig').read())"
python manage.py runserver 8000
```

Then:

```bash
npm install
npm start          # then scan the QR code with Expo Go, or press 'a' for Android
npm run typecheck
```

### Reaching the backend from a phone

A phone cannot reach `localhost` — that resolves to the phone itself. The app
derives the development machine's LAN address from the Metro bundler URL, so on
a real device it usually works with no configuration. Override it when needed:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.24:8000 npm start
```

Django must also accept that host — add it to `ALLOWED_HOSTS`.

### Development accounts

`bootstrap_local.py` creates `agent1@sentinel.ke` … `agent5@sentinel.ke`, each
posted to a real Kiharu stream, password `Sentinel-Dev-2027!`. Development only.

## Architecture

```
app/                    expo-router routes
  _layout.tsx           providers, and the signed-in/signed-out gate
  login.tsx
  (app)/
    _layout.tsx         three tabs
    index.tsx           My Station
    submit.tsx          Submit Result
    chat.tsx            Messages
src/
  api/
    config.ts           base URL resolution (LAN, emulator, env override)
    tokens.ts           refresh token in the OS keystore; access token in memory
    client.ts           fetch wrapper: single-flight refresh, error normalising
    endpoints.ts        one typed function per endpoint
    types.ts            mirrors the Django serializers
  components/           Button, VoteInput, ChatBubble, shared primitives
  hooks/
    usePosting.ts       the agent's station, cached to disk for offline use
    usePhoto.ts         capture and compress the form photo
    useResultValidation.ts   live arithmetic checks
    useChat.ts          polling, optimistic sends
  store/auth.tsx        session state
  theme/                colours, spacing, type, motion
```

### Decisions worth knowing

**Photo compression is the most consequential detail.** A phone camera produces
a 4–6MB JPEG. On the 2G an agent may have at a rural station at 22:00 that
either fails or takes minutes, and an agent whose upload fails twice stops
trying. A declaration form is black text on white paper, so it survives
compression well: the long edge is resized to 1600px at quality 0.7, bringing a
typical form to roughly 250–500KB. 1600px is a floor set by legibility — below
about 1200px, pencil figures on a carbon copy break up when a verifier zooms in
and the photo stops working as evidence.

**Upload is separate from submission.** The photo is uploaded first and returns
an id. If the submission then fails, the image is already on the server and a
retry does not re-send it.

**Validation runs while the agent still holds the form.** The checks duplicate
the server's, which is the point: the same error caught by a verifier two hours
later means a correction request to an agent who has gone home. Errors block
sending; warnings (unusual turnout, high rejected count) do not — an app that
refused to send a real-but-surprising result would suppress the evidence the
platform exists to capture.

**Tokens.** The refresh token goes in the OS keystore via `expo-secure-store`,
never AsyncStorage, which is an unencrypted file. The access token is held in
memory only. A 401 triggers exactly one refresh, shared across concurrent
requests, so six requests on mount do not race the rotation.

**Chat polls rather than holding a socket.** A socket on a cheap phone with
intermittent 2G costs battery and reconnect churn, and a dead socket looks
exactly like an empty conversation — the worst failure for an agent waiting on
instructions. A 6-second cursor-based poll cannot fail silently.

**Idempotency.** Every message carries a `client_uuid` generated when it is
composed, not when it is sent, so a retry over a flaky connection is stored
once. Result submissions are protected by a unique constraint on
`(race, polling_station)`, which the API reports as a 400 rather than a crash.

## Backend endpoints used

| Endpoint | Purpose |
|---|---|
| `POST /auth/login/`, `/refresh/`, `/logout/` | Session |
| `GET /agents/me/` | The agent's posting, race and ballot — one call, then offline |
| `POST /uploads/` | Form photos, chat images, voice notes |
| `POST /results/submissions/submit/` | The result |
| `GET`/`POST` `/messages/` | Chat |
| `POST /messages/read/` | Read receipts |

## Not built yet

- **Durable offline queue.** Figures survive in screen state and the app is
  honest when a send fails ("nothing was sent — your figures are still here"),
  but a submission composed with no signal is not yet persisted to disk and
  retried in the background. This is the most valuable next piece of work.
- **Push notifications.** Without them an agent only learns that a correction
  was requested next time they open the app.
- **Biometric or PIN app lock.** A field phone can be borrowed or seized.
- **Multi-page forms.** Some declaration forms run to two sheets.

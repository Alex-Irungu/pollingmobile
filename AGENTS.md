# Working on Sentinel Agent

## What this is

The mobile app for Sentinel field agents. It shares the Django backend and
database with the web Command Center, which lives in a **different repository**
(`Alex-Irungu/Polling`). This repo contains only the app.

## Verify before committing

```bash
npm run typecheck        # must be clean
npm start                # Metro must bundle for android and ios
```

There is no test suite yet. Until there is, exercise the real flow against a
local backend: sign in as `agent1@sentinel.ke`, submit a result with a photo,
send a text, a photo and a voice note.

## Rules that are not negotiable

These encode decisions that took research to get right. Changing them needs a
deliberate discussion, not a refactor.

1. **An agent submits only for the station they are posted to.** The server
   enforces it; the app must never offer a station picker.
2. **No self-registration.** Agents are created by an admin. Adding a sign-up
   screen would break the link between a person and a polling stream.
3. **Never show a fake success.** If something is queued or unsent, say so. An
   agent who believes a result was sent will not resend it.
4. **Never show the tally to an agent.** The API will not serve it, and an agent
   watching a running total is under pressure to report a helpful figure.
5. **Warnings must not block sending.** Unusual turnout is not proof of
   anything. Refusing to send a real-but-surprising result would suppress the
   evidence the platform exists to capture.
6. **Photos are evidence.** Do not crop, redraw, annotate or re-encode a form
   photo beyond the one compression step in `usePhoto.ts`. A corrected photo is
   a new upload, never an overwrite.
7. **Do not lower the compression floor below ~1200px.** Pencil figures on a
   carbon-copy form stop being legible when a verifier zooms in.
8. **Refresh tokens go in `expo-secure-store`, never AsyncStorage.** A field
   phone can be seized.
9. **Keep `client_uuid` generated at compose time, not send time.** It is what
   makes retries idempotent.

## Backend coordination

The backend is in the other repo. If you need an API change:

- **Additive only.** Deployed phones cannot be force-updated mid-election, so
  renaming or removing a field breaks agents in the field. Add fields; do not
  rename them.
- The endpoints this app relies on are listed in `README.md`. Several were added
  specifically for it (`/agents/me/`, `/uploads/`, `/messages/`) — the web app
  does not use them all, so they are easy for someone to break unknowingly.

## Design system

Use `src/theme`. Do not introduce ad-hoc colours or spacing.

Constraints behind the tokens: the app is used outdoors at dawn and in badly-lit
halls at midnight (contrast), one-handed by tired people (≥48dp targets, ≥13pt
type), on cheap Android phones (no blurs, shallow shadows, nothing animating on
a timer).

## Known gaps

See "Not built yet" in `README.md`. The durable offline queue is the most
valuable next piece of work: figures currently survive in screen state, but a
submission composed with no signal is not yet persisted and retried in the
background.

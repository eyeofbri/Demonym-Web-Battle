# Demonym Connect Battle Protocol v1

v0.2.7 introduces a small shared data contract between the battle server and its clients. This is not Cardputer integration yet. The purpose is to stop the web build from depending on browser-only creature structures before device work begins.

## Creature payload

Static creature identity and battle loadout now live in a versioned payload:

```json
{
  "format": "demonym-battle-creature",
  "version": 1,
  "source": "web-test",
  "creatureId": "web-test-cinder",
  "name": "Cinder Demonym",
  "lineage": "Cinder",
  "stats": {
    "maxHp": 100,
    "maxEnergy": 10
  },
  "moveIds": [
    "pulse-strike",
    "overcharge",
    "reckless-rush",
    "ember-spire"
  ]
}
```

The server validates the payload before it creates runtime battle state. A v1 payload requires a known lineage, positive maximum HP/Energy values, and exactly four unique known moves.

Current HP, current Energy, statuses, and the previous move are runtime battle state. They are intentionally not part of the static creature payload.

`source` is currently `web-test`. A future Cardputer handoff can use the same shape with `source: "cardputer"` once device transport and validation are implemented.

The numeric values and test loadouts in the web build are still test data until the current Cardputer battle tables are synced.

## Battle events

The Durable Object also maintains a monotonically increasing event ID and a short rolling list of public battle events. Clients can process only events newer than the last ID they have seen.

Current event types include:

- `lineage_selected`
- `ready`
- `signal_toss`
- `round_start`
- `action_locked`
- `move_resolved`
- `move_missed`
- `recover`
- `status_applied`
- `heal`
- `battle_end`
- `rematch_requested`
- `rematch_started`
- `disconnect`

An `action_locked` event deliberately does **not** contain the selected move. The move ID is only exposed in resolution events after both players have committed their actions. This preserves the hidden lock-in battle structure.

Example resolved move event:

```json
{
  "id": 18,
  "type": "move_resolved",
  "round": 3,
  "player": 2,
  "targetPlayer": 1,
  "moveId": "signal-snare",
  "amount": 7,
  "message": "Player 2 used Signal Snare for 7 damage."
}
```

## UI events in v0.2.7

The current browser uses these server events for lightweight feedback only: move-lock pulses, attack/hit motion, Recover/heal flashes, status flashes, Signal Toss/round callouts, and a winner pulse.

The event stream is the important piece. The current animations are intentionally modest and can be replaced later without changing battle resolution.

## v0.2.8 mock external creature handoff

v0.2.8 adds a development-only transport for exercising the creature payload contract before live Cardputer networking is implemented.

A connected client can send the following WebSocket message before that player presses READY:

```json
{
  "type": "import-creature",
  "creature": {
    "format": "demonym-battle-creature",
    "version": 1,
    "source": "cardputer",
    "creatureId": "cardputer-mock-p1-cinder",
    "name": "Cinder Device Test",
    "lineage": "Cinder",
    "stats": {
      "maxHp": 100,
      "maxEnergy": 10
    },
    "moveIds": [
      "pulse-strike",
      "overcharge",
      "reckless-rush",
      "ember-spire"
    ]
  }
}
```

The Durable Object validates and normalizes the payload before replacing that player's pre-battle creature. External imports currently require `source: "cardputer"`, exactly four unique known move IDs, a known lineage, positive bounded HP/Energy values, and bounded creature ID/name strings. Unknown moves, malformed JSON, unsupported versions, and imports after READY are rejected.

The server rebuilds runtime state from the accepted payload; clients cannot provide current HP, current Energy, statuses, lock state, or other live battle values.

This is deliberately **not** live Cardputer transport. The browser's `DEVICE PAYLOAD TEST` panel is only a protocol harness that simulates the device handoff and allows malformed payloads to be tested against server validation.

Rematches preserve the exact accepted creature payload, including a mock Cardputer payload. Choosing a lineage or using the `USE WEB PRESET` action replaces it with a normal server-generated `web-test` payload.

The browser also shows the current creature source as `WEB TEST` or `CARDPUTER MOCK` so protocol tests are easy to verify from both clients.

## v0.2.9 connection handshake

v0.2.9 adds an explicit client handshake before a socket is considered connected to the battle room. This is the first transport step intended to map directly to a future Cardputer implementation.

A newly accepted WebSocket is assigned a provisional player slot, but it is **not** included in `connectedPlayers` and cannot send battle commands until the handshake succeeds.

The server first sends:

```json
{
  "type": "hello-required",
  "player": 1,
  "connectionProtocol": {
    "name": "demonym-connect",
    "version": 1,
    "serverVersion": "0.3.0",
    "requiredCapabilities": [
      "creature-payload-v1",
      "round-lock-v1",
      "battle-events-v1",
      "recover-action-v1",
      "session-resume-v1"
    ],
    "supportedClientTypes": ["web", "cardputer"]
  }
}
```

The client must answer with `client-hello`:

```json
{
  "type": "client-hello",
  "protocol": "demonym-connect",
  "protocolVersion": 1,
  "clientType": "cardputer",
  "clientVersion": "0.9.x",
  "capabilities": [
    "creature-payload-v1",
    "round-lock-v1",
    "battle-events-v1",
    "recover-action-v1",
    "rematch-v1",
    "session-resume-v1"
  ]
}
```

A compatible client receives:

```json
{
  "type": "hello-ack",
  "player": 1,
  "client": {
    "clientType": "cardputer",
    "clientVersion": "0.9.x",
    "capabilities": ["..."]
  },
  "connectionProtocol": { "...": "..." }
}
```

The normal `welcome` state follows the acknowledgement. An incompatible protocol version, unsupported client type, malformed capability list, or missing required capability receives `hello-reject` and the server closes that socket.

The handshake is a **compatibility negotiation, not authentication**. A client identifying itself as `cardputer` is not yet cryptographically verified as a physical device. Device identity/authentication is outside the current v1 scope.

### Current capabilities

- `creature-payload-v1` — understands the static creature payload contract.
- `round-lock-v1` — understands simultaneous hidden move selection followed by ordered round resolution.
- `battle-events-v1` — can consume the current public server event stream.
- `recover-action-v1` — understands the permanent Recover battle action.
- `rematch-v1` — understands the current rematch flow. This is advertised by the web/mock clients but is not currently required for admission.

### Cardputer payload gating

Starting in v0.2.9, `import-creature` with `source: "cardputer"` is accepted only from a socket whose successful handshake used `clientType: "cardputer"`.

The browser includes a **Cardputer Mock** lobby mode so this can be tested without firmware changes. Cardputer Mock uses the normal browser battle UI, but performs a Cardputer-type handshake and is therefore allowed to exercise the device creature handoff path.

A normal `web` client may still use server-generated web lineage presets but cannot submit a Cardputer creature payload.

### Connected client metadata

State messages now include `connectedClients` alongside `connectedPlayers`. Each item exposes only compatibility metadata needed by the UI:

```json
{
  "player": 1,
  "clientType": "cardputer",
  "clientVersion": "browser-mock-0.3.0",
  "capabilities": ["..."]
}
```

This metadata is connection state, not creature state. A Cardputer client can theoretically battle using a server test creature, and a creature payload's `source` remains separate from the type of client connected to that player slot.

## v0.3 resilient battle loop

v0.3 keeps Demonym Connect protocol v1, but adds resumable player sessions and makes the browser treat the server event stream as a real playback phase rather than purely decorative feedback.

### Session resume

When a player first connects, the server creates an opaque session token for that player slot and includes it in `hello-required`:

```json
{
  "type": "hello-required",
  "player": 1,
  "sessionToken": "opaque-session-token",
  "resumed": false,
  "reconnectGraceMs": 60000,
  "connectionProtocol": { "...": "..." }
}
```

The browser stores this token in `sessionStorage`, scoped to that tab and room. `sessionStorage` is intentional: two browser tabs can still represent two different players during testing, while a refresh or temporary socket drop in one tab can retain its own player identity.

A reconnect sends the token as the WebSocket query parameter:

```text
/api/rooms/ABC123/ws?session=<opaque-session-token>
```

If the token matches a reserved player slot and that slot does not already have an active socket, the server resumes that player. The next `hello-required` and `hello-ack` messages include `resumed: true`.

The resumed client receives the current authoritative state, including its already locked move when applicable. A dropped connection therefore does not immediately erase READY state, the current round, HP/Energy, statuses, or a locked action.

The server allows a 60-second reconnect window. A disconnected player's session remains reserved during that window. If it expires, the token is released and the interrupted battle returns to pre-READY state so another client can take the open slot. The reconnect timeout is driven by a Durable Object alarm rather than by a browser timer.

A client can also send:

```json
{ "type": "leave" }
```

This explicitly releases its session immediately. The current web UI uses this when `NEW ROOM` is selected.

### New capability

v0.3 clients advertise and the server requires:

- `session-resume-v1` — understands the opaque player-session token and reconnection flow.

The protocol remains `demonym-connect` version 1. This addition is represented as a required capability rather than a protocol-version bump.

### Resolution playback lock

The Durable Object still resolves both locked actions immediately and remains authoritative for the battle result. The browser now treats newly received battle events as a local playback queue.

While that queue is playing:

- all move buttons are disabled;
- Recover is disabled;
- the round panel displays a resolving state;
- the result/rematch panel waits until the final battle event has played;
- the next round cannot be selected from the standard web UI until the prior round's events finish.

This is deliberately a **client presentation lock**, not a server delay. The server does not wait on animations or acknowledgements from either client. That avoids allowing a slow, backgrounded, or disconnected client to stall authoritative battle resolution.

The future Cardputer client can use the same server event order with device-appropriate timing and animation while keeping the battle outcome synchronized.

### Additional public events

v0.3 adds:

- `reconnect`
- `session_expired`

The existing `disconnect` event now means the player has temporarily lost its connection and is inside the reconnect window, rather than immediately meaning the match has been destroyed.

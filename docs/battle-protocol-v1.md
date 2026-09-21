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

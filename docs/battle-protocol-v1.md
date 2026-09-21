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

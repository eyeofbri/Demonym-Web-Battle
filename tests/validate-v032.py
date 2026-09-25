from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = (root / 'src/index.ts').read_text(encoding='utf-8')
battle = (root / 'src/battle-v19.ts').read_text(encoding='utf-8')
page = (root / 'public/index.html').read_text(encoding='utf-8')
docs = (root / 'docs/battle-protocol-v1.md').read_text(encoding='utf-8')

checks = []
def check(name, ok):
    checks.append((name, bool(ok)))

check('server_version_032', "serverVersion: '0.3.2'" in index)
check('state_version_14', 'version: 14;' in index and 'storedState.version !== 14' in index)
check('canonical_protocol_name', "name: 'demonym-connect-v1'" in index)
check('legacy_protocol_alias', "data.protocol !== 'demonym-connect'" in index)
check('requires_payload_v2', "'creature-payload-v2'" in index and "REQUIRED_CLIENT_CAPABILITIES" in index)
check('battle_rules_19', 'battleRules: 19' in index and "c.battleRules !== 19" in battle)
check('canonical_payload_v2', "version: 2;" in battle and "schemaVersion: 1;" in battle and 'moveSlots:' in battle)
check('snapshot_auto_ready', "data.type === 'creature-snapshot'" in index and 'data.creature, true' in index)
check('browser_import_manual_ready', "data.type === 'import-creature'" in index and 'data.creature, false' in index)
check('slot_actions', "kind !== 'move'" in index and 'equippedMoves[slot]' in index)
check('recover_action', "kind === 'recover'" in index and "a.energy=clamp(a.energy+2" in battle)
check('standalone_guard', "kind === 'guard'" in index and 'applyGuard' in battle)
check('top_level_events', 'this.send(socket, authored)' in index)
check('event_history_retained', 'state.events.push(authored)' in index)
check('rng_hidden_from_public_state', 'battleRuntime: _battleRuntime' in index and '...publicState' in index)
check('session_tokens_hidden', 'sessionTokens: _sessionTokens' in index)
check('reconnect_grace_60s', 'RECONNECT_GRACE_MS = 60_000' in index)
check('connection_generation_retained', 'connectionIds' in index and 'Session resumed by a newer connection' in index)
check('alarm_reconnect_retained', 'scheduleReconnectAlarm' in index and 'async alarm()' in index)
check('effective_costs_server_owned', 'effectiveMoveCosts:' in index and 'creature.effectiveMoveCosts?.[slot]' in page)
check('browser_032', 'v0.3.2 canonical battle bridge' in page and "web-0.3.2" in page and "browser-mock-0.3.2" in page)
check('docs_032', '## v0.3.2 canonical Cardputer battle bridge' in docs)
check('all_41_move_ids', len([line for line in battle.splitlines() if "M('" in line]) == 41)
check('no_old_restore_wire_id', "'restore-pulse'" not in battle and "'restorative-pulse'" in battle)
check('no_old_round_energy_regen', 'energyRecoveryPerRound: 0' in index)

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'} {name}")
print(f"\n{len(checks)-len(failed)}/{len(checks)} checks PASS")
if failed:
    raise SystemExit(1)

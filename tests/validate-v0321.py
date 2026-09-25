from pathlib import Path

root = Path(__file__).resolve().parents[1]
index = (root / 'src/index.ts').read_text(encoding='utf-8')
page = (root / 'public/index.html').read_text(encoding='utf-8')
docs = (root / 'docs/battle-protocol-v1.md').read_text(encoding='utf-8')

checks = []
def check(name, ok):
    checks.append((name, bool(ok)))

check('server_version_0321', "serverVersion: '0.3.2.1'" in index)
check('state_schema_unchanged', 'version: 14;' in index and 'storedState.version !== 14' in index)
check('compact_capability_known', "| 'compact-state-v1';" in index)
check('compact_state_opt_in', "capabilities.includes('compact-state-v1')" in index)
check('compact_cardputer_only', "clientType === 'cardputer'" in index and 'usesCompactState' in index)
check('compact_room_state', "type: 'room-state'" in index and 'opponentConnected:' in index and 'eventSeq:' in index)
check('full_browser_state_retained', 'moveLibrary: MOVE_LIBRARY' in index and 'lineageLibrary: LINEAGE_LIBRARY' in index)
check('state_split_before_full_envelope', index.index('if (this.usesCompactState(socket))') < index.index('moveLibrary: MOVE_LIBRARY'))
check('top_level_events_retained', 'this.send(socket, authored)' in index)
check('browser_does_not_opt_in', "'compact-state-v1'" not in page)
check('browser_version_0321', "web-0.3.2.1" in page and "browser-mock-0.3.2.1" in page)
check('docs_connection_stability', '## v0.3.2.1 connection stability' in docs and '`compact-state-v1`' in docs)
check('reconnect_grace_unchanged', 'RECONNECT_GRACE_MS = 60_000' in index)
check('battle_rules_unchanged', 'battleRules: 19' in index)

failed = [name for name, ok in checks if not ok]
for name, ok in checks:
    print(f"{'PASS' if ok else 'FAIL'} {name}")
print(f"\n{len(checks)-len(failed)}/{len(checks)} checks PASS")
if failed:
    raise SystemExit(1)

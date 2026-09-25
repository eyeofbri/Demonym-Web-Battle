import { effectiveEnergyCost, fighterFromPayload, validateCanonicalPayloadV2, type CanonicalCreaturePayloadV2 } from '../src/battle-v19';

function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(`ASSERT FAILED: ${message}`); }
function base(): CanonicalCreaturePayloadV2 { return {
  format:'demonym-battle-creature', version:2, source:'cardputer', schemaVersion:1, battleRules:19,
  creatureId:123, visualSeed:456, publicId:789, name:'VALID', lineage:'wisp', form:'static', level:10,
  currentHealth:100, currentEnergy:100, injury:0,
  combat:{attackBonus:0,defenseBonus:0,healthBonus:0,energyBonus:0,pressureResistanceMask:0,pressureWeaknessMask:0,pressureBoostMask:0,installedPrimary:0,installedSecondary:0},
  moveSlots:['wisp-jab','wisp-ward','wisp-ghost-cut','phase-feint'],
}; }
assert(validateCanonicalPayloadV2(base()).ok, 'valid canonical v2 payload');
let p:any=base();p.battleRules=18;assert(!validateCanonicalPayloadV2(p).ok,'reject Battle Rules v18');
p=base();p.moveSlots=['wisp-jab','wisp-jab','wisp-ghost-cut','phase-feint'];assert(!validateCanonicalPayloadV2(p).ok,'reject duplicate move');
p=base();p.level=1;p.moveSlots=['wisp-jab','wisp-ward','wisp-ghost-cut','phase-feint'];assert(!validateCanonicalPayloadV2(p).ok,'reject locked signature at level 1');
p=base();p.name='12345678901234567';assert(!validateCanonicalPayloadV2(p).ok,'reject overlong name');
p=base();p.combat.installedPrimary=11;assert(!validateCanonicalPayloadV2(p).ok,'reject invalid adaptation id');
p=base();p.combat.installedPrimary=4;const f=fighterFromPayload(p);f.disruptionTurns=2;f.disrupted=true;assert(effectiveEnergyCost(f,'wisp-jab')===4,'Static Membrane removes Signal disruption surcharge');
p=base();const f2=fighterFromPayload(p);f2.disruptionTurns=2;f2.disrupted=true;assert(effectiveEnergyCost(f2,'wisp-jab')===6,'normal Signal move pays disruption surcharge');
console.log('battle-v19 validation PASS');

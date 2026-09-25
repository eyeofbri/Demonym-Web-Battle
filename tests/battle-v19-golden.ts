import { createRuntime, fighterFromPayload, resolvePeerTurn, validateCanonicalPayloadV2, type CanonicalCreaturePayloadV2, type V19Fighter } from '../src/battle-v19';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function equal<T>(actual:T, expected:T, message:string){assert(actual===expected,`${message}: expected ${String(expected)}, got ${String(actual)}`);}
function deepEqual(actual:unknown,expected:unknown,message:string){const a=JSON.stringify(actual),e=JSON.stringify(expected);assert(a===e,`${message}: expected ${e}, got ${a}`);}
function payload(overrides: Partial<CanonicalCreaturePayloadV2>): CanonicalCreaturePayloadV2 {
  return {
    format:'demonym-battle-creature',version:2,source:'cardputer',schemaVersion:1,battleRules:19,
    creatureId:1,visualSeed:1,publicId:1,name:'GOLDEN',lineage:'wisp',form:'static',level:10,currentHealth:100,currentEnergy:100,injury:0,
    combat:{attackBonus:0,defenseBonus:0,healthBonus:0,energyBonus:0,pressureResistanceMask:0,pressureWeaknessMask:0,pressureBoostMask:0,installedPrimary:0,installedSecondary:0},
    moveSlots:['wisp-jab','wisp-ward','wisp-ghost-cut','phase-feint'],...overrides,
  };
}
const pa=payload({creatureId:0x11112222,visualSeed:(0x11112222^0x55aa1234)>>>0,publicId:0x2222,lineage:'cinder',form:'static',level:10,currentHealth:83,currentEnergy:41,injury:1,combat:{attackBonus:1,defenseBonus:-1,healthBonus:4,energyBonus:3,pressureResistanceMask:0,pressureWeaknessMask:0,pressureBoostMask:0,installedPrimary:9,installedSecondary:6},moveSlots:['cinder-jab','cinder-screen','cinder-flash','ember-spire']});
const pb=payload({creatureId:0x33334444,visualSeed:(0x33334444^0x55aa1234)>>>0,publicId:0x4444,lineage:'mire',form:'pale',level:9,currentHealth:72,currentEnergy:66,injury:0,combat:{attackBonus:0,defenseBonus:2,healthBonus:8,energyBonus:0,pressureResistanceMask:0,pressureWeaknessMask:0,pressureBoostMask:0,installedPrimary:3,installedSecondary:10},moveSlots:['mire-lash','mire-hide','mire-seep','bog-leech']});
equal(validateCanonicalPayloadV2(pa).ok,true,'Cinder golden payload accepted');
equal(validateCanonicalPayloadV2(pb).ok,true,'Mire golden payload accepted');
const a=fighterFromPayload(pa), b=fighterFromPayload(pb);
function core(f:V19Fighter){return {hp:f.hp,maxHp:f.maxHp,energy:f.energy,maxEnergy:f.maxEnergy,attack:f.attack,defense:f.defense,ev:f.evasionBonus,phr:f.passiveHealthRegen,per:f.passiveEnergyRegen,stagger:f.staggerTurns,disrupt:f.disruptionTurns,burn:f.burnTurns,corrode:f.corrosionTurns,echo:f.echoTurns,ward:f.wardTurns,accdown:f.accuracyDownTurns,cd:[...f.moveCooldowns]};}
deepEqual(core(a),{hp:116,maxHp:140,energy:53,maxEnergy:130,attack:17,defense:7,ev:0,phr:0,per:0,stagger:0,disrupt:0,burn:0,corrode:0,echo:0,ward:0,accdown:0,cd:[0,0,0,0]},'Cinder fighter reconstruction');
deepEqual(core(b),{hp:100,maxHp:140,energy:81,maxEnergy:124,attack:14,defense:13,ev:0,phr:2,per:0,stagger:0,disrupt:0,burn:0,corrode:0,echo:0,ward:0,accdown:0,cd:[0,0,0,0]},'Mire fighter reconstruction');
const rt=createRuntime(0x10203040);
const seq=[
  [{kind:'move',slot:0},{kind:'move',slot:0}],
  [{kind:'guard'},{kind:'move',slot:3}],
  [{kind:'recover'},{kind:'recover'}],
  [{kind:'move',slot:3},{kind:'guard'}],
  [{kind:'move',slot:2},{kind:'move',slot:2}],
] as const;
const expected=[
 {admg:21,bdmg:19,arec:0,brec:2,a:{hp:97,energy:49,corrode:1,cd:[0,0,0,0]},b:{hp:83,energy:77,burn:0,stagger:0,cd:[0,0,0,0]}},
 {admg:0,bdmg:10,arec:0,brec:11,a:{hp:87,energy:57,corrode:1,cd:[0,0,0,0]},b:{hp:96,energy:67,burn:0,stagger:0,cd:[0,0,0,2]}},
 {admg:0,bdmg:0,arec:2,brec:2,a:{hp:87,energy:59,corrode:0,cd:[0,0,0,0]},b:{hp:98,energy:69,burn:0,stagger:0,cd:[0,0,0,1]}},
 {admg:17,bdmg:0,arec:0,brec:0,a:{hp:87,energy:48,corrode:0,cd:[0,0,0,2]},b:{hp:81,energy:76,burn:2,stagger:0,cd:[0,0,0,0]}},
 {admg:17,bdmg:16,arec:0,brec:0,a:{hp:71,energy:42,corrode:0,cd:[0,0,1,1]},b:{hp:64,energy:70,burn:1,stagger:1,cd:[0,0,1,0]}},
];
for(let i=0;i<seq.length;i++){
 const r=resolvePeerTurn(rt,a,b,seq[i][0],seq[i][1]); const e=expected[i]; const turn=i+1;
 equal(r.firstDamage,e.admg,`turn ${turn} first damage`);equal(r.secondDamage,e.bdmg,`turn ${turn} second damage`);equal(r.firstRecovered,e.arec,`turn ${turn} first recovery`);equal(r.secondRecovered,e.brec,`turn ${turn} second recovery`);
 equal(a.hp,e.a.hp,`turn ${turn} first HP`);equal(a.energy,e.a.energy,`turn ${turn} first Energy`);equal(a.corrosionTurns,e.a.corrode,`turn ${turn} first Corrosion`);deepEqual([...a.moveCooldowns],e.a.cd,`turn ${turn} first cooldowns`);
 equal(b.hp,e.b.hp,`turn ${turn} second HP`);equal(b.energy,e.b.energy,`turn ${turn} second Energy`);equal(b.burnTurns,e.b.burn,`turn ${turn} second Burn`);equal(b.staggerTurns,e.b.stagger,`turn ${turn} second Stagger`);deepEqual([...b.moveCooldowns],e.b.cd,`turn ${turn} second cooldowns`);
}
console.log('battle-v19 golden vectors PASS');

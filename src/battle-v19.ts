export type CanonicalLineage = 'husk' | 'mire' | 'wisp' | 'fang' | 'choir' | 'machine' | 'cinder' | 'veil';
export type CanonicalForm = 'pale' | 'static' | 'feral';
export type Pressure = 'Force' | 'Signal' | 'Heat' | 'Corrosion' | 'Echo';
export type PressureEffectiveness = 'resisted' | 'neutral' | 'strong';
export type BattleOutcome = 'ongoing' | 'first' | 'second' | 'draw';
export type StatusId = 'stagger' | 'disruption' | 'burn' | 'corrosion' | 'echo-interference' | 'ward';
export type SynergyId = 'breach' | 'phase-lock' | 'arc-flash' | 'open-seam' | 'burn-echo';
export type ActionKind = 'move' | 'guard' | 'recover';

export type MoveId =
  | 'none' | 'pulse-strike' | 'quiet-ward' | 'restorative-pulse' | 'signal-snare'
  | 'overcharge' | 'rend' | 'reckless-rush' | 'shell-brace' | 'bog-leech'
  | 'phase-feint' | 'pursuit-bite' | 'chorus-echo' | 'panel-shift' | 'ember-spire'
  | 'veil-snare' | 'husk-knock' | 'husk-tuck' | 'husk-fault' | 'mire-lash'
  | 'mire-hide' | 'mire-seep' | 'wisp-jab' | 'wisp-ward' | 'wisp-ghost-cut'
  | 'fang-snap' | 'fang-crouch' | 'fang-bait' | 'choir-tone' | 'choir-veil'
  | 'choir-discord' | 'machine-servo' | 'machine-guard' | 'machine-override'
  | 'cinder-jab' | 'cinder-screen' | 'cinder-flash' | 'veil-cut' | 'veil-ward'
  | 'veil-misdirect' | 'resonant-guard';

export interface CanonicalCreaturePayloadV2 {
  format: 'demonym-battle-creature';
  version: 2;
  source: 'cardputer' | 'web-test';
  schemaVersion: 1;
  battleRules: 19;
  creatureId: number;
  visualSeed: number;
  publicId: number;
  name: string;
  lineage: CanonicalLineage;
  form: CanonicalForm;
  level: number;
  currentHealth: number;
  currentEnergy: number;
  injury: number;
  combat: {
    attackBonus: number;
    defenseBonus: number;
    healthBonus: number;
    energyBonus: number;
    pressureResistanceMask: number;
    pressureWeaknessMask: number;
    pressureBoostMask: number;
    installedPrimary: number;
    installedSecondary: number;
  };
  moveSlots: [MoveId, MoveId, MoveId, MoveId];
}

export interface MoveDefinition {
  id: MoveId;
  name: string;
  pressure: Pressure | 'Lineage';
  role: 'attack' | 'guard' | 'heal' | 'utility';
  energyCost: number;
  accuracy: number;
  cooldown: number;
  description: string;
}

export interface V19Fighter {
  hp: number; maxHp: number; energy: number; maxEnergy: number;
  attack: number; defense: number; form: CanonicalForm; lineage: CanonicalLineage;
  evasionBonus: number; passiveHealthRegen: number; passiveEnergyRegen: number;
  guarding: boolean; disrupted: boolean; wardTurns: number; accuracyDownTurns: number;
  powerTurns: number; staggerTurns: number; disruptionTurns: number; burnTurns: number;
  corrosionTurns: number; echoTurns: number;
  pressureResistanceMask: number; pressureWeaknessMask: number; pressureBoostMask: number;
  adaptationPrimary: number; adaptationSecondary: number; lastMove: MoveId; level: number;
  equippedMoves: [MoveId, MoveId, MoveId, MoveId];
  moveCooldowns: [number, number, number, number];
}

export interface V19BattleRuntime { seed: number; randomState: number; turnCount: number; outcome: BattleOutcome; }
export interface BattleChoice { kind: ActionKind; slot?: number; }
export interface TurnReport {
  outcome: BattleOutcome;
  firstAction: ActionKind; secondAction: ActionKind;
  firstMove: MoveId; secondMove: MoveId;
  firstDamage: number; secondDamage: number;
  firstRecovered: number; secondRecovered: number;
  firstRecoil: number; secondRecoil: number;
  firstMissed: boolean; secondMissed: boolean;
  firstPressure?: Pressure; secondPressure?: Pressure;
  firstPressureEffect: PressureEffectiveness; secondPressureEffect: PressureEffectiveness;
  statusAppliedToSecond?: StatusId; statusAppliedToFirst?: StatusId;
  firstSynergy?: SynergyId; secondSynergy?: SynergyId;
  firstStatusDamage: number; secondStatusDamage: number;
  firstPassiveHealth: number; firstPassiveEnergy: number;
  secondPassiveHealth: number; secondPassiveEnergy: number;
}

const M = (id: MoveId, name: string, pressure: Pressure | 'Lineage', role: MoveDefinition['role'], energyCost: number, accuracy: number, cooldown: number, description: string): MoveDefinition => ({id,name,pressure,role,energyCost,accuracy,cooldown,description});
export const MOVE_LIBRARY_V19: Record<MoveId, MoveDefinition> = {
  'none': M('none','NO MOVE','Lineage','utility',0,0,0,''),
  'pulse-strike': M('pulse-strike','PULSE STRIKE','Lineage','attack',3,96,0,'Reliable low-cost hit.'),
  'quiet-ward': M('quiet-ward','QUIET WARD','Echo','guard',7,100,2,'Guard / ward + Energy.'),
  'restorative-pulse': M('restorative-pulse','RESTORE PULSE','Echo','heal',13,100,3,'Recovery / restores Health.'),
  'signal-snare': M('signal-snare','SIGNAL SNARE','Signal','utility',9,90,2,'Hit / lowers accuracy.'),
  'overcharge': M('overcharge','OVERCHARGE','Signal','attack',16,80,2,'Heavy hit with recoil.'),
  'rend': M('rend','REND','Force','attack',8,88,1,'Strong direct attack.'),
  'reckless-rush': M('reckless-rush','RECKLESS RUSH','Force','attack',15,76,2,'Huge hit with recoil.'),
  'shell-brace': M('shell-brace','SHELL BRACE','Force','guard',8,100,2,'Guard / clears Stagger / heals.'),
  'bog-leech': M('bog-leech','BOG LEECH','Corrosion','utility',10,88,2,'Drain / more healing vs Corroded.'),
  'phase-feint': M('phase-feint','PHASE FEINT','Signal','utility',9,92,2,'Hit / evasion boost; more vs Disrupted.'),
  'pursuit-bite': M('pursuit-bite','PURSUIT BITE','Force','attack',10,87,2,'Finisher / stronger vs wounded.'),
  'chorus-echo': M('chorus-echo','CHORUS ECHO','Echo','utility',10,91,2,'Hit / Energy; more vs Echo/Burn.'),
  'panel-shift': M('panel-shift','PANEL SHIFT','Signal','guard',8,100,2,'Guard / clears noise + Energy.'),
  'ember-spire': M('ember-spire','EMBER SPIRE','Heat','attack',11,84,2,'Heat burst / spikes existing Burn.'),
  'veil-snare': M('veil-snare','VEIL SNARE','Echo','utility',9,90,2,'Echo snare / deepens interference.'),
  'husk-knock': M('husk-knock','KNUCKLE TAP','Force','attack',4,94,0,'Starter strike / steady damage.'),
  'husk-tuck': M('husk-tuck','SHELL TUCK','Force','guard',5,100,1,'Starter ward / guard + Energy.'),
  'husk-fault': M('husk-fault','FAULT KNOCK','Corrosion','attack',6,90,1,'Breaker / punishes Guard.'),
  'mire-lash': M('mire-lash','MUD LASH','Corrosion','attack',4,94,0,'Starter strike / steady damage.'),
  'mire-hide': M('mire-hide','BOG HIDE','Corrosion','guard',5,100,1,'Starter ward / guard + Energy.'),
  'mire-seep': M('mire-seep','SEEP FEINT','Echo','attack',6,90,1,'Breaker / punishes Guard.'),
  'wisp-jab': M('wisp-jab','SPARK JAB','Signal','attack',4,94,0,'Starter strike / steady damage.'),
  'wisp-ward': M('wisp-ward','PHASE WARD','Signal','guard',5,100,1,'Starter ward / guard + Energy.'),
  'wisp-ghost-cut': M('wisp-ghost-cut','GHOST CUT','Echo','attack',6,90,1,'Breaker / punishes Guard.'),
  'fang-snap': M('fang-snap','SNAP BITE','Force','attack',4,94,0,'Starter strike / steady damage.'),
  'fang-crouch': M('fang-crouch','LOW CROUCH','Force','guard',5,100,1,'Starter ward / guard + Energy.'),
  'fang-bait': M('fang-bait','BAIT LUNGE','Signal','attack',6,90,1,'Breaker / punishes Guard.'),
  'choir-tone': M('choir-tone','TONE STRIKE','Echo','attack',4,94,0,'Starter strike / steady damage.'),
  'choir-veil': M('choir-veil','HARMONIC VEIL','Echo','guard',5,100,1,'Starter ward / guard + Energy.'),
  'choir-discord': M('choir-discord','DISCORD','Signal','attack',6,90,1,'Breaker / punishes Guard.'),
  'machine-servo': M('machine-servo','SERVO HIT','Signal','attack',4,94,0,'Starter strike / steady damage.'),
  'machine-guard': M('machine-guard','PANEL GUARD','Signal','guard',5,100,1,'Starter ward / guard + Energy.'),
  'machine-override': M('machine-override','OVERRIDE','Signal','attack',6,90,1,'Breaker / punishes Guard.'),
  'cinder-jab': M('cinder-jab','EMBER JAB','Heat','attack',4,94,0,'Starter strike / steady damage.'),
  'cinder-screen': M('cinder-screen','ASH SCREEN','Heat','guard',5,100,1,'Starter ward / guard + Energy.'),
  'cinder-flash': M('cinder-flash','FLASH BREAK','Force','attack',6,90,1,'Breaker / punishes Guard.'),
  'veil-cut': M('veil-cut','SHADOW CUT','Echo','attack',4,94,0,'Starter strike / steady damage.'),
  'veil-ward': M('veil-ward','PALE WARD','Echo','guard',5,100,1,'Starter ward / guard + Energy.'),
  'veil-misdirect': M('veil-misdirect','MISDIRECT','Signal','attack',6,90,1,'Breaker / punishes Guard.'),
  'resonant-guard': M('resonant-guard','RESONANT GUARD','Echo','guard',9,100,2,'Deep ward + Energy return.'),
};

const STARTERS: Record<CanonicalLineage,[MoveId,MoveId,MoveId]> = {
  husk:['husk-knock','husk-tuck','husk-fault'], mire:['mire-lash','mire-hide','mire-seep'],
  wisp:['wisp-jab','wisp-ward','wisp-ghost-cut'], fang:['fang-snap','fang-crouch','fang-bait'],
  choir:['choir-tone','choir-veil','choir-discord'], machine:['machine-servo','machine-guard','machine-override'],
  cinder:['cinder-jab','cinder-screen','cinder-flash'], veil:['veil-cut','veil-ward','veil-misdirect'],
};
const SIGNATURE: Record<CanonicalLineage,MoveId> = {husk:'shell-brace',mire:'bog-leech',wisp:'phase-feint',fang:'pursuit-bite',choir:'chorus-echo',machine:'panel-shift',cinder:'ember-spire',veil:'veil-snare'};
const FORM_L5: Record<CanonicalForm,MoveId> = {pale:'quiet-ward',static:'signal-snare',feral:'rend'};
const FORM_L9: Record<CanonicalForm,MoveId> = {pale:'restorative-pulse',static:'overcharge',feral:'reckless-rush'};
const UNLOCKS = [1,1,1,2,3,5,7,9];
const ADAPTATION_COUNT = 11;
const PRESSURES: Pressure[] = ['Force','Signal','Heat','Corrosion','Echo'];
const LINEAGE_PRESSURE: Record<CanonicalLineage,Pressure> = {husk:'Force',fang:'Force',wisp:'Signal',machine:'Signal',cinder:'Heat',mire:'Corrosion',choir:'Echo',veil:'Echo'};
const RESISTANCE: Record<CanonicalLineage,Pressure> = {husk:'Force',mire:'Corrosion',wisp:'Signal',fang:'Echo',choir:'Echo',machine:'Signal',cinder:'Heat',veil:'Echo'};
const WEAKNESS: Record<CanonicalLineage,Pressure> = {husk:'Corrosion',mire:'Heat',wisp:'Echo',fang:'Signal',choir:'Force',machine:'Corrosion',cinder:'Signal',veil:'Heat'};
const GUARD_MOVES = new Set<MoveId>(['quiet-ward','shell-brace','panel-shift','husk-tuck','mire-hide','wisp-ward','fang-crouch','choir-veil','machine-guard','cinder-screen','veil-ward','resonant-guard']);
const BREAKERS = new Set<MoveId>(['husk-fault','mire-seep','wisp-ghost-cut','fang-bait','choir-discord','machine-override','cinder-flash','veil-misdirect']);
const SIGNATURES = new Set<MoveId>(Object.values(SIGNATURE));

const clamp = (v:number,min:number,max:number) => Math.max(min,Math.min(max,v));
const u32 = (v:number) => v >>> 0;
const pressureBit = (p:Pressure) => 1 << PRESSURES.indexOf(p);
const hasAdaptation = (f:V19Fighter,id:number) => id !== 0 && (f.adaptationPrimary===id || f.adaptationSecondary===id);

export function learnset(form:CanonicalForm,lineage:CanonicalLineage): MoveId[] { return [...STARTERS[lineage],'pulse-strike',SIGNATURE[lineage],FORM_L5[form],'resonant-guard',FORM_L9[form]]; }
export function moveLearned(form:CanonicalForm,lineage:CanonicalLineage,level:number,move:MoveId): boolean { return learnset(form,lineage).some((m,i)=>m===move && level>=UNLOCKS[i]); }
export function movePressure(move:MoveId,lineage:CanonicalLineage): Pressure {
  const def = MOVE_LIBRARY_V19[move]; return def.pressure === 'Lineage' ? LINEAGE_PRESSURE[lineage] : def.pressure;
}
export function actionForMove(move:MoveId): 'move' | 'guard' { return GUARD_MOVES.has(move) ? 'guard' : 'move'; }

export function validateCanonicalPayloadV2(input:unknown): {ok:true;payload:CanonicalCreaturePayloadV2}|{ok:false;error:string} {
  if (!input || typeof input !== 'object') return {ok:false,error:'Creature payload must be an object.'};
  const c = input as any;
  const lineages = new Set(Object.keys(STARTERS)); const forms = new Set(['pale','static','feral']);
  if (c.format !== 'demonym-battle-creature' || c.version !== 2) return {ok:false,error:'Unsupported canonical creature payload.'};
  if (c.source !== 'cardputer' && c.source !== 'web-test') return {ok:false,error:'Unknown creature payload source.'};
  if (c.schemaVersion !== 1) return {ok:false,error:'Unsupported battle snapshot schema.'};
  if (c.battleRules !== 19) return {ok:false,error:'Cardputer Battle Rules v19 are required.'};
  if (!Number.isInteger(c.creatureId) || c.creatureId <= 0 || c.creatureId > 0xffffffff) return {ok:false,error:'creatureId must be a non-zero uint32.'};
  if (!Number.isInteger(c.visualSeed) || c.visualSeed < 0 || c.visualSeed > 0xffffffff) return {ok:false,error:'visualSeed must be a uint32.'};
  if (!Number.isInteger(c.publicId) || c.publicId < 0 || c.publicId > 0xffff) return {ok:false,error:'publicId must be a uint16.'};
  if (typeof c.name !== 'string' || !c.name.trim() || c.name.trim().length > 16) return {ok:false,error:'name must be 1-16 characters.'};
  if (!lineages.has(c.lineage)) return {ok:false,error:'Unknown Demonym lineage.'};
  if (!forms.has(c.form)) return {ok:false,error:'Unknown adult form.'};
  if (!Number.isInteger(c.level) || c.level < 1 || c.level > 20) return {ok:false,error:'level must be 1-20.'};
  if (!Number.isInteger(c.currentHealth) || c.currentHealth < 0 || c.currentHealth > 100) return {ok:false,error:'currentHealth must be 0-100.'};
  if (!Number.isInteger(c.currentEnergy) || c.currentEnergy < 0 || c.currentEnergy > 100) return {ok:false,error:'currentEnergy must be 0-100.'};
  if (!Number.isInteger(c.injury) || c.injury < 0 || c.injury > 3) return {ok:false,error:'injury must be 0-3.'};
  if (!c.combat || typeof c.combat !== 'object') return {ok:false,error:'combat block is required.'};
  for (const [key,min,max] of [['attackBonus',-8,8],['defenseBonus',-8,8],['healthBonus',-20,20],['energyBonus',-20,20]] as const) {
    if (!Number.isInteger(c.combat[key]) || c.combat[key] < min || c.combat[key] > max) return {ok:false,error:`combat.${key} is out of range.`};
  }
  for (const key of ['pressureResistanceMask','pressureWeaknessMask','pressureBoostMask'] as const) if (!Number.isInteger(c.combat[key]) || c.combat[key] < 0 || c.combat[key] > 0x1f) return {ok:false,error:`combat.${key} must be a 5-bit mask.`};
  for (const key of ['installedPrimary','installedSecondary'] as const) if (!Number.isInteger(c.combat[key]) || c.combat[key] < 0 || c.combat[key] >= ADAPTATION_COUNT) return {ok:false,error:`combat.${key} is invalid.`};
  if (!Array.isArray(c.moveSlots) || c.moveSlots.length !== 4) return {ok:false,error:'moveSlots must contain exactly four entries.'};
  const moves = c.moveSlots as MoveId[];
  if (!moves.every((m:any)=>typeof m==='string' && m in MOVE_LIBRARY_V19)) return {ok:false,error:'moveSlots contains an unknown move ID.'};
  if (moves.slice(0,3).includes('none')) return {ok:false,error:'The first three move slots cannot be empty.'};
  const nonNone = moves.filter(m=>m!=='none'); if (new Set(nonNone).size !== nonNone.length) return {ok:false,error:'moveSlots cannot contain duplicate moves.'};
  for (const move of nonNone) if (!moveLearned(c.form,c.lineage,c.level,move)) return {ok:false,error:`Move ${move} is not learned by this build.`};
  return {ok:true,payload:{...c,name:c.name.trim(),combat:{...c.combat},moveSlots:[...moves] as [MoveId,MoveId,MoveId,MoveId]}};
}

function formAttackBonus(form:CanonicalForm){return form==='feral'?4:form==='static'?2:0;}
function formDefenseBonus(form:CanonicalForm){return form==='pale'?4:form==='static'?2:0;}
function resonanceAttack(level:number){level=clamp(level,1,10);return Math.floor((level-1)/2);}
function resonanceDefense(level:number){level=clamp(level,1,10);return Math.floor((level-1)/3);}
function resonanceHp(level:number){level=clamp(level,1,10);return (level-1)*4;}
function resonanceEnergy(level:number){level=clamp(level,1,10);return (level-1)*3;}

export function fighterFromPayload(payload:CanonicalCreaturePayloadV2):V19Fighter {
  const level=clamp(payload.level,1,10); const injuryPenalty=Math.min(6,payload.injury*2);
  let maxHp=Math.max(20,100+resonanceHp(level)+payload.combat.healthBonus);
  let maxEnergy=Math.max(20,100+resonanceEnergy(level)+payload.combat.energyBonus);
  let hp=clamp(Math.trunc(maxHp*payload.currentHealth/100),Math.max(1,Math.trunc(maxHp/5)),maxHp);
  let energy=clamp(Math.trunc(maxEnergy*payload.currentEnergy/100),Math.max(1,Math.trunc(maxEnergy/10)),maxEnergy);
  let attack=Math.max(1,10+formAttackBonus(payload.form)+resonanceAttack(level)+payload.combat.attackBonus-Math.min(9,injuryPenalty));
  let defense=Math.max(0,5+formDefenseBonus(payload.form)+resonanceDefense(level)+payload.combat.defenseBonus-Math.min(4,payload.injury));
  let evasionBonus=0, passiveHealthRegen=0, passiveEnergyRegen=0;
  switch(payload.lineage){
    case'husk':defense+=2;break; case'mire':passiveHealthRegen=2;break; case'wisp':evasionBonus=8;break;
    case'fang':attack+=2;break; case'choir':attack+=1;defense+=1;break;
    case'machine':defense+=1;maxEnergy+=8;passiveEnergyRegen=1;break;
    case'cinder':attack+=2;defense=Math.max(0,defense-1);break; case'veil':evasionBonus=10;break;
  }
  hp=Math.min(hp,maxHp); energy=Math.min(energy,maxEnergy);
  return {hp,maxHp,energy,maxEnergy,attack,defense,form:payload.form,lineage:payload.lineage,evasionBonus,passiveHealthRegen,passiveEnergyRegen,guarding:false,disrupted:false,wardTurns:0,accuracyDownTurns:0,powerTurns:0,staggerTurns:0,disruptionTurns:0,burnTurns:0,corrosionTurns:0,echoTurns:0,pressureResistanceMask:pressureBit(RESISTANCE[payload.lineage])|payload.combat.pressureResistanceMask,pressureWeaknessMask:pressureBit(WEAKNESS[payload.lineage])|payload.combat.pressureWeaknessMask,pressureBoostMask:payload.combat.pressureBoostMask,adaptationPrimary:payload.combat.installedPrimary,adaptationSecondary:payload.combat.installedSecondary,lastMove:'none',level,equippedMoves:[...payload.moveSlots],moveCooldowns:[0,0,0,0]};
}

export function createRuntime(seed:number):V19BattleRuntime{return {seed:u32(seed||0x0b4771e5),randomState:u32((seed||0x0b4771e5)^0xb4711e5d),turnCount:0,outcome:'ongoing'};}
function nextRandom(r:V19BattleRuntime){let x=r.randomState===0?0x6d2b79f5:r.randomState;x=u32(x^(x<<13));x=u32(x^(x>>>17));x=u32(x^(x<<5));r.randomState=x;return x;}
function randomRange(r:V19BattleRuntime,min:number,max:number){if(max<=min)return min;return min+(nextRandom(r)%(max-min+1));}
function equippedSlot(f:V19Fighter,m:MoveId){return f.equippedMoves.indexOf(m);}
function moveIsBreaker(m:MoveId){return BREAKERS.has(m);}
function effectiveCooldown(f:V19Fighter,m:MoveId){let c=MOVE_LIBRARY_V19[m].cooldown;if(c>0&&moveIsBreaker(m)&&hasAdaptation(f,5))c--;return c;}
export function effectiveEnergyCost(f:V19Fighter,m:MoveId){const base=MOVE_LIBRARY_V19[m].energyCost;const membrane=f.disruptionTurns>0&&movePressure(m,f.lineage)==='Signal'&&hasAdaptation(f,4);return base+(f.disruptionTurns>0&&!membrane?2:0);}
export function canUseMove(f:V19Fighter,m:MoveId){const s=equippedSlot(f,m);return m!=='none'&&s>=0&&f.energy>=effectiveEnergyCost(f,m)&&f.moveCooldowns[s]===0;}
function setCooldown(f:V19Fighter,m:MoveId){const s=equippedSlot(f,m);if(s<0)return;const c=effectiveCooldown(f,m);f.moveCooldowns[s]=c===0?0:c+1;}
function pressureEffect(p:Pressure,d:V19Fighter):PressureEffectiveness{const bit=pressureBit(p),weak=(d.pressureWeaknessMask&bit)!==0,res=(d.pressureResistanceMask&bit)!==0;return weak===res?'neutral':weak?'strong':'resisted';}
function synergy(p:Pressure,d:V19Fighter):SynergyId|undefined{if(p==='Force'&&d.corrosionTurns>0)return'breach';if(p==='Signal'&&d.echoTurns>0)return'phase-lock';if(p==='Heat'&&d.disruptionTurns>0)return'arc-flash';if(p==='Corrosion'&&d.staggerTurns>0)return'open-seam';if(p==='Echo'&&d.burnTurns>0)return'burn-echo';return undefined;}
function applyDamage(f:V19Fighter,n:number){const before=f.hp;f.hp=clamp(f.hp-n,0,f.maxHp);return before-f.hp;}
function moveHits(r:V19BattleRuntime,a:V19Fighter,d:V19Fighter,m:MoveId){let acc=MOVE_LIBRARY_V19[m].accuracy;if(a.accuracyDownTurns>0)acc=acc>18?acc-18:1;if(a.echoTurns>0){acc=Math.max(1,acc-10);if(a.lastMove===m)acc=Math.max(1,acc-12);}acc-=d.evasionBonus;acc=clamp(acc,5,100);return randomRange(r,0,99)<acc;}
function attackDamage(r:V19BattleRuntime,a:V19Fighter,d:V19Fighter,power:number,p:Pressure){let base=a.attack+randomRange(r,0,5)+power;let ed=d.defense;if(d.corrosionTurns>0)ed=Math.max(0,ed-3);if(d.staggerTurns>0)ed=Math.max(0,ed-2);let reduction=Math.trunc(ed/2);if(d.guarding)reduction+=8;if(d.wardTurns>0)reduction+=4;if(a.disruptionTurns>0||a.disrupted)base-=2;if(a.powerTurns>0)base+=4;let damage=Math.max(1,base-reduction);const pe=pressureEffect(p,d);if(pe==='strong')damage=Math.max(1,Math.trunc((damage*115+50)/100));else if(pe==='resisted')damage=Math.max(1,Math.trunc((damage*85+50)/100));if((a.pressureBoostMask&pressureBit(p))!==0)damage=Math.max(1,Math.trunc((damage*110+50)/100));return {damage,effect:pe};}
function applyPressureStatus(r:V19BattleRuntime,d:V19Fighter,p:Pressure,m:MoveId,e:PressureEffectiveness):StatusId|undefined{let chance=SIGNATURES.has(m)?68:34;if(e==='strong')chance=Math.min(90,chance+12);if(e==='resisted')chance=chance>14?chance-14:8;if(randomRange(r,0,99)>=chance)return;switch(p){case'Force':d.staggerTurns=Math.max(d.staggerTurns,2);return'stagger';case'Signal':d.disruptionTurns=Math.max(d.disruptionTurns,2);d.disrupted=true;return'disruption';case'Heat':d.burnTurns=Math.max(d.burnTurns,3);return'burn';case'Corrosion':d.corrosionTurns=Math.max(d.corrosionTurns,3);return'corrosion';case'Echo':d.echoTurns=Math.max(d.echoTurns,2);d.accuracyDownTurns=Math.max(d.accuracyDownTurns,2);return'echo-interference';}}
function addRecovery(report:TurnReport,first:boolean,n:number){if(n<=0)return;if(first)report.firstRecovered+=n;else report.secondRecovered+=n;}

function executeMove(r:V19BattleRuntime,a:V19Fighter,d:V19Fighter,m:MoveId,first:boolean,report:TurnReport):number{
  if(!canUseMove(a,m))return -2;
  a.energy=clamp(a.energy-effectiveEnergyCost(a,m),0,a.maxEnergy);setCooldown(a,m);
  let braceCleared=false;if(GUARD_MOVES.has(m)&&a.staggerTurns>0){if(m==='shell-brace'||hasAdaptation(a,1)){a.staggerTurns=0;braceCleared=true;}}
  if(!moveHits(r,a,d,m)){if(first)report.firstMissed=true;else report.secondMissed=true;a.lastMove=m;return -1;}
  const p=movePressure(m,a.lineage);if(first)report.firstPressure=p;else report.secondPressure=p;
  const syn=synergy(p,d);const wasBurn=d.burnTurns>0,wasCorrode=d.corrosionTurns>0,wasDisrupt=d.disruptionTurns>0,wasEcho=d.echoTurns>0,wasStagger=d.staggerTurns>0;
  const deal=(power:number)=>{let bonus=0;if(p==='Force'&&(wasStagger||wasCorrode)&&hasAdaptation(a,6))bonus+=2;if(d.lastMove!=='none'&&movePressure(d.lastMove,d.lineage)===p&&hasAdaptation(a,8))bonus+=2;if(p==='Heat'&&wasBurn&&hasAdaptation(a,9))bonus+=2;let sb= syn==='breach'?4:syn==='arc-flash'?3:syn==='open-seam'?2:0;const ad=attackDamage(r,a,d,power+sb+bonus,p);if(first)report.firstPressureEffect=ad.effect;else report.secondPressureEffect=ad.effect;let damage=applyDamage(d,ad.damage);if(damage>0){const status=applyPressureStatus(r,d,p,m,ad.effect);if(status){if(first)report.statusAppliedToSecond=status;else report.statusAppliedToFirst=status;}if(syn){if(first)report.firstSynergy=syn;else report.secondSynergy=syn;}if(syn==='phase-lock')d.energy=clamp(d.energy-4,0,d.maxEnergy);else if(syn==='arc-flash'){d.burnTurns=Math.max(d.burnTurns,3);if(first&&!report.statusAppliedToSecond)report.statusAppliedToSecond='burn';if(!first&&!report.statusAppliedToFirst)report.statusAppliedToFirst='burn';}else if(syn==='open-seam'){d.corrosionTurns=Math.max(d.corrosionTurns,3);if(first&&!report.statusAppliedToSecond)report.statusAppliedToSecond='corrosion';if(!first&&!report.statusAppliedToFirst)report.statusAppliedToFirst='corrosion';}else if(syn==='burn-echo')damage+=applyDamage(d,2);if(p==='Echo'&&hasAdaptation(a,2))a.energy=clamp(a.energy+2,0,a.maxEnergy);if(p==='Corrosion'&&hasAdaptation(a,3)){const before=a.hp;a.hp=clamp(a.hp+2,0,a.maxHp);addRecovery(report,first,a.hp-before);}if(p==='Corrosion'&&hasAdaptation(a,10)){d.corrosionTurns=d.corrosionTurns===0?2:Math.min(4,d.corrosionTurns+1);if(first&&!report.statusAppliedToSecond)report.statusAppliedToSecond='corrosion';if(!first&&!report.statusAppliedToFirst)report.statusAppliedToFirst='corrosion';}}
    a.lastMove=m;return damage;};
  const guardEnergy=()=>hasAdaptation(a,7)?3:0;
  switch(m){
    case'pulse-strike':return deal(1);
    case'quiet-ward':a.guarding=true;a.wardTurns=Math.max(a.wardTurns,2);a.energy=clamp(a.energy+5+guardEnergy(),0,a.maxEnergy);a.lastMove=m;return 0;
    case'restorative-pulse':{const before=a.hp;a.hp=clamp(a.hp+(a.corrosionTurns>0?9:18),0,a.maxHp);addRecovery(report,first,a.hp-before);a.lastMove=m;return 0;}
    case'signal-snare':d.accuracyDownTurns=Math.max(d.accuracyDownTurns,2);d.disrupted=true;return deal(1);
    case'overcharge':{const damage=deal(9),recoil=applyDamage(a,4);if(first)report.firstRecoil=recoil;else report.secondRecoil=recoil;return damage;}
    case'rend':return deal(7);
    case'reckless-rush':{const damage=deal(13),recoil=applyDamage(a,6);if(first)report.firstRecoil=recoil;else report.secondRecoil=recoil;return damage;}
    case'shell-brace':{a.guarding=true;a.wardTurns=Math.max(a.wardTurns,3);const before=a.hp;a.hp=clamp(a.hp+(braceCleared?6:4),0,a.maxHp);addRecovery(report,first,a.hp-before);a.energy=clamp(a.energy+guardEnergy(),0,a.maxEnergy);a.lastMove=m;return 0;}
    case'bog-leech':{const damage=deal(4),before=a.hp;let heal=wasCorrode?9:6;if(a.corrosionTurns>0)heal=Math.trunc(heal/2);a.hp=clamp(a.hp+heal,0,a.maxHp);addRecovery(report,first,a.hp-before);return damage;}
    case'phase-feint':a.evasionBonus=Math.min(18,a.evasionBonus+(wasDisrupt?8:4));return deal(3);
    case'pursuit-bite':return deal(9+(d.hp<=Math.trunc(d.maxHp/2)?4:0));
    case'chorus-echo':{const damage=deal(5);a.energy=clamp(a.energy+(wasEcho||wasBurn?8:5),0,a.maxEnergy);return damage;}
    case'panel-shift':{const cleared=a.disruptionTurns>0||a.echoTurns>0||a.accuracyDownTurns>0;a.guarding=true;a.wardTurns=Math.max(a.wardTurns,2);a.disruptionTurns=0;a.echoTurns=0;a.accuracyDownTurns=0;a.disrupted=false;a.energy=clamp(a.energy+(cleared?13:10)+guardEnergy(),0,a.maxEnergy);a.lastMove=m;return 0;}
    case'ember-spire':{const damage=deal(wasBurn?14:10);let recoil=wasBurn?0:2;if(hasAdaptation(a,9)&&recoil>0)recoil=0;const applied=applyDamage(a,recoil);if(first)report.firstRecoil=applied;else report.secondRecoil=applied;return damage;}
    case'veil-snare':d.accuracyDownTurns=Math.max(d.accuracyDownTurns,wasEcho?4:2);return deal(wasEcho?6:4);
    case'husk-knock':case'mire-lash':case'wisp-jab':case'fang-snap':case'choir-tone':case'machine-servo':case'cinder-jab':case'veil-cut':return deal(3);
    case'husk-tuck':case'mire-hide':case'wisp-ward':case'fang-crouch':case'choir-veil':case'machine-guard':case'cinder-screen':case'veil-ward':a.guarding=true;a.wardTurns=Math.max(a.wardTurns,1);a.energy=clamp(a.energy+4+guardEnergy(),0,a.maxEnergy);a.lastMove=m;return 0;
    case'husk-fault':case'mire-seep':case'wisp-ghost-cut':case'fang-bait':case'choir-discord':case'machine-override':case'cinder-flash':case'veil-misdirect':{const caught=d.guarding||d.wardTurns>0;if(caught){d.guarding=false;d.wardTurns=0;}return deal(caught?8:1);}
    case'resonant-guard':a.guarding=true;a.wardTurns=Math.max(a.wardTurns,3);a.energy=clamp(a.energy+8+guardEnergy(),0,a.maxEnergy);a.lastMove=m;return 0;
    default:return -2;
  }
}
function tick(f:V19Fighter){for(const k of ['wardTurns','accuracyDownTurns','powerTurns','staggerTurns','disruptionTurns','burnTurns','corrosionTurns','echoTurns'] as const)if(f[k]>0)f[k]--;f.disrupted=f.disruptionTurns>0||f.accuracyDownTurns>0;for(let i=0;i<4;i++)if(f.moveCooldowns[i]>0)f.moveCooldowns[i]--;}
function statusDamage(f:V19Fighter){return f.hp<=0||f.burnTurns===0?0:applyDamage(f,2);}
function passive(f:V19Fighter){if(f.hp<=0)return {hp:0,energy:0};const hb=f.hp,eb=f.energy;f.hp=clamp(f.hp+f.passiveHealthRegen,0,f.maxHp);f.energy=clamp(f.energy+f.passiveEnergyRegen,0,f.maxEnergy);return {hp:f.hp-hb,energy:f.energy-eb};}
function applyGuard(f:V19Fighter,first:boolean){if(f.staggerTurns>0){f.energy=clamp(f.energy+3,0,f.maxEnergy);return;}f.guarding=true;f.energy=clamp(f.energy+(first?8:7),0,f.maxEnergy);}
export function resolvePeerTurn(runtime:V19BattleRuntime,first:V19Fighter,second:V19Fighter,firstChoice:BattleChoice,secondChoice:BattleChoice):TurnReport{
 const report:TurnReport={outcome:runtime.outcome,firstAction:firstChoice.kind,secondAction:secondChoice.kind,firstMove:'none',secondMove:'none',firstDamage:0,secondDamage:0,firstRecovered:0,secondRecovered:0,firstRecoil:0,secondRecoil:0,firstMissed:false,secondMissed:false,firstPressureEffect:'neutral',secondPressureEffect:'neutral',firstStatusDamage:0,secondStatusDamage:0,firstPassiveHealth:0,firstPassiveEnergy:0,secondPassiveHealth:0,secondPassiveEnergy:0};if(runtime.outcome!=='ongoing')return report;
 runtime.turnCount++;first.guarding=false;second.guarding=false;
 const prep=(f:V19Fighter,c:BattleChoice,isFirst:boolean)=>{if(c.kind==='guard')applyGuard(f,isFirst);};prep(first,firstChoice,true);prep(second,secondChoice,false);
 const execute=(isFirst:boolean)=>{const a=isFirst?first:second,d=isFirst?second:first,c=isFirst?firstChoice:secondChoice;if(c.kind==='guard')return;if(c.kind==='recover'){const b=a.energy;a.energy=clamp(a.energy+2,0,a.maxEnergy);if(isFirst)report.firstRecovered=a.energy-b;else report.secondRecovered=a.energy-b;return;}let slot=Number.isInteger(c.slot)?Number(c.slot):0;slot=clamp(slot,0,3);let move=a.equippedMoves[slot]??'none';if(move==='none'||!canUseMove(a,move)){move=a.equippedMoves[0];}if(isFirst)report.firstMove=move;else report.secondMove=move;let damage=executeMove(runtime,a,d,move,isFirst,report);if(damage===-2){move=a.equippedMoves[0];if(isFirst)report.firstMove=move;else report.secondMove=move;damage=executeMove(runtime,a,d,move,isFirst,report);}if(isFirst)report.firstDamage=Math.max(0,damage);else report.secondDamage=Math.max(0,damage);};
 if((runtime.turnCount&1)!==0){execute(true);if(second.hp>0)execute(false);}else{execute(false);if(first.hp>0)execute(true);}
 if(first.hp>0&&second.hp>0){report.firstStatusDamage=statusDamage(first);report.secondStatusDamage=statusDamage(second);}if(first.hp>0&&second.hp>0){const a=passive(first),b=passive(second);report.firstPassiveHealth=a.hp;report.firstPassiveEnergy=a.energy;report.secondPassiveHealth=b.hp;report.secondPassiveEnergy=b.energy;}
 if(first.hp<=0&&second.hp<=0)runtime.outcome='draw';else if(second.hp<=0)runtime.outcome='first';else if(first.hp<=0)runtime.outcome='second';else if(runtime.turnCount>=30)runtime.outcome='draw';tick(first);tick(second);report.outcome=runtime.outcome;return report;
}
export function statusList(f:V19Fighter):{id:StatusId;turns:number}[]{const out:{id:StatusId;turns:number}[]=[];if(f.staggerTurns)out.push({id:'stagger',turns:f.staggerTurns});if(f.disruptionTurns)out.push({id:'disruption',turns:f.disruptionTurns});if(f.burnTurns)out.push({id:'burn',turns:f.burnTurns});if(f.corrosionTurns)out.push({id:'corrosion',turns:f.corrosionTurns});if(f.echoTurns||f.accuracyDownTurns)out.push({id:'echo-interference',turns:Math.max(f.echoTurns,f.accuracyDownTurns)});if(f.wardTurns)out.push({id:'ward',turns:f.wardTurns});return out;}

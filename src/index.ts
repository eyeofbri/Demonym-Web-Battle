import { DurableObject } from 'cloudflare:workers';
import {
	MOVE_LIBRARY_V19,
	canUseMove,
	createRuntime,
	effectiveEnergyCost,
	fighterFromPayload,
	resolvePeerTurn,
	statusList,
	validateCanonicalPayloadV2,
	type BattleChoice,
	type CanonicalCreaturePayloadV2,
	type CanonicalLineage,
	type MoveId,
	type StatusId,
	type TurnReport,
	type V19BattleRuntime,
	type V19Fighter,
} from './battle-v19';

type PlayerNumber = 1 | 2;
type Lineage = 'Husk' | 'Mire' | 'Wisp' | 'Fang' | 'Choir' | 'Machine' | 'Cinder' | 'Veil';
type BattlePhase = 'waiting' | 'selecting' | 'finished';
type BattleEventType = 'lineage_selected' | 'creature_imported' | 'ready' | 'signal_toss' | 'round_start' | 'action_locked' | 'move_resolved' | 'move_missed' | 'recover' | 'status_applied' | 'heal' | 'battle_end' | 'rematch_requested' | 'rematch_started' | 'disconnect' | 'reconnect' | 'session_expired';
type ClientType = 'web' | 'cardputer';
type LockedAction = MoveId | 'guard' | 'recover' | null;

type ClientCapability =
	| 'creature-payload-v1'
	| 'creature-payload-v2'
	| 'round-lock-v1'
	| 'battle-events-v1'
	| 'recover-action-v1'
	| 'rematch-v1'
	| 'session-resume-v1';

interface StatusState { id: StatusId; turns: number; stacks?: number; }
interface CreatureState {
	payload: CanonicalCreaturePayloadV2;
	fighter: V19Fighter;
	hp: number;
	energy: number;
	statuses: StatusState[];
	lastMoveId: MoveId | null;
}
interface BattleEvent {
	id: number;
	type: BattleEventType;
	round: number;
	player?: PlayerNumber;
	targetPlayer?: PlayerNumber;
	moveId?: MoveId;
	amount?: number;
	statusId?: StatusId;
	message: string;
}
interface BattleState {
	version: 14;
	players: [CreatureState, CreatureState];
	ready: [boolean, boolean];
	started: boolean;
	phase: BattlePhase;
	round: number;
	roundFirstPlayer: PlayerNumber | null;
	initiativeWinner: PlayerNumber | null;
	canonicalFirstPlayer: PlayerNumber | null;
	winner: PlayerNumber | 0 | null;
	lockedMoves: [LockedAction, LockedAction];
	lockedCosts: [number | null, number | null];
	battleRuntime: V19BattleRuntime | null;
	rematch: [boolean, boolean];
	matchNumber: number;
	log: string[];
	eventSeq: number;
	events: BattleEvent[];
	sessionTokens: [string | null, string | null];
	disconnectDeadlines: [number | null, number | null];
	connectionIds: [string | null, string | null];
}
interface ClientInfo { clientType: ClientType; clientVersion: string; capabilities: ClientCapability[]; }
interface SocketAttachment { player: PlayerNumber; handshakeComplete: boolean; sessionToken: string; resumed: boolean; clientInfo?: ClientInfo; connectionId: string; }
interface ClientMessage {
	type?: string; moveId?: string; lineage?: string; creature?: unknown;
	protocol?: string; protocolVersion?: number; clientType?: string; clientVersion?: string; capabilities?: unknown;
	round?: number; action?: { kind?: string; slot?: number };
}
interface LineageDefinition { id: Lineage; name: string; moves: MoveId[]; }

const MOVE_LIBRARY = MOVE_LIBRARY_V19;
const LINEAGE_WIRE: Record<Lineage, CanonicalLineage> = { Husk:'husk', Mire:'mire', Wisp:'wisp', Fang:'fang', Choir:'choir', Machine:'machine', Cinder:'cinder', Veil:'veil' };
const LINEAGE_STARTERS: Record<Lineage, [MoveId,MoveId,MoveId,MoveId]> = {
	Husk:['husk-knock','husk-tuck','husk-fault','shell-brace'], Mire:['mire-lash','mire-hide','mire-seep','bog-leech'],
	Wisp:['wisp-jab','wisp-ward','wisp-ghost-cut','phase-feint'], Fang:['fang-snap','fang-crouch','fang-bait','pursuit-bite'],
	Choir:['choir-tone','choir-veil','choir-discord','chorus-echo'], Machine:['machine-servo','machine-guard','machine-override','panel-shift'],
	Cinder:['cinder-jab','cinder-screen','cinder-flash','ember-spire'], Veil:['veil-cut','veil-ward','veil-misdirect','veil-snare'],
};
const LINEAGE_LIBRARY: Record<Lineage, LineageDefinition> = Object.fromEntries(
	(Object.keys(LINEAGE_WIRE) as Lineage[]).map((lineage) => [lineage, { id: lineage, name: lineage, moves: LINEAGE_STARTERS[lineage] }]),
) as unknown as Record<Lineage, LineageDefinition>;
const RECOVER_ENERGY = 2;
const MAX_LOG_ENTRIES = 24;
const MAX_BATTLE_EVENTS = 64;
const RECONNECT_GRACE_MS = 60_000;
const BATTLE_CONFIG = { recoverEnergy: RECOVER_ENERGY, energyRecoveryPerRound: 0, battleRules: 19 };
const REQUIRED_CLIENT_CAPABILITIES: ClientCapability[] = ['creature-payload-v2','round-lock-v1','battle-events-v1','recover-action-v1','session-resume-v1'];
const CONNECTION_PROTOCOL = {
	name: 'demonym-connect-v1', version: 1, serverVersion: '0.3.2', requiredCapabilities: REQUIRED_CLIENT_CAPABILITIES,
	supportedClientTypes: ['web','cardputer'] as ClientType[], aliases: ['demonym-connect'],
};
const BATTLE_PROTOCOL = {
	version: 2, creaturePayloadFormat: 'demonym-battle-creature', creaturePayloadVersion: 2, battleRules: 19,
	battleEventVersion: 1, externalCreatureImport: true, sessionResume: true, reconnectGraceMs: RECONNECT_GRACE_MS,
	connectionProtocol: CONNECTION_PROTOCOL,
};
function numericSeed(): number { const x=new Uint32Array(1); crypto.getRandomValues(x); return x[0] || 1; }
function createWebTestPayload(player: PlayerNumber, lineage: Lineage): CanonicalCreaturePayloadV2 {
	const i=(Object.keys(LINEAGE_WIRE) as Lineage[]).indexOf(lineage)+1;
	return { format:'demonym-battle-creature', version:2, source:'web-test', schemaVersion:1, battleRules:19,
		creatureId: 0x57000000 + player*0x100 + i, visualSeed: 0x0d3a0000 + player*0x100 + i, publicId: 0x1000 + player*0x10 + i,
		name:`${lineage} Test`, lineage:LINEAGE_WIRE[lineage], form:'static', level:10, currentHealth:100, currentEnergy:100, injury:0,
		combat:{attackBonus:0,defenseBonus:0,healthBonus:0,energyBonus:0,pressureResistanceMask:0,pressureWeaknessMask:0,pressureBoostMask:0,installedPrimary:0,installedSecondary:0},
		moveSlots:[...LINEAGE_STARTERS[lineage]] };
}
function syncCreature(c: CreatureState): CreatureState { c.hp=c.fighter.hp; c.energy=c.fighter.energy; c.statuses=statusList(c.fighter); c.lastMoveId=c.fighter.lastMove==='none'?null:c.fighter.lastMove; return c; }
function createCreatureFromPayload(payload: CanonicalCreaturePayloadV2): CreatureState {
	const v=validateCanonicalPayloadV2(payload); if('error' in v) throw new Error(v.error);
	const normalized=structuredClone(v.payload); return syncCreature({payload:normalized,fighter:fighterFromPayload(normalized),hp:0,energy:0,statuses:[],lastMoveId:null});
}
function createCreature(player: PlayerNumber, lineage?: Lineage): CreatureState { return createCreatureFromPayload(createWebTestPayload(player,lineage ?? (player===1?'Husk':'Wisp'))); }
function pickStartingPlayer(): PlayerNumber { const b=new Uint8Array(1);crypto.getRandomValues(b);return b[0]%2===0?1:2; }
function generateSessionToken(): string { const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''); }
function createInitialState(): BattleState { return {version:14,players:[createCreature(1),createCreature(2)],ready:[false,false],started:false,phase:'waiting',round:0,roundFirstPlayer:null,initiativeWinner:null,canonicalFirstPlayer:null,winner:null,lockedMoves:[null,null],lockedCosts:[null,null],battleRuntime:null,rematch:[false,false],matchNumber:1,log:['Battle room created.'],eventSeq:0,events:[],sessionTokens:[null,null],disconnectDeadlines:[null,null],connectionIds:[null,null]}; }
function otherPlayer(player: PlayerNumber): PlayerNumber { return player===1?2:1; }

export class BattleRoom extends DurableObject<Env> {
	private async getState(): Promise<BattleState> {
		const storedState = await this.ctx.storage.get<BattleState | { version?: number }>('state');

		if (!storedState || storedState.version !== 14) {
			const state = createInitialState();
			await this.ctx.storage.put('state', state);
			return state;
		}

		return storedState as BattleState;
	}

	private getReservedPlayers(): PlayerNumber[] {
		const players = new Set<PlayerNumber>();

		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;
			if (attachment?.player) players.add(attachment.player);
		}

		return [...players].sort() as PlayerNumber[];
	}

	private getConnectedPlayers(): PlayerNumber[] {
		const players = new Set<PlayerNumber>();

		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;
			if (attachment?.player && attachment.handshakeComplete) players.add(attachment.player);
		}

		return [...players].sort() as PlayerNumber[];
	}

	private getConnectedClients() {
		return this.ctx.getWebSockets()
			.map((socket) => socket.deserializeAttachment() as SocketAttachment | null)
			.filter((attachment): attachment is SocketAttachment => Boolean(attachment?.player && attachment.handshakeComplete && attachment.clientInfo))
			.map((attachment) => ({ player: attachment.player, ...attachment.clientInfo }))
			.sort((a, b) => a.player - b.player);
	}

	private send(socket: WebSocket, data: unknown) {
		socket.send(JSON.stringify(data));
	}

	private addLog(state: BattleState, message: string) {
		state.log.push(message);
		if (state.log.length > MAX_LOG_ENTRIES) {
			state.log.splice(0, state.log.length - MAX_LOG_ENTRIES);
		}
	}

	private addEvent(state: BattleState, event: Omit<BattleEvent, 'id' | 'round'> & { round?: number }) {
		state.eventSeq += 1;
		const authored: BattleEvent = { id: state.eventSeq, round: event.round ?? state.round, ...event };
		state.events.push(authored);
		if (state.events.length > MAX_BATTLE_EVENTS) state.events.splice(0, state.events.length - MAX_BATTLE_EVENTS);
		// v0.3.2 keeps the rolling event list for browser/reconnect playback, but
		// also emits each event as a top-level WebSocket message so a Cardputer
		// does not need to parse the large browser state envelope.
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;
			if (attachment?.handshakeComplete) this.send(socket, authored);
		}
	}

	private bothPlayersConnected(): boolean {
		const connected = this.getConnectedPlayers();
		return connected.includes(1) && connected.includes(2);
	}

	private async saveAndBroadcast(state: BattleState) {
		await this.ctx.storage.put('state', state);
		await this.broadcastState(state);
	}

	private stateForPlayer(state: BattleState, player: PlayerNumber) {
		const { lockedMoves, lockedCosts: _lockedCosts, battleRuntime: _battleRuntime, sessionTokens: _sessionTokens, disconnectDeadlines: _disconnectDeadlines, connectionIds: _connectionIds, ...publicState } = state;
		return {
			...publicState,
			players: state.players.map((creature) => ({
				payload: creature.payload,
				hp: creature.hp,
				maxHp: creature.fighter.maxHp,
				energy: creature.energy,
				maxEnergy: creature.fighter.maxEnergy,
				statuses: creature.statuses,
				lastMoveId: creature.lastMoveId,
				moveCooldowns: creature.fighter.moveCooldowns,
				effectiveMoveCosts: creature.fighter.equippedMoves.map((move) => move === 'none' ? 0 : effectiveEnergyCost(creature.fighter, move)),
			})),
			lockedPlayers: [lockedMoves[0] !== null, lockedMoves[1] !== null],
			yourLockedMoveId: lockedMoves[player - 1],
		};
	}

	private sendState(socket: WebSocket, state: BattleState, player: PlayerNumber, type: 'welcome' | 'state' = 'state') {
		this.send(socket, {
			type,
			...(type === 'welcome' ? { player } : {}),
			state: this.stateForPlayer(state, player),
			connectedPlayers: this.getConnectedPlayers(),
			connectedClients: this.getConnectedClients(),
			moveLibrary: MOVE_LIBRARY,
			lineageLibrary: LINEAGE_LIBRARY,
			battleConfig: BATTLE_CONFIG,
			battleProtocol: BATTLE_PROTOCOL,
		});
	}

	private async broadcastState(existingState?: BattleState) {
		const state = existingState ?? (await this.getState());

		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;
			if (!attachment?.player || !attachment.handshakeComplete) continue;
			this.sendState(socket, state, attachment.player);
		}
	}

	private async scheduleReconnectAlarm(state: BattleState) {
		const deadlines = state.disconnectDeadlines.filter((value): value is number => typeof value === 'number');
		if (!deadlines.length) {
			await this.ctx.storage.deleteAlarm();
			return;
		}

		await this.ctx.storage.setAlarm(Math.min(...deadlines));
	}

	private resetInterruptedBattle(state: BattleState, message: string) {
		const player1Payload = structuredClone(state.players[0].payload);
		const player2Payload = structuredClone(state.players[1].payload);
		const completedMatch = state.winner !== null;

		state.players = [createCreatureFromPayload(player1Payload), createCreatureFromPayload(player2Payload)];
		state.ready = [false, false];
		state.started = false;
		state.phase = 'waiting';
		state.round = 0;
		state.roundFirstPlayer = null;
		state.initiativeWinner = null;
		state.canonicalFirstPlayer = null;
		state.winner = null;
		state.battleRuntime = null;
		state.lockedMoves = [null, null];
		state.lockedCosts = [null, null];
		state.rematch = [false, false];
		if (completedMatch) state.matchNumber += 1;
		this.addLog(state, message);
	}

	private async expirePlayerSession(state: BattleState, player: PlayerNumber, message: string) {
		state.sessionTokens[player - 1] = null;
		state.disconnectDeadlines[player - 1] = null;
		state.connectionIds[player - 1] = null;
		this.resetInterruptedBattle(state, message);
		this.addEvent(state, { type: 'session_expired', player, round: 0, message });
	}

	private resetForRematch(state: BattleState) {
		const player1Payload = structuredClone(state.players[0].payload);
		const player2Payload = structuredClone(state.players[1].payload);

		state.players = [createCreatureFromPayload(player1Payload), createCreatureFromPayload(player2Payload)];
		state.ready = [false, false];
		state.started = false;
		state.phase = 'waiting';
		state.round = 0;
		state.roundFirstPlayer = null;
		state.initiativeWinner = null;
		state.canonicalFirstPlayer = null;
		state.winner = null;
		state.battleRuntime = null;
		state.lockedMoves = [null, null];
		state.lockedCosts = [null, null];
		state.rematch = [false, false];
		state.matchNumber += 1;
		state.log = [`Match ${state.matchNumber} ready. Choose your lineage and press READY.`];
		this.addEvent(state, { type: 'rematch_started', round: 0, message: `Match ${state.matchNumber} ready.` });
	}


	private parseClientHello(data: ClientMessage): { ok: true; info: ClientInfo } | { ok: false; error: string } {
		if (data.protocol !== CONNECTION_PROTOCOL.name && data.protocol !== 'demonym-connect') {
			return { ok: false, error: `Unsupported connection protocol. Expected ${CONNECTION_PROTOCOL.name}.` };
		}

		if (data.protocolVersion !== CONNECTION_PROTOCOL.version) {
			return { ok: false, error: `Unsupported protocol version. Server requires v${CONNECTION_PROTOCOL.version}.` };
		}

		if (data.clientType !== 'web' && data.clientType !== 'cardputer') {
			return { ok: false, error: 'clientType must be "web" or "cardputer".' };
		}

		const clientVersion = typeof data.clientVersion === 'string' ? data.clientVersion.trim() : '';
		if (!clientVersion || clientVersion.length > 40) {
			return { ok: false, error: 'clientVersion must be 1-40 characters.' };
		}

		if (!Array.isArray(data.capabilities) || !data.capabilities.every((item) => typeof item === 'string')) {
			return { ok: false, error: 'capabilities must be an array of strings.' };
		}

		const capabilities = [...new Set(data.capabilities)] as ClientCapability[];
		const missing = REQUIRED_CLIENT_CAPABILITIES.filter((capability) => !capabilities.includes(capability));
		if (missing.length) {
			return { ok: false, error: `Missing required capabilities: ${missing.join(', ')}.` };
		}

		return {
			ok: true,
			info: {
				clientType: data.clientType,
				clientVersion,
				capabilities,
			},
		};
	}

	private async handleClientHello(socket: WebSocket, data: ClientMessage, attachment: SocketAttachment) {
		if (attachment.handshakeComplete) {
			this.send(socket, { type: 'error', message: 'Client handshake is already complete.' });
			return;
		}

		const result = this.parseClientHello(data);
		if (result.ok === false) {
			this.send(socket, {
				type: 'hello-reject',
				message: result.error,
				connectionProtocol: CONNECTION_PROTOCOL,
			});
			socket.close(1008, 'Handshake rejected');
			return;
		}

		const updatedAttachment: SocketAttachment = {
			player: attachment.player,
			handshakeComplete: true,
			sessionToken: attachment.sessionToken,
			resumed: attachment.resumed,
			clientInfo: result.info,
			connectionId: attachment.connectionId,
		};
		socket.serializeAttachment(updatedAttachment);

		this.send(socket, {
			type: 'hello-ack',
			player: attachment.player,
			client: result.info,
			resumed: attachment.resumed,
			connectionProtocol: CONNECTION_PROTOCOL,
		});

		const state = await this.getState();
		state.disconnectDeadlines[attachment.player - 1] = null;
		if (attachment.resumed) {
			this.addLog(state, `Player ${attachment.player} reconnected and resumed their session.`);
			this.addEvent(state, { type: 'reconnect', player: attachment.player, message: `Player ${attachment.player} reconnected.` });
		}
		await this.ctx.storage.put('state', state);
		await this.scheduleReconnectAlarm(state);
		this.sendState(socket, state, attachment.player, 'welcome');
		await this.broadcastState(state);
	}

	private async handleRematch(socket: WebSocket, player: PlayerNumber) {
		const state = await this.getState();

		if (state.winner === null || state.phase !== 'finished') {
			this.send(socket, { type: 'error', message: 'Rematch is only available after the battle ends.' });
			return;
		}

		if (!this.bothPlayersConnected()) {
			this.send(socket, { type: 'error', message: 'Both players must be connected for a rematch.' });
			return;
		}

		if (state.rematch[player - 1]) return;

		state.rematch[player - 1] = true;
		this.addLog(state, `Player ${player} requested a rematch.`);
		this.addEvent(state, { type: 'rematch_requested', player, message: `Player ${player} requested a rematch.` });

		if (state.rematch[0] && state.rematch[1]) {
			this.resetForRematch(state);
		}

		await this.saveAndBroadcast(state);
	}

	private async handleReady(socket: WebSocket, player: PlayerNumber) {
		const state = await this.getState();
		if (state.winner !== null) { this.send(socket,{type:'error',message:'This battle is already over.'}); return; }
		if (state.ready[player-1]) return;
		state.ready[player-1]=true;
		this.addLog(state,`Player ${player} is ready.`);
		this.addEvent(state,{type:'ready',player,message:`Player ${player} is ready.`});
		if (state.ready[0] && state.ready[1] && this.bothPlayersConnected()) {
			const startingPlayer=pickStartingPlayer();
			state.started=true; state.phase='selecting'; state.round=1; state.roundFirstPlayer=startingPlayer; state.initiativeWinner=startingPlayer; state.canonicalFirstPlayer=startingPlayer;
			state.battleRuntime=createRuntime(numericSeed()); state.lockedMoves=[null,null]; state.lockedCosts=[null,null]; state.rematch=[false,false];
			this.addLog(state,'Both players ready. Signal Toss...'); this.addLog(state,`Player ${startingPlayer} wins the Signal Toss and is canonical first fighter.`);
			this.addEvent(state,{type:'signal_toss',player:startingPlayer,message:`Player ${startingPlayer} wins the Signal Toss.`});
			this.addEvent(state,{type:'round_start',player:startingPlayer,message:`Round 1. Player ${startingPlayer} resolves first.`});
		}
		await this.saveAndBroadcast(state);
	}

	private async handleLineageSelect(socket: WebSocket, player: PlayerNumber, rawLineage?: string) {
		const state=await this.getState();
		if(state.winner!==null){this.send(socket,{type:'error',message:'This battle is already over.'});return;}
		if(state.started||state.ready[player-1]){this.send(socket,{type:'error',message:'Lineage is locked once you are ready.'});return;}
		if(!rawLineage||!(rawLineage in LINEAGE_LIBRARY)){this.send(socket,{type:'error',message:'Unknown lineage.'});return;}
		const lineage=rawLineage as Lineage;
		if(state.players[player-1].payload.lineage===LINEAGE_WIRE[lineage]&&state.players[player-1].payload.source==='web-test')return;
		state.players[player-1]=createCreature(player,lineage);
		this.addLog(state,`Player ${player} selected ${lineage}.`);this.addEvent(state,{type:'lineage_selected',player,message:`Player ${player} selected ${lineage}.`});await this.saveAndBroadcast(state);
	}

	private async handleCreatureImport(socket: WebSocket, player: PlayerNumber, rawPayload: unknown, autoReady = false) {
		const attachment=socket.deserializeAttachment() as SocketAttachment|null;
		if(attachment?.clientInfo?.clientType!=='cardputer'){this.send(socket,{type:'error',message:'Cardputer creature imports require a Cardputer client handshake.'});return;}
		const state=await this.getState();
		if(state.winner!==null){this.send(socket,{type:'error',message:'This battle is already over.'});return;}
		if(state.started||state.ready[player-1]){this.send(socket,{type:'error',message:'Creature payload is locked once you are ready.'});return;}
		const validation=validateCanonicalPayloadV2(rawPayload);
		if('error' in validation){this.send(socket,{type:'error',message:`Payload rejected: ${validation.error}`});return;}
		if(validation.payload.source!=='cardputer'){this.send(socket,{type:'error',message:'External creature imports must use source: "cardputer".'});return;}
		state.players[player-1]=createCreatureFromPayload(validation.payload);
		this.addLog(state,`Player ${player} imported ${validation.payload.name} using canonical Battle Rules v19.`);
		this.addEvent(state,{type:'creature_imported',player,message:`Player ${player} imported canonical creature payload v2.`});
		await this.saveAndBroadcast(state);
		if(autoReady) await this.handleReady(socket,player);
	}

	private emitChoiceResult(state: BattleState, player: PlayerNumber, choice: LockedAction, report: TurnReport, canonicalFirst: boolean) {
		const target=otherPlayer(player);
		const move=canonicalFirst?report.firstMove:report.secondMove;
		const missed=canonicalFirst?report.firstMissed:report.secondMissed;
		const damage=canonicalFirst?report.firstDamage:report.secondDamage;
		const recovered=canonicalFirst?report.firstRecovered:report.secondRecovered;
		const status=canonicalFirst?report.statusAppliedToSecond:report.statusAppliedToFirst;
		if(choice==='recover'){this.addLog(state,`Player ${player} used Recover and restored ${recovered} Energy.`);this.addEvent(state,{type:'recover',player,targetPlayer:player,amount:recovered,message:`Player ${player} restored ${recovered} Energy.`});return;}
		if(choice==='guard'){this.addLog(state,`Player ${player} guarded and recovered Energy.`);this.addEvent(state,{type:'move_resolved',player,targetPlayer:player,message:`Player ${player} guarded.`});return;}
		if(!choice||move==='none')return;
		const name=MOVE_LIBRARY[move]?.name??move;
		if(missed){this.addLog(state,`Player ${player} used ${name}, but it missed.`);this.addEvent(state,{type:'move_missed',player,targetPlayer:target,moveId:move,message:`Player ${player} used ${name}, but it missed.`});return;}
		this.addLog(state,damage>0?`Player ${player} used ${name} for ${damage} damage.`:`Player ${player} used ${name}.`);
		this.addEvent(state,{type:'move_resolved',player,targetPlayer:target,moveId:move,amount:damage,message:damage>0?`Player ${player} used ${name} for ${damage} damage.`:`Player ${player} used ${name}.`});
		if(recovered>0)this.addEvent(state,{type:'heal',player,targetPlayer:player,moveId:move,amount:recovered,message:`Player ${player} recovered ${recovered}.`});
		if(status)this.addEvent(state,{type:'status_applied',player,targetPlayer:target,moveId:move,statusId:status,message:`Player ${target} gained ${status}.`});
	}

	private resolveRound(state: BattleState) {
		if(!state.lockedMoves[0]||!state.lockedMoves[1]||!state.canonicalFirstPlayer||!state.battleRuntime)return;
		const canonicalFirst=state.canonicalFirstPlayer, canonicalSecond=otherPlayer(canonicalFirst);
		const firstCreature=state.players[canonicalFirst-1], secondCreature=state.players[canonicalSecond-1];
		const toChoice=(creature:CreatureState,locked:LockedAction):BattleChoice=>{
			if(locked==='recover')return{kind:'recover'}; if(locked==='guard')return{kind:'guard'};
			const slot=locked?creature.fighter.equippedMoves.indexOf(locked):-1; return{kind:'move',slot:slot>=0?slot:0};
		};
		const firstLocked=state.lockedMoves[canonicalFirst-1], secondLocked=state.lockedMoves[canonicalSecond-1];
		const report=resolvePeerTurn(state.battleRuntime,firstCreature.fighter,secondCreature.fighter,toChoice(firstCreature,firstLocked),toChoice(secondCreature,secondLocked));
		syncCreature(firstCreature);syncCreature(secondCreature);
		// Emit playback in the actual v19 initiative order for this turn.
		const firstActsFirst=(state.battleRuntime.turnCount&1)===1;
		if(firstActsFirst){this.emitChoiceResult(state,canonicalFirst,firstLocked,report,true);if(report.secondMove!=='none'||secondLocked==='guard'||secondLocked==='recover')this.emitChoiceResult(state,canonicalSecond,secondLocked,report,false);}
		else{this.emitChoiceResult(state,canonicalSecond,secondLocked,report,false);if(report.firstMove!=='none'||firstLocked==='guard'||firstLocked==='recover')this.emitChoiceResult(state,canonicalFirst,firstLocked,report,true);}
		if(report.firstStatusDamage>0)this.addLog(state,`Player ${canonicalFirst} took ${report.firstStatusDamage} Burn damage.`);
		if(report.secondStatusDamage>0)this.addLog(state,`Player ${canonicalSecond} took ${report.secondStatusDamage} Burn damage.`);
		state.lockedMoves=[null,null];state.lockedCosts=[null,null];
		if(report.outcome!=='ongoing'){
			state.phase='finished';
			if(report.outcome==='first')state.winner=canonicalFirst;else if(report.outcome==='second')state.winner=canonicalSecond;else state.winner=0;
			const msg=state.winner===0?'Battle ended in a draw.':`Player ${state.winner} wins.`;this.addLog(state,msg);this.addEvent(state,{type:'battle_end',...(state.winner?{player:state.winner}:{ }),message:msg});return;
		}
		state.round=state.battleRuntime.turnCount+1;
		state.roundFirstPlayer=(state.round&1)===1?canonicalFirst:canonicalSecond;
		this.addEvent(state,{type:'round_start',player:state.roundFirstPlayer,message:`Round ${state.round}. Player ${state.roundFirstPlayer} resolves first.`});
	}

	private async lockAction(socket: WebSocket, player: PlayerNumber, action: Exclude<LockedAction,null>) {
		const state=await this.getState();
		if(!this.bothPlayersConnected()){this.send(socket,{type:'error',message:'Waiting for another player.'});return;}
		if(state.winner!==null||state.phase==='finished'){this.send(socket,{type:'error',message:'This battle is already over.'});return;}
		if(!state.started||!state.ready[0]||!state.ready[1]||state.phase!=='selecting'){this.send(socket,{type:'error',message:'Both players must be ready before battling.'});return;}
		if(state.lockedMoves[player-1]!==null){this.send(socket,{type:'error',message:'Your action is already locked for this round.'});return;}
		state.lockedMoves[player-1]=action;state.lockedCosts[player-1]=0;this.addLog(state,`Player ${player} locked in an action.`);this.addEvent(state,{type:'action_locked',player,message:`Player ${player} locked in an action.`});
		if(state.lockedMoves[0]!==null&&state.lockedMoves[1]!==null)this.resolveRound(state);await this.saveAndBroadcast(state);
	}

	private async handleMove(socket: WebSocket, player: PlayerNumber, rawMoveId?: string) {
		const state=await this.getState(); const creature=state.players[player-1];
		if(!rawMoveId||!(rawMoveId in MOVE_LIBRARY)||rawMoveId==='none'){this.send(socket,{type:'error',message:'Unknown move.'});return;}
		const moveId=rawMoveId as MoveId;
		if(!creature.fighter.equippedMoves.includes(moveId)){this.send(socket,{type:'error',message:'That creature does not have this move equipped.'});return;}
		if(!canUseMove(creature.fighter,moveId)){const cost=effectiveEnergyCost(creature.fighter,moveId);this.send(socket,{type:'error',message:`Move unavailable. ${MOVE_LIBRARY[moveId].name} costs ${cost} Energy or is cooling down.`});return;}
		await this.lockAction(socket,player,moveId);
	}

	private async handleBattleAction(socket: WebSocket, player: PlayerNumber, data: ClientMessage) {
		const state = await this.getState();
		if (!Number.isInteger(data.round) || data.round !== state.round) {
			this.send(socket, { type: 'error', message: `Round mismatch. Server is on Round ${state.round}.` });
			return;
		}

		const kind = data.action?.kind;
		if (kind === 'recover') {
			await this.lockAction(socket, player, 'recover');
			return;
		}
		if (kind === 'guard') {
			await this.lockAction(socket, player, 'guard');
			return;
		}

		const slot = data.action?.slot;
		if (kind !== 'move' || !Number.isInteger(slot) || slot === undefined || slot < 0 || slot > 3) {
			this.send(socket, { type: 'error', message: 'Invalid battle action.' });
			return;
		}

		const creature = state.players[player - 1];
		const move = creature.fighter.equippedMoves[slot];
		if (!move || move === 'none') {
			this.send(socket, { type: 'error', message: 'That move slot is empty.' });
			return;
		}
		if (!canUseMove(creature.fighter, move)) {
			this.send(socket, { type: 'error', message: `Move unavailable. ${MOVE_LIBRARY[move].name} costs ${effectiveEnergyCost(creature.fighter, move)} Energy or is cooling down.` });
			return;
		}
		await this.lockAction(socket, player, move);
	}

	private async handleRecover(socket: WebSocket, player: PlayerNumber) { await this.lockAction(socket,player,'recover'); }

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket', { status: 426 });
		}

		const url = new URL(request.url);
		const requestedSession = url.searchParams.get('session')?.trim() || null;
		const state = await this.getState();
		const reservedPlayers = this.getReservedPlayers();
		let player: PlayerNumber | null = null;
		let sessionToken = requestedSession;
		let resumed = false;

		if (requestedSession) {
			const matchIndex = state.sessionTokens.findIndex((token) => token === requestedSession);
			if (matchIndex >= 0) {
				player = (matchIndex + 1) as PlayerNumber;
				resumed = true;
			}
		}

		if (!player) {
			const availableIndex = state.sessionTokens.findIndex((token, index) => token === null && !reservedPlayers.includes((index + 1) as PlayerNumber));
			if (availableIndex < 0) return new Response('Battle room is full', { status: 409 });
			player = (availableIndex + 1) as PlayerNumber;
			sessionToken = generateSessionToken();
			state.sessionTokens[availableIndex] = sessionToken;
		}

		if (!sessionToken) return new Response('Unable to create player session', { status: 500 });

		// Every socket connection gets its own generation id. A resumed connection
		// replaces the previous generation before that old socket can report a
		// disconnect, preventing a refresh/reconnect race from pausing the room.
		const connectionId = generateSessionToken();
		state.connectionIds[player - 1] = connectionId;
		state.disconnectDeadlines[player - 1] = null;
		await this.ctx.storage.put('state', state);

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ player, handshakeComplete: false, sessionToken, resumed, connectionId } satisfies SocketAttachment);

		if (resumed) {
			for (const existingSocket of this.ctx.getWebSockets()) {
				if (existingSocket === server) continue;
				const existingAttachment = existingSocket.deserializeAttachment() as SocketAttachment | null;
				if (existingAttachment?.player === player && existingAttachment.sessionToken === sessionToken) {
					existingSocket.close(4001, 'Session resumed by a newer connection');
				}
			}
		}

		this.send(server, {
			type: 'hello-required',
			player,
			sessionToken,
			resumed,
			reconnectGraceMs: RECONNECT_GRACE_MS,
			connectionProtocol: CONNECTION_PROTOCOL,
		});

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string) {
		if (typeof message !== 'string') return;

		const attachment = socket.deserializeAttachment() as SocketAttachment | null;
		if (!attachment?.player) return;

		let data: ClientMessage;
		try {
			data = JSON.parse(message) as ClientMessage;
		} catch {
			this.send(socket, { type: 'error', message: 'Invalid message.' });
			return;
		}

		if (!attachment.handshakeComplete) {
			if (data.type === 'client-hello') {
				await this.handleClientHello(socket, data, attachment);
				return;
			}

			this.send(socket, { type: 'hello-reject', message: 'Client handshake required before battle messages.', connectionProtocol: CONNECTION_PROTOCOL });
			return;
		}

		if (data.type === 'client-hello') {
			this.send(socket, { type: 'error', message: 'Client handshake is already complete.' });
			return;
		}

		if (data.type === 'select-lineage') {
			await this.handleLineageSelect(socket, attachment.player, data.lineage);
			return;
		}

		if (data.type === 'import-creature') { await this.handleCreatureImport(socket, attachment.player, data.creature, false); return; }

		if (data.type === 'creature-snapshot') { await this.handleCreatureImport(socket, attachment.player, data.creature, true); return; }

		if (data.type === 'ready') {
			await this.handleReady(socket, attachment.player);
			return;
		}

		if (data.type === 'move') {
			await this.handleMove(socket, attachment.player, data.moveId);
			return;
		}

		if (data.type === 'rematch') {
			await this.handleRematch(socket, attachment.player);
			return;
		}

		if (data.type === 'leave') {
			await this.handleLeave(socket, attachment);
			return;
		}

		if (data.type === 'battle-action') { await this.handleBattleAction(socket, attachment.player, data); return; }

		if (data.type === 'recover') await this.handleRecover(socket, attachment.player);
	}

	private async handleLeave(socket: WebSocket, attachment: SocketAttachment) {
		const state = await this.getState();
		if (
			state.sessionTokens[attachment.player - 1] === attachment.sessionToken &&
			state.connectionIds[attachment.player - 1] === attachment.connectionId
		) {
			state.sessionTokens[attachment.player - 1] = null;
			state.disconnectDeadlines[attachment.player - 1] = null;
			state.connectionIds[attachment.player - 1] = null;
			this.resetInterruptedBattle(state, `Player ${attachment.player} left the battle room.`);
			this.addEvent(state, { type: 'session_expired', player: attachment.player, round: 0, message: `Player ${attachment.player} left the battle room.` });
			await this.ctx.storage.put('state', state);
			await this.scheduleReconnectAlarm(state);
			await this.broadcastState(state);
		}
		socket.close(1000, 'Player left room');
	}

	async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
		const attachment = socket.deserializeAttachment() as SocketAttachment | null;
		if (!attachment?.player || !attachment.sessionToken) return;

		const state = await this.getState();
		if (state.sessionTokens[attachment.player - 1] !== attachment.sessionToken) {
			await this.broadcastState(state);
			return;
		}

		// Ignore the close event from an older socket generation after a refresh
		// or reconnect has already replaced it. Only the currently active
		// connection is allowed to start the reconnect grace timer.
		if (state.connectionIds[attachment.player - 1] !== attachment.connectionId) {
			await this.broadcastState(state);
			return;
		}

		if (!attachment.handshakeComplete) {
			state.sessionTokens[attachment.player - 1] = null;
			state.disconnectDeadlines[attachment.player - 1] = null;
			state.connectionIds[attachment.player - 1] = null;
			await this.ctx.storage.put('state', state);
			await this.scheduleReconnectAlarm(state);
			await this.broadcastState(state);
			return;
		}

		state.disconnectDeadlines[attachment.player - 1] = Date.now() + RECONNECT_GRACE_MS;
		this.addLog(state, `Player ${attachment.player} disconnected. Waiting up to ${RECONNECT_GRACE_MS / 1000} seconds for reconnection.`);
		this.addEvent(state, { type: 'disconnect', player: attachment.player, message: `Player ${attachment.player} disconnected. Reconnect window started.` });
		await this.ctx.storage.put('state', state);
		await this.scheduleReconnectAlarm(state);
		await this.broadcastState(state);
	}

	async alarm() {
		const state = await this.getState();
		const now = Date.now();
		const expiredPlayers: PlayerNumber[] = [];

		for (const player of [1, 2] as PlayerNumber[]) {
			const deadline = state.disconnectDeadlines[player - 1];
			if (deadline !== null && deadline <= now) expiredPlayers.push(player);
		}

		for (const player of expiredPlayers) {
			await this.expirePlayerSession(state, player, `Player ${player}'s reconnect window expired. Battle reset.`);
		}

		if (expiredPlayers.length) {
			await this.ctx.storage.put('state', state);
			await this.broadcastState(state);
		}

		await this.scheduleReconnectAlarm(state);
	}

}

function generateRoomCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	const bytes = new Uint8Array(6);
	crypto.getRandomValues(bytes);
	let code = '';
	for (const byte of bytes) code += alphabet[byte % alphabet.length];
	return code;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/api/rooms') {
			return Response.json({ code: generateRoomCode() });
		}

		const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/ws$/);
		if (match) {
			const room = env.BATTLE_ROOM.getByName(match[1]);
			return room.fetch(request);
		}

		return Response.json({ error: 'Not found' }, { status: 404 });
	},
} satisfies ExportedHandler<Env>;

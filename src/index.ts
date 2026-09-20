import { DurableObject } from 'cloudflare:workers';

type PlayerNumber = 1 | 2;
type Lineage = 'Husk' | 'Mire' | 'Wisp' | 'Fang' | 'Choir' | 'Machine' | 'Cinder' | 'Veil';
type Pressure = 'Neutral' | 'Force' | 'Signal' | 'Heat' | 'Corrosion' | 'Echo';
type MoveRole = 'attack' | 'guard' | 'heal' | 'utility';
type BattlePhase = 'waiting' | 'selecting' | 'finished';
type StatusId = 'stagger' | 'disruption' | 'burn' | 'corrosion' | 'echo-interference' | 'evasion' | 'ward';

type MoveId =
	| 'pulse-strike'
	| 'quiet-ward'
	| 'restore-pulse'
	| 'signal-snare'
	| 'overcharge'
	| 'rend'
	| 'reckless-rush'
	| 'shell-brace'
	| 'bog-leech'
	| 'phase-feint'
	| 'pursuit-bite'
	| 'chorus-echo'
	| 'panel-shift'
	| 'ember-spire'
	| 'veil-snare';

interface StatusState {
	id: StatusId;
	turns: number;
	stacks?: number;
}

interface MoveDefinition {
	id: MoveId;
	name: string;
	pressure: Pressure;
	role: MoveRole;
	energyCost: number;
	accuracy: number;
	power: number;
	description: string;
	signatureOf?: Lineage;
}

interface CreatureState {
	name: string;
	lineage: Lineage;
	hp: number;
	maxHp: number;
	energy: number;
	maxEnergy: number;
	moves: MoveId[];
	statuses: StatusState[];
	lastMoveId: MoveId | null;
}

interface BattleState {
	version: 6;
	players: [CreatureState, CreatureState];
	ready: [boolean, boolean];
	started: boolean;
	phase: BattlePhase;
	round: number;
	roundFirstPlayer: PlayerNumber | null;
	initiativeWinner: PlayerNumber | null;
	winner: PlayerNumber | null;
	lockedMoves: [MoveId | 'recover' | null, MoveId | 'recover' | null];
	lockedCosts: [number | null, number | null];
	log: string[];
}

interface SocketAttachment {
	player: PlayerNumber;
}

interface ClientMessage {
	type?: string;
	moveId?: string;
	lineage?: string;
}

interface LineageDefinition {
	id: Lineage;
	name: string;
	moves: MoveId[];
}

/*
 * v0.2.2 introduces Demonym's real move vocabulary and effect model.
 *
 * IMPORTANT: numeric values below are WEB TEST BALANCE, not a claim that they
 * are the final Cardputer BattleEngine values. The public Demonym material does
 * not contain the complete private balance table. Keep move behavior/data in
 * this one library so exact firmware values can replace these numbers later.
 */
const MOVE_LIBRARY: Record<MoveId, MoveDefinition> = {
	'pulse-strike': {
		id: 'pulse-strike',
		name: 'Pulse Strike',
		pressure: 'Neutral',
		role: 'attack',
		energyCost: 1,
		accuracy: 96,
		power: 14,
		description: 'Reliable low-cost damaging hit.',
	},
	'quiet-ward': {
		id: 'quiet-ward',
		name: 'Quiet Ward',
		pressure: 'Neutral',
		role: 'guard',
		energyCost: 2,
		accuracy: 100,
		power: 0,
		description: 'Raises a ward to soften the next incoming hit.',
	},
	'restore-pulse': {
		id: 'restore-pulse',
		name: 'Restore Pulse',
		pressure: 'Neutral',
		role: 'heal',
		energyCost: 3,
		accuracy: 100,
		power: 22,
		description: 'Restores Health.',
	},
	'signal-snare': {
		id: 'signal-snare',
		name: 'Signal Snare',
		pressure: 'Signal',
		role: 'utility',
		energyCost: 2,
		accuracy: 90,
		power: 7,
		description: 'Applies Disruption, increasing enemy Energy costs.',
	},
	'overcharge': {
		id: 'overcharge',
		name: 'Overcharge',
		pressure: 'Signal',
		role: 'attack',
		energyCost: 5,
		accuracy: 88,
		power: 28,
		description: 'High-output Signal attack with a heavy Energy cost.',
	},
	'rend': {
		id: 'rend',
		name: 'Rend',
		pressure: 'Force',
		role: 'attack',
		energyCost: 3,
		accuracy: 86,
		power: 24,
		description: 'Strong Force hit with lower accuracy.',
	},
	'reckless-rush': {
		id: 'reckless-rush',
		name: 'Reckless Rush',
		pressure: 'Force',
		role: 'attack',
		energyCost: 4,
		accuracy: 82,
		power: 32,
		description: 'Very heavy hit that also hurts the user.',
	},
	'shell-brace': {
		id: 'shell-brace',
		name: 'Shell Brace',
		pressure: 'Force',
		role: 'guard',
		energyCost: 3,
		accuracy: 100,
		power: 10,
		description: 'Husk signature. Clears Stagger, restores Health, and braces for impact.',
		signatureOf: 'Husk',
	},
	'bog-leech': {
		id: 'bog-leech',
		name: 'Bog Leech',
		pressure: 'Corrosion',
		role: 'attack',
		energyCost: 3,
		accuracy: 92,
		power: 16,
		description: 'Mire signature. Drains Health and improves against Corroded targets.',
		signatureOf: 'Mire',
	},
	'phase-feint': {
		id: 'phase-feint',
		name: 'Phase Feint',
		pressure: 'Signal',
		role: 'utility',
		energyCost: 2,
		accuracy: 100,
		power: 0,
		description: 'Wisp signature. Boosts evasion against the next incoming move.',
		signatureOf: 'Wisp',
	},
	'pursuit-bite': {
		id: 'pursuit-bite',
		name: 'Pursuit Bite',
		pressure: 'Force',
		role: 'attack',
		energyCost: 3,
		accuracy: 94,
		power: 18,
		description: 'Fang signature. A finisher that hits harder against weakened targets.',
		signatureOf: 'Fang',
	},
	'chorus-echo': {
		id: 'chorus-echo',
		name: 'Chorus Echo',
		pressure: 'Echo',
		role: 'attack',
		energyCost: 3,
		accuracy: 92,
		power: 16,
		description: 'Choir signature. Feeds on existing Echo Interference or Burn.',
		signatureOf: 'Choir',
	},
	'panel-shift': {
		id: 'panel-shift',
		name: 'Panel Shift',
		pressure: 'Signal',
		role: 'utility',
		energyCost: 1,
		accuracy: 100,
		power: 3,
		description: 'Machine signature. Clears signal noise and restores Energy.',
		signatureOf: 'Machine',
	},
	'ember-spire': {
		id: 'ember-spire',
		name: 'Ember Spire',
		pressure: 'Heat',
		role: 'attack',
		energyCost: 4,
		accuracy: 90,
		power: 20,
		description: 'Cinder signature. Spikes an existing Burn without recoil.',
		signatureOf: 'Cinder',
	},
	'veil-snare': {
		id: 'veil-snare',
		name: 'Veil Snare',
		pressure: 'Echo',
		role: 'utility',
		energyCost: 3,
		accuracy: 92,
		power: 9,
		description: 'Veil signature. Applies or deepens Echo Interference.',
		signatureOf: 'Veil',
	},
};

/*
 * v0.2.3+ lineage presets. These are WEB TEST LOADOUTS built around the known
 * Demonym move vocabulary and each lineage's signature move. They make every
 * lineage/signature selectable for multiplayer testing without pretending the
 * private Cardputer learned-move table has already been synced.
 */
const LINEAGE_LIBRARY: Record<Lineage, LineageDefinition> = {
	Husk: { id: 'Husk', name: 'Husk', moves: ['pulse-strike', 'quiet-ward', 'rend', 'shell-brace'] },
	Mire: { id: 'Mire', name: 'Mire', moves: ['pulse-strike', 'restore-pulse', 'signal-snare', 'bog-leech'] },
	Wisp: { id: 'Wisp', name: 'Wisp', moves: ['pulse-strike', 'signal-snare', 'restore-pulse', 'phase-feint'] },
	Fang: { id: 'Fang', name: 'Fang', moves: ['pulse-strike', 'rend', 'reckless-rush', 'pursuit-bite'] },
	Choir: { id: 'Choir', name: 'Choir', moves: ['pulse-strike', 'signal-snare', 'restore-pulse', 'chorus-echo'] },
	Machine: { id: 'Machine', name: 'Machine', moves: ['pulse-strike', 'quiet-ward', 'overcharge', 'panel-shift'] },
	Cinder: { id: 'Cinder', name: 'Cinder', moves: ['pulse-strike', 'overcharge', 'reckless-rush', 'ember-spire'] },
	Veil: { id: 'Veil', name: 'Veil', moves: ['pulse-strike', 'signal-snare', 'quiet-ward', 'veil-snare'] },
};

const STARTING_HP = 100;
const STARTING_ENERGY = 7;
const MAX_ENERGY = 10;
const ENERGY_RECOVERY_PER_ROUND = 1;
const EMERGENCY_RECOVER_ENERGY = 2;
const MAX_LOG_ENTRIES = 24;
const DISRUPTION_EXTRA_COST = 2;
const WARD_DAMAGE_REDUCTION = 0.5;
const EVASION_BONUS = 20;
const BURN_DAMAGE = 4;
const CORROSION_DAMAGE_MULTIPLIER = 1.2;

function createCreature(player: PlayerNumber, lineage?: Lineage): CreatureState {
	const selectedLineage: Lineage = lineage ?? (player === 1 ? 'Husk' : 'Wisp');
	const preset = LINEAGE_LIBRARY[selectedLineage];

	return {
		name: `${preset.name} Demonym`,
		lineage: selectedLineage,
		hp: STARTING_HP,
		maxHp: STARTING_HP,
		energy: STARTING_ENERGY,
		maxEnergy: MAX_ENERGY,
		moves: [...preset.moves],
		statuses: [],
		lastMoveId: null,
	};
}

function pickStartingPlayer(): PlayerNumber {
	const byte = new Uint8Array(1);
	crypto.getRandomValues(byte);
	return byte[0] % 2 === 0 ? 1 : 2;
}

function randomPercent(): number {
	const bytes = new Uint32Array(1);
	crypto.getRandomValues(bytes);
	return bytes[0] / 0xffffffff * 100;
}

function createInitialState(): BattleState {
	return {
		version: 6,
		players: [createCreature(1), createCreature(2)],
		ready: [false, false],
		started: false,
		phase: 'waiting',
		round: 0,
		roundFirstPlayer: null,
		initiativeWinner: null,
		winner: null,
		lockedMoves: [null, null],
		lockedCosts: [null, null],
		log: ['Battle room created.'],
	};
}

function getStatus(creature: CreatureState, id: StatusId): StatusState | undefined {
	return creature.statuses.find((status) => status.id === id);
}

function hasStatus(creature: CreatureState, id: StatusId): boolean {
	return Boolean(getStatus(creature, id));
}

function removeStatus(creature: CreatureState, id: StatusId): boolean {
	const before = creature.statuses.length;
	creature.statuses = creature.statuses.filter((status) => status.id !== id);
	return creature.statuses.length !== before;
}

function addOrRefreshStatus(creature: CreatureState, id: StatusId, turns: number, stack = false) {
	const existing = getStatus(creature, id);

	if (!existing) {
		creature.statuses.push({ id, turns, stacks: 1 });
		return;
	}

	existing.turns = Math.max(existing.turns, turns);
	if (stack) {
		existing.stacks = Math.min(3, (existing.stacks ?? 1) + 1);
	}
}

function healCreature(creature: CreatureState, amount: number): number {
	let adjusted = amount;

	if (hasStatus(creature, 'corrosion')) {
		adjusted = Math.ceil(adjusted / 2);
	}

	const before = creature.hp;
	creature.hp = Math.min(creature.maxHp, creature.hp + adjusted);
	return creature.hp - before;
}

function damageCreature(creature: CreatureState, amount: number): number {
	let adjusted = amount;

	if (hasStatus(creature, 'ward')) {
		adjusted = Math.max(1, Math.round(adjusted * WARD_DAMAGE_REDUCTION));
		removeStatus(creature, 'ward');
	}

	if (hasStatus(creature, 'corrosion')) {
		adjusted = Math.max(1, Math.round(adjusted * CORROSION_DAMAGE_MULTIPLIER));
	}

	const before = creature.hp;
	creature.hp = Math.max(0, creature.hp - adjusted);
	return before - creature.hp;
}

function effectiveEnergyCost(creature: CreatureState, move: MoveDefinition): number {
	return move.energyCost + (hasStatus(creature, 'disruption') ? DISRUPTION_EXTRA_COST : 0);
}

function effectiveAccuracy(attacker: CreatureState, defender: CreatureState, move: MoveDefinition): number {
	let accuracy = move.accuracy;

	if (hasStatus(attacker, 'echo-interference')) {
		const stacks = getStatus(attacker, 'echo-interference')?.stacks ?? 1;
		accuracy -= 8 * stacks;
	}

	if (hasStatus(defender, 'evasion')) {
		accuracy -= EVASION_BONUS;
	}

	return Math.max(20, Math.min(100, accuracy));
}

function otherPlayer(player: PlayerNumber): PlayerNumber {
	return player === 1 ? 2 : 1;
}

function affordableMoves(creature: CreatureState): MoveId[] {
	return creature.moves.filter((moveId) => {
		const move = MOVE_LIBRARY[moveId];
		return creature.energy >= effectiveEnergyCost(creature, move);
	});
}

function isOffensiveMove(move: MoveDefinition): boolean {
	return move.role === 'attack' || (move.role === 'utility' && move.power > 0);
}

export class BattleRoom extends DurableObject<Env> {
	private async getState(): Promise<BattleState> {
		const storedState = await this.ctx.storage.get<BattleState | { version?: number }>('state');

		if (!storedState || storedState.version !== 6) {
			const state = createInitialState();
			await this.ctx.storage.put('state', state);
			return state;
		}

		return storedState as BattleState;
	}

	private getConnectedPlayers(): PlayerNumber[] {
		const players = new Set<PlayerNumber>();

		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;
			if (attachment?.player) players.add(attachment.player);
		}

		return [...players].sort() as PlayerNumber[];
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

	private bothPlayersConnected(): boolean {
		const connected = this.getConnectedPlayers();
		return connected.includes(1) && connected.includes(2);
	}

	private async saveAndBroadcast(state: BattleState) {
		await this.ctx.storage.put('state', state);
		await this.broadcastState(state);
	}

	private stateForPlayer(state: BattleState, player: PlayerNumber) {
		const { lockedMoves, lockedCosts: _lockedCosts, ...publicState } = state;
		return {
			...publicState,
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
			moveLibrary: MOVE_LIBRARY,
			lineageLibrary: LINEAGE_LIBRARY,
		});
	}

	private async broadcastState(existingState?: BattleState) {
		const state = existingState ?? (await this.getState());

		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;
			if (!attachment?.player) continue;
			this.sendState(socket, state, attachment.player);
		}
	}

	private async handleReady(socket: WebSocket, player: PlayerNumber) {
		const state = await this.getState();

		if (state.winner !== null) {
			this.send(socket, { type: 'error', message: 'This battle is already over.' });
			return;
		}

		if (state.ready[player - 1]) return;

		state.ready[player - 1] = true;
		this.addLog(state, `Player ${player} is ready.`);

		if (state.ready[0] && state.ready[1] && this.bothPlayersConnected()) {
			const startingPlayer = pickStartingPlayer();
			state.started = true;
			state.phase = 'selecting';
			state.round = 1;
			state.roundFirstPlayer = startingPlayer;
			state.initiativeWinner = startingPlayer;
			state.lockedMoves = [null, null];
			state.lockedCosts = [null, null];
			this.addLog(state, 'Both players ready. Signal Toss...');
			this.addLog(state, `Player ${startingPlayer} wins the Signal Toss and has first resolution priority.`);
			this.addLog(state, 'Round 1: both players lock in a move.');
		}

		await this.saveAndBroadcast(state);
	}

	private async handleLineageSelect(socket: WebSocket, player: PlayerNumber, rawLineage?: string) {
		const state = await this.getState();

		if (state.winner !== null) {
			this.send(socket, { type: 'error', message: 'This battle is already over.' });
			return;
		}

		if (state.started || state.ready[player - 1]) {
			this.send(socket, { type: 'error', message: 'Lineage is locked once you are ready.' });
			return;
		}

		if (!rawLineage || !(rawLineage in LINEAGE_LIBRARY)) {
			this.send(socket, { type: 'error', message: 'Unknown lineage.' });
			return;
		}

		const lineage = rawLineage as Lineage;
		if (state.players[player - 1].lineage === lineage) return;

		state.players[player - 1] = createCreature(player, lineage);
		this.addLog(state, `Player ${player} selected ${lineage}.`);
		await this.saveAndBroadcast(state);
	}

	private resolveMoveEffect(state: BattleState, player: PlayerNumber, move: MoveDefinition) {
		const opponent: PlayerNumber = player === 1 ? 2 : 1;
		const attacker = state.players[player - 1];
		const defender = state.players[opponent - 1];
		const attackerLabel = `Player ${player}`;
		const defenderLabel = `Player ${opponent}`;

		if (move.id === 'quiet-ward') {
			addOrRefreshStatus(attacker, 'ward', 2);
			this.addLog(state, `${attackerLabel} raised Quiet Ward.`);
			return;
		}

		if (move.id === 'restore-pulse') {
			const healed = healCreature(attacker, move.power);
			this.addLog(state, `${attackerLabel} used Restore Pulse and restored ${healed} HP.`);
			return;
		}

		if (move.id === 'shell-brace') {
			const cleared = removeStatus(attacker, 'stagger');
			const healed = healCreature(attacker, move.power);
			addOrRefreshStatus(attacker, 'ward', 2);
			this.addLog(state, `${attackerLabel} used Shell Brace: ${healed} HP restored${cleared ? ', Stagger cleared' : ''}, Ward raised.`);
			return;
		}

		if (move.id === 'phase-feint') {
			addOrRefreshStatus(attacker, 'evasion', 2);
			this.addLog(state, `${attackerLabel} used Phase Feint and became harder to hit.`);
			return;
		}

		if (move.id === 'panel-shift') {
			const clearedDisruption = removeStatus(attacker, 'disruption');
			const clearedEcho = removeStatus(attacker, 'echo-interference');
			const before = attacker.energy;
			attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + move.power);
			const restored = attacker.energy - before;
			this.addLog(state, `${attackerLabel} used Panel Shift: ${restored} Energy restored${clearedDisruption || clearedEcho ? ', noise cleared' : ''}.`);
			return;
		}

		let damage = move.power;

		if (move.id === 'pursuit-bite' && defender.hp <= Math.ceil(defender.maxHp * 0.35)) {
			damage += 10;
		}

		if (move.id === 'bog-leech' && hasStatus(defender, 'corrosion')) {
			damage += 6;
		}

		if (move.id === 'chorus-echo' && (hasStatus(defender, 'echo-interference') || hasStatus(defender, 'burn'))) {
			damage += 8;
		}

		if (move.id === 'ember-spire' && hasStatus(defender, 'burn')) {
			damage += 10;
		}

		const dealt = damageCreature(defender, damage);
		this.addLog(state, `${attackerLabel} used ${move.name} for ${dealt} damage.`);

		if (move.id === 'signal-snare') {
			addOrRefreshStatus(defender, 'disruption', 3);
			this.addLog(state, `${defenderLabel} is Disrupted. Move costs are increased.`);
		}

		if (move.id === 'bog-leech') {
			const healed = healCreature(attacker, Math.max(1, Math.ceil(dealt / (hasStatus(defender, 'corrosion') ? 2 : 3))));
			if (healed > 0) this.addLog(state, `${attackerLabel} drained ${healed} HP.`);
		}

		if (move.id === 'reckless-rush') {
			const recoil = Math.max(1, Math.ceil(dealt * 0.25));
			attacker.hp = Math.max(1, attacker.hp - recoil);
			this.addLog(state, `${attackerLabel} took ${recoil} recoil damage.`);
		}

		if (move.id === 'veil-snare') {
			addOrRefreshStatus(defender, 'echo-interference', 3, true);
			const stacks = getStatus(defender, 'echo-interference')?.stacks ?? 1;
			this.addLog(state, `${defenderLabel} has Echo Interference x${stacks}.`);
		}
	}

	private applyEndOfRound(state: BattleState) {
		for (let index = 0; index < state.players.length; index++) {
			const creature = state.players[index];
			const label = `Player ${index + 1}`;

			if (hasStatus(creature, 'burn') && creature.hp > 0) {
				const burnDamage = Math.min(BURN_DAMAGE, Math.max(0, creature.hp - 1));
				creature.hp -= burnDamage;
				if (burnDamage > 0) this.addLog(state, `${label} took ${burnDamage} Burn damage.`);
			}

			for (const status of creature.statuses) {
				status.turns -= 1;
			}

			creature.statuses = creature.statuses.filter((status) => status.turns > 0);
			creature.energy = Math.min(creature.maxEnergy, creature.energy + ENERGY_RECOVERY_PER_ROUND);
		}
	}

	private resolveLockedAction(state: BattleState, player: PlayerNumber) {
		const opponent = otherPlayer(player);
		const attacker = state.players[player - 1];
		const defender = state.players[opponent - 1];
		const action = state.lockedMoves[player - 1];
		const reservedCost = state.lockedCosts[player - 1] ?? 0;

		if (!action || attacker.hp <= 0 || state.winner !== null) return;

		if (action === 'recover') {
			const before = attacker.energy;
			attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + EMERGENCY_RECOVER_ENERGY);
			this.addLog(state, `Player ${player} recovered ${attacker.energy - before} Energy.`);
			return;
		}

		const move = MOVE_LIBRARY[action];
		attacker.energy = Math.max(0, attacker.energy - reservedCost);

		const accuracy = effectiveAccuracy(attacker, defender, move);
		const hit = move.accuracy >= 100 || randomPercent() < accuracy;

		if (!hit) {
			this.addLog(state, `Player ${player} used ${move.name}, but it missed.`);
		} else {
			this.resolveMoveEffect(state, player, move);
		}

		if (isOffensiveMove(move) && hasStatus(defender, 'evasion')) {
			removeStatus(defender, 'evasion');
		}

		attacker.lastMoveId = action;

		if (defender.hp <= 0) {
			state.winner = player;
			state.phase = 'finished';
			this.addLog(state, `Player ${player} wins.`);
		} else if (attacker.hp <= 0) {
			state.winner = opponent;
			state.phase = 'finished';
			this.addLog(state, `Player ${opponent} wins.`);
		}
	}

	private resolveRound(state: BattleState) {
		if (!state.lockedMoves[0] || !state.lockedMoves[1] || !state.roundFirstPlayer) return;

		const first = state.roundFirstPlayer;
		const second = otherPlayer(first);
		this.addLog(state, `Round ${state.round}: both moves locked. Resolving Player ${first} first.`);

		this.resolveLockedAction(state, first);
		if (state.winner === null) this.resolveLockedAction(state, second);

		if (state.winner !== null) {
			state.lockedMoves = [null, null];
			state.lockedCosts = [null, null];
			return;
		}

		this.applyEndOfRound(state);
		state.round += 1;
		state.roundFirstPlayer = second;
		state.lockedMoves = [null, null];
		state.lockedCosts = [null, null];
		this.addLog(state, `Round ${state.round}: both players lock in a move. Player ${state.roundFirstPlayer} resolves first.`);
	}

	private async lockAction(socket: WebSocket, player: PlayerNumber, action: MoveId | 'recover', cost: number) {
		const state = await this.getState();

		if (!this.bothPlayersConnected()) {
			this.send(socket, { type: 'error', message: 'Waiting for another player.' });
			return;
		}

		if (state.winner !== null || state.phase === 'finished') {
			this.send(socket, { type: 'error', message: 'This battle is already over.' });
			return;
		}

		if (!state.started || !state.ready[0] || !state.ready[1] || state.phase !== 'selecting') {
			this.send(socket, { type: 'error', message: 'Both players must be ready before battling.' });
			return;
		}

		if (state.lockedMoves[player - 1] !== null) {
			this.send(socket, { type: 'error', message: 'Your move is already locked for this round.' });
			return;
		}

		state.lockedMoves[player - 1] = action;
		state.lockedCosts[player - 1] = cost;
		this.addLog(state, `Player ${player} locked in a move.`);

		if (state.lockedMoves[0] !== null && state.lockedMoves[1] !== null) {
			this.resolveRound(state);
		}

		await this.saveAndBroadcast(state);
	}

	private async handleMove(socket: WebSocket, player: PlayerNumber, rawMoveId?: string) {
		const state = await this.getState();

		if (!this.bothPlayersConnected()) {
			this.send(socket, { type: 'error', message: 'Waiting for another player.' });
			return;
		}

		if (state.winner !== null || state.phase === 'finished') {
			this.send(socket, { type: 'error', message: 'This battle is already over.' });
			return;
		}

		if (!state.started || !state.ready[0] || !state.ready[1] || state.phase !== 'selecting') {
			this.send(socket, { type: 'error', message: 'Both players must be ready before battling.' });
			return;
		}

		if (state.lockedMoves[player - 1] !== null) {
			this.send(socket, { type: 'error', message: 'Your move is already locked for this round.' });
			return;
		}

		if (!rawMoveId || !(rawMoveId in MOVE_LIBRARY)) {
			this.send(socket, { type: 'error', message: 'Unknown move.' });
			return;
		}

		const moveId = rawMoveId as MoveId;
		const move = MOVE_LIBRARY[moveId];
		const attacker = state.players[player - 1];

		if (!attacker.moves.includes(moveId)) {
			this.send(socket, { type: 'error', message: 'That creature does not know this move.' });
			return;
		}

		const cost = effectiveEnergyCost(attacker, move);
		if (attacker.energy < cost) {
			this.send(socket, { type: 'error', message: `Not enough energy. ${move.name} currently costs ${cost}.` });
			return;
		}

		await this.lockAction(socket, player, moveId, cost);
	}

	private async handleRecover(socket: WebSocket, player: PlayerNumber) {
		const state = await this.getState();

		if (!state.started || state.phase !== 'selecting' || state.winner !== null) {
			this.send(socket, { type: 'error', message: 'Recover is not available right now.' });
			return;
		}

		if (state.lockedMoves[player - 1] !== null) {
			this.send(socket, { type: 'error', message: 'Your move is already locked for this round.' });
			return;
		}

		const creature = state.players[player - 1];
		if (affordableMoves(creature).length > 0) {
			this.send(socket, { type: 'error', message: 'Recover is only available when no moves can be afforded.' });
			return;
		}

		await this.lockAction(socket, player, 'recover', 0);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket', { status: 426 });
		}

		const existingSockets = this.ctx.getWebSockets();
		if (existingSockets.length >= 2) return new Response('Battle room is full', { status: 409 });

		const connectedPlayers = this.getConnectedPlayers();
		const player: PlayerNumber = connectedPlayers.includes(1) ? 2 : 1;
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ player } satisfies SocketAttachment);

		const state = await this.getState();
		this.sendState(server, state, player, 'welcome');

		await this.broadcastState(state);
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

		if (data.type === 'select-lineage') {
			await this.handleLineageSelect(socket, attachment.player, data.lineage);
			return;
		}

		if (data.type === 'ready') {
			await this.handleReady(socket, attachment.player);
			return;
		}

		if (data.type === 'move') {
			await this.handleMove(socket, attachment.player, data.moveId);
			return;
		}

		if (data.type === 'recover') await this.handleRecover(socket, attachment.player);
	}

	async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
		const attachment = socket.deserializeAttachment() as SocketAttachment | null;
		const state = await this.getState();

		if (attachment?.player && state.winner === null) {
			state.ready[attachment.player - 1] = false;
			state.started = false;
			state.phase = 'waiting';
			state.round = 0;
			state.roundFirstPlayer = null;
			state.initiativeWinner = null;
			state.lockedMoves = [null, null];
			state.lockedCosts = [null, null];
			this.addLog(state, `Player ${attachment.player} disconnected. Battle paused.`);
			await this.ctx.storage.put('state', state);
		}

		await this.broadcastState(state);
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

import { DurableObject } from 'cloudflare:workers';

type PlayerNumber = 1 | 2;

type MoveId = 'pulse-strike' | 'signal-burst';

interface MoveDefinition {
	id: MoveId;
	name: string;
	damage: number;
	energyCost: number;
	description: string;
}

interface CreatureState {
	name: string;
	lineage: string;
	hp: number;
	maxHp: number;
	energy: number;
	maxEnergy: number;
	moves: MoveId[];
	statuses: string[];
}

interface BattleState {
	version: 2;
	players: [CreatureState, CreatureState];
	ready: [boolean, boolean];
	started: boolean;
	turn: PlayerNumber | null;
	winner: PlayerNumber | null;
	log: string[];
}

interface SocketAttachment {
	player: PlayerNumber;
}

interface ClientMessage {
	type?: string;
	moveId?: string;
}

const MOVE_LIBRARY: Record<MoveId, MoveDefinition> = {
	'pulse-strike': {
		id: 'pulse-strike',
		name: 'Pulse Strike',
		damage: 12,
		energyCost: 0,
		description: 'Reliable test attack.',
	},
	'signal-burst': {
		id: 'signal-burst',
		name: 'Signal Burst',
		damage: 20,
		energyCost: 4,
		description: 'Stronger attack with an energy cost.',
	},
};

const STARTING_HP = 100;
const STARTING_ENERGY = 6;
const MAX_ENERGY = 10;
const ENERGY_RECOVERY_PER_TURN = 1;
const MAX_LOG_ENTRIES = 16;

function createCreature(player: PlayerNumber): CreatureState {
	return {
		name: `Test Creature ${player}`,
		lineage: player === 1 ? 'Husk' : 'Wisp',
		hp: STARTING_HP,
		maxHp: STARTING_HP,
		energy: STARTING_ENERGY,
		maxEnergy: MAX_ENERGY,
		moves: ['pulse-strike', 'signal-burst'],
		statuses: [],
	};
}

function createInitialState(): BattleState {
	return {
		version: 2,
		players: [createCreature(1), createCreature(2)],
		ready: [false, false],
		started: false,
		turn: null,
		winner: null,
		log: ['Battle room created.'],
	};
}

export class BattleRoom extends DurableObject<Env> {
	private async getState(): Promise<BattleState> {
		const storedState = await this.ctx.storage.get<BattleState | { version?: number }>('state');

		// Old v0.1 rooms used a different state shape. Reset those rooms cleanly.
		if (!storedState || storedState.version !== 2) {
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

			if (attachment?.player) {
				players.add(attachment.player);
			}
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

	private async saveAndBroadcast(state: BattleState) {
		await this.ctx.storage.put('state', state);
		await this.broadcastState(state);
	}

	private async broadcastState(existingState?: BattleState) {
		const state = existingState ?? (await this.getState());
		const connectedPlayers = this.getConnectedPlayers();

		const message = JSON.stringify({
			type: 'state',
			state,
			connectedPlayers,
			moveLibrary: MOVE_LIBRARY,
		});

		for (const socket of this.ctx.getWebSockets()) {
			socket.send(message);
		}
	}

	private bothPlayersConnected(): boolean {
		const connected = this.getConnectedPlayers();
		return connected.includes(1) && connected.includes(2);
	}

	private async handleReady(socket: WebSocket, player: PlayerNumber) {
		const state = await this.getState();

		if (state.winner !== null) {
			this.send(socket, {
				type: 'error',
				message: 'This battle is already over.',
			});
			return;
		}

		if (state.ready[player - 1]) {
			return;
		}

		state.ready[player - 1] = true;
		this.addLog(state, `Player ${player} is ready.`);

		if (state.ready[0] && state.ready[1] && this.bothPlayersConnected()) {
			state.started = true;
			state.turn = 1;
			this.addLog(state, 'Both players ready. Player 1 goes first.');
		}

		await this.saveAndBroadcast(state);
	}

	private async handleMove(socket: WebSocket, player: PlayerNumber, rawMoveId?: string) {
		if (!this.bothPlayersConnected()) {
			this.send(socket, {
				type: 'error',
				message: 'Waiting for another player.',
			});
			return;
		}

		const state = await this.getState();

		if (state.winner !== null) {
			this.send(socket, {
				type: 'error',
				message: 'This battle is already over.',
			});
			return;
		}

		if (!state.started || !state.ready[0] || !state.ready[1]) {
			this.send(socket, {
				type: 'error',
				message: 'Both players must be ready before battling.',
			});
			return;
		}

		if (state.turn !== player) {
			this.send(socket, {
				type: 'error',
				message: 'It is not your turn.',
			});
			return;
		}

		if (!rawMoveId || !(rawMoveId in MOVE_LIBRARY)) {
			this.send(socket, {
				type: 'error',
				message: 'Unknown move.',
			});
			return;
		}

		const moveId = rawMoveId as MoveId;
		const attacker = state.players[player - 1];

		if (!attacker.moves.includes(moveId)) {
			this.send(socket, {
				type: 'error',
				message: 'That creature does not know this move.',
			});
			return;
		}

		const move = MOVE_LIBRARY[moveId];

		if (attacker.energy < move.energyCost) {
			this.send(socket, {
				type: 'error',
				message: 'Not enough energy for that move.',
			});
			return;
		}

		const opponent: PlayerNumber = player === 1 ? 2 : 1;
		const defender = state.players[opponent - 1];

		attacker.energy -= move.energyCost;
		defender.hp = Math.max(0, defender.hp - move.damage);

		this.addLog(state, `Player ${player} used ${move.name} for ${move.damage} damage.`);

		if (defender.hp === 0) {
			state.winner = player;
			state.turn = null;
			this.addLog(state, `Player ${player} wins.`);
		} else {
			defender.energy = Math.min(defender.maxEnergy, defender.energy + ENERGY_RECOVERY_PER_TURN);
			state.turn = opponent;
		}

		await this.saveAndBroadcast(state);
	}

	async fetch(request: Request): Promise<Response> {
		if (request.headers.get('Upgrade') !== 'websocket') {
			return new Response('Expected WebSocket', {
				status: 426,
			});
		}

		const existingSockets = this.ctx.getWebSockets();

		if (existingSockets.length >= 2) {
			return new Response('Battle room is full', {
				status: 409,
			});
		}

		const connectedPlayers = this.getConnectedPlayers();
		const player: PlayerNumber = connectedPlayers.includes(1) ? 2 : 1;

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ player } satisfies SocketAttachment);

		const state = await this.getState();
		this.send(server, {
			type: 'welcome',
			player,
			state,
			connectedPlayers: this.getConnectedPlayers(),
			moveLibrary: MOVE_LIBRARY,
		});

		await this.broadcastState(state);

		return new Response(null, {
			status: 101,
			webSocket: client,
		});
	}

	async webSocketMessage(socket: WebSocket, message: ArrayBuffer | string) {
		if (typeof message !== 'string') {
			return;
		}

		const attachment = socket.deserializeAttachment() as SocketAttachment | null;

		if (!attachment?.player) {
			return;
		}

		let data: ClientMessage;

		try {
			data = JSON.parse(message) as ClientMessage;
		} catch {
			this.send(socket, {
				type: 'error',
				message: 'Invalid message.',
			});
			return;
		}

		if (data.type === 'ready') {
			await this.handleReady(socket, attachment.player);
			return;
		}

		if (data.type === 'move') {
			await this.handleMove(socket, attachment.player, data.moveId);
		}
	}

	async webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
		const attachment = socket.deserializeAttachment() as SocketAttachment | null;
		const state = await this.getState();

		if (attachment?.player && state.winner === null) {
			state.ready[attachment.player - 1] = false;
			state.started = false;
			state.turn = null;
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

	for (const byte of bytes) {
		code += alphabet[byte % alphabet.length];
	}

	return code;
}

export default {
	async fetch(request, env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === 'POST' && url.pathname === '/api/rooms') {
			return Response.json({
				code: generateRoomCode(),
			});
		}

		const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/ws$/);

		if (match) {
			const roomCode = match[1];
			const room = env.BATTLE_ROOM.getByName(roomCode);
			return room.fetch(request);
		}

		return Response.json(
			{
				error: 'Not found',
			},
			{
				status: 404,
			},
		);
	},
} satisfies ExportedHandler<Env>;

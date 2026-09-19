import { DurableObject } from 'cloudflare:workers';

type PlayerNumber = 1 | 2;

interface BattleState {
	hp: [number, number];
	winner: PlayerNumber | null;
}

interface SocketAttachment {
	player: PlayerNumber;
}

const STARTING_HP = 100;
const ATTACK_DAMAGE = 10;

export class BattleRoom extends DurableObject<Env> {
	private async getState(): Promise<BattleState> {
		let state = await this.ctx.storage.get<BattleState>('state');

		if (!state) {
			state = {
				hp: [STARTING_HP, STARTING_HP],
				winner: null,
			};

			await this.ctx.storage.put('state', state);
		}

		return state;
	}

	private getConnectedPlayers(): PlayerNumber[] {
		const players: PlayerNumber[] = [];

		for (const socket of this.ctx.getWebSockets()) {
			const attachment = socket.deserializeAttachment() as SocketAttachment | null;

			if (attachment?.player) {
				players.push(attachment.player);
			}
		}

		return players;
	}

	private send(socket: WebSocket, data: unknown) {
		socket.send(JSON.stringify(data));
	}

	private async broadcastState() {
		const state = await this.getState();
		const sockets = this.ctx.getWebSockets();

		const message = JSON.stringify({
			type: 'state',
			state,
			connected: sockets.length,
		});

		for (const socket of sockets) {
			socket.send(message);
		}
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

		let player: PlayerNumber;

		if (!connectedPlayers.includes(1)) {
			player = 1;
		} else {
			player = 2;
		}

		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);

		// Using ctx.acceptWebSocket enables Durable Object hibernation.
		this.ctx.acceptWebSocket(server);

		// Remember which player owns this socket even if the
		// Durable Object later hibernates and wakes back up.
		server.serializeAttachment({
			player,
		} satisfies SocketAttachment);

		const state = await this.getState();

		this.send(server, {
			type: 'welcome',
			player,
			state,
		});

		await this.broadcastState();

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

		let data: {
			type?: string;
		};

		try {
			data = JSON.parse(message);
		} catch {
			this.send(socket, {
				type: 'error',
				message: 'Invalid message.',
			});
			return;
		}

		if (data.type !== 'attack') {
			return;
		}

		if (this.ctx.getWebSockets().length < 2) {
			this.send(socket, {
				type: 'error',
				message: 'Waiting for another player.',
			});
			return;
		}

		const state = await this.getState();

		if (state.winner !== null) {
			return;
		}

		const player = attachment.player;
		const opponent: PlayerNumber = player === 1 ? 2 : 1;

		const opponentIndex = opponent - 1;

		state.hp[opponentIndex] = Math.max(0, state.hp[opponentIndex] - ATTACK_DAMAGE);

		if (state.hp[opponentIndex] === 0) {
			state.winner = player;
		}

		await this.ctx.storage.put('state', state);

		await this.broadcastState();
	}

	async webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean) {
		await this.broadcastState();
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

		/*
		 * Create a room.
		 *
		 * For now this simply generates the name that will be used
		 * for the room's Durable Object.
		 */
		if (request.method === 'POST' && url.pathname === '/api/rooms') {
			return Response.json({
				code: generateRoomCode(),
			});
		}

		/*
		 * WebSocket route:
		 *
		 * /api/rooms/ABC123/ws
		 */
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

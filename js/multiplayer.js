import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && !SUPABASE_URL.includes("YOUR-PROJECT");
}

const QUEUE_CHANNEL_NAME = "mathtetris-queue";
const QUEUE_ENTRY_TTL_MS = 120000;

export class Matchmaker {
  constructor() {
    this.client = isSupabaseConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
    this.authPromise = null;
    this.myId = Math.random().toString(36).slice(2, 10);
    this.queueChannel = null;
    this.lobbyChannel = null;
    this.directoryChannel = null;
    this.directoryPresence = { role: "browser" };
    this.onRoomsChanged = null;
    this.roomChannel = null;
    this.roomId = null;
    this.matched = false;
    this.onMatched = null;
    this.onRemoteState = null;
    this.onDisconnect = null;
    this.onReconnect = null;
    this.onCommand = null;
    this.queueJoinedAt = 0;
    this.roomOptions = {};
  }

  async ensureAuthenticated() {
    if (!this.client) throw new Error("Supabase 온라인 설정이 필요합니다.");
    if (!this.authPromise) {
      this.authPromise = (async () => {
        const { data: sessionData } = await this.client.auth.getSession();
        if (sessionData.session) return sessionData.session;
        const { data, error } = await this.client.auth.signInAnonymously();
        if (error || !data.session) throw new Error("멀티플레이 익명 인증에 실패했습니다. Supabase Anonymous Sign-Ins 설정을 확인하세요.");
        return data.session;
      })().catch((error) => {
        this.authPromise = null;
        throw error;
      });
    }
    return this.authPromise;
  }

  async createRoom(onMatched, playerName = "", roomOptions = {}) {
    await this.ensureAuthenticated();
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    this.roomOptions = { itemMode: Boolean(roomOptions.itemMode) };
    await this._joinRoomLobby(code, "host", onMatched, playerName, this.roomOptions);
    await this.setDirectoryPresence({
      role: "host",
      code,
      name: playerName,
      createdAt: Date.now(),
      status: "open",
      itemMode: this.roomOptions.itemMode,
    });
    return code;
  }

  async joinRoom(code, onMatched, playerName = "") {
    await this.ensureAuthenticated();
    const normalized = String(code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (normalized.length !== 6) throw new Error("6자리 방 코드를 입력하세요.");
    await this._joinRoomLobby(normalized, "guest", onMatched, playerName);
    return normalized;
  }

  async _joinRoomLobby(code, role, onMatched, playerName, roomOptions = {}) {
    if (!this.client) return;
    await this.ensureAuthenticated();
    this.leaveRoom();
    this.onMatched = onMatched;
    this.playerName = playerName;
    this.matched = false;
    const channel = this.client.channel(`mathtetris-lobby-${code}`, { config: { private: true, presence: { key: this.myId } } });
    this.lobbyChannel = channel;

    channel.on("broadcast", { event: "room_ready" }, ({ payload }) => {
      if (this.matched || !payload.pair.includes(this.myId)) return;
      this.matched = true;
      const opponentKey = payload.pair.find((id) => id !== this.myId);
      const opponent = {
        name: payload.players?.[opponentKey]?.name || "",
        roomOptions: payload.options || {},
      };
      setTimeout(() => this._enterRoom(payload.roomId, opponent), 120);
    });

    channel.on("presence", { event: "sync" }, async () => {
      if (role !== "host" || this.matched) return;
      const state = channel.presenceState();
      const entries = Object.keys(state).map((id) => ({ id, ...(state[id][0] || {}) }));
      const host = entries.find((entry) => entry.id === this.myId && entry.role === "host");
      const guest = entries.find((entry) => entry.id !== this.myId && entry.role === "guest");
      if (!host || !guest) return;
      this.matched = true;
      const roomId = `invite-${code}-${Date.now()}`;
      const pair = [host.id, guest.id];
      const players = {
        [host.id]: { name: host.name || playerName },
        [guest.id]: { name: guest.name || "" },
      };
      await channel.send({ type: "broadcast", event: "room_ready", payload: { roomId, pair, players, options: this.roomOptions } });
      setTimeout(() => this._enterRoom(roomId, {
        name: guest.name || "",
        roomOptions: this.roomOptions,
      }), 180);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ role, name: playerName, joinedAt: Date.now() });
    });
  }

  cancelRoomLobby() {
    if (this.lobbyChannel) {
      this.lobbyChannel.unsubscribe();
      this.lobbyChannel = null;
    }
  }

  async watchRooms(onRoomsChanged) {
    if (!this.client) return;
    await this.ensureAuthenticated();
    this.onRoomsChanged = onRoomsChanged;
    if (this.directoryChannel) {
      this.emitRoomList();
      return;
    }
    const channel = this.client.channel("mathtetris-room-directory", { config: { private: true, presence: { key: this.myId } } });
    this.directoryChannel = channel;
    channel.on("presence", { event: "sync" }, () => this.emitRoomList());
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track(this.directoryPresence);
    });
  }

  async setDirectoryPresence(presence) {
    await this.ensureAuthenticated();
    this.directoryPresence = presence;
    if (!this.directoryChannel) await this.watchRooms(this.onRoomsChanged || (() => {}));
    else this.directoryChannel.track(presence);
  }

  async updateRoomOptions(roomOptions = {}) {
    this.roomOptions = { ...this.roomOptions, itemMode: Boolean(roomOptions.itemMode) };
    if (this.directoryPresence.role === "host") {
      await this.setDirectoryPresence({ ...this.directoryPresence, itemMode: this.roomOptions.itemMode });
    }
  }

  roomList() {
    if (!this.directoryChannel) return [];
    const state = this.directoryChannel.presenceState();
    const now = Date.now();
    return Object.keys(state)
      .map((id) => ({ ownerId: id, ...(state[id][0] || {}) }))
      .filter((room) => room.role === "host" && room.status === "open" && room.code)
      .filter((room) => !room.createdAt || now - room.createdAt < QUEUE_ENTRY_TTL_MS)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  emitRoomList() {
    if (this.onRoomsChanged) this.onRoomsChanged(this.roomList());
  }

  cancelRoomDirectory() {
    if (this.directoryChannel) {
      this.directoryChannel.unsubscribe();
      this.directoryChannel = null;
    }
    this.directoryPresence = { role: "browser" };
    this.onRoomsChanged = null;
  }

  async joinQueue(onMatched, playerName = "") {
    if (!this.client) return;
    await this.ensureAuthenticated();
    this.cancelQueue();
    this.onMatched = onMatched;
    this.playerName = playerName;
    this.matched = false;
    this.queueJoinedAt = Date.now();
    const channel = this.client.channel(QUEUE_CHANNEL_NAME, { config: { private: true, presence: { key: this.myId } } });
    this.queueChannel = channel;

    channel.on("presence", { event: "sync" }, () => {
      this.tryPairFromQueue(channel);
    });

    channel.on("broadcast", { event: "matched" }, ({ payload }) => {
      if (this.matched || !payload.pair.includes(this.myId)) return;
      this.matched = true;
      this.markQueueMatched(payload.roomId);
      const opponentKey = payload.pair.find((id) => id !== this.myId);
      this._enterRoom(payload.roomId, {
        name: payload.names?.[opponentKey] || "",
      });
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ joinedAt: this.queueJoinedAt, status: "waiting", name: playerName });
    });
  }

  waitingEntries(channel) {
    const now = Date.now();
    const state = channel.presenceState();
    return Object.keys(state)
      .map((id) => {
        const presence = state[id][0] || {};
        return {
          id,
          joinedAt: presence.joinedAt || 0,
          status: presence.status || "waiting",
          name: presence.name || "",
        };
      })
      .filter((entry) => entry.status === "waiting")
      .filter((entry) => !entry.joinedAt || now - entry.joinedAt < QUEUE_ENTRY_TTL_MS)
      .sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
  }

  tryPairFromQueue(channel) {
    if (this.matched) return;
    const entries = this.waitingEntries(channel);
    for (let i = 0; i + 1 < entries.length; i += 2) {
      const pair = [entries[i], entries[i + 1]];
      if (this.myId !== pair[0].id) continue;
      const roomId = `${pair[0].id}_${pair[1].id}_${Date.now()}`;
      const names = { [pair[0].id]: pair[0].name, [pair[1].id]: pair[1].name };
      channel.send({ type: "broadcast", event: "matched", payload: { pair: pair.map((entry) => entry.id), roomId, names } });
      this.matched = true;
      this.markQueueMatched(roomId);
      setTimeout(() => this._enterRoom(roomId, { name: pair[1].name }), 0);
      return;
    }
  }

  markQueueMatched(roomId) {
    if (!this.queueChannel) return;
    this.queueChannel.track({ joinedAt: this.queueJoinedAt, status: "matched", roomId });
  }

  cancelQueue() {
    if (this.queueChannel) {
      this.queueChannel.unsubscribe();
      this.queueChannel = null;
    }
    this.queueJoinedAt = 0;
  }

  _enterRoom(roomId, opponent = {}) {
    this.cancelQueue();
    this.cancelRoomLobby();
    this.cancelRoomDirectory();
    this.roomId = roomId;
    const channel = this.client.channel(`mathtetris-room-${roomId}`, { config: { private: true, presence: { key: this.myId } } });
    this.roomChannel = channel;

    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      if (payload.id === this.myId) return;
      if (this.onRemoteState) this.onRemoteState(payload);
    });

    channel.on("broadcast", { event: "command" }, ({ payload }) => {
      if (payload.id === this.myId) return;
      if (this.onCommand) this.onCommand(payload.cmd, payload.data);
    });

    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      const opponentLeft = leftPresences.some((p) => p.id !== this.myId);
      if (opponentLeft && this.onDisconnect) this.onDisconnect();
    });

    channel.on("presence", { event: "join" }, ({ newPresences }) => {
      const opponentJoined = newPresences.some((p) => p.id !== this.myId);
      if (opponentJoined && this.onReconnect) this.onReconnect();
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ id: this.myId });
        if (this.onMatched) this.onMatched(opponent);
      }
    });
  }

  sendState(state) {
    if (!this.roomChannel) return;
    this.roomChannel.send({ type: "broadcast", event: "state", payload: { id: this.myId, ...state } });
  }

  sendCommand(cmd, data = {}) {
    if (!this.roomChannel) return;
    this.roomChannel.send({ type: "broadcast", event: "command", payload: { id: this.myId, cmd, data } });
  }

  leaveRoom() {
    this.cancelQueue();
    this.cancelRoomLobby();
    if (this.roomChannel) {
      this.roomChannel.unsubscribe();
      this.roomChannel = null;
    }
    this.roomId = null;
    this.matched = false;
  }

  connected() {
    return this.roomChannel !== null;
  }
}

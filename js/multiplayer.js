import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && !SUPABASE_URL.includes("YOUR-PROJECT");
}

const QUEUE_CHANNEL_NAME = "mathtetris-queue";
const QUEUE_ENTRY_TTL_MS = 120000;

export class Matchmaker {
  constructor() {
    this.client = isSupabaseConfigured() ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
    this.myId = Math.random().toString(36).slice(2, 10);
    this.queueChannel = null;
    this.roomChannel = null;
    this.roomId = null;
    this.matched = false;
    this.onMatched = null;
    this.onRemoteState = null;
    this.onDisconnect = null;
    this.onCommand = null;
    this.queueJoinedAt = 0;
  }

  joinQueue(onMatched, playerName = "") {
    if (!this.client) return;
    this.cancelQueue();
    this.onMatched = onMatched;
    this.playerName = playerName;
    this.matched = false;
    this.queueJoinedAt = Date.now();
    const channel = this.client.channel(QUEUE_CHANNEL_NAME, { config: { presence: { key: this.myId } } });
    this.queueChannel = channel;

    channel.on("presence", { event: "sync" }, () => {
      this.tryPairFromQueue(channel);
    });

    channel.on("broadcast", { event: "matched" }, ({ payload }) => {
      if (this.matched || !payload.pair.includes(this.myId)) return;
      this.matched = true;
      this.markQueueMatched(payload.roomId);
      const opponentName = payload.names?.[payload.pair.find((id) => id !== this.myId)] || "";
      this._enterRoom(payload.roomId, opponentName);
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
      const opponentName = pair[1].name;
      setTimeout(() => this._enterRoom(roomId, opponentName), 0);
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

  _enterRoom(roomId, opponentName = "") {
    this.cancelQueue();
    this.roomId = roomId;
    const channel = this.client.channel(`mathtetris-room-${roomId}`, { config: { presence: { key: this.myId } } });
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

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ id: this.myId });
        if (this.onMatched) this.onMatched(opponentName);
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

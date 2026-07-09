import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL) && Boolean(SUPABASE_ANON_KEY) && !SUPABASE_URL.includes("YOUR-PROJECT");
}

const QUEUE_CHANNEL_NAME = "mathtetris-queue";

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
  }

  joinQueue(onMatched) {
    if (!this.client) return;
    this.onMatched = onMatched;
    this.matched = false;
    const channel = this.client.channel(QUEUE_CHANNEL_NAME, { config: { presence: { key: this.myId } } });
    this.queueChannel = channel;

    channel.on("presence", { event: "sync" }, () => {
      if (this.matched) return;
      const state = channel.presenceState();
      const entries = Object.keys(state).map((id) => ({ id, joinedAt: state[id][0].joinedAt }));
      entries.sort((a, b) => a.joinedAt - b.joinedAt || a.id.localeCompare(b.id));
      if (entries.length >= 2) {
        const [a, b] = entries;
        if (this.myId === a.id) {
          const roomId = `${a.id}_${b.id}`;
          channel.send({ type: "broadcast", event: "matched", payload: { pair: [a.id, b.id], roomId } });
          this.matched = true;
          setTimeout(() => this._enterRoom(roomId), 0);
        }
      }
    });

    channel.on("broadcast", { event: "matched" }, ({ payload }) => {
      if (this.matched || !payload.pair.includes(this.myId)) return;
      this.matched = true;
      this._enterRoom(payload.roomId);
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") channel.track({ joinedAt: Date.now() });
    });
  }

  cancelQueue() {
    if (this.queueChannel) {
      this.queueChannel.unsubscribe();
      this.queueChannel = null;
    }
  }

  _enterRoom(roomId) {
    this.cancelQueue();
    this.roomId = roomId;
    const channel = this.client.channel(`mathtetris-room-${roomId}`, { config: { presence: { key: this.myId } } });
    this.roomChannel = channel;

    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      if (payload.id === this.myId) return;
      if (this.onRemoteState) this.onRemoteState(payload);
    });

    channel.on("presence", { event: "leave" }, ({ leftPresences }) => {
      const opponentLeft = leftPresences.some((p) => p.id !== this.myId);
      if (opponentLeft && this.onDisconnect) this.onDisconnect();
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        channel.track({ id: this.myId });
        if (this.onMatched) this.onMatched();
      }
    });
  }

  sendState(state) {
    if (!this.roomChannel) return;
    this.roomChannel.send({ type: "broadcast", event: "state", payload: { id: this.myId, ...state } });
  }

  leaveRoom() {
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

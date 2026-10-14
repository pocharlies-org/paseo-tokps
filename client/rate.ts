// The rate lives here and nowhere else: every agent_update snapshot passes through `apply`, which keeps per-agent
// turn state and publishes {live estimate while running, exact rate once the turn ends}. Views subscribe.
import type { PluginClientContext } from "@getpaseo/plugin/client";

type Paseo = PluginClientContext["paseo"];

// The fields this plugin reads from an agent snapshot, spelled out because the plugin client bundle may not import
// @getpaseo/client (runtime boundary); the snapshots arrive structurally.
type PaseoAgent = {
  id: string;
  workspaceId?: string | null;
  status: string;
  activeTurn?: { turnId: string; startedAt: string | null } | null;
  lastUsage?: { outputTokens?: number; contextWindowUsedTokens?: number } | null;
};

export type TurnRate = { rate: number; out: number; seconds: number };
export type AgentRate = { live: number | null; last: TurnRate | null };

const rates = new Map<string, AgentRate>();
const empty: AgentRate = { live: null, last: null }; // stable: views compare the snapshot by identity
const running = new Map<string, { turnId: string; startedMs: number; baseCtx: number | null }>();
const seen = new Map<string, string>(); // agentId -> workspaceId, so pills can be (re)registered
const listeners = new Set<() => void>();

export function rateOf(agentId: string): AgentRate {
  return rates.get(agentId) ?? empty;
}

export function agentWorkspace(agentId: string): string | null {
  return seen.get(agentId) ?? null;
}

export function ratedAgentIds(): string[] {
  return [...rates.keys()];
}

export function subscribeRates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

export function fmtRate(toksPerSecond: number): string {
  const n = toksPerSecond >= 1000 ? `${(toksPerSecond / 1000).toFixed(1)}k` : `${Math.round(toksPerSecond)}`;
  return `${n} tok/s`;
}

function apply(agent: PaseoAgent): void {
  seen.set(agent.id, agent.workspaceId ?? "");
  const ctx = agent.lastUsage?.contextWindowUsedTokens ?? null;
  if (agent.status === "running" && agent.activeTurn) {
    const turnId = agent.activeTurn.turnId;
    let state = running.get(agent.id);
    if (!state || state.turnId !== turnId) {
      state = {
        turnId,
        startedMs: agent.activeTurn.startedAt ? Date.parse(agent.activeTurn.startedAt) : Date.now(),
        baseCtx: ctx,
      };
      running.set(agent.id, state);
    } else if (ctx !== null && state.baseCtx !== null) {
      const secs = (Date.now() - state.startedMs) / 1000;
      // shortcut: while the turn runs the only growing counter is the context, which also counts tool results,
      // so the live figure is an upper bound (shown with ≈); the exact output rate arrives with the turn.
      if (secs > 2) rates.set(agent.id, { live: Math.max(0, (ctx - state.baseCtx) / secs), last: rates.get(agent.id)?.last ?? null });
    }
    notify();
    return;
  }
  // shortcut: the end instant is when the idle snapshot arrives here, not when the turn closed: a few seconds of
  // slack on short turns. The provider only reports outputTokens on turn_completed.
  const state = running.get(agent.id);
  const out = agent.lastUsage?.outputTokens;
  if (state && out !== undefined && out > 0) {
    const seconds = Math.max(0.5, (Date.now() - state.startedMs) / 1000);
    rates.set(agent.id, { live: null, last: { rate: out / seconds, out, seconds } });
    running.delete(agent.id);
    notify();
  }
}

export function startRates(paseo: Paseo): () => void {
  const off = paseo.agents.subscribe((update) => {
    if (update.kind === "upsert") apply(update.agent);
  });
  paseo.agents.list().then(
    (result) => {
      for (const entry of result.entries) seen.set(entry.agent.id, entry.agent.workspaceId ?? "");
    },
    () => {},
  );
  return off;
}

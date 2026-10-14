import type { PluginClientContext, PluginButtonRegistration } from "@getpaseo/plugin/client";
import { ThinkingRow, thinkingSchema } from "./client/thinking.tsx";
import { agentWorkspace, fmtRate, rateOf, seenAgentIds, startRates, subscribeRates } from "./client/rate.ts";

// Two views over one store (client/rate.ts): the thinking row in the transcript carries the rate of its turn, and a
// composer pill keeps the live figure visible while the agent runs. The pill is registered per agent the first time
// this client sees it; Paseo gives no "current agent" hook to plugins.
export default function contribute(client: PluginClientContext) {
  const stopRates = startRates(client.paseo);

  client.addTimelineTransformer({
    id: "tokps-thinking",
    query: { itemType: "reasoning" },
    transform: ({ item }) => ({
      items: [{ type: "plugin", kind: "tokps-thinking", version: 1, data: { text: item.text } }],
    }),
  });
  client.addTimelineRenderer({ kind: "tokps-thinking", version: 1, schema: thinkingSchema, Component: ThinkingRow });

  const pills = new Map<string, PluginButtonRegistration>();
  const refreshPills = () => {
    for (const agentId of seenAgentIds()) {
      const workspaceId = agentWorkspace(agentId);
      if (!workspaceId) continue;
      let pill = pills.get(agentId);
      if (!pill) {
        pill = client.addComposerPill({
          id: `tokps-${agentId}`,
          workspaceId,
          agentId,
          button: {
            title: "Tokens por segundo",
            icon: "Gauge",
            label: "—",
            visible: false,
            behavior: { kind: "action", onPress: () => {} },
          },
        });
        pills.set(agentId, pill);
      }
      const rate = rateOf(agentId);
      const label = rate.live !== null ? `≈${fmtRate(rate.live)}` : rate.last !== null ? fmtRate(rate.last.rate) : "—";
      pill.update({ label, visible: rate.live !== null || rate.last !== null });
    }
  };
  const off = subscribeRates(refreshPills);
  refreshPills();

  return () => {
    off();
    stopRates();
    for (const pill of pills.values()) pill.remove();
    pills.clear();
  };
}

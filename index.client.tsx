import type { PluginClientContext, PluginButtonRegistration } from "@getpaseo/plugin/client";
import { ThinkingRow, thinkingSchema } from "./client/thinking.tsx";
import { agentWorkspace, fmtRate, rateOf, ratedAgentIds, startRates, subscribeRates } from "./client/rate.ts";

// Two views over one store (client/rate.ts): the thinking row in the transcript carries the rate of its turn, and a
// composer pill keeps the live figure visible while the agent runs. The pill appears only for agents whose turn this
// client actually watched (Paseo gives no "current agent" hook, and registering one per known agent is too heavy).
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
    for (const agentId of ratedAgentIds()) {
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
            behavior: { kind: "action", onPress: () => {} },
          },
        });
        pills.set(agentId, pill);
      }
      const rate = rateOf(agentId);
      const label = rate.live !== null ? `≈${fmtRate(rate.live)}` : rate.last !== null ? fmtRate(rate.last.rate) : "—";
      pill.update({ label });
    }
  };
  const off = subscribeRates(refreshPills);

  return () => {
    off();
    stopRates();
    for (const pill of pills.values()) pill.remove();
    pills.clear();
  };
}

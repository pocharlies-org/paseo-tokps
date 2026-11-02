import type {
  PluginButtonContentProps,
  PluginButtonIconProps,
  PluginButtonRegistration,
  PluginClientContext,
} from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { ThinkingRow, thinkingSchema } from "./client/thinking.tsx";
import { agentWorkspace, fmtRate, rateOf, ratedAgentIds, startRates, subscribeRates } from "./client/rate.ts";

// Two views over one store (client/rate.ts): the thinking row in the transcript carries the rate of its turn, and a
// composer pill keeps the live figure visible while the agent runs. The pill appears only for agents whose turn this
// client actually watched (Paseo gives no "current agent" hook, and registering one per known agent is too heavy).
//
// On a compact layout (the phone) the row of chips has no room for the label — it does not wrap (Dani 02-11: «en el
// móvil acaban amontonados»): there the pill keeps only the gauge and the figure moves into its popover, which is also what
// the pill opens on desktop when you want the exact number. The host hands `layout.compact` to components only, never to the
// registration, so the icon reports it and the label is blanked from there.
// shortcut: the first paint uses the wide label until the icon reports the layout; upgrade when the SDK exposes layout at registration.
function rateLabel(agentId: string): string {
  const rate = rateOf(agentId);
  if (rate.live !== null) return `≈${fmtRate(rate.live)}`;
  return rate.last !== null ? fmtRate(rate.last.rate) : "—";
}

function RatePopover(props: PluginButtonContentProps) {
  const [, tick] = useState(0); // the figure keeps moving while the popover is open: repaint on every published rate
  useEffect(() => subscribeRates(() => tick((n) => n + 1)), []);
  const agentId = props.context === "agent" ? props.agentId : "";
  return <Text style={{ color: props.theme.colors.foreground, fontSize: 13, minWidth: 96 }}>{rateLabel(agentId)}</Text>;
}

function makeGauge(reportCompact: (compact: boolean) => void) {
  return function GaugeIcon(props: PluginButtonIconProps) {
    const compact = props.layout.compact;
    useEffect(() => {
      reportCompact(compact);
    }, [compact]);
    return <Icon name="Gauge" size={props.size} color={props.color} />;
  };
}

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

  type Pill = { reg: PluginButtonRegistration; compact: boolean; label: string };
  const pills = new Map<string, Pill>();

  const show = (pill: Pill, agentId: string) => {
    const label = pill.compact ? "" : rateLabel(agentId);
    if (label === pill.label) return;
    pill.label = label;
    pill.reg.update({ label });
  };

  const refreshPills = () => {
    for (const agentId of ratedAgentIds()) {
      const workspaceId = agentWorkspace(agentId);
      if (!workspaceId) continue;
      const pill = pills.get(agentId);
      if (!pill) {
        const fresh: Pill = { reg: undefined as unknown as PluginButtonRegistration, compact: false, label: "" };
        fresh.reg = client.addComposerPill({
          id: `tokps-${agentId}`,
          workspaceId,
          agentId,
          button: {
            title: "Tokens por segundo",
            icon: makeGauge((compact) => {
              if (fresh.compact === compact) return;
              fresh.compact = compact;
              show(fresh, agentId);
            }),
            label: rateLabel(agentId),
            behavior: { kind: "popover", Content: RatePopover },
          },
        });
        fresh.label = rateLabel(agentId);
        pills.set(agentId, fresh);
        continue;
      }
      show(pill, agentId);
    }
  };
  const off = subscribeRates(refreshPills);

  return () => {
    off();
    stopRates();
    for (const pill of pills.values()) pill.reg.remove();
    pills.clear();
  };
}

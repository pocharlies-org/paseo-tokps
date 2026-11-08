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
// On a compact layout (the phone) the row of chips does not fit and the host squeezes plugin pills below their icon (Dani
// 08-11: «se ve cortado»; 02-11: «en el móvil acaban amontonados»): there the pill is hidden — it has nothing to warn about —
// and the figure stays in the thinking row. The host hands `layout.compact` to components only, never to the registration,
// so the gauge and the thinking row report it.
// shortcut: the first paint shows the pill until a component reports the layout; upgrade when the SDK exposes layout at registration.
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

function makeThinkingRow(reportCompact: (compact: boolean) => void) {
  return function ReportingThinkingRow(props: Parameters<typeof ThinkingRow>[0]) {
    const compact = props.layout.compact;
    useEffect(() => {
      reportCompact(compact);
    }, [compact]);
    return <ThinkingRow {...props} />;
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
  type Pill = { reg: PluginButtonRegistration; label: string; visible: boolean };
  const pills = new Map<string, Pill>();
  let compact = false;

  const show = (pill: Pill, agentId: string) => {
    const label = rateLabel(agentId);
    const visible = !compact;
    if (label === pill.label && visible === pill.visible) return;
    pill.label = label;
    pill.visible = visible;
    pill.reg.update({ label, visible });
  };
  const reportCompact = (next: boolean) => {
    if (compact === next) return;
    compact = next;
    for (const [agentId, pill] of pills) show(pill, agentId);
  };

  client.addTimelineRenderer({ kind: "tokps-thinking", version: 1, schema: thinkingSchema, Component: makeThinkingRow(reportCompact) });

  const refreshPills = () => {
    for (const agentId of ratedAgentIds()) {
      const workspaceId = agentWorkspace(agentId);
      if (!workspaceId) continue;
      const pill = pills.get(agentId);
      if (!pill) {
        const label = rateLabel(agentId);
        const reg = client.addComposerPill({
          id: `tokps-${agentId}`,
          workspaceId,
          agentId,
          button: {
            title: "Tokens por segundo",
            icon: makeGauge(reportCompact),
            label,
            visible: !compact,
            behavior: { kind: "popover", Content: RatePopover },
          },
        });
        pills.set(agentId, { reg, label, visible: !compact });
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

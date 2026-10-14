import { useState, useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { z } from "zod";
import { fmtRate, rateOf, subscribeRates } from "./rate.ts";

// CONTRACT: paseo-tokps.thinking.v1 — a reasoning item rewritten for display: the thinking text, collapsed, plus the
// rate of the turn it belongs to. A new shape enters as .v2 and v1 keeps rendering.
export const thinkingSchema = z.object({ text: z.string() });

export function ThinkingRow({ item, agentId, theme }: PluginTimelineItemProps<z.output<typeof thinkingSchema>>) {
  const [open, setOpen] = useState(false);
  const rate = useSyncExternalStore(subscribeRates, () => rateOf(agentId));
  const label = rate.live !== null ? `≈${fmtRate(rate.live)}` : rate.last !== null ? fmtRate(rate.last.rate) : null;
  return (
    <View style={{ paddingVertical: 2 }}>
      <Pressable accessibilityRole="button" onPress={() => setOpen((value) => !value)}>
        <Text style={{ color: theme.colors.foregroundMuted }}>
          {open ? "▾" : "▸"} Thinking{label ? ` · ${label}` : ""}
        </Text>
      </Pressable>
      {open && <Text style={{ color: theme.colors.foregroundMuted, marginTop: 2 }}>{item.data.text}</Text>}
    </View>
  );
}

import type { PluginServerContext } from "@getpaseo/plugin/server";

// Empty on purpose: the host only ships a plugin's client bundle when the plugin also registers server-side, and this
// plugin needs no server half (everything comes from the agent snapshots the client receives).
export default function contribute(_server: PluginServerContext) {
  return () => {};
}

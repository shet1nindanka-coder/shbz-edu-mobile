// Ported 1:1 from the site (lib/developer-panel-tabs.ts) — only the imports differ. Re-port instead of hand-editing;
// anything the app changes on purpose is marked [MOBILE].
/*
 * Вкладки панели разработчика — общий список для клиентского таббара самой
 * панели и серверного таббара страницы журнала (/teacher/panel/journal):
 * журнал живёт на своём URL из-за фильтров и пагинации в адресе, но визуально
 * остаётся вкладкой той же панели.
 */

import type { Dictionary } from "@/lib/i18n";

export type DeveloperPanelTab = "status" | "actions" | "broadcast" | "settings";

export const DEVELOPER_PANEL_TAB_KEYS: DeveloperPanelTab[] = ["status", "actions", "broadcast", "settings"];

/** Вкладки с подписями на языке интерфейса (`labels` — dict.planner.devPanel.tabs). */
export function developerPanelTabs(
  labels: Dictionary["planner"]["devPanel"]["tabs"]
): { key: DeveloperPanelTab; label: string }[] {
  return DEVELOPER_PANEL_TAB_KEYS.map((key) => ({ key, label: labels[key] }));
}

export function parseDeveloperPanelTab(raw: string | undefined): DeveloperPanelTab {
  return DEVELOPER_PANEL_TAB_KEYS.some((key) => key === raw) ? (raw as DeveloperPanelTab) : "status";
}

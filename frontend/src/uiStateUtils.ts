export const TOKEN_STORAGE_KEY = "dms.auth.token";
export const LISTS_PANEL_WIDTH_STORAGE_KEY = "dms.ui.listsPanelWidth";
export const RAIL_PANEL_WIDTH_STORAGE_KEY = "dms.ui.railPanelWidth";
export const LISTS_PANEL_OPEN_STORAGE_KEY = "dms.ui.listsPanelOpen";
export const CENTER_PANEL_OPEN_STORAGE_KEY = "dms.ui.centerPanelOpen";
export const LISTS_PANEL_MIN_WIDTH = 280;
export const CANVAS_MIN_MAIN_WIDTH = 260;
export const RAIL_PANEL_MIN_WIDTH = 360;
export const SHELL_MIN_MAIN_WIDTH = 0;

export function getRailPanelMaxWidth(shellWidth: number) {
  return Math.max(RAIL_PANEL_MIN_WIDTH, shellWidth - 24 - SHELL_MIN_MAIN_WIDTH);
}

export function getListsPanelMaxWidth(canvasWidth: number) {
  return Math.max(LISTS_PANEL_MIN_WIDTH, canvasWidth - CANVAS_MIN_MAIN_WIDTH);
}

export function clampPanelWidth(nextWidth: number, minWidth: number, maxWidth: number) {
  return Math.min(Math.max(nextWidth, minWidth), maxWidth);
}

export function readStoredPanelWidth(storageValue: string | null, minWidth: number, fallback: number) {
  const storedWidth = Number(storageValue);

  if (Number.isFinite(storedWidth) && storedWidth >= minWidth) {
    return storedWidth;
  }

  return fallback;
}

export function readStoredOpenState(storageValue: string | null, fallback: boolean) {
  return storageValue === null ? fallback : storageValue === "true";
}

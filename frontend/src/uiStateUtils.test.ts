import { describe, expect, it } from "vitest";

import {
  LISTS_PANEL_MIN_WIDTH,
  RAIL_PANEL_MIN_WIDTH,
  clampPanelWidth,
  getListsPanelMaxWidth,
  getRailPanelMaxWidth,
  readStoredOpenState,
  readStoredPanelWidth,
} from "./uiStateUtils";

describe("uiStateUtils", () => {
  it("readStoredPanelWidth usa el valor guardado cuando es válido", () => {
    expect(readStoredPanelWidth("420", RAIL_PANEL_MIN_WIDTH, 360)).toBe(420);
  });

  it("readStoredPanelWidth cae al fallback con valores inválidos o menores al mínimo", () => {
    expect(readStoredPanelWidth("texto", RAIL_PANEL_MIN_WIDTH, 360)).toBe(360);
    expect(readStoredPanelWidth("200", RAIL_PANEL_MIN_WIDTH, 360)).toBe(360);
    expect(readStoredPanelWidth(null, LISTS_PANEL_MIN_WIDTH, 320)).toBe(320);
  });

  it("readStoredOpenState interpreta booleanos persistidos y fallback", () => {
    expect(readStoredOpenState("true", false)).toBe(true);
    expect(readStoredOpenState("false", true)).toBe(false);
    expect(readStoredOpenState(null, true)).toBe(true);
  });

  it("getRailPanelMaxWidth y getListsPanelMaxWidth respetan mínimos del layout", () => {
    expect(getRailPanelMaxWidth(300)).toBe(RAIL_PANEL_MIN_WIDTH);
    expect(getRailPanelMaxWidth(900)).toBe(876);
    expect(getListsPanelMaxWidth(400)).toBe(LISTS_PANEL_MIN_WIDTH);
    expect(getListsPanelMaxWidth(900)).toBe(640);
  });

  it("clampPanelWidth limita por mínimo y máximo", () => {
    expect(clampPanelWidth(100, 280, 640)).toBe(280);
    expect(clampPanelWidth(480, 280, 640)).toBe(480);
    expect(clampPanelWidth(900, 280, 640)).toBe(640);
  });
});

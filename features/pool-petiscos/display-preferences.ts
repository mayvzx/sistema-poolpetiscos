export type ThemeMode = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemeMode, "system">;

export type DisplayPreferences = {
  fontScale: number;
  themeMode: ThemeMode;
};

export const DISPLAY_PREFERENCES_KEY =
  "pool-petiscos-preferencias-visuais-v1";
export const MIN_FONT_SCALE = 90;
export const MAX_FONT_SCALE = 135;
export const FONT_SCALE_STEP = 5;
export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  fontScale: 100,
  themeMode: "system",
};

export function parseDisplayPreferences(
  value: unknown,
): DisplayPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.fontScale !== "number" ||
    !Number.isInteger(candidate.fontScale) ||
    candidate.fontScale < MIN_FONT_SCALE ||
    candidate.fontScale > MAX_FONT_SCALE ||
    candidate.fontScale % FONT_SCALE_STEP !== 0 ||
    (candidate.themeMode !== "system" &&
      candidate.themeMode !== "light" &&
      candidate.themeMode !== "dark")
  ) {
    return null;
  }
  return {
    fontScale: candidate.fontScale,
    themeMode: candidate.themeMode,
  };
}

export function loadDisplayPreferences(): DisplayPreferences {
  try {
    const saved = window.localStorage.getItem(DISPLAY_PREFERENCES_KEY);
    if (!saved) return DEFAULT_DISPLAY_PREFERENCES;
    return (
      parseDisplayPreferences(JSON.parse(saved)) ??
      DEFAULT_DISPLAY_PREFERENCES
    );
  } catch {
    return DEFAULT_DISPLAY_PREFERENCES;
  }
}

export function saveDisplayPreferences(preferences: DisplayPreferences) {
  try {
    window.localStorage.setItem(
      DISPLAY_PREFERENCES_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // A preferência continua aplicada na sessão mesmo com storage bloqueado.
  }
}

export function resolveTheme(
  mode: ThemeMode,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (mode === "system") return systemPrefersDark ? "dark" : "light";
  return mode;
}


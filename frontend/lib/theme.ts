export const MODES = ["light", "dark", "system"] as const;
export const RADII = ["none", "sm", "md", "lg", "xl"] as const;
export const FONTS = ["jetbrains-mono", "geist", "inter", "space-grotesk", "playfair", "lora"] as const;

export type Mode = (typeof MODES)[number];
export type Radius = (typeof RADII)[number];
export type Font = (typeof FONTS)[number];
export interface ThemePrefs {
  mode: Mode;
  radius: Radius;
  font: Font;
  headingFont: Font;
}

export const THEME_COOKIE = "pabbar_theme";
export const DEFAULT_THEME: ThemePrefs = { mode: "system", radius: "md", font: "inter", headingFont: "inter" };

export const FONT_LABELS: Record<Font, string> = {
  "jetbrains-mono": "JetBrains Mono",
  geist: "Geist",
  inter: "Inter",
  "space-grotesk": "Space Grotesk",
  playfair: "Playfair Display",
  lora: "Lora",
};
/** CSS variable registered by next/font in app/layout.tsx. */
export const FONT_VARS: Record<Font, string> = {
  "jetbrains-mono": "var(--font-mono)",
  geist: "var(--font-geist-sans)",
  inter: "var(--font-inter)",
  "space-grotesk": "var(--font-space-grotesk)",
  playfair: "var(--font-playfair)",
  lora: "var(--font-lora)",
};

export const PRESETS: { name: string; description: string; prefs: Omit<ThemePrefs, "mode"> }[] = [
  { name: "Default", description: "Clean, medium radius", prefs: { radius: "md", font: "inter", headingFont: "inter" } },
  { name: "Soft", description: "Rounded, friendly", prefs: { radius: "xl", font: "inter", headingFont: "inter" } },
  { name: "Mono", description: "Sharp, monospaced", prefs: { radius: "none", font: "jetbrains-mono", headingFont: "jetbrains-mono" } },
  { name: "Editorial", description: "Serif reading feel", prefs: { radius: "sm", font: "lora", headingFont: "playfair" } },
  { name: "Technical", description: "Geometric headings", prefs: { radius: "none", font: "inter", headingFont: "space-grotesk" } },
];

const has = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === "string" && (list as readonly string[]).includes(v);

/** Cookie / share-code body: `<mode>.<radius>.<font>.<headingFont>`; null if malformed. */
export function decodeTheme(raw: string | undefined | null): ThemePrefs | null {
  if (!raw || raw.length > 100) return null;
  const [mode, radius, font, headingFont, extra] = raw.split(".");
  if (extra !== undefined || !has(MODES, mode) || !has(RADII, radius) || !has(FONTS, font) || !has(FONTS, headingFont)) {
    return null;
  }
  return { mode, radius, font, headingFont };
}

export const encodeTheme = (p: ThemePrefs) => `${p.mode}.${p.radius}.${p.font}.${p.headingFont}`;

export function shuffleTheme(mode: Mode): ThemePrefs {
  const pick = <T,>(l: readonly T[]) => l[Math.floor(Math.random() * l.length)];
  return { mode, radius: pick(RADII), font: pick(FONTS), headingFont: pick(FONTS) };
}

const isDark = (mode: Mode) => mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);

/** Applies prefs to <html> and persists them in a 1-year cookie. */
export function applyTheme(p: ThemePrefs) {
  const el = document.documentElement;
  const dark = isDark(p.mode);
  const update = () => {
    el.dataset.radius = p.radius;
    el.dataset.font = p.font;
    el.dataset.headingFont = p.headingFont;
    el.classList.toggle("dark", dark);
  };
  if (dark !== el.classList.contains("dark") && "startViewTransition" in document) document.startViewTransition(update);
  else update();
  document.cookie = `${THEME_COOKIE}=${encodeURIComponent(encodeTheme(p))}; path=/; max-age=31536000; samesite=lax`;
}

export function resetTheme() {
  applyTheme(DEFAULT_THEME);
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/** Inline script run before first paint: applies cookie prefs (legacy localStorage "theme" as fallback). */
export const themeScript = `(function(){try{var R=${JSON.stringify(RADII)},F=${JSON.stringify(FONTS)},M=${JSON.stringify(MODES)};var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/);var p=m?decodeURIComponent(m[1]).split("."):[];var e=document.documentElement;var mode=M.indexOf(p[0])>-1?p[0]:null;if(!mode){var t=localStorage.getItem("theme");mode=t==="dark"||t==="light"?t:"system"}if(R.indexOf(p[1])>-1)e.dataset.radius=p[1];else e.dataset.radius="md";e.dataset.font=F.indexOf(p[2])>-1?p[2]:"inter";e.dataset.headingFont=F.indexOf(p[3])>-1?p[3]:"inter";if(mode==="dark"||(mode==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))e.classList.add("dark")}catch(x){}})()`;

"use client";

import { useState } from "react";
import { MoonIcon, MonitorIcon, SunIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  FONTS,
  FONT_LABELS,
  FONT_VARS,
  PRESETS,
  RADII,
  applyTheme,
  resetTheme,
  shuffleTheme,
  DEFAULT_THEME,
  type Font,
  type Mode,
  type Radius,
  type ThemePrefs,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const MODE_OPTIONS: { value: Mode; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];
const RADIUS_LABELS: Record<Radius, string> = { none: "None", sm: "Small", md: "Medium", lg: "Large", xl: "XL" };

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}

function FontSelect({ label, value: raw, onChange }: { label: string; value?: Font; onChange: (f: Font) => void }) {
  // Always a defined string so the Select stays controlled for its whole life.
  const value = raw ?? DEFAULT_THEME.font;
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v as Font)}>
        <SelectTrigger className="w-full" style={{ fontFamily: FONT_VARS[value] }}>
          <SelectValue>{FONT_LABELS[value]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {FONTS.map((f) => (
            <SelectItem key={f} value={f} style={{ fontFamily: FONT_VARS[f] }}>
              {FONT_LABELS[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ThemeSettings({ initial }: { initial: ThemePrefs }) {
  // `initial` comes from the cookie, which the pre-paint script already applied.
  const [prefs, setPrefs] = useState<ThemePrefs>(initial);

  const set = (next: ThemePrefs) => {
    setPrefs(next);
    applyTheme(next);
  };
  const update = (patch: Partial<ThemePrefs>) => set({ ...prefs, ...patch });

  const activePreset = PRESETS.find(
    (p) => p.prefs.radius === prefs.radius && p.prefs.font === prefs.font && p.prefs.headingFont === prefs.headingFont,
  );

  return (
    <div className="flex flex-col gap-4">
      <Section title="Theme" description="Light, dark, or follow your system.">
        <ToggleGroup variant="outline" value={[prefs.mode]} onValueChange={(v) => v[0] && update({ mode: v[0] as Mode })}>
          {MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
            <ToggleGroupItem key={value} value={value} aria-label={label}>
              <Icon /> {label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Presets" description="Start from a ready-made combination of radius and typography.">
        <div className="grid gap-2 sm:grid-cols-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              aria-pressed={activePreset?.name === p.name}
              onClick={() => update(p.prefs)}
              className={cn(
                "flex flex-col items-start gap-0.5 border p-3 text-left transition-colors hover:bg-muted",
                activePreset?.name === p.name && "border-primary ring-1 ring-primary",
              )}
            >
              <span className="font-medium" style={{ fontFamily: FONT_VARS[p.prefs.headingFont] }}>
                {p.name}
              </span>
              <span className="text-muted-foreground" style={{ fontFamily: FONT_VARS[p.prefs.font] }}>
                {p.description}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => set(shuffleTheme(prefs.mode))}>
            Shuffle
          </Button>
        </div>
      </Section>

      <Section title="Radius" description="How rounded corners are across the app.">
        <ToggleGroup variant="outline" value={[prefs.radius]} onValueChange={(v) => v[0] && update({ radius: v[0] as Radius })}>
          {RADII.map((r) => (
            <ToggleGroupItem key={r} value={r}>
              {RADIUS_LABELS[r]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Section>

      <Section title="Typography" description="Fonts load only when you pick them.">
        <div className="flex flex-col gap-3 sm:flex-row">
          <FontSelect label="Heading font" value={prefs.headingFont} onChange={(f) => update({ headingFont: f })} />
          <FontSelect label="Body font" value={prefs.font} onChange={(f) => update({ font: f })} />
        </div>
      </Section>

      <div>
        <Button
          variant="outline"
          onClick={() => {
            setPrefs(DEFAULT_THEME);
            resetTheme();
          }}
        >
          Reset to default
        </Button>
      </div>
    </div>
  );
}

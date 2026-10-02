import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ThemeSettings } from "@/components/theme/theme-settings";
import { DEFAULT_THEME, THEME_COOKIE, decodeTheme } from "@/lib/theme";

export const metadata: Metadata = { title: "Appearance settings" };

export default async function AppearancePage() {
  const initial = decodeTheme((await cookies()).get(THEME_COOKIE)?.value) ?? DEFAULT_THEME;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Appearance</h3>
        <p className="text-muted-foreground">Customize the look of the app. Saved on this device.</p>
      </div>
      <ThemeSettings initial={initial} />
    </section>
  );
}

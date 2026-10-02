import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 p-2 md:p-4">
      <div>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-muted-foreground">Manage your profile and account settings</p>
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:gap-12">
        <SettingsNav />
        <div className="w-full max-w-[650px] min-w-0">{children}</div>
      </div>
    </div>
  );
}

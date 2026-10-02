import type { Metadata } from "next";
import { SessionsCard } from "@/components/settings/sessions-card";
import { getSessions } from "@/lib/session";

export const metadata: Metadata = { title: "Security settings" };

export default async function SecurityPage() {
  const page = await getSessions();

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h3 className="text-sm font-medium">Security</h3>
        <p className="mt-1 text-muted-foreground">
          You sign in with a one-time code or a connected account, so there is no password to manage.
          Review the browsers signed in to your account below and log out of any you do not recognise.
        </p>
      </section>
      <SessionsCard initial={page?.sessions ?? []} initialCursor={page?.nextCursor ?? null} />
    </div>
  );
}

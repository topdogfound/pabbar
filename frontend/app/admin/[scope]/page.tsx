import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader, formatStat } from "@/components/admin/display";
import { NoAccess } from "@/components/admin/no-access";
import { RecentActivity } from "@/components/admin/recent-activity";
import type { Overview, ScopeContext } from "@/lib/admin-api";
import { adminGet } from "@/lib/admin-server";

export const metadata: Metadata = { title: "Overview" };

const ORG_STATS = [
  ["members", "Members"],
  ["pendingInvites", "Pending invitations"],
  ["activeSessions", "Active sessions"],
  ["adminChanges7d", "Admin changes, 7 days"],
] as const;

const PLATFORM_STATS = [
  ["users", "Users"],
  ["orgs", "Organizations"],
  ["activeSessions", "Active sessions"],
  ["adminChanges7d", "Admin changes, 7 days"],
] as const;

export default async function OverviewPage({ params }: { params: Promise<{ scope: string }> }) {
  const { scope } = await params;
  const [overview, context] = await Promise.all([
    adminGet<Overview>(`/admin/${scope}/overview`),
    adminGet<ScopeContext>(`/admin/${scope}/context`),
  ]);
  if (!overview.ok) return overview.status === 403 ? <NoAccess permission="admin:access" /> : notFound();

  const stats = scope === "platform" ? PLATFORM_STATS : ORG_STATS;
  const canAudit = context.ok && context.data.permissions.includes("audit:read");

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          scope === "platform"
            ? "Everything on the platform at a glance."
            : "Who is in this organization and what changed recently."
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([key, label]) => (
          <div key={key} className="rounded-lg border p-4">
            <p className="text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {overview.data.stats[key] ? formatStat(overview.data.stats[key]) : "–"}
            </p>
          </div>
        ))}
      </div>
      {overview.data.recent ? (
        <RecentActivity events={overview.data.recent} auditHref={canAudit ? `/admin/${scope}/audit` : undefined} />
      ) : (
        <p className="rounded-lg border p-4 text-muted-foreground">
          Recent activity is hidden: your role does not include <code className="font-mono">audit:read</code>.
        </p>
      )}
    </>
  );
}

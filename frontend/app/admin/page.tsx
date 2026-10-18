import { notFound, redirect } from "next/navigation";
import { defaultScope, getAdminSummary } from "@/lib/admin-server";

export default async function AdminIndex() {
  const summary = await getAdminSummary();
  const scope = summary && defaultScope(summary);
  if (!scope) {
    // Browse-only operators land on the org directory.
    if (summary?.canBrowseOrgs) redirect("/admin/platform/orgs");
    notFound();
  }
  redirect(`/admin/${scope}`);
}

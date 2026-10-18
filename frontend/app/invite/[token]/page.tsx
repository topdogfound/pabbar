import type { Metadata } from "next";
import { BuildingsIcon } from "@phosphor-icons/react/ssr";
import { AcceptInvite } from "@/components/admin/accept-invite";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Invitation" };

interface Preview {
  orgName: string;
  email: string;
  roleName: string;
  status: "pending" | "accepted" | "revoked" | "expired" | "unavailable";
}

const PROBLEMS: Record<Exclude<Preview["status"], "pending">, string> = {
  accepted: "This invitation has already been used.",
  revoked: "This invitation was withdrawn by the organization.",
  expired: "This invitation has expired. Ask the organization to send a new one.",
  unavailable: "This organization is not accepting members right now.",
};

async function getPreview(token: string): Promise<Preview | null> {
  const backend = process.env.BACKEND_URL ?? "http://localhost:4711";
  try {
    const res = await fetch(`${backend}/invitations/${encodeURIComponent(token)}`, { cache: "no-store" });
    return res.ok ? ((await res.json()) as Preview) : null;
  } catch {
    return null;
  }
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, user] = await Promise.all([getPreview(token), getSession()]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-6 text-center">
        <BuildingsIcon className="mx-auto size-10" />
        {!preview ? (
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold">Invitation not found</h1>
            <p className="text-muted-foreground">The link may be mistyped or no longer valid.</p>
          </div>
        ) : preview.status !== "pending" ? (
          <div className="flex flex-col gap-2">
            <h1 className="text-lg font-semibold">{preview.orgName}</h1>
            <p className="text-muted-foreground">{PROBLEMS[preview.status]}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-lg font-semibold">Join {preview.orgName}</h1>
              <p className="text-muted-foreground">
                You have been invited as <strong>{preview.roleName}</strong>. This invitation is for{" "}
                <strong>{preview.email}</strong>.
              </p>
            </div>
            <AcceptInvite token={token} signedInAs={user?.email ?? null} email={preview.email} />
          </>
        )}
      </div>
    </main>
  );
}

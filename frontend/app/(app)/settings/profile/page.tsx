import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DeleteAccountCard } from "@/components/settings/delete-account-card";
import { ProfileForm } from "@/components/settings/profile-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Profile settings" };

export default async function ProfilePage() {
  // Request-cached: shares the fetch already made by the (app) layout.
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="flex flex-col gap-8">
      <ProfileForm user={user} />
      <DeleteAccountCard />
    </div>
  );
}

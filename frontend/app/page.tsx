import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { getSession } from "@/lib/session";

export default async function Home() {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-lg font-semibold">Signed in</h1>
      <p className="text-muted-foreground">{user.email ?? user.name}</p>
      <LogoutButton />
    </main>
  );
}

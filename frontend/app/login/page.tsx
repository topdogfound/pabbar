import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import type { AuthMethods } from "@/lib/api";
import { getSession } from "@/lib/session";

export const metadata = { title: "Log in" };

async function getMethods(): Promise<AuthMethods | undefined> {
  const backend = process.env.BACKEND_URL ?? "http://localhost:4000";
  try {
    const res = await fetch(`${backend}/auth/config`, { cache: "no-store" });
    if (!res.ok) return undefined;
    return (await res.json()).methods as AuthMethods;
  } catch {
    return undefined;
  }
}

export default async function LoginPage() {
  if (await getSession()) redirect("/");
  const methods = await getMethods();

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Suspense>
        <LoginForm methods={methods} />
      </Suspense>
    </main>
  );
}

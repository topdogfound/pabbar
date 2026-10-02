import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Landing() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold">Pabbar</span>
        <Button nativeButton={false} render={<Link href="/login" />}>Sign in</Button>
      </header>
      <section className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome to Pabbar</h1>
        <p className="text-muted-foreground">
          Sign in with a one-time code sent to your email to get started.
        </p>
        <Button size="lg" nativeButton={false} render={<Link href="/login" />}>
          Get started
        </Button>
      </section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailStepProps {
  defaultEmail: string;
  defaultRemember: boolean;
  onSubmit: (email: string, remember: boolean) => Promise<void>;
}

export function EmailStep({ defaultEmail, defaultRemember, onSubmit }: EmailStepProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [remember, setRemember] = useState(defaultRemember);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await onSubmit(value, remember);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field data-invalid={!!error}>
        <FieldLabel htmlFor="email">Email address</FieldLabel>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="email@example.com"
          autoFocus
          value={email}
          aria-invalid={!!error}
          onChange={(e) => setEmail(e.target.value)}
        />
        {error && <FieldError>{error}</FieldError>}
      </Field>

      <Field orientation="horizontal">
        <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
        <FieldLabel htmlFor="remember">Remember me</FieldLabel>
      </Field>

      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <Spinner />}
        Send code
      </Button>

      {/* <p className="text-center text-muted-foreground">
        No account yet? One is created automatically the first time you sign in.
      </p> */}
    </form>
  );
}

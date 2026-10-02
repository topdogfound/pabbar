"use client";

import { useState } from "react";
import { maskEmail, OtpStep } from "@/components/auth/otp-step";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, authApi, type PublicUser } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface EmailChangeDialogProps {
  currentEmail: string | null;
  onClose: () => void;
  onChanged: (user: PublicUser) => void;
}

type Step = { name: "email" } | { name: "otp"; email: string; resendIn: number };

async function requestCode(email: string) {
  try {
    return (await authApi.requestEmailChange(email)).resendIn;
  } catch (err) {
    // Cooldown still active: continue to the code step.
    if (err instanceof ApiError && err.status === 429 && err.data?.resendIn) return err.data.resendIn;
    throw err;
  }
}

export default function EmailChangeDialog({ currentEmail, onClose, onChanged }: EmailChangeDialogProps) {
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) return setError("Enter a valid email address.");
    if (value.toLowerCase() === currentEmail?.toLowerCase()) return setError("That is already your email.");
    setError(null);
    setPending(true);
    try {
      const resendIn = await requestCode(value);
      setStep({ name: "otp", email: value, resendIn });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the code.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change email</DialogTitle>
          <DialogDescription>
            {step.name === "email"
              ? "We will send a code to the new address to confirm it."
              : `Confirm ${maskEmail(step.email)} to finish the change.`}
          </DialogDescription>
        </DialogHeader>

        {step.name === "email" ? (
          <form onSubmit={submitEmail} noValidate className="flex flex-col gap-4">
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="new-email">New email address</FieldLabel>
              <Input
                id="new-email"
                type="email"
                autoComplete="email"
                placeholder="email@example.com"
                autoFocus
                value={email}
                aria-invalid={!!error}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) setError(null);
                }}
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              Send code
            </Button>
          </form>
        ) : (
          <OtpStep
            email={step.email}
            resendIn={step.resendIn}
            submitLabel="Verify and change email"
            backLabel="Use a different email"
            onBack={() => setStep({ name: "email" })}
            onResend={() => requestCode(step.email)}
            onVerify={async (code) => {
              const { user } = await authApi.verifyEmailChange(step.email, code);
              onChanged(user);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

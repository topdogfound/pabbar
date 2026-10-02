"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Spinner } from "@/components/ui/spinner";

export function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 3))}@${domain}`;
}

interface OtpStepProps {
  email: string;
  resendIn: number;
  onVerify: (code: string) => Promise<void>;
  onResend: () => Promise<number>;
  onBack: () => void;
  submitLabel?: string;
  backLabel?: string;
}

export function OtpStep({ email, resendIn, onVerify, onResend, onBack, submitLabel = "Verify and sign in", backLabel = "Use a different email" }: OtpStepProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [seconds, setSeconds] = useState(resendIn);
  const submitting = useRef(false);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  async function verify(value: string) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(true);
    setError(null);
    try {
      await onVerify(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code.");
      setCode("");
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      setSeconds(await onResend());
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code.");
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === 6) void verify(code);
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-center text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{maskEmail(email)}</span>.
      </p>

      <div className="flex flex-col items-center gap-2">
        <InputOTP
          maxLength={6}
          inputMode="numeric"
          pattern="^[0-9]*$"
          autoComplete="one-time-code"
          autoFocus
          value={code}
          disabled={pending}
          aria-invalid={!!error}
          onChange={setCode}
          onComplete={(v) => void verify(v)}
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="size-10 text-sm" />
            ))}
          </InputOTPGroup>
        </InputOTP>
        {error && <FieldError>{error}</FieldError>}
      </div>

      <Button type="submit" size="lg" disabled={pending || code.length < 6} className="w-full">
        {pending && <Spinner />}
        {submitLabel}
      </Button>

      <div className="flex items-center justify-between">
        <Button type="button" variant="link" className="px-0" onClick={onBack}>
          {backLabel}
        </Button>
        {seconds > 0 ? (
          <span className="text-muted-foreground">Resend code in {seconds}s</span>
        ) : (
          <Button type="button" variant="link" className="px-0" onClick={() => void resend()}>
            Resend code
          </Button>
        )}
      </div>
    </form>
  );
}

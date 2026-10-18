"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LockKeyIcon } from "@phosphor-icons/react";
import { toast } from "@/components/ui/toast";
import { ApiError, authApi, type AuthMethods } from "@/lib/api";
import { safeNext } from "@/lib/safe-next";
import { EmailStep } from "./email-step";
import { OtpStep } from "./otp-step";
import { SocialButtons } from "./social-buttons";

const OAUTH_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
  account_disabled: "This account is disabled.",
  oauth_failed: "We couldn't sign you in with that provider.",
};

// Falls back to email-only if the config call fails.
const FALLBACK_METHODS: AuthMethods = { emailOtp: true, google: false, github: false, phoneOtp: false };

type Step = { name: "email" } | { name: "otp"; email: string; resendIn: number };

export function LoginForm({ methods = FALLBACK_METHODS }: { methods?: AuthMethods }) {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ name: "email" });
  const [email, setEmail] = useState("");
  const [remember, setRemember] = useState(false);

  const oauthError = params.get("error");
  useEffect(() => {
    if (!oauthError) return;
    toast.add({
      type: "error",
      title: OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.oauth_failed,
    });
    router.replace("/login");
  }, [oauthError, router]);

  async function sendCode(address: string) {
    try {
      const { resendIn } = await authApi.requestOtp(address);
      return resendIn;
    } catch (err) {
      // Cooldown still active (e.g. page reload): continue to the OTP step.
      if (err instanceof ApiError && err.status === 429 && err.data?.resendIn) {
        return err.data.resendIn;
      }
      throw err;
    }
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <LockKeyIcon className="size-10" />
        <h1 className="text-lg font-semibold">Log in to your account</h1>
        <p className="text-muted-foreground">
          Enter your email and we will send you a one-time sign-in code.
        </p>
      </div>

      {step.name === "email" ? (
        <>
          <EmailStep
            defaultEmail={email}
            defaultRemember={remember}
            onSubmit={async (address, rememberMe) => {
              const resendIn = await sendCode(address);
              setEmail(address);
              setRemember(rememberMe);
              setStep({ name: "otp", email: address, resendIn });
            }}
          />
          <SocialButtons methods={methods} />
        </>
      ) : (
        <OtpStep
          email={step.email}
          resendIn={step.resendIn}
          onBack={() => setStep({ name: "email" })}
          onResend={() => sendCode(step.email)}
          onVerify={async (code) => {
            await authApi.verifyOtp(step.email, code, remember);
            router.replace(safeNext(params.get("next")) ?? "/");
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

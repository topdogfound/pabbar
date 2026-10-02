import { GithubLogoIcon, GoogleLogoIcon } from "@phosphor-icons/react";
import { buttonVariants } from "@/components/ui/button";
import type { AuthMethods } from "@/lib/api";
import { cn } from "@/lib/utils";

const PROVIDERS = [
  { id: "google", label: "Continue with Google", Icon: GoogleLogoIcon },
  { id: "github", label: "Continue with GitHub", Icon: GithubLogoIcon },
] as const;

/** Renders only the providers enabled in the backend .env. */
export function SocialButtons({ methods }: { methods: AuthMethods }) {
  const enabled = PROVIDERS.filter((p) => methods[p.id]);
  if (enabled.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      {enabled.map(({ id, label, Icon }) => (
        // Full navigation: the backend redirects to the provider.
        <a
          key={id}
          href={`/api/auth/oauth/${id}`}
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
        >
          <Icon />
          {label}
        </a>
      ))}
    </div>
  );
}

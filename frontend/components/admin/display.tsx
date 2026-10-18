import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LockSimpleIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import type { RoleChip } from "@/lib/admin-api";

export function PersonAvatar({
  name,
  email,
  avatarUrl,
  className,
}: {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  className?: string;
}) {
  const label = name ?? email ?? "?";
  return (
    <Avatar className={className}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={label} referrerPolicy="no-referrer" />}
      <AvatarFallback>{label.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

export function PersonCell({
  name,
  email,
  avatarUrl,
}: {
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <PersonAvatar name={name} email={email} avatarUrl={avatarUrl} />
      <div className="min-w-0">
        <p className="truncate font-medium">{name ?? email ?? "Unknown user"}</p>
        {name && email && <p className="truncate text-muted-foreground">{email}</p>}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: "ACTIVE" | "SUSPENDED" }) {
  return status === "ACTIVE" ? (
    <Badge variant="secondary" className="text-green-600 dark:text-green-500">
      Active
    </Badge>
  ) : (
    <Badge variant="destructive">Suspended</Badge>
  );
}

export function RoleBadges({ roles, max = 3 }: { roles: RoleChip[]; max?: number }) {
  if (roles.length === 0) return <span className="text-muted-foreground">No role</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {roles.slice(0, max).map((r) => (
        <Badge key={r.id} variant="outline" className="gap-1">
          {r.isSystem && <LockSimpleIcon aria-label="System role" />}
          {r.name}
        </Badge>
      ))}
      {roles.length > max && <Badge variant="outline">+{roles.length - max}</Badge>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function formatStat(stat: { value: number; capped: boolean }) {
  return `${stat.value.toLocaleString("en-US")}${stat.capped ? "+" : ""}`;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-destructive">
      {message}
    </p>
  );
}

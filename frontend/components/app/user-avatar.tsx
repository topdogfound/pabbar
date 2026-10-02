import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { PublicUser } from "@/lib/api";

export function displayName(user: PublicUser) {
  return user.name ?? user.email ?? "Account";
}

export function UserAvatar({ user, className }: { user: PublicUser; className?: string }) {
  const name = displayName(user);
  return (
    <Avatar className={className}>
      {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={name} referrerPolicy="no-referrer" />}
      <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

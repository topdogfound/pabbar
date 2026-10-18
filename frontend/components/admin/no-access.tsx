import { LockKeyIcon } from "@phosphor-icons/react/ssr";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Shown when the viewer can open the console but lacks the permission for this page. */
export function NoAccess({ permission }: { permission: string }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <LockKeyIcon />
        </EmptyMedia>
        <EmptyTitle>You do not have access to this page</EmptyTitle>
        <EmptyDescription>
          It needs the <code className="font-mono">{permission}</code> permission. Ask an administrator of this scope
          to give you a role that includes it.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

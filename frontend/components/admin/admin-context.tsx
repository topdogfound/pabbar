"use client";

import { createContext, useContext, useMemo } from "react";
import type { AdminSummary, ScopeContext } from "@/lib/admin-api";

interface AdminValue {
  scope: ScopeContext["scope"];
  permissions: ReadonlySet<string>;
  held: ReadonlySet<string>;
  summary: AdminSummary;
}

const AdminCtx = createContext<AdminValue | null>(null);

export function AdminProvider({
  context,
  summary,
  children,
}: {
  context: ScopeContext;
  summary: AdminSummary;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({
      scope: context.scope,
      permissions: new Set(context.permissions),
      held: new Set(context.held),
      summary,
    }),
    [context, summary],
  );
  return <AdminCtx value={value}>{children}</AdminCtx>;
}

export function useAdmin() {
  const value = useContext(AdminCtx);
  if (!value) throw new Error("useAdmin must be used inside <AdminProvider>");
  return value;
}

/**
 * UI gating only. The API enforces every permission itself; this just avoids
 * showing buttons that would answer 403.
 */
export function useCan(permission: string) {
  return useAdmin().permissions.has(permission);
}

/**
 * Mirrors the API's escalation guard: you can only grant or hand out what you
 * hold. Used to grey out roles and permissions, never to enforce.
 */
export function useCanGrant() {
  const { held } = useAdmin();
  return (permissions: readonly string[]) => permissions.every((p) => held.has(p));
}

export function Can({ permission, children }: { permission: string; children: React.ReactNode }) {
  return useCan(permission) ? children : null;
}

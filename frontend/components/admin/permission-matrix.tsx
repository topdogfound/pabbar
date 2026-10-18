"use client";

import { LockSimpleIcon } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import type { PermissionDef } from "@/lib/admin-api";

/**
 * Permissions grouped by area. `editable` decides whether the matrix can change
 * at all; `canGrant` decides per permission (you can only grant what you hold),
 * and locked ones say so instead of silently ignoring the click.
 */
export function PermissionMatrix({
  catalog,
  selected,
  onChange,
  editable,
  canGrant,
}: {
  catalog: PermissionDef[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  editable: boolean;
  canGrant: (permissions: readonly string[]) => boolean;
}) {
  const groups = new Map<string, PermissionDef[]>();
  for (const p of catalog) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);

  function set(keys: string[], on: boolean) {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {[...groups.entries()].map(([group, perms]) => {
        const selectable = editable ? perms.filter((p) => canGrant([p.key])) : [];
        const on = perms.filter((p) => selected.has(p.key)).length;
        const allSelectableOn = selectable.length > 0 && selectable.every((p) => selected.has(p.key));
        const someOn = selectable.some((p) => selected.has(p.key));
        return (
          <section key={group} className="rounded-lg border">
            <header className="flex items-center gap-3 border-b bg-muted/40 px-4 py-2.5">
              {editable && (
                <Checkbox
                  aria-label={`Select all in ${group}`}
                  checked={allSelectableOn}
                  indeterminate={!allSelectableOn && someOn}
                  disabled={selectable.length === 0}
                  className="data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground"
                  onCheckedChange={(v) =>
                    set(
                      selectable.map((p) => p.key),
                      v === true,
                    )
                  }
                />
              )}
              <h4 className="flex-1 text-xs font-medium">{group}</h4>
              <span className="text-muted-foreground tabular-nums">
                {on}/{perms.length}
              </span>
            </header>
            <ul className="divide-y">
              {perms.map((p) => {
                const locked = editable && !canGrant([p.key]);
                const checked = selected.has(p.key);
                return (
                  <li key={p.key}>
                    <label
                      className={`flex items-start gap-3 px-4 py-2.5 ${editable && !locked ? "cursor-pointer" : "cursor-default"} ${locked ? "opacity-60" : ""}`}
                      title={locked ? "You cannot grant a permission you do not hold yourself." : undefined}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!editable || locked}
                        onCheckedChange={(v) => set([p.key], v === true)}
                        aria-label={p.label}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-2 font-medium">
                          {p.label}
                          <code className="font-mono font-normal text-muted-foreground">{p.key}</code>
                          {locked && <LockSimpleIcon className="size-3 text-muted-foreground" aria-label="Locked" />}
                        </span>
                        <span className="block text-muted-foreground">{p.description}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

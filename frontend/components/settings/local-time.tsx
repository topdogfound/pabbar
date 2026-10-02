"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** Renders UTC on the server and the viewer's local time after hydration (no mismatch). */
export function LocalTime({ iso }: { iso: string }) {
  const date = new Date(iso);
  const text = useSyncExternalStore(
    noop,
    () => date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }),
    () =>
      date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }) + " UTC",
  );
  return <time dateTime={iso}>{text}</time>;
}

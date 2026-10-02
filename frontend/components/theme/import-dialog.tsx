"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { decodeTheme, type ThemePrefs } from "@/lib/theme";

export function ImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (prefs: ThemePrefs) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import preset code</DialogTitle>
          <DialogDescription>Paste a code copied from another device.</DialogDescription>
        </DialogHeader>
        <Input
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError("");
          }}
          placeholder="v1.dark.xl.inter.inter"
          aria-invalid={!!error}
        />
        {error && <p className="text-destructive">{error}</p>}
        <DialogFooter>
          <Button
            onClick={() => {
              const prefs = decodeTheme(code.trim().replace(/^v1\./, ""));
              if (!prefs) return setError("That code isn't valid.");
              onImport(prefs);
              setCode("");
              onOpenChange(false);
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

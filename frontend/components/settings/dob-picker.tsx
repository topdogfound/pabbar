"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarBlankIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parse(value: string | null) {
  if (!value) return undefined;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

interface DobPickerProps {
  id?: string;
  value: string | null;
  onChange: (value: string | null) => void;
}

export default function DobPicker({ id, value, onChange }: DobPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parse(value);
  const thisYear = new Date().getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button id={id} type="button" variant="outline" className="w-full justify-start font-normal" />}
      >
        <CalendarBlankIcon />
        {selected ? format(selected, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={selected}
          defaultMonth={selected ?? new Date(thisYear - 25, 0)}
          startMonth={new Date(1900, 0)}
          endMonth={new Date()}
          disabled={{ after: new Date() }}
          onSelect={(d) => {
            onChange(d ? format(d, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

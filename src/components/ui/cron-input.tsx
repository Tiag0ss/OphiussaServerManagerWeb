"use client";

import { useRef, useState } from "react";
import { Input, Label, Select } from "./field";
import { cn } from "@/lib/utils";

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45];
const HOUR_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

type Kind = "disabled" | "everyMinutes" | "everyHours" | "daily" | "weekly" | "custom";

type Parsed =
  | { kind: "disabled" }
  | { kind: "everyMinutes"; minutes: number }
  | { kind: "everyHours"; hours: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; hour: number; minute: number; weekday: number }
  | { kind: "custom" };

function parseCron(value: string): Parsed {
  const v = value.trim();
  if (!v) return { kind: "disabled" };

  let m = v.match(/^\*\/(\d{1,2}) \* \* \* \*$/);
  if (m) return { kind: "everyMinutes", minutes: Number(m[1]) };

  m = v.match(/^0 \*\/(\d{1,2}) \* \* \*$/);
  if (m) return { kind: "everyHours", hours: Number(m[1]) };

  m = v.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (m) return { kind: "daily", minute: Number(m[1]), hour: Number(m[2]) };

  m = v.match(/^(\d{1,2}) (\d{1,2}) \* \* (\d)$/);
  if (m) {
    return {
      kind: "weekly",
      minute: Number(m[1]),
      hour: Number(m[2]),
      weekday: Number(m[3]),
    };
  }

  return { kind: "custom" };
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function timeToInput(hour: number, minute: number) {
  return `${pad(hour)}:${pad(minute)}`;
}

export function CronInput({
  value,
  onChange,
  allowDisabled = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Whether "Disabled" (empty string) is offered as an option. */
  allowDisabled?: boolean;
  className?: string;
}) {
  // `kind` is independent, user-driven state — NOT re-derived from `value`
  // on every render. Otherwise picking "Custom" for a value that happens to
  // match a preset's shape (e.g. "*/15 * * * *") would immediately snap
  // back to that preset, and the raw text box would never show.
  const [kind, setKind] = useState<Kind>(() => parseCron(value).kind);
  const lastEmitted = useRef(value);

  // Re-sync only when `value` changed from outside this component (e.g. the
  // parent reset the form or loaded a different schedule to edit).
  if (value !== lastEmitted.current) {
    lastEmitted.current = value;
    const next = parseCron(value).kind;
    if (next !== kind) setKind(next);
  }

  function emit(next: string) {
    lastEmitted.current = next;
    onChange(next);
  }

  function selectKind(next: Kind) {
    setKind(next);
    switch (next) {
      case "disabled":
        emit("");
        break;
      case "everyMinutes":
        emit(`*/${MINUTE_OPTIONS[0]} * * * *`);
        break;
      case "everyHours":
        emit(`0 */${HOUR_OPTIONS[0]} * * *`);
        break;
      case "daily":
        emit("0 4 * * *");
        break;
      case "weekly":
        emit("0 4 * * 0");
        break;
      case "custom":
        // Keep the current value as-is; just switch to the raw editor.
        break;
    }
  }

  const parsed = parseCron(value);
  const minutesN = parsed.kind === "everyMinutes" ? parsed.minutes : MINUTE_OPTIONS[0];
  const hoursN = parsed.kind === "everyHours" ? parsed.hours : HOUR_OPTIONS[0];
  const hour = parsed.kind === "daily" || parsed.kind === "weekly" ? parsed.hour : 4;
  const minute = parsed.kind === "daily" || parsed.kind === "weekly" ? parsed.minute : 0;
  const weekday = parsed.kind === "weekly" ? parsed.weekday : 0;

  return (
    <div className={cn("space-y-2", className)}>
      <Select value={kind} onChange={(e) => selectKind(e.target.value as Kind)}>
        {allowDisabled && <option value="disabled">Disabled</option>}
        <option value="everyMinutes">Every N minutes</option>
        <option value="everyHours">Every N hours</option>
        <option value="daily">Daily at a time</option>
        <option value="weekly">Weekly on a day</option>
        <option value="custom">Custom (cron expression)</option>
      </Select>

      {kind === "everyMinutes" && (
        <Select
          value={String(minutesN)}
          onChange={(e) => emit(`*/${e.target.value} * * * *`)}
        >
          {(MINUTE_OPTIONS.includes(minutesN) ? MINUTE_OPTIONS : [minutesN, ...MINUTE_OPTIONS]).map(
            (n) => (
              <option key={n} value={n}>
                every {n} minutes
              </option>
            ),
          )}
        </Select>
      )}

      {kind === "everyHours" && (
        <Select
          value={String(hoursN)}
          onChange={(e) => emit(`0 */${e.target.value} * * *`)}
        >
          {(HOUR_OPTIONS.includes(hoursN) ? HOUR_OPTIONS : [hoursN, ...HOUR_OPTIONS]).map((n) => (
            <option key={n} value={n}>
              every {n} hour{n === 1 ? "" : "s"}
            </option>
          ))}
        </Select>
      )}

      {kind === "daily" && (
        <div>
          <Label className="text-xs">Time</Label>
          <Input
            type="time"
            value={timeToInput(hour, minute)}
            onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              emit(`${m} ${h} * * *`);
            }}
          />
        </div>
      )}

      {kind === "weekly" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Day</Label>
            <Select
              value={String(weekday)}
              onChange={(e) => emit(`${minute} ${hour} * * ${e.target.value}`)}
            >
              {WEEKDAYS.map((day, idx) => (
                <option key={day} value={idx}>
                  {day}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Time</Label>
            <Input
              type="time"
              value={timeToInput(hour, minute)}
              onChange={(e) => {
                const [h, m] = e.target.value.split(":").map(Number);
                emit(`${m} ${h} * * ${weekday}`);
              }}
            />
          </div>
        </div>
      )}

      {kind === "custom" && (
        <Input
          value={value}
          placeholder="0 4 * * *"
          onChange={(e) => emit(e.target.value)}
        />
      )}

      {kind !== "disabled" && kind !== "custom" && (
        <p className="font-mono text-xs text-muted">{value || " "}</p>
      )}
    </div>
  );
}

"use client";

import { useMemo } from "react";

export type TripDateRangePickerProps = {
  startDate: string;
  endDate: string;
  /** Called with `YYYY-MM-DD`; pass `""` to clear start or end. */
  onRangeChange: (start: string, end: string) => void;
  /** Last selectable day is today + this many days (default 15 → 16 calendar days inclusive). */
  maxOffsetFromToday?: number;
};

function localToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function addDaysLocal(d: Date, days: number): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + days);
  return x;
}

function localYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday = start of ISO-style week (local). */
function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = x.getDay(); // 0 Sun .. 6 Sat
  const diffFromMon = (dow + 6) % 7;
  x.setDate(x.getDate() - diffFromMon);
  return x;
}

function eachDayInclusive(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function TripDateRangePicker({
  startDate,
  endDate,
  onRangeChange,
  maxOffsetFromToday = 15,
}: TripDateRangePickerProps) {
  const { gridDays, minYmd, maxYmd, monthTitle, todayYmd } = useMemo(() => {
    const today = localToday();
    const lastSelectable = addDaysLocal(today, maxOffsetFromToday);
    const weekStart = startOfWeekMonday(today);
    const mondayOfLastWeek = startOfWeekMonday(lastSelectable);
    const weekEndSunday = addDaysLocal(mondayOfLastWeek, 6);

    const grid = eachDayInclusive(weekStart, weekEndSunday);
    const minY = localYMD(today);
    const maxY = localYMD(lastSelectable);
    const todayY = localYMD(today);

    const fmt = (d: Date, opts: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("en-US", opts).format(d);

    let title: string;
    if (weekStart.getFullYear() === weekEndSunday.getFullYear() && weekStart.getMonth() === weekEndSunday.getMonth()) {
      title = fmt(weekStart, { month: "long", year: "numeric" });
    } else if (weekStart.getFullYear() === weekEndSunday.getFullYear()) {
      title = `${fmt(weekStart, { month: "long" })} – ${fmt(weekEndSunday, { month: "long", year: "numeric" })}`;
    } else {
      title = `${fmt(weekStart, { month: "short", year: "numeric" })} – ${fmt(weekEndSunday, { month: "short", year: "numeric" })}`;
    }

    return { gridDays: grid, minYmd: minY, maxYmd: maxY, monthTitle: title, todayYmd: todayY };
  }, [maxOffsetFromToday]);

  const handleDayClick = (ymd: string) => {
    if (ymd < minYmd || ymd > maxYmd) return;

    if (!startDate) {
      onRangeChange(ymd, "");
      return;
    }
    if (startDate && !endDate) {
      if (ymd < startDate) {
        onRangeChange(ymd, "");
      } else {
        onRangeChange(startDate, ymd);
      }
      return;
    }
    onRangeChange(ymd, "");
  };

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border-2 border-[#eadfcd]/90 bg-[#fffcf7]/80 p-3 shadow-sm sm:max-w-xl sm:p-4">
      <div className="flex flex-col gap-1 text-center sm:flex-row sm:items-baseline sm:justify-between sm:text-left">
        <p className="font-display text-base font-bold text-[#3d4249] sm:text-lg">{monthTitle}</p>
        <p className="text-[11px] font-medium text-[#888780] sm:text-xs">Tap start date, then end date</p>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[#8b8e94] sm:mt-4 sm:gap-1 sm:text-[11px]">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-0.5 sm:py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-0.5 grid grid-cols-7 gap-0.5 sm:mt-1 sm:gap-1">
        {gridDays.map((d) => {
          const ymd = localYMD(d);
          const selectable = ymd >= minYmd && ymd <= maxYmd;
          const isToday = ymd === todayYmd;
          const isStart = Boolean(startDate && ymd === startDate);
          const isEnd = Boolean(endDate && ymd === endDate);
          const inSpan =
            Boolean(startDate && endDate && startDate <= endDate && ymd >= startDate && ymd <= endDate);

          return (
            <button
              key={ymd}
              type="button"
              disabled={!selectable}
              onClick={() => handleDayClick(ymd)}
              className={[
                "relative flex min-h-[2.25rem] flex-col items-center justify-center rounded-lg border text-xs font-semibold transition sm:min-h-[2.5rem] sm:rounded-xl sm:text-sm",
                !selectable
                  ? "cursor-default border-transparent bg-[#f5ebe0]/40 text-[#c4c0bc]"
                  : inSpan
                    ? "border-[#ea8a12]/40 bg-[#fff3e0] text-[#1a1c1e] hover:bg-[#ffe8cc]"
                    : "border-[#eadfcd]/60 bg-white/80 text-[#1a1c1e] hover:border-[#d97706]/50 hover:bg-[#fffaf4]",
                isStart || isEnd
                  ? "z-[1] border-[#ea8a12] ring-2 ring-[#ea8a12]/90 ring-offset-1 ring-offset-[#fffcf7]"
                  : "",
                isToday && selectable ? "font-extrabold" : "",
              ].join(" ")}
            >
              <span className="leading-none">{d.getDate()}</span>
              {isToday && selectable ? (
                <span className="mt-0.5 text-[8px] font-bold uppercase tracking-wide text-[#d97706] sm:text-[9px]">
                  Today
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

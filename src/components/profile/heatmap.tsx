const MONTHS = ["янв.", "февр.", "март", "апр.", "май", "июнь", "июль", "авг.", "сент.", "окт.", "нояб.", "дек."];
const DAYS = ["пн", "", "ср", "", "пт", "", ""];

function level(v: number) {
  if (v <= 0) return 0;
  if (v <= 2) return 1;
  if (v <= 5) return 2;
  if (v <= 10) return 3;
  return 4;
}

/** Тепловая карта активности за год (как на GitHub / Stepik). Дни по UTC. */
export function Heatmap({ data }: { data: Map<string, number> }) {
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const dow = (new Date(todayUtc).getUTCDay() + 6) % 7; // 0 = понедельник
  const start = todayUtc - (52 * 7 + dow) * 86_400_000;

  const weeks: { key: string; date: Date; value: number; future: boolean }[][] = [];
  for (let w = 0; w < 53; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const t = start + (w * 7 + d) * 86_400_000;
      const date = new Date(t);
      const key = date.toISOString().slice(0, 10);
      week.push({ key, date, value: data.get(key) ?? 0, future: t > todayUtc });
    }
    weeks.push(week);
  }

  const monthLabels = weeks.map((week, i) => {
    const first = week[0].date;
    const prev = i > 0 ? weeks[i - 1][0].date : null;
    return !prev || prev.getUTCMonth() !== first.getUTCMonth() ? MONTHS[first.getUTCMonth()] : "";
  });
  // Неполный первый месяц: убираем подпись, если следующая идёт вплотную.
  let lastLabel = -10;
  monthLabels.forEach((m, i) => {
    if (!m) return;
    if (i - lastLabel < 3) monthLabels[lastLabel] = "";
    lastLabel = i;
  });

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        <div className="flex gap-[3px] pl-6 text-[10px] text-muted">
          {monthLabels.map((m, i) => (
            <div key={i} className="w-[11px] overflow-visible whitespace-nowrap">
              {m}
            </div>
          ))}
        </div>
        <div className="flex gap-[3px]">
          <div className="flex w-5 flex-col gap-[3px] text-[9px] leading-[11px] text-muted">
            {DAYS.map((d, i) => (
              <div key={i} className="h-[11px]">
                {d}
              </div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => (
                <div
                  key={day.key}
                  title={
                    day.future
                      ? ""
                      : `${day.value ? `Активность: ${day.value}` : "Нет активности"} · ${day.date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`
                  }
                  className={`size-[11px] rounded-[2px] ${day.key === new Date(todayUtc).toISOString().slice(0, 10) ? "ring-1 ring-danger" : ""}`}
                  style={{ background: day.future ? "transparent" : `var(--heat-${level(day.value)})` }}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted">
          Меньше
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="size-[11px] rounded-[2px]" style={{ background: `var(--heat-${l})` }} />
          ))}
          Больше · новый день начинается в 00:00 UTC
        </div>
      </div>
    </div>
  );
}

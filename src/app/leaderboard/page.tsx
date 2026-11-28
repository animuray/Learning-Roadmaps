import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Medal } from "lucide-react";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { getLeaderboard, points, SCORE_WEIGHTS } from "@/lib/stats";
import { Avatar } from "@/components/avatar";

export const metadata: Metadata = { title: "Лидеры" };

const SHOWN = 100;

const MEDAL: Record<number, string> = { 1: "text-yellow-500", 2: "text-zinc-400", 3: "text-amber-700" };

const COLUMNS = [
  { key: "topicsPassed", label: "Темы", title: "тем изучено", rule: "Изученная тема" },
  { key: "testsPassed", label: "Тесты", title: "тестов сдано", rule: "Сданный тест" },
  { key: "correctAnswers", label: "Ответы", title: "верных ответов", rule: "Верный ответ в тесте" },
  { key: "practiceDone", label: "Практика", title: "практических заданий", rule: "Практическое задание" },
  { key: "materials", label: "Материалы", title: "материалов сохранено", rule: "Сохранённый материал" },
] as const;

export default async function LeaderboardPage() {
  const [rows, viewer] = await Promise.all([getLeaderboard(), getCurrentUser()]);
  const top = rows.slice(0, SHOWN);
  const mine = viewer ? rows.find((r) => r.id === viewer.id) : undefined;
  const [viewerProfile] = viewer
    ? await db.select({ isPublic: users.isPublic }).from(users).where(eq(users.id, viewer.id))
    : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-bold">Лидеры</h1>
      <p className="mt-1 text-muted">Кто больше всех учится и практикуется.</p>

      {viewer && viewerProfile && !viewerProfile.isPublic && (
        <p className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-3 text-sm">
          Ваш профиль скрыт, поэтому вас нет в рейтинге. Открыть профиль можно в{" "}
          <Link href="/settings" className="text-accent hover:underline">
            настройках
          </Link>
          .
        </p>
      )}
      {mine && mine.place > SHOWN && (
        <p className="mt-4 text-sm">
          Ваше место — <b>{mine.place}</b>, у вас <b>{mine.score}</b> {points(mine.score)}.
        </p>
      )}

      {top.length === 0 ? (
        <p className="mt-8 text-muted">Пока в рейтинге никого нет: здесь появляются все, у кого открыт профиль.</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-muted">
              <tr>
                <th className="w-14 px-4 py-3 font-medium">#</th>
                <th className="px-2 py-3 font-medium">Участник</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} title={c.title} className="hidden px-3 py-3 text-right font-medium md:table-cell">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Очки</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => {
                const name = r.name ?? r.handle ?? "Без имени";
                const isMe = r.id === viewer?.id;
                return (
                  <tr key={r.id} className={`border-b border-line last:border-0 ${isMe ? "bg-accent-soft" : ""}`}>
                    <td className="px-4 py-3 font-semibold">
                      {MEDAL[r.place] ? (
                        <span className="flex items-center gap-1">
                          <Medal className={`size-4 ${MEDAL[r.place]}`} />
                          {r.place}
                        </span>
                      ) : (
                        r.place
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Link href={`/u/${r.handle ?? r.id}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
                        <Avatar name={name} image={r.image} size={32} />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {name}
                            {isMe && <span className="ml-1.5 text-xs font-normal text-muted">(вы)</span>}
                          </span>
                          {r.handle && <span className="block truncate text-xs text-muted">@{r.handle}</span>}
                        </span>
                      </Link>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className="hidden px-3 py-3 text-right tabular-nums md:table-cell">
                        {r[c.key]}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right text-base font-bold tabular-nums">{r.score}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-sm text-muted">
        <div className="font-medium text-fg">Как считаются очки</div>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          {COLUMNS.map((c) => (
            <li key={c.key}>
              {c.rule} — <b className="text-fg">{SCORE_WEIGHTS[c.key]}</b> {points(SCORE_WEIGHTS[c.key])}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Практические задания — пункты «Практики», задачи SQL-тренажёра и лабораторий. Тест засчитывается один раз,
          сколько бы попыток ни было. В рейтинге только открытые профили.
        </p>
      </div>
    </div>
  );
}

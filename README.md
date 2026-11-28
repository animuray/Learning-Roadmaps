# Learning Roadmaps

Платформа для самостоятельного обучения по роадмапам — как [roadmap.sh](https://roadmap.sh), но с конспектами, практикой, тестами и прогрессом.

- **Карта роадмапа**: разделы и темы на оси, статусы «доступна / пройдена / заблокирована».
- **Тема**: конспект, материалы, свои ссылки, чек-лист практики, личные заметки.
- **Тест**: случайная выборка из банка вопросов, проверка на сервере. Сдал (по умолчанию от 80%) — открывается следующая тема.
- **Повторение ошибок**: вопросы, на которых ошиблись в тестах, возвращаются через 1, 3, 7, 16 и 35 дней, пока не будут выучены.
- **Лаборатории** в терминале учебного стенда, а в конце каждого раздела — разбор аварий «Сломанный сервер».
- **Профиль** как на Stepik: тепловая карта активности за год, текущая и максимальная серия дней, статистика, прогресс по роадмапам, свой аватар.
- **Лидеры**: рейтинг по сумме метрик — темы, тесты, практика, ответы, материалы.
- **Светлая и тёмная тема**.
- **Вход через Google**.
- **Контент в Markdown** — папка `content/` открывается в Obsidian как хранилище. Формат описан в [content/README.md](content/README.md).

Стек: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, PostgreSQL + Drizzle ORM, Auth.js (next-auth v5).

## Быстрый старт (локально)

Нужны Node.js 22+ и Docker (для базы).

```bash
cp .env.example .env          # заполните AUTH_SECRET, для начала можно DEV_LOGIN=true
docker compose up -d db       # PostgreSQL на localhost:5432
npm install
npm run db:migrate            # создать таблицы
npm run dev                   # http://localhost:3000
```

С `DEV_LOGIN=true` на странице входа появится вход по email без пароля — удобно, пока не настроен Google. **На сервере его не включайте.**

## Лаборатория: терминал на учебном стенде

В темах с разделом «Лаборатория» на странице открывается настоящий терминал Linux. Задачи проверяются скриптом на стенде: засчитывается любое рабочее решение, а замечания и разбор объясняют, как делают на практике. Внешние сервисы и ИИ не используются.

Локально (Windows + WSL2):

```bash
npm run lab:stand:wsl   # отдельный WSL-дистрибутив lr-stand: Ubuntu 24.04, sshd на 2222, без доступа к дискам Windows
npm run lab:runner      # WebSocket-терминал на :3001, держит стенд включённым
npm run lab:check       # прогнать все задачи лабораторий на стенде
```

Нужные переменные — в `.env.example` (раздел «Лаборатория»). Стенд на любой Linux-машине или в контейнере Proxmox готовит `scripts/lab-stand/provision.sh`; план с отдельным стендом на ученика — в [docs/practice-lab.md](docs/practice-lab.md).

## Вход через Google

1. Откройте [Google Cloud Console](https://console.cloud.google.com/) → создайте проект.
2. **APIs & Services → OAuth consent screen**: тип External, заполните название и почту. Пока приложение в режиме Testing, войти смогут только добавленные тестовые пользователи — добавьте себя или опубликуйте приложение.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, тип *Web application*.
4. **Authorized redirect URIs**:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://ВАШ-ДОМЕН/api/auth/callback/google`
5. Скопируйте Client ID и Client Secret в `.env`:

```env
AUTH_GOOGLE_ID=...apps.googleusercontent.com
AUTH_GOOGLE_SECRET=...
AUTH_SECRET=...            # openssl rand -base64 32
AUTH_URL=https://ВАШ-ДОМЕН # только в продакшене
```

## Деплой на свой сервер (VPS + Docker)

```bash
git clone https://github.com/animuray/Learning-Roadmaps.git && cd Learning-Roadmaps
cp .env.example .env   # AUTH_SECRET, AUTH_GOOGLE_*, AUTH_URL, POSTGRES_PASSWORD, DEV_LOGIN=false
docker compose up -d --build
```

Сайт поднимется на порту 3000, миграции базы применяются при старте контейнера. Перед ним поставьте reverse proxy с HTTPS (nginx + certbot или Caddy) — это как раз темы из роадмапа.

Обновление контента: `git pull` — папка `content/` смонтирована в контейнер, изменения появятся в течение минуты (`CONTENT_CACHE_TTL`). Обновление кода: `git pull && docker compose up -d --build`.

Бэкап базы: `docker compose exec db pg_dump -U roadmaps roadmaps > backup.sql`.

## Деплой на Vercel (бесплатно)

1. Создайте базу PostgreSQL (например, Neon или Supabase) и возьмите строку подключения.
2. Импортируйте репозиторий в Vercel, задайте переменные `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`.
3. Примените миграции один раз со своего компьютера: `DATABASE_URL=... npm run db:migrate`.
4. Добавьте домен Vercel в redirect URI Google.

## Команды

| Команда | Что делает |
| --- | --- |
| `npm run dev` | Режим разработки |
| `npm run build` / `npm start` | Сборка и запуск продакшена |
| `npm run content:check` | Проверка контента: темы, тесты, ошибки формата |
| `npm run sql:setup` | Создать роль и базу-песочницу SQL-тренажёра, прописать `SQL_PRACTICE_URL` в `.env` |
| `npm run sql:check` | Выполнить решения всех задач тренажёра в песочнице и проверить, что они проходят |
| `npm run lab:stand:wsl` | Создать учебный стенд в WSL для разработки лабораторий |
| `npm run lab:runner` | Запустить lab-runner — терминал стенда в браузере |
| `npm run lab:check` | Прогнать задачи лабораторий на стенде: до решения проверка не проходит, после эталона — проходит |
| `npm run lab:key` | Создать ключ `.lab/id_ed25519` для входа на стенды |
| `npm run db:generate` | Создать миграцию после изменения `src/db/schema.ts` |
| `npm run db:migrate` | Применить миграции |
| `npm run db:studio` | Веб-интерфейс к базе (Drizzle Studio) |
| `npm run lint` / `npm run typecheck` | Проверки кода |

## Как устроен проект

```
content/                  контент (хранилище Obsidian)
docs/                     планы: практика в терминале и домашний сервер
lab-runner/               WebSocket-терминал: браузер ↔ SSH на учебный стенд
drizzle/                  SQL-миграции
scripts/                  миграции, проверка контента, тренажёра и лабораторий, подготовка стенда
src/
  auth.ts                 Auth.js: Google + dev-вход
  db/schema.ts            таблицы: пользователи, прогресс, попытки, активность, материалы, заметки, практика
  lib/content/            чтение Markdown: роадмапы, темы, тесты, Obsidian-синтаксис
  lib/progress.ts         открытие тем по порядку, учёт активности
  lib/stats.ts            тепловая карта, серии дней, статистика профиля
  app/                    страницы: /roadmaps, /roadmaps/[roadmap]/[topic], /test, /u/[handle], /settings
  app/actions/            серверные действия: тест, тренажёр, практика, материалы, заметки, профиль
```

### Как засчитывается активность

Каждое действие пишется в таблицу `activity`, из неё строится тепловая карта (дни по UTC):

| Действие | Очки |
| --- | --- |
| Тема открыта и читалась 15+ секунд (раз в день на тему) | 1 |
| Попытка теста | по числу верных ответов |
| Тест сдан или тема отмечена изученной | 3 |
| Пункт практики, ссылка на материал, заметка | 1 |

Серия дней не прерывается, пока есть активность сегодня или вчера.

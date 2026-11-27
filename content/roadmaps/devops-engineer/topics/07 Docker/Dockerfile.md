---
title: Dockerfile
slug: dockerfile
description: Инструкции Dockerfile — FROM, RUN, COPY, ADD, WORKDIR, ENV, ARG, EXPOSE, CMD, ENTRYPOINT, USER, HEALTHCHECK — и как из них собирается образ.
duration: 120
level: Основы
quizSize: 10
materials:
  - title: Docker Docs — Dockerfile reference
    url: https://docs.docker.com/reference/dockerfile/
    type: документация
  - title: Docker Docs — Building best practices
    url: https://docs.docker.com/build/building/best-practices/
    type: документация
  - title: Docker Blog — Intro Guide to Dockerfile Best Practices
    url: https://www.docker.com/blog/intro-guide-to-dockerfile-best-practices/
    type: статья
---

# Dockerfile

**Dockerfile** — текстовый рецепт образа: базовый образ, команды установки, файлы приложения и команда запуска. Собирается командой `docker build -t имя:тег .` — точка здесь — это **контекст сборки** (каталог, файлы из которого можно копировать в образ).

## Пример: приложение на Python

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN useradd --create-home --uid 10001 app
USER app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

ENTRYPOINT ["gunicorn", "--bind", "0.0.0.0:8000"]
CMD ["app:app"]
```

## Инструкции

| Инструкция | Что делает |
| --- | --- |
| `FROM образ:тег` | Базовый образ. Первая инструкция (до неё может стоять только `ARG`). `FROM scratch` — пустой образ |
| `RUN команда` | Выполнить команду при **сборке** и сохранить результат как новый слой |
| `COPY src dst` | Скопировать файлы из контекста сборки (или из другого этапа: `--from=build`) |
| `ADD src dst` | Как COPY, но умеет распаковывать локальные tar-архивы и скачивать по URL |
| `WORKDIR /app` | Рабочий каталог для следующих инструкций и для контейнера. Создаётся, если его нет |
| `ENV KEY=value` | Переменная окружения — есть и при сборке, и в запущенном контейнере |
| `ARG NAME=default` | Переменная **только для сборки**: `docker build --build-arg NAME=...`. В контейнере её нет |
| `EXPOSE 8000` | Документирует порт. Сам порт **не публикует** — это делает `-p` при запуске |
| `CMD` | Команда (или аргументы) по умолчанию при запуске. Легко переопределяется: `docker run образ другая-команда` |
| `ENTRYPOINT` | Основная исполняемая программа контейнера. Аргументы `docker run` дописываются к ней |
| `USER app` | От какого пользователя выполнять следующие `RUN` и сам контейнер |
| `HEALTHCHECK` | Команда проверки здоровья: статус `healthy`/`unhealthy` в `docker ps` |
| `LABEL` | Метаданные: автор, версия, ссылка на репозиторий |
| `VOLUME` | Объявить каталог для данных — Docker создаст анонимный том |
| `STOPSIGNAL` | Сигнал для остановки (по умолчанию SIGTERM) |

## Shell-форма и exec-форма

```dockerfile
CMD ["python", "app.py"]      # exec-форма (JSON-массив) — процесс запускается напрямую, PID 1
CMD python app.py             # shell-форма — запускается через /bin/sh -c
```

В shell-форме PID 1 — это `sh`, и он **не передаёт сигналы** приложению: `docker stop` ждёт 10 секунд и убивает контейнер через SIGKILL, приложение не завершается корректно. Для `CMD` и `ENTRYPOINT` используйте **exec-форму**. Для `RUN` shell-форма нормальна: там нужны `&&`, пайпы и переменные.

## CMD и ENTRYPOINT

| Dockerfile | `docker run образ` | `docker run образ --version` |
| --- | --- | --- |
| `CMD ["nginx", "-g", "daemon off;"]` | `nginx -g daemon off;` | `--version` (CMD заменена целиком — ошибка) |
| `ENTRYPOINT ["nginx"]` + `CMD ["-g", "daemon off;"]` | `nginx -g daemon off;` | `nginx --version` |

- **CMD** — «что запустить по умолчанию», целиком заменяется аргументами `docker run`.
- **ENTRYPOINT** — «какая программа это контейнер», аргументы дописываются к ней. Переопределить — `docker run --entrypoint`.
- Вместе: ENTRYPOINT — программа, CMD — её аргументы по умолчанию.

Частый приём — скрипт-обёртка `docker-entrypoint.sh`, который готовит конфиг и в конце делает `exec "$@"`, чтобы приложение стало PID 1 и получало сигналы.

## COPY и ADD

- **COPY** — просто копирует файлы. Используйте по умолчанию.
- **ADD** — дополнительно распаковывает локальные `.tar`/`.tar.gz` и умеет скачивать по URL. Это неявное поведение, поэтому ADD применяют, только когда нужна именно распаковка.
- `COPY --chown=app:app . .` — сразу задать владельца, без отдельного `RUN chown` (он удваивает размер слоя).

## ARG и ENV

```dockerfile
ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
```

> [!warning] Секреты
> Не передавайте пароли и токены через `ARG` и `ENV`: они остаются в метаданных образа и видны в `docker history` и `docker inspect`. Для секретов при сборке — `RUN --mount=type=secret`, в рантайме — переменные окружения или секреты оркестратора.

## Практика

- [ ] Написать Dockerfile для простого веб-приложения (Python/Flask или Node.js) и собрать образ `docker build -t myapp:0.1 .`
- [ ] Запустить контейнер, опубликовать порт, проверить приложение через curl
- [ ] Сравнить CMD в shell-форме и exec-форме: замерить, сколько длится `docker stop` в обоих случаях
- [ ] Сделать ENTRYPOINT + CMD и переопределить аргументы при `docker run`
- [ ] Передать версию через `--build-arg` и вывести её в приложении через ENV
- [ ] Добавить HEALTHCHECK и увидеть статус `healthy` в `docker ps`
- [ ] Запустить контейнер и выполнить `docker exec myapp id` — убедиться, что процесс не от root

## Тест

### Какая инструкция задаёт базовый образ?
= FROM
> Это первая инструкция Dockerfile; до неё может стоять только ARG.

### Чем RUN отличается от CMD?
- [ ] Ничем
- [x] RUN выполняется при сборке образа и создаёт слой, CMD — команда по умолчанию при запуске контейнера
- [ ] RUN выполняется при каждом запуске контейнера
- [ ] CMD выполняется при сборке
> RUN ставит пакеты, CMD запускает приложение.

### Чем CMD отличается от ENTRYPOINT?
- [x] CMD целиком заменяется аргументами docker run
- [x] Аргументы docker run дописываются к ENTRYPOINT
- [x] Вместе ENTRYPOINT задаёт программу, а CMD — её аргументы по умолчанию
- [ ] ENTRYPOINT выполняется при сборке образа
> ENTRYPOINT переопределяют флагом `--entrypoint`.

### Чем ADD отличается от COPY?
- [ ] ADD быстрее
- [x] ADD умеет распаковывать локальные tar-архивы и скачивать файлы по URL, COPY только копирует
- [ ] COPY умеет распаковывать архивы
- [ ] ADD копирует только каталоги
> По умолчанию используйте COPY — его поведение предсказуемо.

### Что делает EXPOSE 8080?
- [ ] Публикует порт 8080 на хосте
- [x] Только документирует, какой порт слушает приложение; публикация делается флагом -p при запуске
- [ ] Открывает порт в файрволе
- [ ] Запрещает другие порты
> `docker run -P` публикует все EXPOSE-порты на случайные порты хоста.

### Чем ARG отличается от ENV?
- [ ] Ничем
- [x] ARG доступна только во время сборки, ENV — и при сборке, и в запущенном контейнере
- [ ] ENV доступна только при сборке
- [ ] ARG сохраняется в контейнере
> ARG передаётся через `--build-arg`.

### Почему CMD и ENTRYPOINT лучше писать в exec-форме (JSON-массив)?
- [ ] Так короче
- [x] В shell-форме PID 1 становится sh, который не передаёт сигналы приложению, и оно не завершается корректно при docker stop
- [ ] Shell-форма не поддерживается
- [ ] Exec-форма включает кэш
> Exec-форма: `CMD ["python", "app.py"]`.

### Как правильно хранить пароль, нужный только при сборке (например, токен к приватному репозиторию пакетов)?
- [ ] В ENV
- [ ] В ARG
- [x] Через RUN --mount=type=secret — секрет не попадает в слои и метаданные образа
- [ ] Прописать в Dockerfile
> ARG и ENV видны в `docker history` и `docker inspect`.

### Что делает WORKDIR /app?
- [x] Задаёт рабочий каталог для следующих инструкций RUN, COPY, CMD и для запущенного контейнера
- [x] Создаёт каталог, если его нет
- [ ] Монтирует том /app
- [ ] Копирует файлы в /app
> Лучше, чем `RUN cd /app && ...` — cd действует только внутри одной команды.

### Какая инструкция задаёт пользователя, от которого работает контейнер?
= USER
> Пользователя нужно сначала создать, например через `useradd`.

### Что делает строка exec "$@" в конце docker-entrypoint.sh?
- [ ] Перезапускает контейнер
- [x] Заменяет процесс скрипта на команду из аргументов (CMD), чтобы приложение стало PID 1 и получало сигналы
- [ ] Выводит аргументы
- [ ] Запускает команду в фоне
> Без exec приложение будет дочерним процессом оболочки.

### Что получит контейнер с ENTRYPOINT ["nginx"] и CMD ["-g", "daemon off;"] при запуске docker run образ -t?
- [ ] nginx -g daemon off; -t
- [x] nginx -t
- [ ] -t
- [ ] Ошибку
> Аргументы `docker run` заменяют CMD и дописываются к ENTRYPOINT.

### Как задать владельца файлов при копировании без лишнего слоя?
- [ ] RUN chown -R app:app /app после COPY
- [x] COPY --chown=app:app . .
- [ ] USER app перед COPY
- [ ] ENV OWNER=app
> Отдельный `RUN chown` копирует все файлы в новый слой и раздувает образ.

### Как узнать статус HEALTHCHECK контейнера?
- [x] В столбце STATUS команды docker ps (healthy или unhealthy)
- [x] Через docker inspect в поле State.Health
- [ ] Через docker history
- [ ] Только в Kubernetes
> Docker Compose умеет ждать healthy через `depends_on: condition: service_healthy`.

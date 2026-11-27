---
title: GitLab Runner
slug: gitlab-runner
description: Что такое GitLab Runner, типы раннеров, установка на Linux, регистрация через токен аутентификации, config.toml, теги и executors shell, docker и kubernetes, Docker-in-Docker и безопасность.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: GitLab Docs — GitLab Runner
    url: https://docs.gitlab.com/runner/
    type: документация
  - title: GitLab Docs — Install GitLab Runner using the official repositories
    url: https://docs.gitlab.com/runner/install/linux-repository/
    type: документация
  - title: GitLab Docs — Registering runners
    url: https://docs.gitlab.com/runner/register
    type: документация
  - title: GitLab Docs — Executors
    url: https://docs.gitlab.com/runner/executors
    type: документация
---

# GitLab Runner

**GitLab Runner** — приложение на Go, которое опрашивает GitLab, берёт задачи из очереди и выполняет их. Сам GitLab задачи не выполняет. На GitLab.com есть общие раннеры, но в компаниях почти всегда ставят **свои**: доступ во внутреннюю сеть, к серверам и реестрам, свои ресурсы и контроль.

```
 GitLab ◄── опрос (HTTPS) ── gitlab-runner ──► executor ──► задача
                              (на вашем сервере)   shell / docker / kubernetes
```

Раннер сам ходит в GitLab (исходящее соединение), поэтому ему не нужен входящий порт.

## Типы раннеров

| Тип | Кому доступен |
| --- | --- |
| **Instance** (shared) | Всем проектам инстанса GitLab |
| **Group** | Всем проектам группы |
| **Project** | Одному проекту |

Настройки раннера:

- **tags** — метки (`docker`, `prod-deploy`, `gpu`); задача с `tags: [prod-deploy]` попадёт только на раннер с таким тегом;
- **Run untagged jobs** — брать ли задачи без тегов;
- **Protected** — выполнять задачи только из защищённых веток (для раннеров с доступом к проду);
- **Locked** — нельзя подключить к другим проектам.

## Установка на Linux

```bash
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt install gitlab-runner
systemctl status gitlab-runner
```

Раннер работает как служба systemd от пользователя `gitlab-runner`. Для Docker executor заранее установите Docker. Можно запускать и сам раннер в контейнере `gitlab/gitlab-runner` или в Kubernetes через Helm-чарт.

## Регистрация

Современный способ:

1. В GitLab: **Settings → CI/CD → Runners → New project runner** — задать теги и описание.
2. GitLab выдаст **токен аутентификации раннера** (начинается с `glrt-`).
3. На сервере:

```bash
sudo gitlab-runner register \
  --non-interactive \
  --url "https://gitlab.com/" \
  --token "$RUNNER_TOKEN" \
  --executor "docker" \
  --docker-image alpine:latest \
  --description "docker-runner"
```

> [!note] Старые registration tokens
> В старых инструкциях раннер регистрируют общим registration token проекта и флагом `--registration-token`. Этот способ устарел — используйте токен аутентификации, созданный в интерфейсе вместе с раннером.

## config.toml

`/etc/gitlab-runner/config.toml`:

```toml
concurrent = 4

[[runners]]
  name = "docker-runner"
  url = "https://gitlab.com/"
  token = "glrt-..."
  executor = "docker"
  [runners.docker]
    image = "alpine:latest"
    privileged = false
    volumes = ["/cache"]
    pull_policy = ["if-not-present"]
```

- `concurrent` — сколько задач раннер выполняет одновременно (на все `[[runners]]`).
- Изменения подхватываются автоматически, перезапуск обычно не нужен.

```bash
sudo gitlab-runner list            # зарегистрированные раннеры
sudo gitlab-runner verify          # проверить связь с GitLab
sudo gitlab-runner status
sudo journalctl -u gitlab-runner -f
sudo gitlab-runner unregister --name docker-runner
```

## Executors — как выполняется задача

| Executor | Как работает | Плюсы | Минусы |
| --- | --- | --- | --- |
| **shell** | Команды выполняются прямо на сервере раннера от пользователя `gitlab-runner` | Просто, быстро, доступ к инструментам хоста | Нет изоляции, всё нужное ставить на хост вручную, задачи влияют друг на друга, `image:` игнорируется |
| **docker** | Каждая задача — новый контейнер из `image:`; `services:` — соседние контейнеры | Чистое окружение каждый раз, любые версии инструментов | Для сборки образов нужен dind или Kaniko |
| **kubernetes** | Каждая задача — новый под в кластере | Масштабирование, ресурсы кластера | Сложнее настройка |
| docker-autoscaler / instance | Автоматически создаёт облачные ВМ под задачи | Платите только за работу | Нужно облако |
| ssh, virtualbox, parallels, custom | Специальные случаи | — | В режиме поддержки, новых функций нет |

Выбор по умолчанию — **docker executor**. Shell — для особых задач, например деплоя на саму машину раннера.

## Сборка Docker-образов на раннере

1. **Docker-in-Docker**: `privileged = true` в config.toml + `services: [docker:dind]`. Изоляция между задачами, но привилегированный контейнер.
2. **Проброс сокета**: `volumes = ["/var/run/docker.sock:/var/run/docker.sock"]`. Быстро и с общим кэшем, но **любая задача получает root на хосте раннера**.
3. **Kaniko / Buildah / BuildKit rootless** — сборка без привилегий и без демона.

> [!warning] Безопасность раннеров
> Раннер выполняет произвольный код из репозитория. Не регистрируйте shell-раннер или раннер с `docker.sock` для недоверенных проектов и форков. Раннер с доступом к проду делайте **Protected** с отдельным тегом.

## Практика

- [ ] Установить GitLab Runner на ВМ из официального репозитория и проверить службу
- [ ] Создать в проекте раннер с тегом `docker`, зарегистрировать его с docker executor и выполнить задачу на нём
- [ ] Зарегистрировать второй раннер с shell executor и тегом `shell`; выполнить на нём `whoami` и `which docker`
- [ ] Сравнить, что видит задача в shell и docker executor: файловую систему, установленные программы, переменные
- [ ] Собрать образ на docker-раннере через Docker-in-Docker (privileged) и через Kaniko
- [ ] Увеличить `concurrent` и запустить несколько задач одновременно
- [ ] Посмотреть логи раннера через journalctl во время выполнения задачи

## Тест

### Что делает GitLab Runner?
- [ ] Хранит репозитории
- [x] Получает задачи пайплайнов из GitLab и выполняет их с помощью выбранного executor
- [ ] Отображает интерфейс GitLab
- [ ] Хранит образы
> Сам GitLab задачи не выполняет.

### Нужен ли раннеру входящий открытый порт, чтобы получать задачи?
- [ ] Да, порт 8080
- [x] Нет: раннер сам опрашивает GitLab по HTTPS (исходящее соединение)
- [ ] Да, порт 22
- [ ] Только для docker executor
> Поэтому раннер можно поставить во внутреннюю сеть за NAT.

### Чем shell executor отличается от docker executor?
- [x] Shell выполняет команды прямо на хосте раннера без изоляции, ключ image игнорируется
- [x] Docker запускает каждую задачу в новом контейнере из указанного образа
- [ ] Shell работает только на Windows
- [ ] Docker executor не поддерживает services
> Docker executor даёт чистое окружение на каждую задачу.

### Как Kubernetes executor выполняет задачу?
- [ ] На мастер-ноде через kubectl exec
- [x] Создаёт для каждой задачи отдельный под в кластере
- [ ] Через SSH на ноду
- [ ] Через Docker Compose
> Сервисы задачи становятся контейнерами того же пода.

### Где хранится конфигурация зарегистрированных раннеров на Linux?
= /etc/gitlab-runner/config.toml
= config.toml
> Файл перечитывается автоматически.

### Что задаёт параметр concurrent в config.toml?
- [ ] Число раннеров в GitLab
- [x] Сколько задач этот процесс gitlab-runner может выполнять одновременно
- [ ] Число повторов задачи
- [ ] Число этапов
> Ограничение для всех секций runners в файле.

### Как сделать, чтобы задача деплоя в прод выполнялась только на определённом раннере?
- [ ] Указать имя раннера в script
- [x] Повесить на раннер тег (например, prod-deploy) и указать tags: [prod-deploy] в задаче
- [ ] Использовать when: manual
- [ ] Указать stage: prod
> Такой раннер стоит сделать ещё и Protected.

### Что даёт опция Protected у раннера?
- [ ] Раннер нельзя удалить
- [x] Раннер выполняет задачи только из пайплайнов защищённых веток и тегов
- [ ] Раннер шифрует логи
- [ ] Раннер работает без интернета
> Код из любой ветки не доберётся до раннера с доступом к проду.

### Чем опасно пробросить /var/run/docker.sock в контейнеры задач?
- [ ] Ничем, это лучший способ
- [x] Любая задача сможет управлять Docker хоста и фактически получить root на машине раннера
- [ ] Перестанет работать кэш
- [ ] Задачи будут выполняться медленнее
> Безопасные альтернативы — Kaniko, Buildah, BuildKit rootless.

### Какой executor рекомендуется по умолчанию для большинства проектов?
= docker
= docker executor
> Чистое и воспроизводимое окружение на каждую задачу.

### Как сейчас рекомендуется регистрировать новый раннер?
- [ ] Общим registration token проекта
- [x] Создать раннер в интерфейсе GitLab, получить токен аутентификации и выполнить gitlab-runner register с ним
- [ ] Вписать раннер вручную в базу GitLab
- [ ] Раннер регистрируется сам после установки
> Старый способ с registration token устарел.

### Задачи с tags: [docker] висят в pending, хотя раннер онлайн. Возможные причины?
- [x] У раннера нет тега docker
- [x] Раннер не назначен этому проекту или группе
- [x] Раннер Protected, а пайплайн из незащищённой ветки
- [ ] В script опечатка
> Опечатка в script даст failed, а не pending.

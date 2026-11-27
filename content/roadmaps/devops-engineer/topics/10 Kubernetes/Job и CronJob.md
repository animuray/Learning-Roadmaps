---
title: Job и CronJob
slug: job-i-cronjob
description: Разовые задачи в Kubernetes — Job с completions, parallelism, backoffLimit и activeDeadlineSeconds, очистка через ttlSecondsAfterFinished; задачи по расписанию — CronJob, concurrencyPolicy, история и часовые пояса.
duration: 45
level: Основы
quizSize: 10
materials:
  - title: Kubernetes Docs — Workload Management (Job и CronJob)
    url: https://kubernetes.io/docs/concepts/workloads/controllers/_print
    type: документация
  - title: Kubernetes Docs — Workloads
    url: https://www.kubernetes.io/docs/concepts/workloads/
    type: документация
---

# Job и CronJob

Deployment поддерживает процессы, которые должны работать **всегда**. А есть задачи, которые должны **выполниться и завершиться**: миграции базы, бэкап, отчёт, пересчёт данных, отправка рассылки.

## Job

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migrate
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 600
  ttlSecondsAfterFinished: 3600
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: registry.example.com/app:1.4.2
          command: ["python", "manage.py", "migrate"]
          envFrom:
            - secretRef:
                name: app-db
```

| Поле | Смысл |
| --- | --- |
| `restartPolicy` | **Обязательно** `Never` или `OnFailure` (не `Always`) |
| `backoffLimit` | Сколько раз повторять при ошибке (по умолчанию 6), с растущей задержкой |
| `activeDeadlineSeconds` | Максимальное время всей задачи — затем Job помечается Failed |
| `ttlSecondsAfterFinished` | Удалить Job и его поды через N секунд после окончания |
| `completions` | Сколько успешных завершений нужно (по умолчанию 1) |
| `parallelism` | Сколько подов выполнять одновременно |

- `Never` — при ошибке создаётся **новый под** (старые остаются для разбора логов); `OnFailure` — перезапускается контейнер в том же поде.
- `completions: 10, parallelism: 3` — обработать 10 «порций», по 3 одновременно. `completionMode: Indexed` даёт каждому поду индекс `JOB_COMPLETION_INDEX`.
- Задача должна быть **идемпотентной**: при повторе после сбоя она может выполниться ещё раз.

```bash
kubectl apply -f job.yaml
kubectl get jobs
kubectl wait --for=condition=complete job/db-migrate --timeout=300s
kubectl logs job/db-migrate
kubectl delete job db-migrate
kubectl create job manual-backup --from=cronjob/pg-backup   # разово запустить CronJob
```

## CronJob

CronJob создаёт Job по расписанию в формате cron:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: pg-backup
spec:
  schedule: "30 2 * * *"
  timeZone: "Europe/Moscow"
  concurrencyPolicy: Forbid
  startingDeadlineSeconds: 300
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: backup
              image: postgres:16
              command: ["sh", "-c", "pg_dump -h pg -U app app | gzip > /backup/app-$(date +%F).sql.gz"]
              volumeMounts:
                - name: backup
                  mountPath: /backup
          volumes:
            - name: backup
              persistentVolumeClaim:
                claimName: backups
```

| Поле | Смысл |
| --- | --- |
| `schedule` | Cron: минута, час, день месяца, месяц, день недели |
| `timeZone` | Часовой пояс расписания (иначе — часовой пояс kube-controller-manager, обычно UTC) |
| `concurrencyPolicy` | `Allow` (по умолчанию) — запускать параллельно; `Forbid` — пропустить, если прошлый ещё идёт; `Replace` — убить прошлый и запустить новый |
| `startingDeadlineSeconds` | Если запуск пропущен (контроллер был недоступен), насколько поздно его ещё можно выполнить |
| `suspend: true` | Временно приостановить расписание |
| `*JobsHistoryLimit` | Сколько завершённых Job хранить |

Как и в обычном cron: CronJob может изредка запуститься **дважды** или **пропустить** запуск — задача должна быть идемпотентной, а для бэкапов нужен мониторинг «последний успешный бэкап был не позже N часов назад».

## Job и CronJob в CI/CD и Helm

- Миграции перед выкаткой — Job, который CI запускает и ждёт через `kubectl wait`, или Helm-хук `pre-upgrade`.
- Не делайте миграции init-контейнером в Deployment с несколькими репликами: они запустятся в каждой реплике одновременно.

## Практика

- [ ] Запустить Job, который считает число π (`perl -Mbignum=bpi -wle 'print bpi(2000)'`) и посмотреть его логи
- [ ] Сделать Job, который падает (`exit 1`), с `backoffLimit: 2` и `restartPolicy: Never`; посчитать созданные поды
- [ ] Запустить Job с `completions: 6` и `parallelism: 2` и понаблюдать за подами
- [ ] Создать CronJob, выполняющийся каждую минуту, с `concurrencyPolicy: Forbid`; посмотреть `kubectl get cronjob,jobs`
- [ ] Запустить CronJob вручную через `kubectl create job --from=cronjob/...`
- [ ] Сделать CronJob бэкапа PostgreSQL в PVC с часовым поясом `Europe/Moscow`

## Тест

### Чем Job отличается от Deployment?
- [ ] Ничем
- [x] Job запускает поды, которые должны выполнить работу и успешно завершиться, а Deployment поддерживает постоянно работающие поды
- [ ] Job нельзя запустить повторно
- [ ] Job работает только по расписанию
> По расписанию Job создаёт CronJob.

### Какие значения restartPolicy допустимы для пода Job?
- [x] Never
- [x] OnFailure
- [ ] Always
- [ ] Sometimes
> Always противоречит смыслу задачи, которая должна завершиться.

### Что задаёт backoffLimit?
- [ ] Максимальное время работы Job
- [x] Сколько раз повторять задачу при ошибках, прежде чем пометить Job как Failed
- [ ] Число параллельных подов
- [ ] Время хранения Job
> По умолчанию 6 повторов с растущей задержкой.

### Как автоматически удалять завершённые Job и их поды?
- [ ] backoffLimit: 0
- [x] ttlSecondsAfterFinished
- [ ] activeDeadlineSeconds
- [ ] suspend: true
> Для CronJob ещё есть successfulJobsHistoryLimit и failedJobsHistoryLimit.

### Что означает concurrencyPolicy: Forbid в CronJob?
- [ ] Запретить CronJob
- [x] Не запускать новую задачу, если предыдущая ещё выполняется
- [ ] Убить предыдущую задачу и запустить новую
- [ ] Запускать задачи параллельно
> Replace убивает предыдущую, Allow (по умолчанию) — запускает параллельно.

### Какое расписание запустит CronJob каждый день в 02:30?
- [ ] `"2 30 * * *"`
- [x] `"30 2 * * *"`
- [ ] `"* * 2 30 *"`
- [ ] `"@daily 02:30"`
> Порядок полей cron: минута, час, день месяца, месяц, день недели.

### Почему задача в Job должна быть идемпотентной?
- [ ] Так требует YAML
- [x] При сбое она может быть выполнена повторно, а CronJob в редких случаях может запуститься дважды
- [ ] Иначе Job не создастся
- [ ] Чтобы уменьшить логи
> Например, миграции должны учитывать уже применённые изменения.

### Как разово запустить задачу, описанную в CronJob pg-backup?
= kubectl create job manual-backup --from=cronjob/pg-backup
= kubectl create job --from=cronjob/pg-backup
> Удобно, чтобы проверить CronJob, не дожидаясь расписания.

### Что делают completions и parallelism?
- [x] completions — сколько успешных завершений подов нужно для завершения Job
- [x] parallelism — сколько подов выполняется одновременно
- [ ] completions — число повторов при ошибке
- [ ] parallelism — число нод
> Так обрабатывают очередь работ несколькими подами.

### Почему миграции базы не стоит выполнять init-контейнером Deployment с несколькими репликами?
- [ ] Init-контейнеры не умеют подключаться к базе
- [x] Init-контейнер выполнится в каждой реплике, и миграции запустятся одновременно несколько раз
- [ ] Init-контейнеры выполняются после приложения
- [ ] Это запрещено Kubernetes
> Лучше отдельный Job из CI или Helm-хук pre-upgrade.

### В каком часовом поясе выполняется расписание CronJob, если timeZone не задан?
- [ ] В часовом поясе пользователя, создавшего CronJob
- [x] В часовом поясе kube-controller-manager — обычно UTC
- [ ] Всегда Europe/Moscow
- [ ] В часовом поясе ноды, где запустится под
> Явный timeZone избавляет от путаницы.

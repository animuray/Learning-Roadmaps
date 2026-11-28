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

## Лаборатория

Кластер — k3s на стенде.

```bash lib
# Kubernetes на стенде — k3s (один узел). root работает с /etc/rancher/k3s/k3s.yaml, ученик — со своим ~/.kube/config
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
# lab_kns имя — чистый namespace задачи (старый удаляется вместе со всем содержимым)
lab_kns() {
  kubectl delete ns "$1" --ignore-not-found --wait=true --timeout=120s >/dev/null 2>&1
  kubectl create ns "$1" >/dev/null
}
# убрать с узла метки и taint-ы, которые оставляют задачи про размещение подов
lab_knode() {
  kubectl taint nodes --all lab-dedicated- >/dev/null 2>&1
  kubectl label nodes --all disktype- zone- >/dev/null 2>&1
  true
}
# lab_kready ns селектор [секунд] — дождаться готовности подов
lab_kready() { kubectl -n "$1" wait --for=condition=Ready pod -l "$2" --timeout="${3:-90}s" >/dev/null 2>&1; }
# lab_kfiles каталог — каталог манифестов ученика (пустой)
lab_kfiles() { rm -rf "$1"; mkdir -p "$1"; chown -R student:student "$1"; }
lab_kj() { kubectl "$@" -o json 2>/dev/null; }
lab_traefik() { kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}'; }
```

```bash setup
lab_knode
```

### Пакетная задача

Создайте в namespace **`lab-jobs`** Job **`report`** (образ `busybox:1.36`), который выполняет команду `echo "report done"` и должен завершиться успешно **3 раза** (`completions`), запуская **не больше 2 подов одновременно**. При падении — **не больше 2 повторов**, а завершённый Job удаляется сам через **10 минут** после окончания.

```bash setup
lab_kns lab-jobs
```

```bash check
j=$(lab_kj -n lab-jobs get job report) || fail "Job report нет"
[ "$(echo "$j" | jq -r .spec.completions)" = 3 ] || fail "completions = $(echo "$j" | jq -r .spec.completions)"
[ "$(echo "$j" | jq -r .spec.parallelism)" = 2 ] || fail "parallelism = $(echo "$j" | jq -r .spec.parallelism)"
[ "$(echo "$j" | jq -r .spec.backoffLimit)" = 2 ] || fail "backoffLimit = $(echo "$j" | jq -r .spec.backoffLimit)"
[ "$(echo "$j" | jq -r .spec.ttlSecondsAfterFinished)" = 600 ] || fail "Job не удалится через 10 минут после завершения"
kubectl -n lab-jobs wait --for=condition=complete job/report --timeout=90s >/dev/null 2>&1 || fail "Job не завершился успешно"
[ "$(lab_kj -n lab-jobs get job report | jq -r .status.succeeded)" = 3 ] || fail "Успешных запусков не 3"
ok "report: 3 успешных пода, по 2 одновременно"
```

```text hint
1. Каркас Job — kubectl create job в режиме «показать на клиенте».
2. Число успешных завершений, параллелизм, лимит повторов и время жизни после завершения — поля спецификации Job.
3. У пода Job политика перезапуска не может быть Always.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/report.yaml <<'EOF'
apiVersion: batch/v1
kind: Job
metadata:
  name: report
  namespace: lab-jobs
spec:
  completions: 3
  parallelism: 2
  backoffLimit: 2
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: report
          image: busybox:1.36
          command: ["sh", "-c", "echo report done"]
EOF
kubectl apply -f ~/k8s/report.yaml
kubectl -n lab-jobs wait --for=condition=complete job/report --timeout=90s
```

```text review
Эталон — в «Решении».

- Job — для разовой работы до успешного завершения: миграции базы перед деплоем, пересчёт отчётов, импорт данных. Под перезапускается при ошибке до `backoffLimit`.
- `restartPolicy: Never` — новая попытка в **новом** поде (логи прошлых сохраняются); `OnFailure` — перезапуск контейнера в том же поде.
- `ttlSecondsAfterFinished` убирает завершённые Job — иначе они копятся и мешают `kubectl get pods`.
- `activeDeadlineSeconds` — общий тайм-аут: зависшая задача не будет висеть вечно.
```

### Расписание

Создайте в namespace **`lab-jobs`** CronJob **`cleanup`** (образ `busybox:1.36`, команда `echo cleanup`), который:

- запускается **каждые 15 минут**;
- **не запускает** новый экземпляр, пока не закончился предыдущий;
- хранит историю **2 успешных** и **1 неудачного** запуска.

Не дожидаясь расписания, **запустите его один раз вручную** — как Job **`cleanup-manual`**, созданный из этого CronJob.

```bash setup
lab_kns lab-jobs
```

```bash check
c=$(lab_kj -n lab-jobs get cronjob cleanup) || fail "CronJob cleanup нет"
[ "$(echo "$c" | jq -r .spec.schedule)" = "*/15 * * * *" ] || fail "Расписание — «$(echo "$c" | jq -r .spec.schedule)»"
[ "$(echo "$c" | jq -r .spec.concurrencyPolicy)" = Forbid ] || fail "Новый запуск может начаться, пока идёт предыдущий (concurrencyPolicy: $(echo "$c" | jq -r .spec.concurrencyPolicy))"
[ "$(echo "$c" | jq -r .spec.successfulJobsHistoryLimit)" = 2 ] && [ "$(echo "$c" | jq -r .spec.failedJobsHistoryLimit)" = 1 ] || fail "История запусков не 2 успешных / 1 неудачный"
j=$(lab_kj -n lab-jobs get job cleanup-manual) || fail "Job cleanup-manual нет — CronJob не запускали вручную"
[ "$(echo "$j" | jq -r '.metadata.ownerReferences[0].kind // .metadata.annotations["cronjob.kubernetes.io/instantiate"] // empty')" != "" ] || fail "cleanup-manual создан не из CronJob cleanup"
kubectl -n lab-jobs wait --for=condition=complete job/cleanup-manual --timeout=60s >/dev/null 2>&1 || fail "cleanup-manual не завершился"
ok "cleanup: */15, Forbid, ручной запуск выполнен"
```

```text hint
1. Расписание — в формате cron: пять полей (минута, час, день, месяц, день недели); «каждые N» — через косую черту.
2. Поведение при наложении запусков и глубина истории — поля спецификации CronJob; сам шаблон Job — внутри.
3. У kubectl create job есть ключ «из» — создать Job из шаблона CronJob.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/cleanup.yaml <<'EOF'
apiVersion: batch/v1
kind: CronJob
metadata:
  name: cleanup
  namespace: lab-jobs
spec:
  schedule: "*/15 * * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 2
  failedJobsHistoryLimit: 1
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: cleanup
              image: busybox:1.36
              command: ["sh", "-c", "echo cleanup"]
EOF
kubectl apply -f ~/k8s/cleanup.yaml
kubectl -n lab-jobs create job cleanup-manual --from=cronjob/cleanup
kubectl -n lab-jobs wait --for=condition=complete job/cleanup-manual --timeout=60s
```

```text review
Эталон: CronJob с `schedule: "*/15 * * * *"`, `concurrencyPolicy: Forbid` + `kubectl create job --from=cronjob/cleanup`.

- `concurrencyPolicy`: `Allow` (по умолчанию — можно параллельно), `Forbid` (пропустить запуск, если прошлый не закончился), `Replace` (убить прошлый). Для бэкапов и очистки — Forbid.
- Время — по часовому поясу kube-controller-manager (обычно UTC); с 1.27 есть `timeZone: Europe/Moscow`.
- Ручной запуск `--from=cronjob/...` — проверить задачу сразу после изменения, не дожидаясь расписания.
- `startingDeadlineSeconds` — сколько можно опоздать с запуском (после простоя кластера), иначе запуск пропускается.
```

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

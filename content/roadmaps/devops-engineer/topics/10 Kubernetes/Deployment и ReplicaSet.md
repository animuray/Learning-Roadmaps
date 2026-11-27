---
title: Deployment и ReplicaSet
slug: deployment-i-replicaset
description: Как Deployment управляет ReplicaSet и подами, стратегии RollingUpdate и Recreate, maxSurge и maxUnavailable, история и откат ревизий, масштабирование, пауза выкатки и типичные проблемы.
duration: 75
level: Основы
quizSize: 10
materials:
  - title: Kubernetes Docs — Deployments
    url: https://kubernetes.io/docs/concepts/workloads/controllers/deployment/
    type: документация
  - title: Kubernetes Docs — Update a Deployment Without Downtime
    url: https://kubernetes.io/docs/tasks/run-application/update-deployment-rolling/
    type: документация
  - title: Kubernetes Docs — kubectl Quick Reference
    url: https://kubernetes.io/docs/reference/kubectl/cheatsheet/
    type: документация
---

# Deployment и ReplicaSet

**Deployment** — основной способ запускать **stateless**-приложения: веб-сервисы, API, воркеры. Он гарантирует нужное число подов и умеет обновлять их без простоя.

```
 Deployment web  ─── управляет ───►  ReplicaSet web-7d9f (образ v2, 3 пода)  ──► pod pod pod
 (желаемое: 3 реплики, образ v2)     ReplicaSet web-5c6b (образ v1, 0 подов)  ← хранится для отката
```

- **ReplicaSet** поддерживает заданное число одинаковых подов по селектору. Напрямую его почти не создают.
- **Deployment** управляет ReplicaSet'ами: на каждое изменение шаблона пода создаёт новый ReplicaSet и плавно переносит реплики.

## Манифест

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  revisionHistoryLimit: 5
  selector:
    matchLabels:
      app: web
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: registry.example.com/web:1.4.2
          ports:
            - containerPort: 8000
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
```

- `selector.matchLabels` должен совпадать с `template.metadata.labels`. Селектор после создания менять нельзя.
- Rollout запускает **только изменение `template`** (образ, переменные, ресурсы). Изменение `replicas` — это просто масштабирование.

## Стратегии обновления

**RollingUpdate** (по умолчанию) — постепенно заменяет старые поды новыми:

- `maxSurge` — сколько подов **сверх** `replicas` можно создать во время выкатки (по умолчанию 25%);
- `maxUnavailable` — сколько подов **может быть недоступно** (по умолчанию 25%).

`maxSurge: 1, maxUnavailable: 0` — самая осторожная схема: сначала поднять новый под, дождаться его **readiness**, потом убрать старый. Без readiness-пробы Kubernetes считает под готовым сразу после старта контейнера — и может отправить трафик в ещё не готовое приложение.

**Recreate** — сначала удалить все старые поды, потом создать новые. Есть простой, но две версии не работают одновременно (нужно, например, при несовместимой миграции схемы или RWO-томе).

Blue-green и canary стандартный Deployment не умеет — их делают двумя Deployment + переключением Service/Ingress, через сервис-меш или инструменты вроде Argo Rollouts и Flagger.

## Управление выкаткой

```bash
kubectl set image deploy/web web=registry.example.com/web:1.4.3
kubectl apply -f deployment.yaml                  # предпочтительно: новый тег в манифесте из Git
kubectl rollout status deploy/web                 # дождаться окончания (удобно в CI)
kubectl rollout history deploy/web
kubectl rollout history deploy/web --revision=3
kubectl rollout undo deploy/web                   # откат на предыдущую ревизию
kubectl rollout undo deploy/web --to-revision=2
kubectl rollout pause deploy/web                  # накопить несколько изменений
kubectl rollout resume deploy/web
kubectl rollout restart deploy/web                # пересоздать поды без изменений (перечитать Secret, например)
kubectl annotate deploy/web kubernetes.io/change-cause="release 1.4.3"
```

Ревизии — это старые ReplicaSet (сколько хранить — `revisionHistoryLimit`). Откат = масштабирование старого ReplicaSet обратно.

> [!warning] undo и Git
> `kubectl rollout undo` меняет кластер, но не манифест в Git. При следующем `apply` (или синхронизации Argo CD) вернётся «плохая» версия. В GitOps откатываются коммитом.

## Масштабирование

```bash
kubectl scale deploy web --replicas=5
kubectl autoscale deploy web --min=2 --max=10 --cpu-percent=70    # HPA
```

Если используется HPA, **не указывайте `replicas` в манифесте** (или не применяйте его повторно) — иначе каждое `apply` будет сбрасывать число реплик, выставленное автоскейлером.

## Типичные проблемы выкатки

- Новые поды в `CrashLoopBackOff` или `ImagePullBackOff` — выкатка застревает: старые поды остаются (при `maxUnavailable: 0` сервис не пострадает). `kubectl rollout status` ждёт до `progressDeadlineSeconds` (по умолчанию 600) и сообщает об ошибке.
- Readiness никогда не проходит — выкатка не продвигается.
- Тег `latest` и `imagePullPolicy: IfNotPresent` — поды не обновляются, потому что шаблон не изменился. Используйте неизменяемые теги.

## Практика

- [ ] Создать Deployment с 3 репликами и посмотреть связку `kubectl get deploy,rs,pods -l app=web`
- [ ] Обновить образ и в соседнем терминале наблюдать `kubectl get pods -w` и `kubectl get rs`
- [ ] Выкатить несуществующий тег и посмотреть, как выкатка застряла; откатиться через `rollout undo`
- [ ] Сравнить `maxSurge: 1, maxUnavailable: 0` и стратегию `Recreate` при обновлении (с `curl` в цикле к сервису)
- [ ] Масштабировать до 5 и обратно до 1
- [ ] Посмотреть историю ревизий и откатиться на конкретную ревизию
- [ ] Удалить ReplicaSet руками и посмотреть, что сделает Deployment

## Тест

### Как связаны Deployment, ReplicaSet и Pod?
- [ ] Pod управляет ReplicaSet, а ReplicaSet — Deployment
- [x] Deployment управляет ReplicaSet'ами, а каждый ReplicaSet поддерживает нужное число подов
- [ ] Это три независимых объекта
- [ ] Deployment напрямую создаёт контейнеры
> На каждое изменение шаблона пода создаётся новый ReplicaSet.

### Какие изменения запускают новый rollout Deployment?
- [x] Изменение шаблона пода: образ, переменные окружения, ресурсы
- [ ] Изменение числа replicas
- [ ] Изменение аннотаций Deployment
- [ ] Удаление одного пода
> Изменение replicas — просто масштабирование.

### Что задают maxSurge и maxUnavailable?
- [x] maxSurge — сколько подов можно создать сверх replicas во время обновления
- [x] maxUnavailable — сколько подов может быть недоступно во время обновления
- [ ] Максимальное число ревизий
- [ ] Лимиты CPU и памяти
> По умолчанию оба 25%.

### Какая настройка RollingUpdate даёт обновление без снижения числа готовых подов?
- [ ] maxSurge: 0, maxUnavailable: 1
- [x] maxSurge: 1, maxUnavailable: 0
- [ ] type: Recreate
- [ ] maxSurge: 0, maxUnavailable: 0
> Обязательно нужна readiness-проба, иначе «готовность» определяется только стартом контейнера.

### Чем стратегия Recreate отличается от RollingUpdate?
- [ ] Ничем
- [x] Recreate удаляет все старые поды и только потом создаёт новые — есть простой, но версии не работают одновременно
- [ ] Recreate быстрее и без простоя
- [ ] Recreate используется только для StatefulSet
> Нужна, когда две версии не могут работать одновременно.

### Как откатить Deployment на предыдущую версию?
= kubectl rollout undo deploy/web
= kubectl rollout undo
> На конкретную ревизию — с флагом --to-revision.

### Почему kubectl rollout undo опасен в GitOps-процессе?
- [ ] Он удаляет Deployment
- [x] Он меняет только кластер; в Git остаётся новая версия, и следующая синхронизация вернёт её обратно
- [ ] Он не работает с RollingUpdate
- [ ] Он удаляет историю ревизий
> В GitOps откатываются revert-коммитом.

### Почему выкатка с тегом latest может не обновить поды?
- [ ] latest запрещён в Kubernetes
- [x] Шаблон пода не изменился, поэтому rollout не запускается; а при imagePullPolicy IfNotPresent ноды могут использовать старый закэшированный образ
- [ ] latest всегда указывает на первый образ
- [ ] Kubernetes не умеет скачивать latest
> Используйте неизменяемые теги (версию или SHA коммита).

### Как перезапустить все поды Deployment, не меняя манифест?
- [ ] kubectl delete deploy web
- [x] kubectl rollout restart deploy/web
- [ ] kubectl scale --replicas=0 навсегда
- [ ] kubectl rollout undo
> Например, чтобы приложение перечитало изменённый Secret.

### Почему при использовании HPA не стоит указывать replicas в манифесте Deployment?
- [ ] HPA не работает с replicas
- [x] Каждый apply будет сбрасывать число реплик к значению из манифеста, перебивая решение автоскейлера
- [ ] Это вызовет ошибку валидации
- [ ] replicas несовместим с RollingUpdate
> Число реплик в этом случае — зона ответственности HPA.

### Что хранит Deployment для возможности отката?
- [ ] Копию etcd
- [x] Старые ReplicaSet'ы (их число задаёт revisionHistoryLimit)
- [ ] Старые образы в реестре
- [ ] Логи подов
> Откат — это масштабирование старого ReplicaSet обратно.

### Как в CI дождаться окончания выкатки и узнать, успешна ли она?
- [ ] sleep 60
- [x] kubectl rollout status deploy/web — команда ждёт завершения и вернёт ошибку, если выкатка не прошла
- [ ] kubectl get pods один раз
- [ ] kubectl describe deploy
> Время ожидания ограничено progressDeadlineSeconds и флагом --timeout.

---
title: Практика — Helm chart для приложения
slug: praktika-helm-chart
description: Превратить манифесты приложения в Helm-чарт — values для реплик, тега образа, ресурсов и Ingress-хоста, файлы values-dev и values-prod, установка в два namespace, проверка, упаковка и деплой из CI.
duration: 240
level: Средний
quizSize: 10
materials:
  - title: Helm Docs — The Chart Template Developer's Guide
    url: https://helm.sh/docs/chart_template_guide
    type: документация
  - title: Helm Docs — Values Files
    url: https://helm.sh/docs/chart_template_guide/values_files
    type: документация
  - title: Helm Docs — Chart Development Tips and Tricks
    url: https://helm.sh/docs/howto/charts_tips_and_tricks
    type: документация
---

# Практика — Helm chart для приложения

Берём манифесты из прошлой практики и делаем из них чарт, который ставится в **два окружения** — `dev` и `prod` — с разными параметрами.

## Требования к чарту

В `values.yaml` должны настраиваться минимум:

- `replicaCount`;
- `image.repository` и `image.tag` (по умолчанию — `appVersion`);
- `resources` (requests и limits);
- `ingress.enabled`, `ingress.host`, `ingress.tls`;
- `env` — обычные переменные (в ConfigMap);
- `existingSecret` — имя Secret с паролями (секреты не кладём в values);
- `autoscaling.enabled`, `minReplicas`, `maxReplicas`, `targetCPU`;
- `probes` — пути и тайминги.

## Структура

```
charts/myapp/
├── Chart.yaml
├── values.yaml
├── values-dev.yaml
├── values-prod.yaml
└── templates/
    ├── _helpers.tpl
    ├── configmap.yaml
    ├── deployment.yaml
    ├── service.yaml
    ├── ingress.yaml
    ├── hpa.yaml
    ├── pdb.yaml
    ├── job-migrate.yaml
    └── NOTES.txt
```

`values-dev.yaml`:

```yaml
replicaCount: 1
resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    memory: 256Mi
ingress:
  enabled: true
  host: dev.app.example.com
env:
  LOG_LEVEL: debug
autoscaling:
  enabled: false
```

`values-prod.yaml`:

```yaml
replicaCount: 3
resources:
  requests:
    cpu: 250m
    memory: 256Mi
  limits:
    memory: 512Mi
ingress:
  enabled: true
  host: app.example.com
  tls: true
env:
  LOG_LEVEL: info
autoscaling:
  enabled: true
  minReplicas: 3
  maxReplicas: 10
  targetCPU: 70
pdb:
  minAvailable: 2
```

Фрагмент `templates/ingress.yaml`:

```yaml
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  ingressClassName: {{ .Values.ingress.className | default "traefik" }}
  {{- if .Values.ingress.tls }}
  tls:
    - hosts: [{{ .Values.ingress.host | quote }}]
      secretName: {{ include "myapp.fullname" . }}-tls
  {{- end }}
  rules:
    - host: {{ required "ingress.host обязателен" .Values.ingress.host | quote }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ include "myapp.fullname" . }}
                port:
                  number: {{ .Values.service.port }}
{{- end }}
```

Миграции — `job-migrate.yaml` с аннотациями `helm.sh/hook: pre-install,pre-upgrade` и `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`.

## Установка в два namespace

```bash
helm lint charts/myapp -f charts/myapp/values-prod.yaml
helm template myapp charts/myapp -f charts/myapp/values-prod.yaml | less

helm upgrade --install myapp charts/myapp -n dev --create-namespace \
  -f charts/myapp/values.yaml -f charts/myapp/values-dev.yaml --wait

helm upgrade --install myapp charts/myapp -n prod --create-namespace \
  -f charts/myapp/values.yaml -f charts/myapp/values-prod.yaml \
  --set image.tag=1.4.2 --wait --timeout 5m

helm list -A
kubectl get all -n dev
kubectl get all -n prod
```

Один чарт → два релиза с одинаковым именем в разных namespace → разное число реплик, ресурсы, хосты и HPA.

## Деплой из CI

```yaml
deploy-prod:
  stage: deploy
  image: alpine/helm:3.16
  environment: production
  script:
    - helm upgrade --install myapp charts/myapp -n prod
        -f charts/myapp/values.yaml -f charts/myapp/values-prod.yaml
        --set image.tag=$CI_COMMIT_SHORT_SHA --wait --timeout 5m
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      when: manual
```

Kubeconfig — переменная типа File с токеном ServiceAccount, у которого права только на namespace `prod`. Образ с Helm и его версию подбирайте под свою версию Helm (Helm 3 или Helm 4).

## Практика

- [ ] Создать чарт через `helm create` и заменить шаблоны своими манифестами из прошлой практики
- [ ] Вынести в values реплики, образ и тег, ресурсы, Ingress-хост, переменные, HPA и пробы
- [ ] Использовать `required` для обязательных значений и аннотацию `checksum/config` для перезапуска при изменении конфига
- [ ] Написать values-dev.yaml и values-prod.yaml и сравнить результат `helm template` для обоих
- [ ] Установить релизы в namespace dev и prod и убедиться, что параметры различаются
- [ ] Обновить prod новым тегом, затем откатить через `helm rollback`
- [ ] Добавить Job миграций как Helm-хук
- [ ] Упаковать чарт и выгрузить в OCI-реестр; установить из реестра
- [ ] Настроить деплой чарта из GitLab CI с ручным подтверждением для prod

## Тест

### Как установить один чарт в два окружения с разными параметрами?
- [ ] Скопировать чарт и поменять шаблоны
- [x] Установить два релиза в разные namespace с разными values-файлами (values-dev.yaml и values-prod.yaml)
- [ ] Использовать два кластера обязательно
- [ ] Менять values.yaml перед каждой установкой вручную
> Общие значения остаются в values.yaml.

### В каком порядке указывать файлы values, чтобы значения prod перекрывали значения по умолчанию?
- [ ] -f values-prod.yaml -f values.yaml
- [x] -f values.yaml -f values-prod.yaml — последний файл имеет приоритет
- [ ] Порядок не важен
- [ ] Только --set
> values.yaml чарта применяется автоматически, но явное указание делает порядок наглядным.

### Почему пароли не кладут в values-prod.yaml?
- [ ] Helm не поддерживает пароли
- [x] Values хранятся в Git и в истории релизов Helm; секреты лучше держать в отдельных Secret (созданных заранее или из хранилища секретов) и ссылаться на них
- [ ] Values не поддерживают строки
- [ ] Пароли автоматически шифруются
> В чарте — параметр existingSecret с именем Secret.

### Как передать тег образа из CI при деплое?
= --set image.tag=$CI_COMMIT_SHORT_SHA
= --set image.tag
> --set имеет наивысший приоритет.

### Как проверить, что шаблоны рендерятся правильно, до установки?
- [x] helm lint
- [x] helm template с нужными values
- [x] helm upgrade --install --dry-run --debug
- [ ] helm rollback
> Плагин helm-diff покажет разницу с установленным релизом.

### Зачем в CI добавляют --wait к helm upgrade --install?
- [ ] Чтобы ускорить установку
- [x] Чтобы команда дождалась готовности ресурсов и вернула ошибку, если выкатка не удалась, — пайплайн станет красным
- [ ] Чтобы подождать подтверждения
- [ ] Чтобы отключить хуки
> Вместе с --timeout ограничивает ожидание.

### Какие права нужны kubeconfig, которым CI деплоит в prod?
- [ ] cluster-admin
- [x] Минимально необходимые — только на ресурсы чарта в namespace prod, через отдельный ServiceAccount
- [ ] Права на все namespaces
- [ ] Никакие
> Kubeconfig хранится в защищённой переменной CI типа File.

### Почему Ingress в шаблоне обёрнут в условие на ingress.enabled?
- [ ] Так требует Kubernetes
- [x] Чтобы Ingress создавался только там, где он нужен, и чарт можно было установить без него
- [ ] Чтобы ускорить рендеринг
- [ ] Чтобы обойти RBAC
> Так же делают с HPA, PDB и другими необязательными ресурсами.

### Как откатить релиз myapp в namespace prod на предыдущую ревизию?
- [ ] kubectl rollout undo
- [x] helm rollback myapp -n prod (без номера — на предыдущую ревизию)
- [ ] helm uninstall myapp
- [ ] helm upgrade --rollback
> Номер ревизии можно указать явно, историю показывает helm history.

### Зачем Job миграций в чарте помечают аннотацией helm.sh/hook-delete-policy?
- [ ] Чтобы Job не выполнялся
- [x] Чтобы старый Job удалялся перед созданием нового и после успеха — иначе повторная установка упадёт из-за существующего объекта
- [ ] Чтобы Job выполнялся после удаления релиза
- [ ] Чтобы Job попал в values
> Значения before-hook-creation и hook-succeeded.

### Что должно различаться между values-dev и values-prod в этой практике?
- [x] Число реплик и ресурсы
- [x] Ingress-хост и TLS
- [x] Включение HPA и PDB
- [ ] Шаблоны манифестов
> Шаблоны общие — в этом смысл чарта.

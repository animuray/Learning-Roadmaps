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

## Лаборатория

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

### Свой чарт для приложения

Создайте Helm-чарт **`~/charts/notes`** для приложения «заметки» (`hashicorp/http-echo:1.0`, порт 5678) с шаблонами Deployment, Service и Ingress. Через `values.yaml` должны настраиваться:

- `replicaCount` (по умолчанию 1);
- `message` — текст ответа (по умолчанию `notes`);
- `ingress.enabled` (по умолчанию `false`) и `ingress.host` — **Ingress создаётся только при `ingress.enabled: true`**.

Имена объектов — от имени релиза. Чарт должен проходить **`helm lint`**. Установите релиз **`notes`** в namespace **`lab-chart`** с **2 репликами**, сообщением **`notes v1`** и включённым Ingress на хосте **`notes.lab`** (класс `traefik`).

```bash setup
lab_kns lab-chart
helm -n lab-chart uninstall notes >/dev/null 2>&1
rm -rf /home/student/charts/notes && mkdir -p /home/student/charts && chown -R student:student /home/student/charts
true
```

```bash check
c=/home/student/charts/notes
[ -f $c/Chart.yaml ] || fail "Нет ~/charts/notes/Chart.yaml"
su - student -c "helm lint $c" >/tmp/lab-lint.log 2>&1 || fail "helm lint находит ошибки: $(grep -E 'ERROR|WARNING' /tmp/lab-lint.log | head -2 | tr '\n' ' ')"
off=$(su - student -c "helm template t $c" 2>/dev/null)
echo "$off" | grep -q 'kind: Ingress' && fail "С ingress.enabled=false (по умолчанию) чарт всё равно создаёт Ingress"
echo "$off" | grep -q 'kind: Deployment' && echo "$off" | grep -q 'kind: Service' || fail "Чарт не создаёт Deployment и Service"
on=$(su - student -c "helm template t $c --set ingress.enabled=true --set ingress.host=x.lab" 2>/dev/null)
echo "$on" | grep -q 'kind: Ingress' && echo "$on" | grep -q 'host: x.lab' || fail "С ingress.enabled=true и ingress.host чарт не создаёт Ingress для этого хоста"
r2=$(su - student -c "helm template other $c" 2>/dev/null | grep -E '^\s+name:' | head -1)
echo "$r2" | grep -q other || fail "Имена объектов не зависят от имени релиза"
[ "$(helm -n lab-chart status notes -o json 2>/dev/null | jq -r .info.status)" = deployed ] || fail "Релиза notes в lab-chart нет"
kubectl -n lab-chart get deploy -o json | jq -e '.items[] | select(.spec.replicas == 2)' >/dev/null || fail "Deployment релиза не с 2 репликами"
kubectl -n lab-chart wait --for=condition=Available deploy --all --timeout=60s >/dev/null 2>&1
t=$(lab_traefik)
for k in $(seq 15); do r=$(curl -s --max-time 3 -H 'Host: notes.lab' http://$t/); [ "$r" = "notes v1" ] && break; sleep 1; done
[ "$r" = "notes v1" ] || fail "notes.lab отвечает «$(echo "$r" | head -c 60)»"
ok "чарт notes: lint OK, Ingress по флагу, релиз отвечает «$r»"
```

```text hint
1. Каркас чарта создаёт helm create — но в нём много лишнего; можно начать с пустого каталога: Chart.yaml, values.yaml и каталог templates.
2. В шаблонах — имя релиза и значения из values через двойные фигурные скобки. Весь шаблон Ingress обернуть в условный блок по флагу.
3. Проверить: линтер, отрисовка шаблонов с разными значениями, затем установка с файлом значений или ключами.
```

```bash solution
c=~/charts/notes && mkdir -p $c/templates
cat > $c/Chart.yaml <<'EOF'
apiVersion: v2
name: notes
description: Notes application
version: 0.1.0
appVersion: "1.0"
EOF
cat > $c/values.yaml <<'EOF'
replicaCount: 1
message: notes
ingress:
  enabled: false
  host: notes.local
  className: traefik
EOF
cat > $c/templates/deployment.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}
  labels:
    app.kubernetes.io/name: {{ .Chart.Name }}
    app.kubernetes.io/instance: {{ .Release.Name }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app.kubernetes.io/instance: {{ .Release.Name }}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: {{ .Chart.Name }}
        app.kubernetes.io/instance: {{ .Release.Name }}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text={{ .Values.message }}"]
          ports:
            - containerPort: 5678
          readinessProbe:
            httpGet: {path: /, port: 5678}
EOF
cat > $c/templates/service.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}
spec:
  selector:
    app.kubernetes.io/instance: {{ .Release.Name }}
  ports:
    - port: 80
      targetPort: 5678
EOF
cat > $c/templates/ingress.yaml <<'EOF'
{{- if .Values.ingress.enabled }}
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: {{ .Release.Name }}
spec:
  ingressClassName: {{ .Values.ingress.className }}
  rules:
    - host: {{ .Values.ingress.host }}
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: {{ .Release.Name }}
                port:
                  number: 80
{{- end }}
EOF
helm lint $c
helm install notes $c -n lab-chart --set replicaCount=2 --set message="notes v1" --set ingress.enabled=true --set ingress.host=notes.lab
kubectl -n lab-chart rollout status deploy/notes
```

```text review
Эталон — в «Решении».

- `{{- if .Values.ingress.enabled }} ... {{- end }}` — необязательные части чарта. Минус убирает лишние переводы строк.
- Имена от `.Release.Name` — можно поставить два релиза одного чарта в один namespace без конфликтов. Метки `app.kubernetes.io/*` — общий стандарт, их понимают дашборды и инструменты.
- `helm lint` и `helm template ... | kubectl apply --dry-run=server -f -` — проверки чарта в CI до установки. `helm create` даёт полный каркас с `_helpers.tpl` (общие метки и имена через `include`).
- Версии: `version` — версия чарта (меняется при изменении шаблонов), `appVersion` — версия приложения. Чарты публикуют в OCI-реестр: `helm push notes-0.1.0.tgz oci://registry/charts`.
```

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

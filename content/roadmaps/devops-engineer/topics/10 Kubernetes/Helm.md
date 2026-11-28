---
title: Helm
slug: helm
description: Helm — пакетный менеджер Kubernetes — chart, release и репозитории (включая OCI), структура чарта, values и их приоритеты, шаблоны Go и функции, команды install, upgrade, rollback, template, хуки, Helm 4.
duration: 90
level: Средний
quizSize: 10
materials:
  - title: Helm Docs — The Chart Template Developer's Guide
    url: https://helm.sh/docs/chart_template_guide
    type: документация
  - title: Helm Docs — Values Files
    url: https://helm.sh/docs/chart_template_guide/values_files
    type: документация
  - title: Helm Docs — Charts
    url: https://helm.sh/docs/topics/charts
    type: документация
  - title: Helm Docs — Chart Development Tips and Tricks
    url: https://helm.sh/docs/howto/charts_tips_and_tricks
    type: документация
  - title: Helm Blog — Helm 4 Released
    url: https://helm.sh/blog/helm-4-released
    type: статья
---

# Helm

Приложение в Kubernetes — это пачка манифестов: Deployment, Service, Ingress, ConfigMap, Secret, HPA, ServiceAccount. Для dev и prod они почти одинаковые, но отличаются образом, репликами, доменом, ресурсами. Копировать YAML — плохо. **Helm** — пакетный менеджер Kubernetes: **шаблонизирует** манифесты и **управляет установками** как версиями.

## Термины

- **Chart** — пакет: шаблоны манифестов + значения по умолчанию + метаданные.
- **Values** — параметры чарта (`values.yaml` и ваши переопределения).
- **Release** — установленный экземпляр чарта в кластере с именем и **историей ревизий**. Один чарт можно установить много раз (`app-dev`, `app-prod`).
- **Repository** — где хранятся чарты: классический HTTP-репозиторий (`index.yaml`) или **OCI-реестр** (тот же, что для образов: GitLab Registry, Harbor, ghcr.io).

Helm хранит состояние релизов в Secret'ах в namespace релиза — отдельного серверного компонента нет (Tiller был в Helm 2). В ноябре 2025 вышел **Helm 4** — первая мажорная версия за 6 лет; чарты Helm 3 в основном совместимы, а поддержка Helm 3 заканчивается.

## Использование готовых чартов

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm search repo prometheus-community
helm show values prometheus-community/kube-prometheus-stack > monitoring-values.yaml

helm install monitoring prometheus-community/kube-prometheus-stack -n monitoring --create-namespace -f monitoring-values.yaml
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack -n monitoring -f monitoring-values.yaml --version 79.0.0
helm list -A
helm status monitoring -n monitoring
helm history monitoring -n monitoring
helm rollback monitoring 2 -n monitoring
helm uninstall monitoring -n monitoring

helm install cert-manager oci://quay.io/jetstack/charts/cert-manager -n cert-manager --create-namespace --set crds.enabled=true
```

`helm upgrade --install` — идемпотентная команда для CI: установит, если релиза нет, обновит, если есть. Добавляйте `--wait --timeout 5m`, чтобы команда дождалась готовности ресурсов. Номера версий в примерах условные — смотрите актуальные в `helm search repo -l` или на Artifact Hub.

> [!warning] Bitnami больше не бесплатный «магазин всего»
> Много лет чарты Bitnami (`bitnami/postgresql`, `bitnami/redis`…) были стандартом для учёбы и прода. С осени 2025 года бесплатный каталог Bitnami сильно урезан: версионные образы переехали в неподдерживаемый `bitnamilegacy`, полный каталог — по платной подписке. В старых инструкциях и чужих кластерах вы их ещё встретите, но для новых проектов берите официальные чарты проектов (prometheus-community, cert-manager, Grafana, Traefik), операторы (CloudNativePG для PostgreSQL) или свои чарты — и всегда проверяйте, откуда берутся образы.

## Структура чарта

```bash
helm create myapp
```

```
myapp/
├── Chart.yaml          # имя, версия чарта (version), версия приложения (appVersion), зависимости
├── values.yaml         # значения по умолчанию
├── values.schema.json  # (необязательно) JSON Schema для проверки values
├── charts/             # зависимые чарты (subcharts)
├── templates/
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── hpa.yaml
│   ├── _helpers.tpl    # именованные шаблоны (define), файл не превращается в манифест
│   ├── NOTES.txt       # подсказка после установки
│   └── tests/
└── .helmignore
```

`Chart.yaml`:

```yaml
apiVersion: v2
name: myapp
version: 0.3.0
appVersion: "1.4.2"
dependencies:
  - name: redis
    version: "1.x.x"
    repository: oci://registry.gitlab.com/team/charts
    condition: redis.enabled
```

`version` — версия **чарта** (меняется при изменении шаблонов), `appVersion` — версия **приложения**.

## Шаблоны

Шаблоны — Go templates с функциями библиотеки Sprig:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "myapp.fullname" . }}
  labels:
    {{- include "myapp.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "myapp.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      annotations:
        checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
      labels:
        {{- include "myapp.selectorLabels" . | nindent 8 }}
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          env:
            {{- range $key, $value := .Values.env }}
            - name: {{ $key }}
              value: {{ $value | quote }}
            {{- end }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
```

- Встроенные объекты: `.Values`, `.Release.Name`, `.Release.Namespace`, `.Chart.Name`, `.Chart.AppVersion`, `.Capabilities`.
- Управление: `if`/`else`, `with`, `range`; `{{-` и `-}}` съедают пробелы и переводы строк.
- Функции: `default`, `required "сообщение"`, `quote`, `toYaml`, `nindent`, `include`, `tpl`, `sha256sum`, `lookup`.
- `required` — упасть с понятной ошибкой, если обязательное значение не задано.

## Values и их приоритет

```yaml
replicaCount: 2
image:
  repository: registry.gitlab.com/team/myapp
  tag: ""
resources:
  requests:
    cpu: 100m
    memory: 128Mi
ingress:
  enabled: false
  host: ""
autoscaling:
  enabled: false
env:
  LOG_LEVEL: info
```

Приоритет (от низшего к высшему): `values.yaml` чарта → `values.yaml` родительского чарта (для subchart) → файлы `-f` (последующий перекрывает предыдущий) → `--set`.

```bash
helm upgrade --install myapp ./myapp -n prod -f values.yaml -f values-prod.yaml --set image.tag=$CI_COMMIT_SHORT_SHA
helm get values myapp -n prod          # какие значения применены
helm get manifest myapp -n prod        # итоговые манифесты в кластере
```

## Отладка и качество

```bash
helm lint ./myapp
helm template myapp ./myapp -f values-prod.yaml          # отрендерить локально, без кластера
helm upgrade --install myapp ./myapp --dry-run --debug
helm diff upgrade myapp ./myapp -f values-prod.yaml      # плагин helm-diff
helm package ./myapp && helm push myapp-0.3.0.tgz oci://registry.gitlab.com/team/charts
```

## Хуки

Аннотация `helm.sh/hook: pre-install,pre-upgrade` на Job — выполнить, например, миграции **до** обновления. Есть `post-install`, `pre-delete`, `test` и др.; `helm.sh/hook-delete-policy` — когда удалять объекты хука.

## Альтернативы

**Kustomize** (встроен в kubectl: `kubectl apply -k`) — без шаблонов: базовые манифесты + патчи для окружений. Часто Helm используют для сторонних приложений, а Kustomize или Helm — для своих. Argo CD и Flux умеют и то, и другое.

## Практика

- [ ] Установить kube-prometheus-stack или cert-manager из официального чарта с собственным values-файлом; посмотреть `helm list`, `status`, `get values`
- [ ] Обновить релиз с другим параметром, посмотреть `history` и откатиться через `rollback`
- [ ] Создать свой чарт через `helm create`, разобрать сгенерированные шаблоны и `_helpers.tpl`
- [ ] Отрендерить чарт через `helm template` с разными values и сравнить результат
- [ ] Добавить в шаблон `required` для обязательного значения и проверить ошибку
- [ ] Добавить аннотацию `checksum/config`, изменить ConfigMap в values и убедиться, что поды пересоздались
- [ ] Упаковать чарт и выгрузить его в OCI-реестр GitLab (или локальный registry)

## Лаборатория

Helm 3 установлен; кластер — k3s на стенде. Чарты в задачах — локальные (без интернета).

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
# lab_chart каталог — учебный чарт «web» (Deployment + Service), версия образа и реплики — из values
lab_chart() {
  rm -rf "$1"; mkdir -p "$1/templates"; chown student:student "$(dirname "$1")"
  cat > "$1/Chart.yaml" <<'EOF'
apiVersion: v2
name: web
version: 0.1.0
appVersion: "1.0"
EOF
  cat > "$1/values.yaml" <<'EOF'
replicaCount: 1
message: "hello from helm"
service:
  port: 80
EOF
  cat > "$1/templates/deployment.yaml" <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-web
  labels:
    app: {{ .Release.Name }}-web
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ .Release.Name }}-web
  template:
    metadata:
      labels:
        app: {{ .Release.Name }}-web
    spec:
      containers:
        - name: web
          image: hashicorp/http-echo:1.0
          args: ["-text={{ .Values.message }}"]
          ports:
            - containerPort: 5678
EOF
  cat > "$1/templates/service.yaml" <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: {{ .Release.Name }}-web
spec:
  selector:
    app: {{ .Release.Name }}-web
  ports:
    - port: {{ .Values.service.port }}
      targetPort: 5678
EOF
  chown -R student:student "$1"
}
```

```bash setup
lab_knode
```

### Установить релиз со своими значениями

В `~/charts/web` лежит чарт. Установите его как релиз **`shop`** в namespace **`lab-helm`** с **2 репликами** и сообщением **`shop v1`** — значения передайте **файлом** `~/charts/shop-values.yaml`, не правя сам чарт.

```bash setup
lab_kns lab-helm
helm -n lab-helm uninstall shop >/dev/null 2>&1; true
lab_chart /home/student/charts/web
rm -f /home/student/charts/shop-values.yaml
md5sum /home/student/charts/web/values.yaml > /var/lib/lab/helm-values.md5
```

```bash check
md5sum -c --quiet /var/lib/lab/helm-values.md5 >/dev/null 2>&1 || fail "Изменён values.yaml самого чарта — значения нужно передавать снаружи"
[ -f /home/student/charts/shop-values.yaml ] || fail "Нет ~/charts/shop-values.yaml"
st=$(helm -n lab-helm status shop -o json 2>/dev/null | jq -r .info.status) || true
[ "$st" = deployed ] || fail "Релиза shop в lab-helm нет или он не deployed ($st)"
v=$(helm -n lab-helm get values shop -o json)
[ "$(echo "$v" | jq -r .replicaCount)" = 2 ] && [ "$(echo "$v" | jq -r .message)" = "shop v1" ] || fail "Значения релиза: $v"
kubectl -n lab-helm rollout status deploy/shop-web --timeout=90s >/dev/null 2>&1 || fail "Deployment shop-web не раскатился"
[ "$(lab_kj -n lab-helm get deploy shop-web | jq -r .status.readyReplicas)" = 2 ] || fail "Готовых реплик не 2"
ok "релиз shop: $(helm -n lab-helm list -o json | jq -r '.[0] | "\(.chart) rev \(.revision)"')"
```

```text hint
1. Создать файл значений: только то, что отличается от значений чарта по умолчанию.
2. Установка релиза: имя, путь к чарту, namespace и ключ «файл значений».
3. Посмотреть, с какими значениями установлен релиз, — подкоманда получения значений.
```

```bash solution
printf 'replicaCount: 2\nmessage: "shop v1"\n' > ~/charts/shop-values.yaml
helm template shop ~/charts/web -f ~/charts/shop-values.yaml | head -30
helm install shop ~/charts/web -n lab-helm -f ~/charts/shop-values.yaml
helm -n lab-helm get values shop
kubectl -n lab-helm rollout status deploy/shop-web
```

```text review
Эталон: `helm install shop ~/charts/web -n lab-helm -f shop-values.yaml`.

- Чарт — шаблоны манифестов + значения по умолчанию; релиз — установленный экземпляр чарта со своими значениями. Один чарт → релизы для dev, stage, prod с разными `values-*.yaml`.
- `helm template` — отрисовать манифесты без установки (посмотреть, что получится, или отдать в Argo CD); `--dry-run` — проверка с сервером.
- `-f` можно указать несколько раз (общие + окружение), `--set key=value` — точечно; приоритет у последнего.
- Чужие чарты из репозиториев: `helm repo add bitnami ...`, `helm install pg bitnami/postgresql --version 15.5.0` — версию фиксируйте всегда.
```

```text notes
--set\s => Значения передавались через --set — для одного-двух удобно, но набор значений релиза лучше держать файлом в Git.
```

### Обновить и откатить релиз

Релиз **`shop`** в **`lab-helm`** работает (ревизия 1, сообщение `shop v1`). Обновите его до сообщения **`shop v2`** (ревизия 2), убедитесь, что новая версия отвечает, затем **откатите** релиз на ревизию 1. В итоге сервис снова отвечает `shop v1`, а в истории релиза — 3 ревизии.

```bash setup
lab_kns lab-helm
helm -n lab-helm uninstall shop >/dev/null 2>&1
lab_chart /home/student/charts/web
printf 'replicaCount: 1\nmessage: "shop v1"\n' > /home/student/charts/shop-values.yaml
chown student:student /home/student/charts/shop-values.yaml
helm install shop /home/student/charts/web -n lab-helm -f /home/student/charts/shop-values.yaml >/dev/null
kubectl -n lab-helm rollout status deploy/shop-web --timeout=90s >/dev/null
kubectl -n lab-helm run client --image=busybox:1.36 --restart=Never --command -- sleep 100000 >/dev/null
```

```bash check
h=$(helm -n lab-helm history shop -o json 2>/dev/null) || fail "Релиза shop нет"
[ "$(echo "$h" | jq length)" -ge 3 ] || fail "В истории релиза $(echo "$h" | jq length) ревизии — обновление и откат не выполнены"
echo "$h" | jq -e '.[] | select(.revision == 2)' >/dev/null || fail "Нет ревизии 2"
last=$(echo "$h" | jq -r '.[-1].description')
echo "$last" | grep -qi 'rollback to 1' || fail "Последняя ревизия — не откат на 1: «$last»"
helm -n lab-helm get values shop --revision 2 -o json | jq -e '.message == "shop v2"' >/dev/null || fail "Ревизия 2 была не с сообщением shop v2"
kubectl -n lab-helm rollout status deploy/shop-web --timeout=60s >/dev/null 2>&1
kubectl -n lab-helm wait --for=condition=Ready pod/client --timeout=60s >/dev/null 2>&1
for k in $(seq 15); do r=$(kubectl -n lab-helm exec client -- wget -qO- -T 2 http://shop-web/ 2>/dev/null); [ "$r" = "shop v1" ] && break; sleep 1; done
[ "$r" = "shop v1" ] || fail "Сервис отвечает «$r», а после отката должен «shop v1»"
ok "$(echo "$h" | jq -r '.[] | "rev \(.revision): \(.description)"' | tr '\n' ';')"
```

```text hint
1. Обновление релиза — подкоманда upgrade с тем же чартом и новыми значениями.
2. История ревизий и откат на номер ревизии — отдельные подкоманды helm.
3. Откат тоже создаёт новую ревизию.
```

```bash solution
sed -i 's/shop v1/shop v2/' ~/charts/shop-values.yaml
helm upgrade shop ~/charts/web -n lab-helm -f ~/charts/shop-values.yaml
kubectl -n lab-helm rollout status deploy/shop-web
kubectl -n lab-helm exec client -- wget -qO- http://shop-web/
helm -n lab-helm rollback shop 1
kubectl -n lab-helm rollout status deploy/shop-web
helm -n lab-helm history shop
```

```text review
Эталон: `helm upgrade` → `helm history` → `helm rollback shop 1`.

- Helm хранит каждую ревизию релиза (манифесты + значения) в Secret в namespace релиза — отсюда история и откат. `--history-max` ограничивает их число.
- Откат = новая ревизия с содержимым старой: история только растёт, как `git revert`.
- `helm upgrade --install` — установить или обновить одной командой (так пишут в CI). `--atomic` — при неудаче обновления откатиться автоматически, `--wait` — дождаться готовности подов.
- Значения в CI не теряйте: `upgrade` без `-f` (или с `--reset-values`) вернёт значения по умолчанию из чарта; `--reuse-values` — оставить прежние.
```

## Тест

### Что такое release в Helm?
- [ ] Версия Helm
- [x] Установленный в кластер экземпляр чарта с именем и историей ревизий
- [ ] Файл values.yaml
- [ ] Репозиторий чартов
> Один чарт можно установить несколькими релизами.

### Чем version отличается от appVersion в Chart.yaml?
- [x] version — версия самого чарта, меняется при изменении шаблонов
- [x] appVersion — версия упакованного приложения
- [ ] Это одно и то же
- [ ] appVersion — версия Kubernetes
> Часто appVersion используют как тег образа по умолчанию.

### Какой источник значений имеет наивысший приоритет?
- [ ] values.yaml чарта
- [ ] Первый файл -f
- [x] Параметры --set
- [ ] values.yaml родительского чарта
> Из нескольких -f побеждает последний.

### Какая команда идемпотентно устанавливает или обновляет релиз — удобно для CI?
= helm upgrade --install
> С --wait она дождётся готовности ресурсов.

### Как отрендерить манифесты чарта локально, не обращаясь к кластеру?
- [ ] helm install --local
- [x] helm template
- [ ] helm show
- [ ] helm get manifest
> helm get manifest показывает манифесты уже установленного релиза.

### Где Helm 3 и Helm 4 хранят информацию о релизах?
- [ ] В серверном компоненте Tiller
- [x] В Secret'ах в namespace релиза
- [ ] В локальном файле на компьютере
- [ ] В ConfigMap kube-system
> Tiller был в Helm 2 и удалён.

### Как откатить релиз myapp на ревизию 3?
= helm rollback myapp 3
> Историю ревизий показывает helm history myapp.

### Для чего в шаблонах используют функцию required?
- [ ] Чтобы сделать значение необязательным
- [x] Чтобы рендеринг падал с понятным сообщением, если обязательное значение не задано
- [ ] Чтобы подключить зависимость
- [ ] Чтобы закодировать значение в base64
> Например, required "image.tag обязателен" .Values.image.tag.

### Зачем выражения вида toYaml .Values.resources | nindent 12?
- [ ] Чтобы зашифровать ресурсы
- [x] Чтобы вставить кусок values как YAML с правильным отступом внутри манифеста
- [ ] Чтобы проверить синтаксис
- [ ] Чтобы отсортировать ключи
> Неправильный отступ — самая частая ошибка в шаблонах Helm.

### Что такое файл _helpers.tpl?
- [ ] Манифест, который применяется первым
- [x] Файл с именованными шаблонами (define), которые подключают через include; сам он не превращается в манифест
- [ ] Файл со значениями
- [ ] Тесты чарта
> Файлы, начинающиеся с подчёркивания, не рендерятся как ресурсы.

### Как выполнить миграции базы перед обновлением приложения средствами Helm?
- [ ] Через NOTES.txt
- [x] Job с аннотацией helm.sh/hook: pre-upgrade (и pre-install)
- [ ] Через helm lint
- [ ] Через values.schema.json
> Хуки выполняются в нужные моменты жизненного цикла релиза.

### Где можно хранить Helm-чарты, кроме классических HTTP-репозиториев?
- [ ] Только в Git
- [x] В OCI-реестрах — тех же, что используются для образов контейнеров
- [ ] В etcd
- [ ] В ConfigMap
> Команды helm push и helm install oci://.

### Чем Kustomize отличается от Helm?
- [ ] Kustomize — это платная версия Helm
- [x] Kustomize не использует шаблоны: он накладывает патчи на базовые манифесты для разных окружений; встроен в kubectl
- [ ] Kustomize работает только с Helm-чартами
- [ ] Kustomize хранит релизы в кластере
> Применение — kubectl apply -k.

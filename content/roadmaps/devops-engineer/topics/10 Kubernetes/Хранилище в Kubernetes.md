---
title: Хранилище в Kubernetes
slug: hranilische-v-kubernetes
description: Тома в Kubernetes — emptyDir, hostPath, configMap и secret, PersistentVolume и PersistentVolumeClaim, StorageClass и динамическое создание дисков, режимы доступа, reclaimPolicy, CSI-драйверы, расширение и снапшоты.
duration: 75
level: Средний
quizSize: 10
materials:
  - title: Kubernetes Docs — Persistent Volumes
    url: https://kubernetes.io/docs/concepts/storage/persistent-volumes/
    type: документация
  - title: Kubernetes Docs — Storage (Volumes, StorageClasses)
    url: https://kubernetes.io/docs/concepts/storage/_print
    type: документация
---

# Хранилище в Kubernetes

Файловая система контейнера исчезает вместе с ним. Kubernetes подключает данные через **тома** (volumes).

## Виды томов

| Том | Живёт | Для чего |
| --- | --- | --- |
| `emptyDir` | Пока живёт под (переживает перезапуск контейнера) | Временные файлы, общий каталог для контейнеров пода, кэш. `medium: Memory` — в RAM |
| `configMap`, `secret`, `projected` | — | Конфиги и секреты как файлы |
| `hostPath` | Пока живёт нода | Каталог ноды. Для агентов (DaemonSet). Для приложений — **плохо**: данные привязаны к ноде, риск безопасности |
| `persistentVolumeClaim` | Независимо от пода | **Постоянные данные**: базы, загрузки пользователей |

## PV, PVC, StorageClass

```
 Под ──► PVC «хочу 10Gi, RWO, класс fast» ──bind──► PV (реальный диск) ◄── создан StorageClass через CSI-драйвер
```

- **PersistentVolume (PV)** — реальный кусок хранилища в кластере: облачный диск, NFS-шара, том Ceph, локальный диск. Ресурс уровня кластера.
- **PersistentVolumeClaim (PVC)** — **заявка** приложения: размер, режим доступа, класс. Ресурс namespace.
- **StorageClass** — «тип» хранилища и **автоматическое создание** PV по заявке (динамическое выделение): какой CSI-драйвер, тип диска, параметры.

Разделение ролей: разработчик пишет PVC, не зная, что под капотом; администратор настраивает StorageClass.

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: uploads
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 10Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      containers:
        - name: app
          image: registry.example.com/app:1.4.2
          volumeMounts:
            - name: uploads
              mountPath: /data/uploads
      volumes:
        - name: uploads
          persistentVolumeClaim:
            claimName: uploads
```

`strategy: Recreate` здесь не случайно: RWO-диск нельзя примонтировать к новому поду на другой ноде, пока старый его держит, — RollingUpdate может зависнуть.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: ebs.csi.aws.com
parameters:
  type: gp3
reclaimPolicy: Delete
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
```

## Режимы доступа (accessModes)

| Режим | Сокращение | Смысл |
| --- | --- | --- |
| ReadWriteOnce | **RWO** | Чтение и запись с **одной ноды** (несколько подов на этой ноде могут) |
| ReadWriteOncePod | **RWOP** | Чтение и запись только **одним подом** |
| ReadOnlyMany | **ROX** | Только чтение со многих нод |
| ReadWriteMany | **RWX** | Чтение и запись со многих нод — нужно сетевое/кластерное хранилище: NFS, CephFS, облачные файловые хранилища |

Блочные облачные диски обычно поддерживают только RWO. Если нескольким репликам нужен общий каталог — RWX-хранилище или, лучше, объектное хранилище S3 вместо файлов.

## Жизненный цикл и reclaimPolicy

PV проходит состояния: `Available` → `Bound` (привязан к PVC) → `Released` (PVC удалён) → удаление или ручная очистка.

- `reclaimPolicy: Delete` (обычно по умолчанию у динамических классов) — при удалении PVC **диск удаляется вместе с данными**.
- `reclaimPolicy: Retain` — диск остаётся, администратор решает, что с ним делать. Для важных данных — Retain или регулярные бэкапы.
- Защита: PVC, используемый подом, не удалится сразу (finalizer `kubernetes.io/pvc-protection`) — повиснет в `Terminating`, пока под жив.

`volumeBindingMode: WaitForFirstConsumer` — создавать диск только когда известен под и его нода. Иначе диск может создаться в одной зоне доступности, а под — запланироваться в другую, и том не примонтируется.

## CSI, расширение, снапшоты

- **CSI** (Container Storage Interface) — стандарт драйверов хранилищ: облачные диски, Ceph (Rook), Longhorn, NFS, local-path. Драйвер обычно — Deployment (controller) + DaemonSet (node).
- **Расширение**: при `allowVolumeExpansion: true` увеличьте `resources.requests.storage` в PVC — диск и ФС вырастут. Уменьшать нельзя.
- **VolumeSnapshot** — снимок тома через CSI (если драйвер поддерживает) для бэкапов и клонирования. Полноценный бэкап кластера и томов — **Velero**.

```bash
kubectl get sc
kubectl get pv,pvc -A
kubectl describe pvc uploads
```

PVC в `Pending`: нет StorageClass по умолчанию, неверное имя класса, драйвер не установлен, для `WaitForFirstConsumer` — ещё нет пода, нет квоты.

## Практика

- [ ] Посмотреть StorageClass в своём кластере (в kind — `standard` с local-path provisioner) и какой из них по умолчанию
- [ ] Создать PVC, под, который пишет в него файл; удалить под, создать новый — данные на месте
- [ ] Посмотреть созданный PV, его reclaimPolicy и путь на ноде
- [ ] Удалить PVC и проверить, что стало с PV при политике Delete
- [ ] Создать PVC с несуществующим StorageClass и разобрать, почему он в Pending
- [ ] Развернуть Deployment с RWO-томом и RollingUpdate на мультинодовом кластере и посмотреть, что происходит при обновлении; переключить на Recreate
- [ ] Разобраться, как устроены `volumeClaimTemplates` у StatefulSet из прошлой темы

## Лаборатория

Кластер — k3s на стенде; StorageClass по умолчанию — `local-path` (том — каталог на узле).

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

### Данные переживают под

В namespace **`lab-pvc`**:

1. создайте PersistentVolumeClaim **`notes-data`** на **100Mi** (режим `ReadWriteOnce`);
2. запустите под **`notes`** (`busybox:1.36`, сон) с этим томом в `/data` и запишите в том файл `/data/notes.txt` со строкой `persist me`;
3. **удалите под и создайте его заново** с тем же томом — файл должен остаться.

```bash setup
lab_kns lab-pvc
```

```bash check
pvc=$(lab_kj -n lab-pvc get pvc notes-data) || fail "PVC notes-data нет"
[ "$(echo "$pvc" | jq -r .spec.resources.requests.storage)" = 100Mi ] || fail "Размер PVC — $(echo "$pvc" | jq -r .spec.resources.requests.storage)"
[ "$(echo "$pvc" | jq -r .status.phase)" = Bound ] || fail "PVC не привязан к тому (Bound)"
p=$(lab_kj -n lab-pvc get pod notes) || fail "Пода notes нет"
echo "$p" | jq -e '.spec.volumes[] | select(.persistentVolumeClaim.claimName == "notes-data")' >/dev/null || fail "Под notes не использует PVC notes-data"
kubectl -n lab-pvc wait --for=condition=Ready pod/notes --timeout=60s >/dev/null 2>&1 || fail "Под notes не Ready"
[ "$(kubectl -n lab-pvc exec notes -- cat /data/notes.txt 2>/dev/null)" = "persist me" ] || fail "В /data/notes.txt нет строки persist me"
pc=$(date -d "$(echo "$pvc" | jq -r .metadata.creationTimestamp)" +%s); pp=$(date -d "$(echo "$p" | jq -r .metadata.creationTimestamp)" +%s)
[ $((pp - pc)) -ge 3 ] || fail "Под notes создан вместе с PVC — его не пересоздавали"
ok "notes.txt пережил пересоздание пода"
```

```text hint
1. Заявка на том: режим доступа и размер; класс хранилища можно не указывать — возьмётся по умолчанию.
2. В поде — том со ссылкой на заявку по имени и точка монтирования.
3. Записать файл через exec, удалить под, применить тот же манифест снова и прочитать файл.
```

```bash solution
mkdir -p ~/k8s
cat > ~/k8s/notes.yaml <<'EOF'
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: notes-data
  namespace: lab-pvc
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 100Mi
---
apiVersion: v1
kind: Pod
metadata:
  name: notes
  namespace: lab-pvc
spec:
  containers:
    - name: notes
      image: busybox:1.36
      command: ["sleep", "infinity"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: notes-data
EOF
kubectl apply -f ~/k8s/notes.yaml
kubectl -n lab-pvc wait --for=condition=Ready pod/notes --timeout=60s
kubectl -n lab-pvc exec notes -- sh -c 'echo "persist me" > /data/notes.txt'
kubectl -n lab-pvc delete pod notes --wait=true
sleep 3
kubectl apply -f ~/k8s/notes.yaml
kubectl -n lab-pvc wait --for=condition=Ready pod/notes --timeout=60s
kubectl -n lab-pvc exec notes -- cat /data/notes.txt
```

```text review
Эталон — в «Решении».

- **PVC** — заявка «мне нужен том такого размера», **PV** — конкретный том, **StorageClass** — как его создать (local-path, Ceph RBD, облачные диски EBS/GCE PD). Динамический провиженинг создаёт PV под каждую заявку сам.
- `ReadWriteOnce` — том подключается к одному узлу; `ReadWriteMany` (NFS, CephFS) — к нескольким сразу; облачные блочные диски RWX не умеют.
- `reclaimPolicy: Delete` (по умолчанию у динамических) — удалили PVC, удалился и диск с данными. Для важного — `Retain`.
- `local-path` привязывает том к узлу: под с таким томом не переедет на другой узел. В продакшене — сетевое хранилище.
```

```text notes
emptyDir => Использовался emptyDir — он живёт только вместе с подом, после пересоздания данные пропадут. Постоянные данные — через PVC.
```

## Тест

### Чем PersistentVolume отличается от PersistentVolumeClaim?
- [x] PV — реальный ресурс хранилища в кластере (диск, шара, том)
- [x] PVC — заявка приложения на хранилище: размер, режим доступа, класс
- [ ] PVC — это диск на ноде
- [ ] Это одно и то же
> PVC привязывается к подходящему PV.

### Для чего нужен StorageClass?
- [ ] Для шифрования томов
- [x] Чтобы описать тип хранилища и автоматически создавать PV по заявкам (динамическое выделение) через CSI-драйвер
- [ ] Для бэкапа томов
- [ ] Для выбора ноды пода
> Разработчик указывает класс в PVC и не думает о деталях.

### Что означает режим доступа ReadWriteOnce?
- [ ] Только один под может читать том
- [x] Том можно смонтировать на чтение и запись с одной ноды
- [ ] Том можно записать только один раз
- [ ] Чтение и запись с любого числа нод
> Только одним подом — ReadWriteOncePod.

### Нескольким репликам на разных нодах нужен общий каталог на запись. Какой режим доступа нужен?
= ReadWriteMany
= RWX
> Нужно сетевое или кластерное хранилище: NFS, CephFS, облачное файловое хранилище.

### Что произойдёт с данными при удалении PVC, если у PV reclaimPolicy: Delete?
- [ ] Данные сохранятся
- [x] PV и реальный диск будут удалены вместе с данными
- [ ] PV перейдёт к другому PVC
- [ ] Kubernetes запретит удаление
> Для важных данных — Retain и бэкапы.

### Зачем volumeBindingMode: WaitForFirstConsumer?
- [ ] Чтобы ускорить создание диска
- [x] Чтобы диск создавался после планирования пода — в той же зоне доступности, где оказался под
- [ ] Чтобы под ждал создания диска бесконечно
- [ ] Чтобы диск монтировался только на чтение
> Иначе диск в одной зоне и под в другой не смогут соединиться.

### Почему hostPath плохо подходит для данных приложения?
- [x] Данные привязаны к конкретной ноде: под на другой ноде их не увидит
- [x] Доступ к файловой системе ноды — риск безопасности
- [ ] hostPath не поддерживает запись
- [ ] hostPath удаляется при перезапуске контейнера
> Его используют агенты в DaemonSet: сборщики логов, node-exporter.

### PVC завис в статусе Pending. Возможные причины?
- [x] Указан несуществующий StorageClass или нет класса по умолчанию
- [x] Не установлен CSI-драйвер или он не работает
- [x] Режим WaitForFirstConsumer, а пода, использующего PVC, ещё нет
- [ ] Слишком длинное имя пода
> Подробности — в kubectl describe pvc.

### Почему Deployment с RWO-томом при RollingUpdate может зависнуть?
- [ ] RollingUpdate не поддерживает тома
- [x] Новый под на другой ноде не может смонтировать диск, пока его держит старый под, а старый не удаляется, пока новый не готов
- [ ] RWO-том удаляется при обновлении
- [ ] Kubernetes запрещает тома в Deployment
> Решения — стратегия Recreate, StatefulSet или RWX-хранилище.

### Как увеличить размер существующего тома?
- [ ] Создать новый PV и скопировать данные вручную — другого способа нет
- [x] Если в StorageClass allowVolumeExpansion: true, увеличить resources.requests.storage в PVC
- [ ] Уменьшить и снова увеличить replicas
- [ ] Удалить StorageClass
> Уменьшать тома нельзя.

### Что такое CSI?
- [ ] Формат образов
- [x] Стандартный интерфейс драйверов хранилищ, через который Kubernetes работает с облачными дисками, Ceph, NFS и др.
- [ ] Сетевой плагин
- [ ] Инструмент бэкапа
> Аналогично CNI для сети и CRI для runtime.

### Какой инструмент чаще всего используют для бэкапа объектов кластера и томов?
= Velero
> Он умеет сохранять манифесты и снапшоты томов в объектное хранилище.

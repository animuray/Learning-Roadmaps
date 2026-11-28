---
title: Affinity, taints и tolerations
slug: affinity-taints-tolerations
description: Как управлять размещением подов — метки нод и nodeSelector, node affinity, pod affinity и anti-affinity, topologySpreadConstraints, taints и tolerations с эффектами NoSchedule и NoExecute, cordon и drain, PodDisruptionBudget.
duration: 75
level: Продвинутый
quizSize: 10
materials:
  - title: Kubernetes Docs — Assigning Pods to Nodes
    url: https://kubernetes.io/docs/concepts/scheduling-eviction/assign-Pod-node/
    type: документация
  - title: Kubernetes Docs — Taints and Tolerations
    url: https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration
    type: документация
---

# Affinity, taints и tolerations

По умолчанию scheduler ставит под на любую ноду, где хватает ресурсов. Но часто нужно управлять размещением:

- база — только на нодах с SSD;
- ML-задачи — только на нодах с GPU, и **никто другой** туда не должен попадать;
- реплики приложения — на **разных** нодах и в разных зонах, чтобы падение одной не уронило всё;
- кэш — рядом с приложением.

## Метки нод и nodeSelector

```bash
kubectl label node worker-1 disktype=ssd
kubectl get nodes --show-labels
kubectl get nodes -L topology.kubernetes.io/zone
```

```yaml
spec:
  nodeSelector:
    disktype: ssd
```

Самый простой способ: под пойдёт **только** на ноды со всеми указанными метками. Стандартные метки: `kubernetes.io/hostname`, `kubernetes.io/os`, `kubernetes.io/arch`, `topology.kubernetes.io/zone`, `node.kubernetes.io/instance-type`.

## Node affinity

То же, но гибче: операторы `In`, `NotIn`, `Exists`, `DoesNotExist`, `Gt`, `Lt`, и **мягкие** правила.

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/arch
              operator: In
              values: [amd64]
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 80
        preference:
          matchExpressions:
            - key: disktype
              operator: In
              values: [ssd]
```

- `required...` — **жёсткое** условие: нет подходящей ноды — под в Pending.
- `preferred...` — **предпочтение** с весом 1–100: если можно — туда, нельзя — куда угодно.
- `...IgnoredDuringExecution` — правило проверяется при планировании; если метки ноды потом изменились, уже работающий под не выселяется.

## Pod affinity и anti-affinity

Правила относительно **других подов**:

```yaml
affinity:
  podAntiAffinity:
    preferredDuringSchedulingIgnoredDuringExecution:
      - weight: 100
        podAffinityTerm:
          labelSelector:
            matchLabels:
              app: web
          topologyKey: kubernetes.io/hostname
  podAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      - labelSelector:
          matchLabels:
            app: redis
        topologyKey: topology.kubernetes.io/zone
```

- **Anti-affinity** с `topologyKey: kubernetes.io/hostname` — реплики `app: web` на **разных нодах**. С `required` и 5 репликами на 3 нодах две реплики останутся в Pending — поэтому чаще используют `preferred`.
- **Affinity** — разместить рядом (в той же зоне или на той же ноде), например для низкой задержки до кэша.
- `topologyKey` — что считать «одним местом»: нода, зона, регион.

## topologySpreadConstraints

Современный способ **равномерно** распределить реплики:

```yaml
topologySpreadConstraints:
  - maxSkew: 1
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: DoNotSchedule
    labelSelector:
      matchLabels:
        app: web
```

`maxSkew: 1` — разница числа подов между зонами не больше одного.

## Taints и tolerations

Affinity **притягивает** под к нодам. **Taint** — наоборот: нода **отталкивает** все поды, у которых нет соответствующей **toleration**.

```bash
kubectl taint nodes gpu-1 dedicated=gpu:NoSchedule
kubectl taint nodes gpu-1 dedicated=gpu:NoSchedule-    # снять taint
kubectl describe node gpu-1 | grep Taints
```

```yaml
tolerations:
  - key: dedicated
    operator: Equal
    value: gpu
    effect: NoSchedule
```

| Эффект | Что происходит |
| --- | --- |
| `NoSchedule` | Новые поды без toleration сюда не планируются; уже работающие остаются |
| `PreferNoSchedule` | Scheduler старается не ставить, но может |
| `NoExecute` | Не планировать **и выселить** уже работающие поды без toleration (`tolerationSeconds` — через сколько) |

> [!note] Toleration — это допуск, а не притяжение
> Toleration разрешает поду попасть на ноду с taint, но **не заставляет** его туда идти. Чтобы выделить ноды под GPU-задачи полностью: **taint** на нодах (чужие не придут) + **toleration и nodeAffinity/nodeSelector** у GPU-подов (они пойдут именно туда).

Встроенные taints:

- control plane: `node-role.kubernetes.io/control-plane:NoSchedule` — обычные поды туда не попадают;
- `node.kubernetes.io/not-ready` и `unreachable` с `NoExecute` — поды по умолчанию терпят их **300 секунд**, затем выселяются: так поды уезжают с упавшей ноды;
- `memory-pressure`, `disk-pressure`, `unschedulable`.

## Обслуживание нод: cordon, drain, PDB

```bash
kubectl cordon worker-2                                          # не планировать новые поды
kubectl drain worker-2 --ignore-daemonsets --delete-emptydir-data   # выселить поды
kubectl uncordon worker-2
```

**PodDisruptionBudget** защищает от одновременного выселения слишком многих реплик при drain и обновлении нод:

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: web
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: web
```

## Практика

- [ ] Пометить одну ноду `disktype=ssd` и разместить под через `nodeSelector`; затем через node affinity с `preferred`
- [ ] Развернуть 3 реплики с pod anti-affinity по `kubernetes.io/hostname` и убедиться, что они на разных нодах; увеличить реплики больше числа нод с `required` и посмотреть Pending
- [ ] Поставить taint `dedicated=gpu:NoSchedule` на ноду и убедиться, что обычные поды туда не попадают; создать под с toleration и nodeSelector
- [ ] Поставить taint с `NoExecute` на ноду с работающими подами и посмотреть выселение
- [ ] Найти taints control-plane ноды и объяснить, почему DaemonSet агентов логов их терпит
- [ ] Создать PDB с `minAvailable: 2` для Deployment из 3 реплик и выполнить `kubectl drain` ноды

## Лаборатория

Кластер — k3s на стенде из **одного** узла: размещение видно по тому, запустится под или останется Pending. Задачи меняют метки и taint-ы узла; при начале любой задачи Kubernetes на стенде они сбрасываются.

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

### Под только на SSD

Deployment **`cache`** в namespace **`lab-sched`** должен работать **только** на узлах с SSD. Пометьте узел кластера меткой **`disktype=ssd`** и добавьте Deployment **обязательное** правило nodeAffinity по этой метке. Под должен запуститься.

```bash setup
lab_kns lab-sched
kubectl -n lab-sched create deployment cache --image=redis:7-alpine >/dev/null
kubectl -n lab-sched rollout status deploy/cache --timeout=90s >/dev/null
```

```bash check
d=$(lab_kj -n lab-sched get deploy cache) || fail "Deployment cache нет"
t=$(echo "$d" | jq -c '.spec.template.spec.affinity.nodeAffinity.requiredDuringSchedulingIgnoredDuringExecution.nodeSelectorTerms[]?.matchExpressions[]? | select(.key == "disktype")')
[ -n "$t" ] || fail "В Deployment нет обязательного правила nodeAffinity по метке disktype"
echo "$t" | jq -e '.operator == "In" and (.values | index("ssd"))' >/dev/null || fail "Правило nodeAffinity не требует disktype=ssd: $t"
[ "$(kubectl get nodes -l disktype=ssd --no-headers | wc -l)" -ge 1 ] || fail "Ни один узел не помечен disktype=ssd"
kubectl -n lab-sched rollout status deploy/cache --timeout=60s >/dev/null 2>&1 || fail "Под cache не запустился: $(kubectl -n lab-sched get pods --no-headers | awk '{print $3}' | head -1)"
ok "cache работает на узле с disktype=ssd"
```

```text hint
1. Метка узлу ставится командой label для объекта node.
2. В шаблоне пода — раздел affinity → nodeAffinity → «обязательно при планировании»: список условий с ключом метки, оператором «входит в» и значением.
3. Изменённый шаблон перекатит под; убедиться, что он Running.
```

```bash solution
kubectl label node "$(kubectl get nodes -o jsonpath='{.items[0].metadata.name}')" disktype=ssd
kubectl -n lab-sched patch deployment cache --type=merge -p '{
  "spec": {"template": {"spec": {"affinity": {"nodeAffinity": {"requiredDuringSchedulingIgnoredDuringExecution": {
    "nodeSelectorTerms": [{"matchExpressions": [{"key": "disktype", "operator": "In", "values": ["ssd"]}]}]
  }}}}}}}'
kubectl -n lab-sched rollout status deploy/cache
```

```text review
Эталон: `kubectl label node ... disktype=ssd` + `requiredDuringSchedulingIgnoredDuringExecution` с `disktype In [ssd]`.

- `nodeSelector: {disktype: ssd}` — то же короче, но только «равно». Affinity умеет `In`, `NotIn`, `Exists`, `Gt` и мягкие правила (`preferred...` с весом).
- `IgnoredDuringExecution`: если метку с узла снять, уже работающий под не выселится — правило проверяется только при планировании.
- **podAntiAffinity** с `topologyKey: kubernetes.io/hostname` — разнести реплики по разным узлам, чтобы падение одного узла не уронило все копии. Для зон — `topology.kubernetes.io/zone` или `topologySpreadConstraints`.
```

### Узел для базы данных

Узел кластера выделили под базы данных: на нём taint **`lab-dedicated=db:NoSchedule`**, поэтому под **`postgres`** в namespace **`lab-sched`** висит в Pending. **Не снимая taint**, сделайте так, чтобы `postgres` запустился на этом узле. Под `other` (без разрешения) должен остаться в Pending.

```bash setup
lab_kns lab-sched
kubectl taint nodes --all lab-dedicated=db:NoSchedule --overwrite >/dev/null
kubectl -n lab-sched create deployment postgres --image=busybox:1.36 -- sleep 100000 >/dev/null
kubectl -n lab-sched run other --image=busybox:1.36 --restart=Never --command -- sleep 100000 >/dev/null
sleep 2
```

```bash check
kubectl get nodes -o json | jq -e '.items[0].spec.taints[]? | select(.key == "lab-dedicated" and .value == "db" and .effect == "NoSchedule")' >/dev/null || fail "Taint lab-dedicated=db:NoSchedule снят с узла — по условию его нужно оставить"
d=$(lab_kj -n lab-sched get deploy postgres) || fail "Deployment postgres нет"
echo "$d" | jq -e '.spec.template.spec.tolerations[]? | select(.key == "lab-dedicated" and .effect == "NoSchedule" and ((.operator == "Equal" and .value == "db") or .operator == "Exists"))' >/dev/null || fail "У postgres нет toleration для taint lab-dedicated=db:NoSchedule"
kubectl -n lab-sched rollout status deploy/postgres --timeout=60s >/dev/null 2>&1 || fail "postgres не запустился"
[ "$(kubectl -n lab-sched get pod other -o jsonpath='{.status.phase}')" = Pending ] || fail "Под other запустился — taint перестал действовать"
ok "postgres работает на выделенном узле, other — Pending"
```

```text hint
1. Почему под не запускается, видно в событиях его описания.
2. Taint отталкивает поды; под, которому можно на такой узел, должен иметь toleration с тем же ключом, значением и эффектом.
3. Toleration добавляется в шаблон пода Deployment.
```

```bash solution
kubectl -n lab-sched describe pod -l app=postgres | tail -3
kubectl -n lab-sched patch deployment postgres --type=merge -p '{
  "spec": {"template": {"spec": {"tolerations": [
    {"key": "lab-dedicated", "operator": "Equal", "value": "db", "effect": "NoSchedule"}
  ]}}}}'
kubectl -n lab-sched rollout status deploy/postgres
```

```text review
Эталон: toleration `lab-dedicated=db:NoSchedule` в шаблоне пода.

- **Taint** на узле отталкивает все поды, **toleration** у пода разрешает ему туда (но не заставляет!). Чтобы под шёл **только** на эти узлы, добавляют ещё и nodeAffinity по метке.
- Эффекты: `NoSchedule` (новые не ставить), `PreferNoSchedule` (по возможности), `NoExecute` (выселить и уже работающие без toleration).
- Типичное применение: узлы с GPU, выделенные узлы под базы, `node.kubernetes.io/not-ready` (кластер сам вешает taint на сломанные узлы).
- Снять taint: `kubectl taint nodes <узел> lab-dedicated-` (минус в конце).
```

```text notes
taint\s+[^\n]*lab-dedicated- => Taint снимали — по условию узел должен остаться выделенным; под пускают через toleration.
```

## Тест

### Чем nodeSelector отличается от node affinity?
- [x] nodeSelector — простое точное совпадение меток ноды
- [x] Node affinity поддерживает операторы (In, NotIn, Exists и др.) и мягкие правила с весами
- [ ] nodeSelector выселяет поды
- [ ] Node affinity работает только с GPU
> Оба притягивают под к нодам.

### Что означает requiredDuringSchedulingIgnoredDuringExecution?
- [ ] Правило проверяется постоянно, и под выселяется при несоответствии
- [x] Жёсткое условие при планировании; если метки ноды изменятся позже, работающий под не выселяется
- [ ] Мягкое предпочтение
- [ ] Правило игнорируется
> Мягкий вариант — preferredDuringScheduling...

### Как разнести реплики Deployment по разным нодам?
- [ ] nodeSelector с именем ноды
- [x] Pod anti-affinity по меткам этих подов с topologyKey: kubernetes.io/hostname (или topologySpreadConstraints)
- [ ] Taint на всех нодах
- [ ] HPA
> Для зон доступности — topologyKey: topology.kubernetes.io/zone.

### Что делает taint на ноде?
- [ ] Притягивает поды
- [x] Отталкивает поды, у которых нет соответствующей toleration
- [ ] Удаляет ноду
- [ ] Ограничивает ресурсы ноды
> Taints ставят на ноды, tolerations — на поды.

### Гарантирует ли toleration, что под попадёт на ноду с соответствующим taint?
- [ ] Да
- [x] Нет: toleration лишь разрешает попасть туда; чтобы направить под на эти ноды, нужен ещё nodeSelector или node affinity
- [ ] Да, если effect NoExecute
- [ ] Только для DaemonSet
> Выделенные ноды = taint + toleration + affinity.

### Чем эффект NoExecute отличается от NoSchedule?
- [x] NoSchedule не пускает новые поды без toleration, но оставляет уже работающие
- [x] NoExecute ещё и выселяет уже работающие поды без toleration
- [ ] NoSchedule выселяет поды немедленно
- [ ] Это одно и то же
> PreferNoSchedule — мягкий вариант.

### Почему обычные поды не запускаются на control-plane нодах?
- [ ] На них нет kubelet
- [x] На них стоит taint node-role.kubernetes.io/control-plane:NoSchedule
- [ ] Им не хватает памяти
- [ ] Это запрещено RBAC
> Агенты в DaemonSet обычно добавляют соответствующую toleration.

### Через сколько по умолчанию поды выселяются с ноды в статусе NotReady?
- [ ] Сразу
- [x] Примерно через 300 секунд — так задана toleration по умолчанию к taint not-ready и unreachable с NoExecute
- [ ] Через 24 часа
- [ ] Никогда
> Значение можно изменить через tolerationSeconds.

### Какая команда безопасно выводит ноду на обслуживание, выселяя с неё поды?
= kubectl drain
= drain
> Перед этим она делает cordon — запрещает планирование новых подов.

### Для чего нужен PodDisruptionBudget?
- [ ] Чтобы ограничить ресурсы подов
- [x] Чтобы при плановых выселениях (drain, обновление нод) одновременно не останавливалось слишком много реплик приложения
- [ ] Чтобы запретить удаление подов
- [ ] Чтобы задать бюджет облака
> Например, minAvailable: 2 из 3 реплик.

### Что задаёт maxSkew: 1 в topologySpreadConstraints по зонам?
- [ ] Максимум один под в зоне
- [x] Разница в числе подов между зонами не должна превышать одного
- [ ] Минимум одна зона
- [ ] Одна реплика на ноду
> whenUnsatisfiable определяет, блокировать ли планирование.

### Как выделить ноды с GPU только под GPU-задачи?
- [ ] Только nodeSelector у GPU-подов
- [ ] Только toleration у GPU-подов
- [x] Taint на GPU-нодах, чтобы туда не попадали чужие поды, и toleration плюс nodeSelector или affinity у GPU-подов
- [ ] Отдельный namespace
> Каждая часть решает свою задачу.

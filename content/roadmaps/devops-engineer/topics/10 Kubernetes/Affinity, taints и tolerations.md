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

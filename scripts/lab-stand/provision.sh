#!/bin/bash
# Подготовка учебного стенда для лабораторий: Ubuntu 24.04 (WSL, LXC или VM).
# Запуск от root: bash provision.sh <порт sshd> "<публичный ключ lab-runner>"
#
# Что делает:
# - ставит systemd, sshd и набор утилит, нужных в темах роадмапа;
# - создаёт ученика student (sudo без пароля) — под ним открывается терминал;
# - пускает по ключу root (для проверок) и student (для терминала);
# - включает запись истории команд сразу после каждой команды — по ней
#   проверка даёт замечания о неудачных приёмах.
set -euo pipefail

PORT="${1:?порт sshd}"
PUBKEY="${2:?публичный ключ}"
export DEBIAN_FRONTEND=noninteractive

apt-get update -q
apt-get install -y -q --no-install-recommends \
    systemd systemd-sysv dbus openssh-server sudo bash-completion ca-certificates \
    curl wget nano vim less file tree procps psmisc lsof strace htop \
    iproute2 iputils-ping dnsutils netcat-openbsd git cron tzdata man-db \
    gnupg unzip zip jq bc time rsync tmux screen sysstat stress-ng iotop-c \
    lvm2 mdadm xfsprogs parted dosfstools \
    tcpdump nftables iptables traceroute mtr-tiny socat openssl ipcalc dnsmasq-base nginx fail2ban \
    python3 python3-venv python3-pip python3-yaml python3-requests python3-psycopg2 \
    docker.io docker-compose-v2 docker-buildx \
    postgresql postgresql-client redis-server redis-tools \
    prometheus prometheus-node-exporter prometheus-alertmanager \
    ansible rabbitmq-server nodejs npm s3cmd

# Terraform и Vault — из репозитория HashiCorp
if ! command -v terraform >/dev/null; then
    curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor --yes -o /usr/share/keyrings/hashicorp.gpg
    echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com noble main" \
        > /etc/apt/sources.list.d/hashicorp.list
    apt-get update -q
    apt-get install -y -q terraform vault
fi
apt-get clean

# Службы, которые нужны только своим лабораториям, не держим запущенными: их стартует подготовка задачи.
for s in rabbitmq-server prometheus prometheus-alertmanager prometheus-node-exporter fail2ban vault; do
    systemctl disable --now "$s" >/dev/null 2>&1 || true
done

# Kubernetes: k3s (одноузловой кластер, systemd-служба). servicelb выключен — порт 80 остаётся nginx на стенде,
# Ingress-контроллер Traefik доступен по своему ClusterIP.
if ! command -v k3s >/dev/null; then
    curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.31.4+k3s1 \
        INSTALL_K3S_EXEC="--disable servicelb --write-kubeconfig-mode 644" sh -
fi
# root работает с конфигом k3s, ученик — со своей копией (можно менять контекст и namespace по умолчанию).
# Явно для всех: встроенный «k3s kubectl» без KUBECONFIG читает /etc/rancher/k3s/k3s.yaml, а не ~/.kube/config.
cat > /etc/profile.d/k3s.sh <<'EOF'
if [ "$(id -u)" = 0 ]; then export KUBECONFIG=/etc/rancher/k3s/k3s.yaml; else export KUBECONFIG="$HOME/.kube/config"; fi
EOF
# Argo CD для лабораторий GitOps (~600 МБ памяти)
if ! k3s kubectl -n argocd get deploy argocd-server >/dev/null 2>&1; then
    k3s kubectl create namespace argocd >/dev/null 2>&1 || true
    k3s kubectl apply -n argocd --server-side --force-conflicts \
        -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.2/manifests/install.yaml >/dev/null
fi
if ! command -v helm >/dev/null; then
    curl -fsSL https://get.helm.sh/helm-v3.16.4-linux-amd64.tar.gz | tar -xz -C /tmp linux-amd64/helm
    install -m 755 /tmp/linux-amd64/helm /usr/local/bin/helm
fi

# CI локально: act (GitHub Actions), actionlint, gitlab-ci-local
if ! command -v act >/dev/null; then
    curl -fsSL https://github.com/nektos/act/releases/download/v0.2.71/act_Linux_x86_64.tar.gz | tar -xz -C /usr/local/bin act
fi
if ! command -v actionlint >/dev/null; then
    curl -fsSL https://github.com/rhysd/actionlint/releases/download/v1.7.4/actionlint_1.7.4_linux_amd64.tar.gz \
        | tar -xz -C /usr/local/bin actionlint
fi
# готовый бинарник: npm-пакет собирает нативный модуль и не ставится на Node 18 из Ubuntu
if ! command -v gitlab-ci-local >/dev/null; then
    curl -fsSL https://github.com/firecow/gitlab-ci-local/releases/download/4.56.2/linux.gz | gunzip > /usr/local/bin/gitlab-ci-local
    chmod 755 /usr/local/bin/gitlab-ci-local
fi

# Образы для лабораторий заранее: подготовка задачи не должна ждать скачивания
systemctl enable --now docker >/dev/null 2>&1 || true
for img in alpine:3.20 busybox:1.36 nginx:1.27-alpine python:3.12-slim postgres:16-alpine redis:7-alpine \
    registry:2 grafana/grafana-oss:11.3.0 grafana/loki:3.3.0 grafana/promtail:3.3.0 \
    versity/versitygw:v1.0.10 apache/kafka:3.8.1 hashicorp/http-echo:1.0 \
    golang:1.23-alpine hadolint/hadolint:v2.12.0 prom/prometheus:v2.55.1 prom/node-exporter:v1.8.2; do
    docker image inspect "$img" >/dev/null 2>&1 || docker pull -q "$img" >/dev/null
done

# Образы для подов Kubernetes — из Docker в containerd k3s, чтобы поды стартовали без скачивания
for img in nginx:1.27-alpine busybox:1.36 redis:7-alpine hashicorp/http-echo:1.0 python:3.12-slim postgres:16-alpine; do
    # --platform: Docker на containerd иначе сохраняет индекс со всеми архитектурами, которых нет локально
    k3s ctr images ls -q | grep -q "docker.io/.*${img}$" || docker save --platform linux/amd64 "$img" | k3s ctr images import - >/dev/null
done

# Ученик
id student &>/dev/null || useradd -m -s /bin/bash -G sudo student
passwd -d student >/dev/null
usermod -aG docker,systemd-journal,adm student
install -d -m 700 -o student -g student /home/student/.kube
[ -f /home/student/.kube/config ] || install -m 600 -o student -g student /etc/rancher/k3s/k3s.yaml /home/student/.kube/config
echo 'student ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/student
chmod 440 /etc/sudoers.d/student
if ! grep -q 'lab-history' /home/student/.bashrc; then
    cat >> /home/student/.bashrc <<'EOF'

# lab-history: команды сразу пишутся в ~/.bash_history — по ним тренажёр даёт замечания
shopt -s histappend
HISTSIZE=10000
HISTFILESIZE=20000
PROMPT_COMMAND="history -a${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
EOF
fi

# Ключи
for home in /root /home/student; do
    mkdir -p "$home/.ssh"
    echo "$PUBKEY" > "$home/.ssh/authorized_keys"
    chmod 700 "$home/.ssh"
    chmod 600 "$home/.ssh/authorized_keys"
done
chown -R student:student /home/student/.ssh

# sshd: только по ключу, свой порт. В 24.04 sshd запускается через ssh.socket,
# который игнорирует Port из конфига, — переключаемся на обычную службу.
cat > /etc/ssh/sshd_config.d/lab.conf <<EOF
Port $PORT
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
systemctl disable ssh.socket >/dev/null 2>&1 || true
systemctl enable ssh.service >/dev/null 2>&1

# Подготовка и проверка задач работают от root с репозиториями ученика, в том числе через push
# в локальный bare-репозиторий: для него переменные GIT_CONFIG_* не действуют, нужен системный конфиг.
git config --system safe.directory '*'

# В WSL и LXC нет udev: LVM должен сам создавать устройства в /dev, иначе lvcreate падает
# с «Failed to wipe start of new LV». Предупреждения об унаследованных дескрипторах — шум.
sed -i -E 's/^(\s*)#?\s*udev_sync = .*/\1udev_sync = 0/; s/^(\s*)#?\s*udev_rules = .*/\1udev_rules = 0/; s/^(\s*)#?\s*obtain_device_list_from_udev = .*/\1obtain_device_list_from_udev = 0/' /etc/lvm/lvm.conf
echo 'export LVM_SUPPRESS_FD_WARNINGS=1' > /etc/profile.d/lvm.sh

# Кэш провайдеров Terraform: init в каждой задаче не скачивает их заново
cat > /etc/profile.d/terraform.sh <<'EOF'
export TF_PLUGIN_CACHE_DIR="$HOME/.terraform.d/plugin-cache"
[ -d "$TF_PLUGIN_CACHE_DIR" ] || mkdir -p "$TF_PLUGIN_CACHE_DIR" 2>/dev/null
EOF

# inotify: k3s, Docker и сборщики логов (Promtail) вместе не помещаются в лимиты по умолчанию (128 экземпляров)
printf 'fs.inotify.max_user_instances = 1024\nfs.inotify.max_user_watches = 524288\n' > /etc/sysctl.d/90-lab-inotify.conf
sysctl -q --system

# nginx как на небольшом сервере: 2 рабочих процесса (у каждого свой счётчик балансировки без zone)
sed -i 's/^worker_processes .*/worker_processes 2;/' /etc/nginx/nginx.conf

# Служебные файлы тренажёра (смещения истории и т.п.)
install -d -m 700 /var/lib/lab

# Стенд в WSL: systemd и полная изоляция от Windows — без дисков C:, D: и запуска .exe.
# Настройки вступают в силу после перезапуска дистрибутива (wsl --terminate).
if [ "${3:-}" = "wsl" ]; then
    cat > /etc/wsl.conf <<'EOF'
[boot]
systemd=true
[automount]
enabled=false
mountFsTab=false
[interop]
enabled=false
appendWindowsPath=false
[network]
hostname=stand
[user]
default=student
EOF
fi

echo "Стенд подготовлен: sshd на порту $PORT, ученик student"

---
title: Jenkins
slug: jenkins
description: Архитектура Jenkins (controller и agents), типы задач и триггеры, Jenkinsfile и декларативный пайплайн — agent, stages, steps, environment, parameters, when, post, Credentials, Groovy и Shared Libraries.
duration: 120
level: Средний
quizSize: 10
materials:
  - title: Jenkins — Pipeline Syntax
    url: https://jenkins.io/doc/book/pipeline/syntax/
    type: документация
  - title: Jenkins — Using a Jenkinsfile
    url: https://jenkins.io/doc/book/pipeline/jenkinsfile/
    type: документация
  - title: Jenkins — Using credentials
    url: https://jenkins.io/doc/book/using/using-credentials/
    type: документация
  - title: Jenkins — Credentials Binding (withCredentials)
    url: https://jenkins.io/doc/pipeline/steps/credentials-binding/
    type: документация
  - title: Jenkins — Managing Nodes
    url: https://jenkins.io/doc/book/managing/nodes
    type: документация
---

# Jenkins

**Jenkins** — самый старый и распространённый self-hosted CI/CD-сервер на Java. Его любят за гибкость (тысячи плагинов) и не любят за сложность поддержки. Часто встречается в банках, крупных компаниях и на проектах с долгой историей.

## Архитектура

```
              Jenkins controller (бывш. master)
              UI, планировщик, конфигурация, плагины, credentials
               │            │             │
        ┌──────┘            │             └───────┐
   agent linux          agent docker          agent windows
   (label: linux)       (поды/контейнеры)     (label: windows)
   executors: 2
```

- **Controller** — управляет: веб-интерфейс, задачи, планирование, хранение конфигурации и секретов (`$JENKINS_HOME`).
- **Node** — машина, на которой выполняются сборки.
- **Agent** — процесс на ноде, выполняющий задачи по поручению контроллера. Подключается по SSH или сам подключается к контроллеру (inbound/JNLP). Нужна Java.
- **Executor** — слот для одной сборки на агенте.
- **Label** — метка агента (`linux`, `docker`, `gpu`), по ней задача выбирает агента.

Лучшая практика: **0 executors на контроллере**, все сборки — на агентах. Сборка на контроллере может читать и менять `$JENKINS_HOME`, включая секреты.

## Установка

```bash
docker run -d --name jenkins -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home jenkins/jenkins:lts
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Или пакетом из репозитория Jenkins (нужна Java). Дальше — мастер установки и рекомендованные плагины.

## Типы задач и триггеры

- **Freestyle** — настраивается кликами в интерфейсе (shell-команда, логи). Устаревший подход: конфигурация не в Git.
- **Pipeline** — пайплайн как код в `Jenkinsfile`.
- **Multibranch Pipeline** — Jenkins сам находит ветки и MR/PR с `Jenkinsfile` и создаёт для каждой пайплайн.

Как запускается сборка:

- вручную (Build Now / Build with Parameters);
- **webhook** из GitLab/GitHub на push;
- опрос репозитория (Poll SCM) — хуже, создаёт нагрузку;
- по расписанию (`cron`);
- после другой задачи (upstream).

## Декларативный Jenkinsfile

```groovy
pipeline {
    agent { label 'docker' }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    parameters {
        choice(name: 'ENV', choices: ['dev', 'staging', 'prod'], description: 'Куда деплоить')
        booleanParam(name: 'RUN_TESTS', defaultValue: true)
    }

    environment {
        IMAGE = "registry.example.com/team/app:${env.GIT_COMMIT.take(8)}"
        REGISTRY = credentials('registry-creds')
    }

    triggers {
        cron('H 3 * * *')
    }

    stages {
        stage('Lint') {
            agent { docker { image 'python:3.12-slim' } }
            steps {
                sh 'pip install ruff && ruff check .'
            }
        }
        stage('Test') {
            when { expression { params.RUN_TESTS } }
            parallel {
                stage('Unit') {
                    steps { sh 'make test-unit' }
                }
                stage('Integration') {
                    steps { sh 'make test-integration' }
                }
            }
        }
        stage('Build & Push') {
            steps {
                sh 'echo "$REGISTRY_PSW" | docker login registry.example.com -u "$REGISTRY_USR" --password-stdin'
                sh 'docker build -t "$IMAGE" . && docker push "$IMAGE"'
            }
        }
        stage('Deploy prod') {
            when { branch 'main' }
            input { message 'Деплоить в прод?' }
            steps {
                withCredentials([sshUserPrivateKey(credentialsId: 'prod-ssh', keyFileVariable: 'KEY')]) {
                    sh 'ssh -i "$KEY" deploy@prod "docker compose pull && docker compose up -d"'
                }
            }
        }
    }

    post {
        always  { junit allowEmptyResults: true, testResults: 'reports/*.xml' }
        success { echo 'Готово' }
        failure { echo 'Сборка упала — отправить уведомление' }
        cleanup { cleanWs() }
    }
}
```

| Блок | Смысл |
| --- | --- |
| `pipeline` | Корень декларативного пайплайна |
| `agent` | Где выполнять: `any`, `none`, `label`, `docker`, `kubernetes`. Можно на уровне stage |
| `stages` / `stage` / `steps` | Этапы и шаги (`sh`, `echo`, `git`, `junit`, `archiveArtifacts`) |
| `environment` | Переменные окружения, в том числе из credentials |
| `parameters` | Параметры ручного запуска (`params.ENV`) |
| `when` | Условие выполнения этапа: `branch`, `expression`, `environment`, `changeset` |
| `parallel` | Параллельные этапы |
| `input` | Ожидание подтверждения человеком |
| `post` | Действия после: `always`, `success`, `failure`, `unstable`, `changed`, `cleanup` |
| `options`, `triggers`, `tools` | Таймауты, ротация сборок, расписание, установленные инструменты |

## Credentials

- Секреты хранятся **на контроллере в зашифрованном виде** и используются в пайплайнах **по ID**.
- Типы: username + password, secret text, SSH-ключ, secret file, сертификат.
- `credentials('id')` в `environment`: для логина и пароля создаёт `VAR`, `VAR_USR`, `VAR_PSW`.
- `withCredentials([...]) { ... }` — секрет доступен только внутри блока.
- Значения маскируются в логе.
- Пишите `sh 'echo "$SECRET"'` в **одинарных** кавычках: переменную раскроет shell. В двойных кавычках Groovy подставит секрет в строку команды, и он может утечь (Jenkins предупреждает об этом).

## Groovy, scripted pipeline и Shared Libraries

Jenkinsfile написан на DSL поверх **Groovy**. Кроме декларативного есть **скриптовый** синтаксис — полноценный Groovy:

```groovy
node('linux') {
    stage('Build') {
        checkout scm
        def services = ['api', 'worker']
        for (s in services) {
            sh "docker build -t ${s} ${s}/"
        }
    }
}
```

В декларативном пайплайне произвольный Groovy-код пишут в блоке `script { ... }`.

**Shared Libraries** — общий код пайплайнов в отдельном репозитории (каталог `vars/` с функциями), подключается в Jenkinsfile через `@Library('company-lib') _`. Аналог `include` в GitLab CI.

## Поддержка Jenkins

- Плагины — сила и боль: обновления, совместимость, уязвимости.
- **Configuration as Code (JCasC)** — конфигурация Jenkins в YAML, а не кликами.
- Бэкап `$JENKINS_HOME`.
- Агенты в Docker или Kubernetes (плагин Kubernetes создаёт под на каждую сборку).

## GitLab CI или Jenkins

| | GitLab CI | Jenkins |
| --- | --- | --- |
| Установка | Встроен в GitLab | Отдельный сервер, плагины |
| Конфигурация | YAML | Groovy DSL |
| Гибкость | Достаточная для большинства | Почти безграничная |
| Поддержка | Проще | Требует постоянного внимания |
| Где встречается | Новые проекты, GitLab-компании | Легаси, банки, сложные процессы |

## Практика

- [ ] Запустить Jenkins в Docker, пройти мастер установки и создать Freestyle-задачу с одной shell-командой; посмотреть её лог
- [ ] Создать Pipeline-задачу из Jenkinsfile в Git-репозитории с этапами Lint, Test, Build
- [ ] Подключить агент: вторую ВМ по SSH или Docker-агент; поставить контроллеру 0 executors
- [ ] Добавить credentials для реестра и использовать их через `environment` и `withCredentials`
- [ ] Добавить параметры запуска и этап с `when`, выполняющийся только для ветки main, и `input` перед деплоем
- [ ] Настроить webhook из GitLab или GitHub, чтобы сборка запускалась на push
- [ ] Добавить `post` с `always` и `failure` и проверить, что они срабатывают

## Тест

### Чем контроллер Jenkins отличается от агента?
- [x] Контроллер управляет: интерфейс, планирование задач, конфигурация, credentials
- [x] Агент выполняет сборки по поручению контроллера
- [ ] Агент хранит все credentials
- [ ] Контроллер не нужен, если есть агенты
> Раньше их называли master и slave.

### Почему рекомендуют ставить 0 executors на контроллере?
- [ ] Чтобы Jenkins работал без лицензии
- [x] Чтобы сборки не выполнялись на контроллере: это стабильнее и безопаснее, сборка не получит доступ к $JENKINS_HOME и секретам
- [ ] Иначе не работают плагины
- [ ] Так быстрее открывается интерфейс
> Все сборки — на агентах.

### Как называется файл с описанием пайплайна Jenkins в репозитории?
= Jenkinsfile
> Его подхватывают задачи типа Pipeline и Multibranch Pipeline.

### Какие блоки обязательны в декларативном пайплайне?
- [x] pipeline
- [x] agent
- [x] stages со stage и steps внутри
- [ ] parameters
> parameters, environment, post и остальные — по необходимости.

### Что делает блок post с секцией always?
- [ ] Выполняется перед всеми этапами
- [x] Выполняется после пайплайна (или этапа) при любом результате
- [ ] Выполняется только при успехе
- [ ] Повторяет пайплайн
> Есть также success, failure, unstable, changed, cleanup.

### Как в Jenkinsfile выполнить этап только для ветки main?
- [ ] if (branch == main)
- [x] when { branch 'main' }
- [ ] only: main
- [ ] rules: main
> rules и only — это синтаксис GitLab CI.

### Как Jenkins хранит credentials и как их используют в пайплайне?
- [ ] Открытым текстом в Jenkinsfile
- [x] В зашифрованном виде на контроллере, а в пайплайне обращаются к ним по ID через credentials() или withCredentials
- [ ] В переменных окружения агента
- [ ] В Git-репозитории
> Значения маскируются в логе.

### Почему команду с секретом пишут sh 'echo "$SECRET"' в одинарных кавычках?
- [ ] Двойные кавычки не поддерживаются
- [x] С одинарными кавычками переменную раскрывает shell, а с двойными Groovy подставит секрет прямо в текст команды, и он может утечь
- [ ] Так быстрее
- [ ] Одинарные кавычки шифруют значение
> Jenkins предупреждает о небезопасной интерполяции секретов.

### Какие способы запуска сборки есть в Jenkins?
- [x] Вручную
- [x] Webhook из системы контроля версий
- [x] По расписанию (cron) и после другой задачи
- [ ] Только вручную
> Опрос репозитория (Poll SCM) тоже возможен, но создаёт лишнюю нагрузку.

### Что такое Shared Library в Jenkins?
- [ ] Библиотека плагинов
- [x] Общий код пайплайнов в отдельном репозитории, который подключается в разные Jenkinsfile
- [ ] Каталог с артефактами
- [ ] Список агентов
> Аналог include с шаблонами в GitLab CI.

### На каком языке основан синтаксис Jenkinsfile?
= Groovy
> Скриптовый пайплайн — полноценный Groovy, декларативный — упрощённый DSL поверх него.

### Чем Multibranch Pipeline отличается от обычной Pipeline-задачи?
- [ ] Ничем
- [x] Jenkins сам находит ветки и merge request с Jenkinsfile и создаёт пайплайн для каждой
- [ ] Она запускается только вручную
- [ ] Она работает без Jenkinsfile
> Удобно для процесса с feature-ветками.

### Что делает шаг input в декларативном пайплайне?
- [ ] Читает файл
- [x] Приостанавливает пайплайн и ждёт подтверждения человеком
- [ ] Запрашивает параметры при старте
- [ ] Подключает агента
> Типичное применение — подтверждение деплоя в прод.

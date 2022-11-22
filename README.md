[English](README.en.md)

# Momo Store aka Пельменная №2 <!-- omit in toc -->

URL: https://momo.cherkashin.org/

<img width="900" alt="image" src="https://user-images.githubusercontent.com/9394918/167876466-2c530828-d658-4efe-9064-825626cc6db5.png">

Магазин-пельменная

# Оглавление <!-- omit in toc -->

- [Общее](#общее)
  - [Frontend](#frontend)
  - [Backend](#backend)
  - [Локальный запуск](#локальный-запуск)
  - [Структура репозитория приложения](#структура-репозитория-приложения)
- [Репозиторий инфраструктуры](#репозиторий-инфраструктуры)
  - [Cтруктура репозитория](#cтруктура-репозитория)
  - [Подготовка инфраструктуры](#подготовка-инфраструктуры)
    - [Кластер и хранилище](#кластер-и-хранилище)
    - [Подготовка кластера](#подготовка-кластера)
  - [Установка ArgoCD](#установка-argocd)
  - [Установка Grafana](#установка-grafana)
  - [Установка Loki](#установка-loki)
  - [Установка Prometheus](#установка-prometheus)
- [Правила версионирования](#правила-версионирования)
- [Правила внесения изменений в репозиторий](#правила-внесения-изменений-в-репозиторий)
- [TODO](#todo)

# Общее

Сборка приложения выполняется сразу в контейнеры, которые затем деплоятся в кластер Kubernetes, развернутый в Яндекс.Облаке.

## Frontend

Контейнер фронтенда собирается на базе образа `node:16.13.2` и публикуется в образе `nginx:stable`

При сборке необходимо указывать следующие переменные: 

```
VERSION - версия приложения (по-умолчанию формируется в пайплайне - 1.0.${CI_PIPELINE_ID})
VUE_APP_API_URL - URL доступа к бэкенду. Задан в переменных CI/CD и формируется по принципу "<URL фронтенда>/api"
```
После сборки контейнер тестируется с помощью `Postman`, затем маркируется тэгом `latest` и публикуется в GitLab Container Registry

Dockerfile:

```dockerfile
# Stage 1 - Build UI
FROM node:16.13.2 as builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
ARG VERSION=${VERSION}
ARG VUE_APP_API_URL=${VUE_APP_API_URL}
RUN npm version ${VERSION} && npm run build

# Stage 2 - Create production image
FROM nginx:stable
RUN mkdir /app
COPY --from=builder /usr/src/app/dist /app
COPY nginx/momo.conf /etc/nginx/conf.d/momo.conf
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=15s --retries=3 CMD service nginx status || exit 1
```

## Backend

Сборка контейнера на базе образа `golang:1.19.2` и затем артифакт сборки копируется в контейнер на базе образа `scratch` для минимализации итогового размера контейнера.

После тестирования контейнера с помощью Postman, он публикуется в GitLab Container Registry с тегом `latest`.

Dockerfile:

```dockerfile
# Stage 1
FROM golang:1.19.2-bullseye AS builder
ARG VERSION=${VERSION}
ENV GOOS linux
ENV CGO_ENABLED 0
WORKDIR /app/src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o backend-${VERSION} ./cmd/api

# Stage 2
FROM scratch as production
ARG VERSION=${VERSION}
WORKDIR /app
COPY --from=builder /app/src/backend-${VERSION} ./backend
EXPOSE 8081
CMD [ "./backend" ]
```
## Локальный запуск

Через docker-compose

```bash
docker-compose up
```

## Структура репозитория приложения

```
.
├── backend
├── frontend
├── postman
├── docker-compose.yml
├── .gitlab-ci.yml
└── README.md
```

# Репозиторий инфраструктуры

Описание инфраструктуры приложения и чартов для развертывания хранится в отдельном репозитории.

[Momo Infrastructure](https://gitlab.praktikum-services.ru/a.cherkashin/momo-infrastructure)

## Cтруктура репозитория

```
.
├── chart                  - Helm чарт приложения
├── kubernetes-system      - Чарты и манифесты для дополнительных компонентов инфраструктуры
│   ├── argo
│   ├── grafana
│   ├── prometheus
│   ├── acme-issuer.yml
│   ├── README.md
│   └── sa.yml
├── manifests               - манифесты для развертывания вручную
├── terraform               - манифесты IaC
├── .gitlab-ci.yml
└── README.md
```

## Подготовка инфраструктуры

### Кластер и хранилище

Заполнить файл `.s3conf`

```bash
terraform init
terraform plan -var-file secret.tfvars
terraform apply - var-file secret.tfvars
```

### Подготовка кластера

Установить Ingress-контроллер NGINX по инфтрукции от Яндекс:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx
```

Установить менеджер сертификатов:

```bash
kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.10.0/cert-manager.yaml
```

Создать объект ClusterIssuer

```bash
kubectl apply -f acme-issuer.yml
```

Манифест `sa.yml` необходим для создания сервисного аккуанта для последующего формирования статического конфига для доступа к кластеру, например из CI/CD

## Установка ArgoCD

Доступ в ArgoCD: https://argocd.cherkashin.org

Login/Password: 

```bash
cd kubernetes-system/argocd
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -n argocd -f ingress.yml
kubectl apply -n argocd -f user.yml
kubectl apply -n argocd -f policy.yml
```
После установки добавить приложение `momo-store` через YAML

```yaml
project: momo-store
source:
  repoURL: 'https://nexus.praktikum-services.ru/repository/06-a-cherkashin-momo-store/'
  targetRevision: x
  chart: momo-store
destination:
  server: 'https://kubernetes.default.svc'
  namespace: default
syncPolicy:
  automated:
    prune: true
    selfHeal: true
```

Дальнейший мониторинг приложения и обновление производится только через Argo (либо вручную, либо в авторежиме)

## Установка Grafana

Доступ в Grafana: https://grafana.cherkashin.org

Login/Password: user/Testusr1234

```bash
cd kubernetes-system/grafana
helm install --atomic grafana ./
```

## Установка Loki

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install --atomic loki grafana/loki-stack
```

Адрес Loki для добавления в качестве DataSource: `http://loki:3100`

## Установка Prometheus

URL для доступа: https://prometheus.cherkashin.org/

```bash
cd kubernetes-system/prometheus
helm install --atomic prometheus ./
kubectl apply -f ./admin-user.yaml
```

Адрес Prometheus для добавления в качестве DataSource: `http://prometheus:9090`

# Правила версионирования

Версия приложения формируется из переменной `VERSION` в пайплайне - `1.0.${CI_PIPELINE_ID}`

Контейнеры фронтенда и бэкенда собираются и публикуются в отдельных пайплайнах, при сборке каждый образ получает тег с номером версии приложения. После тестирования образа на успешный запуск и отработку запросов (Postman), образ тегируется как latest.

Образы публикуются в GitLab Container Registry.

# Правила внесения изменений в репозиторий

Все изменения должны производиться в отдельном бранче с последующим MR.

# TODO

Переписать код фронтенда для возможности менять адрес API бэкенда через переменную окружения в рантайме, а не на этапе сборки, что позволит более гибко подходить к вопросу развертывания разных окружений приложения.
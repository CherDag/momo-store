[Russian](README.md)

# Momo Store aka Pelmennaya #2 <!-- omit in toc -->

URL: https://momo.cherkashin.org/

<img width="900" alt="image" src="https://user-images.githubusercontent.com/9394918/167876466-2c530828-d658-4efe-9064-825626cc6db5.png">

Shop-dumplings

# Table of contents <!-- omit in toc -->

- [General](#general)
  - [frontend](#frontend)
  - [Backend](#backend)
  - [Run locally](#run-locally)
  - [Deployment strategies](#deployment-strategies)
  - [Application repository structure](#application-repository-structure)
- [Infrastructure repository](#infrastructure-repository)
  - [Repository structure](#repository-structure)
  - [Preparing infrastructure](#preparing-infrastructure)
    - [Cluster and storage](#cluster-and-storage)
    - [Preparing the cluster](#preparing-the-cluster)
  - [Install ArgoCD](#install-argocd)
  - [Install Grafana](#install-grafana)
  - [Install Loki](#install-loki)
  - [Installing Prometheus](#installing-prometheus)
- [Versioning rules](#versioning-rules)
- [Rules for making changes to the repository](#rules-for-making-changes-to-the-repository)

# General

The application is assembled immediately into containers, which are then deployed to a Kubernetes cluster deployed in Yandex.Cloud.

## frontend

The frontend container is built on the basis of the `node:16.13.2` image and published in the `nginx:stable` image

When building, you must specify the following variables:

```
VERSION - application version (by default, it is generated in the pipeline - 1.0.${CI_PIPELINE_ID})
VUE_APP_API_URL - backend access URL. Specified in CI/CD variables and formed according to the "<frontend URL>/api" principle
```
Once built, the container is tested with `Postman`, then tagged with the `latest` tag and published to the GitLab Container Registry

Dockerfile:

```dockerfile
# Stage 1 - Build UI
FROM node:16.13.2 as builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY. .
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
CMD sed -i -e "s,{{ API_URL }},$API_URL,g" /app/js/app.*.js && nginx -g "daemon off;"
```

When launching a frontend container, it is crutial to pass the API_URL environment variable to it, which replaces a pre-placed template in the application code. This allows to dynamically change the address of the backend without rebuilding the application.

## Backend

Build the container based on the `golang:1.19.2` image and then copy the build artifact into the container based on the `scratch` image to minimize the final size of the container.

After testing a container with Postman, it is published to the GitLab Container Registry with the `latest` tag.

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
COPY. .
RUN go build -o backend-${VERSION} ./cmd/api

# Stage 2
FROM scratch as production
ARG VERSION=${VERSION}
WORKDIR /app
COPY --from=builder /app/src/backend-${VERSION} ./backend
EXPOSE 8081
cmd["./backend"]
```
## Run locally

Via docker-compose

```bash
docker-compose-up
```

## Deployment strategies

- When making changes to any branch other than `main`, as well as when creating an MR, a GitLab Environment is created with the name `staging\momo-store-staging`. The deployment takes place through the Helm-chart with the replacement of the domain name with a test one.
   - Staging access URL: https://momo-staging.cherkashin.org
  
- The MR merge creates a GitLab Environment named `production\momo-store`. The deployment is only started manually by calling the pipeline from the infrastructure repository.
   - Access URL: https://momo.cherkashin.org

## Application repository structure

```
.
├── backend
├── front end
├── postman
├── docker-compose.yml
├── .gitlab-ci.yml
└── README.md
```

# Infrastructure repository

The description of the application infrastructure and charts for deployment is stored in a separate repository.

[Momo Infrastructure](https://gitlab.praktikum-services.ru/a.cherkashin/momo-infrastructure)

## Repository structure

```
.
├── chart - Helm chart app
├── kubernetes-system - Charts and manifests for additional infrastructure components
│ ├── argo
│ ├── grafana
│ ├── prometheus
│ ├── acme-issuer.yml
│ ├── README.md
│ └── sa.yml
├── manifests - manifests for manual deployment
├── terraform - IaC manifests
├── .gitlab-ci.yml
└── README.md
```

## Preparing infrastructure

### Cluster and storage

Fill in the `.s3conf` file

```bash
terraform init
terraform plan -var-file secret.tfvars
terraform apply - var-file secret.tfvars
```

### Preparing the cluster

Install the NGINX Ingress controller according to the instructions from Yandex:

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx
```

Install certificate manager:

```bash
kubectl apply -f https://github.com/jetstack/cert-manager/releases/download/v1.10.0/cert-manager.yaml
```

Create a ClusterIssuer object

```bash
kubectl apply -f acme-issuer.yml
```

The `sa.yml` manifest is required to create a service account for a static config for accessing the cluster, for example from CI / CD

## Install ArgoCD

Access to ArgoCD: https://argocd.cherkashin.org

Login/Password:

```bash
cd kubernetes-system/argocd
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -n argocd -f ingress.yml
kubectl apply -n argocd -f user.yml
kubectl apply -n argocd -f policy.yml
```
After installation, add the `momo-store` application via YAML

```yaml
project: momo store
source:
  repoURL: 'https://nexus.praktikum-services.ru/repository/06-a-cherkashin-momo-store/'
  targetRevision: x
  chart:momo-store
destination:
  server: 'https://kubernetes.default.svc'
  namespace:default
syncPolicy:
  automatic:
    prune: true
    selfHeal: true
```

Further monitoring of the application and updating is done only through Argo (either manually or in auto mode)

## Install Grafana

Access to Grafana: https://grafana.cherkashin.org

Login/Password: user/Testusr1234

```bash
cd kubernetes-system/grafana
helm install --atomic grafana ./
```

## Install Loki

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update
helm install --atomic loki grafana/loki-stack
```

Loki address to add as DataSource: `http://loki:3100`

## Installing Prometheus

Access URL: https://prometheus.cherkashin.org/

```bash
cd kubernetes-system/prometheus
helm install --atomic prometheus ./
kubectl apply -f ./admin-user.yaml
```

Prometheus address to add as DataSource: `http://prometheus:9090`

# Versioning rules

The application version is formed from the `VERSION` variable in the pipeline - `1.0.${CI_PIPELINE_ID}`

The front-end and back-end containers are built and published in separate pipelines, and each image gets a tag with the application's version number when built. After testing the image for successful launch and processing requests (Postman), the image is tagged as latest.

The images are published to the GitLab Container Registry.

# Rules for making changes to the repository

All changes must be made in a separate branch followed by MR.

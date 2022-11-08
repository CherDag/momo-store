# Stage 1
# Build app using VERSION argument
FROM golang:1.19.2-bullseye AS builder
ARG VERSION=${VERSION}
#Set env variables
ENV GOOS linux
ENV CGO_ENABLED 0
#Add workdir
WORKDIR /app/src
#Cache dependencies
COPY go.mod go.sum ./
RUN go mod download
# Copy app files
COPY . .
# Build app
RUN go build -o backend-${VERSION} ./cmd/api

# Stage 2
# Copy from builder to production container
FROM scratch as production
ARG VERSION=${VERSION}
WORKDIR /app
COPY --from=builder /app/src/backend-${VERSION} ./backend
EXPOSE 8081
CMD [ "./backend" ]

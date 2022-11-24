# Stage 1 - Build UI
FROM node:16.13.2 as builder
WORKDIR /usr/src/app
# Copy and install dependencies
COPY package*.json ./
RUN npm install
#Copy src
COPY . .
ARG VERSION=${VERSION}
# ENV VUE_APP_API_URL="{{ API_URL }}"
# ENV NODE_ENV=production
# Build static content
RUN npm version ${VERSION} && npm run build

# Stage 2 - Create production image
FROM nginx:stable
RUN mkdir /app
COPY --from=builder /usr/src/app/dist /app
COPY nginx/momo.conf /etc/nginx/conf.d/momo.conf
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=3s --start-period=15s --retries=3 CMD service nginx status || exit 1
CMD sed -i -e "s,{{ API_URL }},$API_URL,g" /app/js/app.*.js && nginx -g "daemon off;"
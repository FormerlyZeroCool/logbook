FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/analysis-sdk/package.json packages/analysis-sdk/package.json
COPY packages/analysis-editor/package.json packages/analysis-editor/package.json
RUN npm ci
COPY packages/analysis-sdk packages/analysis-sdk
COPY packages/analysis-editor packages/analysis-editor
COPY frontend frontend
RUN npm run build --workspace @logbook/analysis-sdk && npm run build --workspace @logbook/analysis-editor && npm run build --workspace ha-timeseries-logbook-frontend
FROM nginx:1.29-alpine
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template
EXPOSE 8080

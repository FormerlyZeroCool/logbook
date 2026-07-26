FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/analysis-sdk/package.json packages/analysis-sdk/package.json
COPY packages/analysis-editor/package.json packages/analysis-editor/package.json
RUN npm ci
COPY packages/analysis-sdk packages/analysis-sdk
COPY backend backend
RUN npm run build --workspace @logbook/analysis-sdk && npm run build --workspace ha-timeseries-logbook-backend

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY packages/analysis-sdk/package.json packages/analysis-sdk/package.json
COPY packages/analysis-editor/package.json packages/analysis-editor/package.json
RUN npm ci --omit=dev --workspace ha-timeseries-logbook-backend --workspace @logbook/analysis-sdk
COPY --from=build /app/packages/analysis-sdk/dist packages/analysis-sdk/dist
COPY --from=build /app/backend/dist backend/dist
COPY backend/migrations backend/migrations
CMD ["sh", "-c", "npm run migrate:prod --workspace ha-timeseries-logbook-backend && npm run start --workspace ha-timeseries-logbook-backend"]

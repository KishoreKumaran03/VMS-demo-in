FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=http://localhost:8000/api/v1
ARG VITE_KIOSK_SITE_ID=
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_KIOSK_SITE_ID=${VITE_KIOSK_SITE_ID}
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]

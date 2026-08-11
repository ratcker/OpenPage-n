#stage requirements
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

#stage dev
FROM base AS development
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

#stage building of frontend
FROM base AS build
RUN npm run build

#stage push front-files
FROM caddy:2-alpine AS production
RUN addgroup -S app && adduser -S -D -H -G app app #создать пользователя, чтобы не запускать приложение от root
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build --chown=app:app /app/dist /srv
USER app
EXPOSE 8080
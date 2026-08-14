ARG CADDY_VERSION=2
FROM caddy:${CADDY_VERSION}-builder-alpine AS builder
ARG REGRU_PLUGIN_VERSION=2fdc6371cc3d63e612ca166ede5c705391f4fe83
RUN xcaddy build \
    --with github.com/heinwol/caddy-dns-regru@${REGRU_PLUGIN_VERSION}

FROM caddy:${CADDY_VERSION}-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
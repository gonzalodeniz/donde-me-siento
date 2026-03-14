FROM nginx:1.27-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY conf.d /etc/nginx/conf.d
COPY docker-entrypoint.sh /docker-entrypoint.sh

RUN chmod +x /docker-entrypoint.sh \
    && mkdir -p /etc/nginx/certs

ENTRYPOINT ["/docker-entrypoint.sh"]

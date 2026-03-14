#!/bin/sh
set -eu

CERT_DIR="/etc/nginx/certs"
CERT_FILE="$CERT_DIR/fullchain.pem"
KEY_FILE="$CERT_DIR/privkey.pem"

mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_FILE" ] || [ ! -f "$KEY_FILE" ]; then
    echo "No se encontraron certificados TLS. Generando certificado autofirmado temporal."
    openssl req -x509 -nodes -days 365 \
        -newkey rsa:2048 \
        -keyout "$KEY_FILE" \
        -out "$CERT_FILE" \
        -subj "/CN=localhost"
fi

exec nginx -g "daemon off;"

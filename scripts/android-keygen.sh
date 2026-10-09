#!/bin/bash
# One time: create the Woof Tweaks Android signing key and give it to GitHub Actions (as encrypted repository
# secrets). Every Android release must be signed with this same key, or phones refuse the update.
# The key and its password stay in ~/.woof-secrets/android (owner-only). Nothing is printed.
set -euo pipefail
umask 077
DIR="$HOME/.woof-secrets/android"
REPO="oliveman-au/woof-tweaks"
mkdir -p "$DIR"
chmod 700 "$HOME/.woof-secrets" "$DIR"
if [ ! -f "$DIR/woof-android.p12" ]; then
  openssl rand -base64 33 | tr -d '\n=+/' > "$DIR/password"
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT
  openssl req -x509 -newkey rsa:4096 -sha256 -days 10950 -nodes -keyout "$tmp/key.pem" -out "$tmp/cert.pem" \
    -subj "/CN=Woof Services/O=Woof Services" 2>/dev/null
  openssl pkcs12 -export -inkey "$tmp/key.pem" -in "$tmp/cert.pem" -name woof -out "$DIR/woof-android.p12" -passout "file:$DIR/password"
  echo "Created the Android signing key in $DIR"
else
  echo "Using the existing Android signing key in $DIR"
fi
base64 < "$DIR/woof-android.p12" | tr -d '\n' | gh secret set WOOF_ANDROID_KEYSTORE_B64 -R "$REPO"
gh secret set WOOF_ANDROID_KEYSTORE_PASSWORD -R "$REPO" < "$DIR/password"
printf 'woof' | gh secret set WOOF_ANDROID_KEY_ALIAS -R "$REPO"
echo "GitHub secrets set for $REPO (WOOF_ANDROID_KEYSTORE_B64, WOOF_ANDROID_KEYSTORE_PASSWORD, WOOF_ANDROID_KEY_ALIAS)."
echo "Back up $DIR somewhere safe: without it, future Android updates can't be signed."

#!/usr/bin/env bash
# PocketBase-installatie voor De Tappenmars Buddy (Ubuntu/Debian, incl. Raspberry Pi).
#
# ============================ LEES DIT EERST ============================
# De vorige versie van dit script startte PocketBase op 0.0.0.0:8090 en zette
# daar `ufw allow 8090/tcp` bij. Dat is levensgevaarlijk zolang het
# auth/rollen-besluit nog open staat: ALLE API-regels van deze app staan
# momenteel op "open" (AUTH_RULE = OPEN_RULE in scripts/setup-pocketbase.mjs).
# Draaien betekende dan: klantgegevens (AVG) en het accijns-tankboek wereldwijd
# leesbaar EN schrijfbaar, over onversleuteld HTTP, als root.
#
# Daarom nu veilig-by-default:
#   * PocketBase luistert op 127.0.0.1 — bereikbaar maken doe je via een
#     reverse proxy met TLS, niet door de poort open te zetten.
#   * Poort 8090 wordt NIET in de firewall opengezet.
#   * Het script weigert te draaien tenzij je expliciet bevestigt dat het
#     auth-besluit genomen is (zie IK_WEET_DAT_AUTH_GEREGELD_IS hieronder).
#
# Zie CLAUDE.md, sectie "Inloggen verwijderd", en
# docs/beveiligingsonderzoek-2026-09-10.md voor de achtergrond.
# =======================================================================
#
# Gebruik (als root op de server):
#   IK_WEET_DAT_AUTH_GEREGELD_IS=ja bash install-pocketbase-vps.sh
set -euo pipefail

if [ "${IK_WEET_DAT_AUTH_GEREGELD_IS:-nee}" != "ja" ]; then
  cat >&2 <<'UITLEG'
GESTOPT — dit script is met opzet geblokkeerd.

Deze app heeft op dit moment GEEN authenticatie: elke API-regel staat open.
Zolang dat zo is, hoort deze server niet vanaf het internet bereikbaar te zijn.

Doe eerst dit:
  1. Neem het auth/rollen-besluit (optie A/B/C, zie WERKLOG.md "Blok D").
  2. Zet de API-regels dicht en controleer met scripts/check-schema-drift.mjs
     en met curl dat een anonieme aanvraag echt 40x geeft.
  3. Zet een reverse proxy met TLS voor PocketBase (poort 8090 blijft dicht).

Daarna pas, bewust:
  IK_WEET_DAT_AUTH_GEREGELD_IS=ja bash install-pocketbase-vps.sh
UITLEG
  exit 1
fi

echo "==> Systeem bijwerken..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq unzip curl openssl >/dev/null

# De Raspberry Pi is arm64, de Hetzner-VPS amd64. De oude versie downloadde
# altijd amd64 en faalde daardoor stilzwijgend op een Pi.
case "$(uname -m)" in
  x86_64 | amd64) PB_ARCH="linux_amd64" ;;
  aarch64 | arm64) PB_ARCH="linux_arm64" ;;
  armv7l | armv6l) PB_ARCH="linux_armv7" ;;
  *)
    echo "Onbekende architectuur: $(uname -m). Kies zelf de juiste PocketBase-build." >&2
    exit 1
    ;;
esac
echo "    Architectuur: $(uname -m) -> ${PB_ARCH}"

echo "==> Nieuwste PocketBase-versie opzoeken..."
PB_VERSION=$(curl -fsSL https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep -oP '"tag_name":\s*"v\K[0-9.]+')
echo "    Versie: v${PB_VERSION}"

echo "==> PocketBase downloaden..."
mkdir -p /opt/pocketbase
cd /opt/pocketbase
curl -fsSL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${PB_ARCH}.zip"
unzip -o -q pb.zip
rm pb.zip
chmod +x pocketbase

echo "==> Admin-account aanmaken..."
ADMIN_EMAIL="admin@tappenmars.nl"
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
./pocketbase superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASS" >/dev/null

# Draaien als een eigen gebruiker i.p.v. root: een lek in PocketBase mag niet
# meteen de hele machine zijn.
if ! id -u pocketbase >/dev/null 2>&1; then
  useradd --system --home /opt/pocketbase --shell /usr/sbin/nologin pocketbase
fi
chown -R pocketbase:pocketbase /opt/pocketbase

echo "==> Firewall instellen (alleen SSH + 80/443 voor de reverse proxy)..."
# BEWUST GEEN "ufw allow 8090/tcp": PocketBase luistert op 127.0.0.1 en is
# alleen via de reverse proxy bereikbaar.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> Systemd-service aanmaken..."
cat > /etc/systemd/system/pocketbase.service << 'EOF'
[Unit]
Description=PocketBase (De Tappenmars Buddy)
After=network.target

[Service]
Type=simple
User=pocketbase
Group=pocketbase
WorkingDirectory=/opt/pocketbase
# Luistert BEWUST alleen op localhost. Naar buiten openstellen doe je via een
# reverse proxy met TLS die X-Forwarded-For forceert (zie het beveiligings-
# rapport: de rate-limit-verdediging hangt aan een correcte proxyconfiguratie).
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/pocketbase

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pocketbase >/dev/null 2>&1
systemctl restart pocketbase

echo "==> Wachten tot PocketBase draait..."
sleep 3
if curl -fsS http://127.0.0.1:8090/api/health >/dev/null; then
  STATUS="✅ PocketBase draait (alleen op 127.0.0.1)."
else
  STATUS="⚠️  PocketBase reageert nog niet - check: systemctl status pocketbase"
fi

# admin-gegevens bewaren voor de beheerder
{
  echo "PocketBase admin"
  echo "Bereikbaar op: http://127.0.0.1:8090/_/ (via SSH-tunnel, niet publiek)"
  echo "E-mail:        $ADMIN_EMAIL"
  echo "Wachtwoord:    $ADMIN_PASS"
} > /root/pocketbase-admin.txt
chmod 600 /root/pocketbase-admin.txt

echo ""
echo "=================================================="
echo "$STATUS"
echo ""
echo "  PocketBase luistert op 127.0.0.1:8090 en is NIET publiek."
echo "  Admin panel via een SSH-tunnel:"
echo "     ssh -L 8090:127.0.0.1:8090 root@<server>"
echo "     daarna in je browser: http://127.0.0.1:8090/_/"
echo ""
echo "  Admin login: $ADMIN_EMAIL"
echo "  Wachtwoord:  (opgeslagen in /root/pocketbase-admin.txt)"
echo ""
echo "  VOLGENDE STAP: reverse proxy met TLS ervoor zetten."
echo "  Zorg dat die X-Forwarded-For OVERSCHRIJFT (niet doorlaat) en"
echo "  stel PocketBase's trustedProxy daarop in - anders is de"
echo "  rate-limit per IP te omzeilen."
echo "=================================================="

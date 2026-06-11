#!/usr/bin/env bash
# PocketBase-installatie voor de Wijngaard Buddy VPS (Ubuntu).
# Gebruik: als root plakken in de terminal van de server.
# Installeert PocketBase als systemd-service op poort 8090 en maakt een
# admin-account aan met een willekeurig wachtwoord (wordt aan het einde getoond
# en opgeslagen in /root/pocketbase-admin.txt).
set -euo pipefail

echo "==> Systeem bijwerken..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq unzip curl openssl >/dev/null

echo "==> Nieuwste PocketBase-versie opzoeken..."
PB_VERSION=$(curl -fsSL https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep -oP '"tag_name":\s*"v\K[0-9.]+')
echo "    Versie: v${PB_VERSION}"

echo "==> PocketBase downloaden..."
mkdir -p /opt/pocketbase
cd /opt/pocketbase
curl -fsSL -o pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip"
unzip -o -q pb.zip
rm pb.zip
chmod +x pocketbase

echo "==> Admin-account aanmaken..."
ADMIN_EMAIL="admin@tappenmars.nl"
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)
./pocketbase superuser upsert "$ADMIN_EMAIL" "$ADMIN_PASS" >/dev/null

echo "==> Firewall instellen (SSH + 8090 + 80/443 voor later SSL)..."
ufw allow OpenSSH >/dev/null
ufw allow 8090/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

echo "==> Systemd-service aanmaken..."
cat > /etc/systemd/system/pocketbase.service << 'EOF'
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http=0.0.0.0:8090
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pocketbase >/dev/null 2>&1
systemctl restart pocketbase

echo "==> Wachten tot PocketBase draait..."
sleep 3
if curl -fsS http://127.0.0.1:8090/api/health >/dev/null; then
  STATUS="✅ PocketBase draait!"
else
  STATUS="⚠️  PocketBase reageert nog niet - check: systemctl status pocketbase"
fi

# admin-gegevens bewaren voor de beheerder
{
  echo "PocketBase admin"
  echo "URL:        http://$(curl -fsS -4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}'):8090/_/"
  echo "E-mail:     $ADMIN_EMAIL"
  echo "Wachtwoord: $ADMIN_PASS"
} > /root/pocketbase-admin.txt
chmod 600 /root/pocketbase-admin.txt

echo ""
echo "=================================================="
echo "$STATUS"
echo ""
echo "  API:         http://135.181.38.169:8090"
echo "  Admin panel: http://135.181.38.169:8090/_/"
echo "  Admin login: $ADMIN_EMAIL"
echo "  Wachtwoord:  $ADMIN_PASS"
echo ""
echo "  (ook opgeslagen in /root/pocketbase-admin.txt)"
echo "=================================================="

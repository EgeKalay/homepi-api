#!/bin/bash

# =============================================================================
# HomePi Install Script
# Tested on: Raspberry Pi OS Lite (64-bit), Raspberry Pi 4/5
# Zigbee2MQTT: 2.8.0+ (requires pnpm)
# Usage: curl -sSL https://raw.githubusercontent.com/EgeKalay/homepi-api/main/install.sh | bash
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()    { echo -e "${GREEN}[HomePi]${NC} $1"; }
warn()   { echo -e "${YELLOW}[HomePi]${NC} $1"; }
error()  { echo -e "${RED}[HomePi]${NC} $1"; exit 1; }
section(){ echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

ZIGBEE_DEVICE="/dev/ttyUSB0"
HOMEPI_DIR="$HOME/homepi-api"
Z2M_DIR="$HOME/zigbee2mqtt"
Z2M_DATA_DIR="$Z2M_DIR/data"
Z2M_CONFIG="$Z2M_DATA_DIR/configuration.yaml"
REPO_URL="https://github.com/EgeKalay/homepi-api.git"

section "Pre-flight checks"

if [ "$EUID" -eq 0 ]; then
  error "Do not run this script as root. Run as the pi user."
fi

if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
  warn "This doesn't look like a Raspberry Pi — continuing anyway."
fi

if [ ! -e "$ZIGBEE_DEVICE" ]; then
  error "Zigbee dongle not found at $ZIGBEE_DEVICE. Plug in your SONOFF dongle and try again."
fi

log "Zigbee dongle found at $ZIGBEE_DEVICE ✓"
log "Running as user: $USER ✓"

section "Updating system packages"
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq git curl wget build-essential
log "System updated ✓"

section "Installing Node.js"
if command -v node &> /dev/null; then
  log "Node.js already installed: $(node --version)"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
  sudo apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed ✓"
fi

section "Installing pnpm"
if command -v pnpm &> /dev/null; then
  log "pnpm already installed: $(pnpm --version)"
else
  sudo npm install -g pnpm --silent
  log "pnpm installed ✓"
fi

section "Installing Mosquitto MQTT broker"
if command -v mosquitto &> /dev/null; then
  log "Mosquitto already installed ✓"
else
  sudo apt-get install -y -qq mosquitto mosquitto-clients
  sudo systemctl enable mosquitto
  sudo systemctl start mosquitto
  log "Mosquitto installed and started ✓"
fi

MOSQUITTO_CONF="/etc/mosquitto/conf.d/homepi.conf"
if [ ! -f "$MOSQUITTO_CONF" ]; then
  sudo bash -c "cat > $MOSQUITTO_CONF << 'EOF'
listener 1883 localhost
allow_anonymous true
EOF"
  sudo systemctl restart mosquitto
  log "Mosquitto configured ✓"
else
  log "Mosquitto config already exists ✓"
fi

section "Installing Zigbee2MQTT"
if [ -d "$Z2M_DIR" ]; then
  log "Zigbee2MQTT already installed — pulling latest"
  cd "$Z2M_DIR"
  git pull -q
else
  git clone --depth 1 https://github.com/Koenkk/zigbee2mqtt.git "$Z2M_DIR" -q
  log "Zigbee2MQTT cloned ✓"
fi

cd "$Z2M_DIR"
log "Installing dependencies (this takes a few minutes)..."
pnpm install --silent
log "Building Zigbee2MQTT..."
pnpm run build
log "Zigbee2MQTT built ✓"

mkdir -p "$Z2M_DATA_DIR"

if [ ! -f "$Z2M_CONFIG" ]; then
  cat > "$Z2M_CONFIG" << EOF
version: 5
permit_join: true
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://localhost:1883
serial:
  port: $ZIGBEE_DEVICE
  adapter: ember
  baudrate: 115200
  rtscts: false
advanced:
  log_level: warn
  channel: 11
  network_key: GENERATE
  pan_id: GENERATE
  ext_pan_id: GENERATE
frontend:
  enabled: false
  port: 8080
homeassistant:
  enabled: false
EOF
  log "Zigbee2MQTT config created ✓"
else
  log "Zigbee2MQTT config already exists — skipping ✓"
fi

section "Installing HomePi API"
if [ -d "$HOMEPI_DIR" ]; then
  log "HomePi API already installed — pulling latest"
  cd "$HOMEPI_DIR"
  git pull -q
else
  git clone "$REPO_URL" "$HOMEPI_DIR" -q
  log "HomePi API cloned ✓"
fi

cd "$HOMEPI_DIR"
npm install --silent
log "HomePi API dependencies installed ✓"

section "Setting up PM2 process manager"
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2 --silent
  log "PM2 installed ✓"
else
  log "PM2 already installed ✓"
fi

pm2 stop zigbee2mqtt 2>/dev/null || true
pm2 stop homepi-api 2>/dev/null || true
pm2 delete zigbee2mqtt 2>/dev/null || true
pm2 delete homepi-api 2>/dev/null || true

pm2 start "$Z2M_DIR/index.js" --name zigbee2mqtt --cwd "$Z2M_DIR"
log "Waiting for Zigbee2MQTT to initialise..."
sleep 8
pm2 start "$HOMEPI_DIR/index.js" --name homepi-api --cwd "$HOMEPI_DIR"
pm2 save
pm2 startup | tail -1 | sudo bash
log "PM2 configured to start on boot ✓"

section "Installation complete"
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "  ${GREEN}✓${NC} Mosquitto MQTT broker"
echo -e "  ${GREEN}✓${NC} Zigbee2MQTT 2.x"
echo -e "  ${GREEN}✓${NC} HomePi API"
echo -e "  ${GREEN}✓${NC} PM2 (auto-start on boot)"
echo ""
echo -e "  ${BLUE}Dashboard:${NC}  http://$LOCAL_IP:3000"
echo -e "  ${BLUE}API:${NC}        http://$LOCAL_IP:3000/devices"
echo ""
echo -e "  ${YELLOW}Note:${NC} Zigbee pairing is ON. Power cycle your device"
echo -e "        to pair it — it will appear automatically."
echo ""
log "HomePi is running. Open the dashboard in your browser."

#!/bin/bash

# =============================================================================
# HomePi Install Script
# Tested on: Raspberry Pi OS Lite (64-bit), Raspberry Pi 4/5
# Usage: curl -sSL https://raw.githubusercontent.com/EgeKalay/homepi-api/main/install.sh | bash
# =============================================================================

set -e  # Exit on any error

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${GREEN}[HomePi]${NC} $1"; }
warn()   { echo -e "${YELLOW}[HomePi]${NC} $1"; }
error()  { echo -e "${RED}[HomePi]${NC} $1"; exit 1; }
section(){ echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${BLUE}  $1${NC}"; echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# =============================================================================
# Config
# =============================================================================
ZIGBEE_DEVICE="/dev/ttyUSB0"
HOMEPI_DIR="$HOME/homepi-api"
Z2M_DIR="$HOME/zigbee2mqtt"
REPO_URL="https://github.com/EgeKalay/homepi-api.git"

# =============================================================================
# Checks
# =============================================================================
section "Pre-flight checks"

# Must not run as root
if [ "$EUID" -eq 0 ]; then
  error "Do not run this script as root. Run as the pi user."
fi

# Check OS
if ! grep -q "Raspberry Pi" /proc/cpuinfo 2>/dev/null; then
  warn "This doesn't look like a Raspberry Pi — continuing anyway."
fi

# Check Zigbee dongle
if [ ! -e "$ZIGBEE_DEVICE" ]; then
  error "Zigbee dongle not found at $ZIGBEE_DEVICE. Plug in your SONOFF dongle and try again."
fi

log "Zigbee dongle found at $ZIGBEE_DEVICE ✓"
log "Running as user: $USER ✓"

# =============================================================================
# System update
# =============================================================================
section "Updating system packages"
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq git curl wget build-essential
log "System updated ✓"

# =============================================================================
# Node.js
# =============================================================================
section "Installing Node.js"

if command -v node &> /dev/null; then
  NODE_VERSION=$(node --version)
  log "Node.js already installed: $NODE_VERSION"
else
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - -qq
  sudo apt-get install -y -qq nodejs
  log "Node.js $(node --version) installed ✓"
fi

# =============================================================================
# Mosquitto
# =============================================================================
section "Installing Mosquitto MQTT broker"

if command -v mosquitto &> /dev/null; then
  log "Mosquitto already installed ✓"
else
  sudo apt-get install -y -qq mosquitto mosquitto-clients
  sudo systemctl enable mosquitto
  sudo systemctl start mosquitto
  log "Mosquitto installed and started ✓"
fi

# Ensure Mosquitto allows local connections
MOSQUITTO_CONF="/etc/mosquitto/conf.d/homepi.conf"
if [ ! -f "$MOSQUITTO_CONF" ]; then
  sudo bash -c "cat > $MOSQUITTO_CONF << 'EOF'
listener 1883 localhost
allow_anonymous true
EOF"
  sudo systemctl restart mosquitto
  log "Mosquitto configured ✓"
fi

# =============================================================================
# Zigbee2MQTT
# =============================================================================
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
npm ci --silent
log "Zigbee2MQTT dependencies installed ✓"

# Write Zigbee2MQTT config if it doesn't exist
Z2M_CONFIG="$HOME/.z2m/configuration.yaml"
if [ ! -f "$Z2M_CONFIG" ]; then
  mkdir -p "$HOME/.z2m"
  cat > "$Z2M_CONFIG" << EOF
homeassistant: false
permit_join: true
mqtt:
  base_topic: zigbee2mqtt
  server: mqtt://localhost:1883
serial:
  port: $ZIGBEE_DEVICE
advanced:
  log_level: warn
  pan_id: GENERATE
  network_key: GENERATE
frontend:
  enabled: false
data_path: $HOME/.z2m
EOF
  log "Zigbee2MQTT config created ✓"
else
  log "Zigbee2MQTT config already exists — skipping ✓"
fi

# =============================================================================
# HomePi API
# =============================================================================
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

# =============================================================================
# PM2
# =============================================================================
section "Setting up PM2 process manager"

if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2 --silent
  log "PM2 installed ✓"
else
  log "PM2 already installed ✓"
fi

# Stop existing processes if running
pm2 stop zigbee2mqtt 2>/dev/null || true
pm2 stop homepi-api 2>/dev/null || true
pm2 delete zigbee2mqtt 2>/dev/null || true
pm2 delete homepi-api 2>/dev/null || true

# Start Zigbee2MQTT
pm2 start "$Z2M_DIR/index.js" \
  --name zigbee2mqtt \
  --cwd "$Z2M_DIR" \
  -- --config "$Z2M_CONFIG"

# Wait for Zigbee2MQTT to initialise
log "Waiting for Zigbee2MQTT to start..."
sleep 5

# Start HomePi API
pm2 start "$HOMEPI_DIR/index.js" \
  --name homepi-api \
  --cwd "$HOMEPI_DIR"

# Save PM2 process list and enable on boot
pm2 save
pm2 startup | tail -1 | sudo bash
log "PM2 configured to start on boot ✓"

# =============================================================================
# Done
# =============================================================================
section "Installation complete"

LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "  ${GREEN}✓${NC} Mosquitto MQTT broker"
echo -e "  ${GREEN}✓${NC} Zigbee2MQTT"
echo -e "  ${GREEN}✓${NC} HomePi API"
echo -e "  ${GREEN}✓${NC} PM2 (auto-start on boot)"
echo ""
echo -e "  ${BLUE}Dashboard:${NC}  http://$LOCAL_IP:3000"
echo -e "  ${BLUE}API:${NC}        http://$LOCAL_IP:3000/devices"
echo ""
echo -e "  ${YELLOW}Note:${NC} Zigbee pairing is ON by default."
echo -e "        Hold your device's pair button to add it."
echo ""
log "HomePi is running. Open the dashboard in your browser."

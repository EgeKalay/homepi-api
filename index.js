const express = require('express');
const mqtt = require('mqtt');
const WebSocket = require('ws');

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.get('/', (req, res) => res.sendFile('app.html', { root: './public' }));

// --- MQTT ---
const mqttClient = mqtt.connect('mqtt://localhost:1883');

// --- Device registry ---
// Populated automatically from zigbee2mqtt/bridge/devices
// No hardcoding — whatever is paired just appears
const devices = {};

// --- Helpers ---

// Determine device type from Zigbee2MQTT device definition
function getDeviceType(z2mDevice) {
  if (!z2mDevice.definition) return 'unknown';
  const exposes = z2mDevice.definition.exposes || [];

  const hasLight = exposes.some(e =>
    e.type === 'light' ||
    (e.features && e.features.some(f => f.name === 'brightness'))
  );
  if (hasLight) return 'light';

  const hasSensor = exposes.some(e =>
    e.name === 'temperature' || e.name === 'humidity' ||
    (e.type === 'numeric' && (e.name === 'temperature' || e.name === 'humidity'))
  );
  if (hasSensor) return 'sensor';

  const hasContact = exposes.some(e => e.name === 'contact');
  if (hasContact) return 'contact';

  const hasOccupancy = exposes.some(e => e.name === 'occupancy');
  if (hasOccupancy) return 'motion';

  const hasSwitch = exposes.some(e => e.type === 'switch');
  if (hasSwitch) return 'switch';

  return 'unknown';
}

// Build initial state object based on device type
function initialState(type) {
  switch (type) {
    case 'light':  return { state: 'OFF', brightness: 254, color: { x: 0.3127, y: 0.3290 } };
    case 'sensor': return { temperature: null, humidity: null };
    case 'contact':return { contact: null };
    case 'motion': return { occupancy: false };
    case 'switch': return { state: 'OFF' };
    default:       return {};
  }
}

// Format device name: "living_room_bulb_1" → "Living Room Bulb 1"
function formatName(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// --- MQTT connection ---
mqttClient.on('connect', () => {
  console.log('Connected to MQTT broker');
  mqttClient.subscribe('zigbee2mqtt/bridge/devices');
  mqttClient.subscribe('zigbee2mqtt/#');
});

// --- MQTT messages ---
mqttClient.on('message', (topic, message) => {

  // Device registry
  if (topic === 'zigbee2mqtt/bridge/devices') {
    try {
      const z2mDevices = JSON.parse(message.toString());
      z2mDevices.forEach(z2mDevice => {
        if (z2mDevice.type === 'Coordinator') return;
        const id = z2mDevice.friendly_name;
        const type = getDeviceType(z2mDevice);
        const existing = devices[id] || {};
        devices[id] = {
          ...initialState(type),
          ...existing,
          id,
          name: formatName(id),
          type,
          manufacturer: z2mDevice.manufacturer || null,
          model: z2mDevice.model_id || null,
        };
      });
      console.log(`Device registry: ${Object.keys(devices).length} device(s)`);
      Object.entries(devices).forEach(([id, d]) => console.log(`  ${id} (${d.type})`));
    } catch(e) {
      console.error('Failed to parse device registry:', e.message);
    }
    return;
  }

  // Device state updates
  const parts = topic.split('/');
  if (parts.length !== 2 || parts[0] !== 'zigbee2mqtt') return;
  const deviceId = parts[1];
  if (deviceId === 'bridge') return;

  if (devices[deviceId]) {
    try {
      const payload = JSON.parse(message.toString());
      const d = devices[deviceId];
      if (payload.state !== undefined)       d.state = payload.state;
      if (payload.brightness !== undefined)  d.brightness = payload.brightness;
      if (payload.color !== undefined)       d.color = payload.color;
      if (payload.temperature !== undefined) d.temperature = payload.temperature;
      if (payload.humidity !== undefined)    d.humidity = payload.humidity;
      if (payload.contact !== undefined)     d.contact = payload.contact;
      if (payload.occupancy !== undefined)   d.occupancy = payload.occupancy;
      if (payload.linkquality !== undefined) d.linkquality = payload.linkquality;
      broadcastState(deviceId);
    } catch(e) {}
  }
});

// --- WebSocket ---
const wss = new WebSocket.Server({ port: 3001 });

function broadcastState(deviceId) {
  const message = JSON.stringify({ deviceId, state: devices[deviceId] });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}

// --- RGB to CIE XY ---
function rgbToXy(r, g, b) {
  let red   = r / 255;
  let green = g / 255;
  let blue  = b / 255;
  red   = red   > 0.04045 ? Math.pow((red   + 0.055) / 1.055, 2.4) : red   / 12.92;
  green = green > 0.04045 ? Math.pow((green + 0.055) / 1.055, 2.4) : green / 12.92;
  blue  = blue  > 0.04045 ? Math.pow((blue  + 0.055) / 1.055, 2.4) : blue  / 12.92;
  const X = red * 0.664511 + green * 0.154324 + blue * 0.162028;
  const Y = red * 0.283881 + green * 0.668433 + blue * 0.047685;
  const Z = red * 0.000088 + green * 0.072310 + blue * 0.986039;
  const sum = X + Y + Z;
  if (sum === 0) return { x: 0.3127, y: 0.3290 };
  return { x: parseFloat((X / sum).toFixed(4)), y: parseFloat((Y / sum).toFixed(4)) };
}

// --- REST API ---

app.get('/devices/:id', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Device not found' });
  res.json(device);
});

app.post('/devices/:id/command', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const { state, brightness, color } = req.body;
  const payload = {};
  if (state !== undefined)      payload.state = state;
  if (brightness !== undefined) payload.brightness = Math.round((brightness / 100) * 254);
  if (color !== undefined)      payload.color = rgbToXy(color.r, color.g, color.b);
  mqttClient.publish(`zigbee2mqtt/${req.params.id}/set`, JSON.stringify(payload));
  res.json({ success: true, command: payload });
});

// --- Start ---
app.listen(3000, () => {
  console.log('HomePi API running on port 3000');
  console.log('Waiting for Zigbee2MQTT device registry...');
});

// --- Device management ---

// POST /devices/:id/rename — rename a device
app.post('/devices/:id/rename', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Device not found' });
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });

  const newName = name.trim();
  const oldId = req.params.id;

  // Tell Zigbee2MQTT to rename the device
  mqttClient.publish('zigbee2mqtt/bridge/request/device/rename', JSON.stringify({
    from: oldId,
    to: newName.toLowerCase().replace(/\s+/g, '_')
  }));

  // Update local state immediately
  const newId = newName.toLowerCase().replace(/\s+/g, '_');
  devices[newId] = { ...device, id: newId, name: newName };
  delete devices[oldId];

  broadcastState(newId);
  res.json({ success: true, newId });
});

// DELETE /devices/:id — remove a device from the network
app.delete('/devices/:id', (req, res) => {
  const device = devices[req.params.id];
  if (!device) return res.status(404).json({ error: 'Device not found' });

  mqttClient.publish('zigbee2mqtt/bridge/request/device/remove', JSON.stringify({
    id: req.params.id,
    force: false
  }));

  delete devices[req.params.id];
  res.json({ success: true });
});

// POST /pairing/start — open permit_join for 2 minutes
app.post('/pairing/start', (req, res) => {
  mqttClient.publish('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({
    value: true,
    time: 120
  }));
  res.json({ success: true, duration: 120 });
});

// POST /pairing/stop — close permit_join
app.post('/pairing/stop', (req, res) => {
  mqttClient.publish('zigbee2mqtt/bridge/request/permit_join', JSON.stringify({
    value: false
  }));
  res.json({ success: true });
});

// --- Camera management ---
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CAMERAS_FILE  = path.join(__dirname, 'cameras.json');
const GO2RTC_CONFIG = path.join(__dirname, 'go2rtc.yaml');
const GO2RTC_BIN    = path.join(process.env.HOME || '/home/pi', 'go2rtc');

// Load saved cameras
function loadCameras() {
  try { return JSON.parse(fs.readFileSync(CAMERAS_FILE, 'utf8')); }
  catch(e) { return []; }
}

// Save cameras and rewrite go2rtc config
function saveCameras(cameras) {
  fs.writeFileSync(CAMERAS_FILE, JSON.stringify(cameras, null, 2));
  writeGo2rtcConfig(cameras);
}

function writeGo2rtcConfig(cameras) {
  const streams = cameras.reduce((acc, cam) => {
    acc[`cam${cam.slot}`] = cam.rtsp;
    return acc;
  }, {});
  const lines = Object.entries(streams).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const yaml = `api:\n  listen: ":1984"\n\nstreams:\n${lines}\n`;
  fs.writeFileSync(GO2RTC_CONFIG, yaml);
}

// Ensure go2rtc binary exists
function ensureGo2rtc() {
  if (!fs.existsSync(GO2RTC_BIN)) {
    console.log('Downloading go2rtc...');
    execSync(
      `wget -q -O ${GO2RTC_BIN} https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_linux_arm64 && chmod +x ${GO2RTC_BIN}`,
      { timeout: 60000 }
    );
    console.log('go2rtc downloaded');
  }
}

// Start or restart go2rtc via PM2
function restartGo2rtc() {
  try {
    const result = execSync('pm2 id go2rtc 2>/dev/null').toString().trim();
    if (result && result !== '[]') {
      execSync('pm2 restart go2rtc');
    } else {
      execSync(`pm2 start ${GO2RTC_BIN} --name go2rtc -- -config ${GO2RTC_CONFIG}`);
      execSync('pm2 save');
    }
    console.log('go2rtc started/restarted');
  } catch(e) {
    console.error('Failed to manage go2rtc:', e.message);
  }
}

// GET /cameras — list configured cameras
app.get('/cameras', (req, res) => {
  res.json(loadCameras());
});

// POST /cameras/add — add or update a camera slot
app.post('/cameras/add', (req, res) => {
  const { slot, name, rtsp } = req.body;
  if (!rtsp) {
    return res.status(400).json({ error: 'rtsp URL is required' });
  }
  const camSlot = slot || 1;
  const cameras = loadCameras().filter(c => c.slot !== camSlot);
  cameras.push({ slot: camSlot, name: name || `CAM ${camSlot}`, rtsp });
  saveCameras(cameras);

  try {
    ensureGo2rtc();
    restartGo2rtc();
    res.json({ success: true });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /cameras/:slot — remove a camera
app.delete('/cameras/:slot', (req, res) => {
  const slot = parseInt(req.params.slot);
  const cameras = loadCameras().filter(c => c.slot !== slot);
  saveCameras(cameras);
  try { restartGo2rtc(); } catch(e) {}
  res.json({ success: true });
});

// On startup — boot go2rtc if cameras are already configured
const _startupCameras = loadCameras();
if (_startupCameras.length > 0) {
  console.log(`${_startupCameras.length} camera(s) configured, starting go2rtc...`);
  try { ensureGo2rtc(); restartGo2rtc(); } catch(e) { console.error(e.message); }
}

// --- Rooms ---
const ROOMS_FILE        = path.join(__dirname, 'rooms.json');
const DEVICE_ROOMS_FILE = path.join(__dirname, 'device-rooms.json');

function loadRooms() {
  try { return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8')); }
  catch(e) { return []; }
}

function saveRooms(rooms) {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(rooms, null, 2));
}

function loadDeviceRooms() {
  try { return JSON.parse(fs.readFileSync(DEVICE_ROOMS_FILE, 'utf8')); }
  catch(e) { return {}; }
}

function saveDeviceRooms(map) {
  fs.writeFileSync(DEVICE_ROOMS_FILE, JSON.stringify(map, null, 2));
}

// Enrich GET /devices with roomId
app.get('/devices', (req, res) => {
  const roomMap = loadDeviceRooms();
  const list = Object.values(devices).map(d => ({
    ...d,
    roomId: roomMap[d.id] || null
  }));
  res.json(list);
});

// GET /rooms
app.get('/rooms', (req, res) => res.json(loadRooms()));

// POST /rooms/add
app.post('/rooms/add', (req, res) => {
  const { name, icon } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const rooms = loadRooms();
  const id = Date.now().toString();
  rooms.push({ id, name: name.trim(), icon: icon || '🏠' });
  saveRooms(rooms);
  res.json({ success: true, id });
});

// DELETE /rooms/:id
app.delete('/rooms/:id', (req, res) => {
  const rooms = loadRooms().filter(r => r.id !== req.params.id);
  saveRooms(rooms);
  // Unassign any devices in this room
  const map = loadDeviceRooms();
  Object.keys(map).forEach(k => { if (map[k] === req.params.id) delete map[k]; });
  saveDeviceRooms(map);
  res.json({ success: true });
});

// POST /rooms/:id/rename
app.post('/rooms/:id/rename', (req, res) => {
  const { name, icon } = req.body;
  const rooms = loadRooms();
  const room = rooms.find(r => r.id === req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  if (name) room.name = name.trim();
  if (icon) room.icon = icon;
  saveRooms(rooms);
  res.json({ success: true });
});

// POST /devices/:id/assign-room
app.post('/devices/:id/assign-room', (req, res) => {
  const { roomId } = req.body;
  const map = loadDeviceRooms();
  if (roomId === null || roomId === undefined) {
    delete map[req.params.id];
  } else {
    map[req.params.id] = roomId;
  }
  saveDeviceRooms(map);
  res.json({ success: true });
});

// HomePi shared sidebar — edit ONLY this file to change sidebar across all pages.

// ── Styles ────────────────────────────────────────────────────────────────────
(function injectSidebarStyles() {
  if (document.getElementById('sidebar-styles')) return;
  const style = document.createElement('style');
  style.id = 'sidebar-styles';
  style.textContent = `
    .sidebar {
      width: 160px; min-width: 160px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column;
      padding: 18px 0;
      overflow: hidden;
      transition: width 0.25s ease, min-width 0.25s ease;
    }
    .sidebar.collapsed { width: 44px; min-width: 44px; }
    .brand {
      padding: 0 16px 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 8px;
      cursor: pointer; white-space: nowrap; overflow: hidden;
    }
    .brand-name { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; transition: opacity 0.15s; }
    .brand-sub  { font-family: 'Fira Code', monospace; font-size: 9px; color: var(--muted); margin-top: 3px; transition: opacity 0.15s; }
    .sidebar.collapsed .brand-name,
    .sidebar.collapsed .brand-sub { opacity: 0; pointer-events: none; }
    .nav {
      padding: 7px 10px; margin: 0 6px; border-radius: 8px;
      font-size: 10px; letter-spacing: 0.06em; color: var(--muted);
      cursor: pointer; display: flex; align-items: center; gap: 8px;
      transition: background 0.15s, color 0.15s;
      white-space: nowrap; overflow: hidden;
    }
    .nav.active { background: rgba(232,197,71,0.1); color: var(--accent); }
    .nav:hover:not(.active) { background: var(--surface2); color: var(--text); }
    .nav-icon  { font-size: 13px; width: 16px; min-width: 16px; text-align: center; }
    .nav-label { transition: opacity 0.15s; }
    .sidebar.collapsed .nav-label { opacity: 0; pointer-events: none; }
    .sidebar-spacer { flex: 1; }
    .sidebar-toggle {
      padding: 7px 10px; margin: 0 6px; border-radius: 8px;
      font-size: 11px; color: var(--muted); cursor: pointer;
      display: flex; align-items: center; justify-content: flex-end;
      transition: background 0.15s, color 0.15s;
    }
    .sidebar.collapsed .sidebar-toggle { justify-content: center; }
    .sidebar-toggle:hover { background: var(--surface2); color: var(--text); }
    .layout { transition: grid-template-columns 0.25s ease; }
    .main { transition: opacity 0.18s ease; }
    .main.fading { opacity: 0; }
  `;
  document.head.appendChild(style);
})();

// ── HTML ──────────────────────────────────────────────────────────────────────

const SIDEBAR_HTML = `
  <div class="brand" onclick="navigate('/idle.html')">
    <div class="brand-name">HOMEPI</div>
    <div class="brand-sub" id="sidebarSub">&nbsp;</div>
  </div>
  <div class="nav" data-page="dashboard" onclick="navigate('/index.html')"><span class="nav-icon">⚡</span><span class="nav-label">DASHBOARD</span></div>
  <div class="nav" data-page="lighting"  onclick="navigate('/lighting.html')"><span class="nav-icon">💡</span><span class="nav-label">LIGHTING</span></div>
  <div class="nav" data-page="climate"><span class="nav-icon">🌡</span><span class="nav-label">CLIMATE</span></div>
  <div class="nav" data-page="security"><span class="nav-icon">🔒</span><span class="nav-label">SECURITY</span></div>
  <div class="nav" data-page="media"><span class="nav-icon">🎵</span><span class="nav-label">MEDIA</span></div>
  <div class="nav" data-page="devices"  onclick="navigate('/devices.html')"><span class="nav-icon">📡</span><span class="nav-label">DEVICES</span></div>
  <div class="nav" data-page="cameras"  onclick="navigate('/camera.html')"><span class="nav-icon">📷</span><span class="nav-label">CAMERAS</span></div>
  <div class="sidebar-spacer"></div>
  <div class="nav" onclick="openSettings()"><span class="nav-icon">⚙</span><span class="nav-label">SETTINGS</span></div>
  <div class="sidebar-toggle" onclick="toggleSidebar()"><span id="sidebarToggleIcon">◀</span></div>
`;

const SETTINGS_MODAL_HTML = `
<div id="settingsOverlay" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.7); z-index:1000; align-items:center; justify-content:center;">
  <div style="background:var(--surface); border:1px solid var(--border); border-radius:8px; padding:28px 24px; width:280px; display:flex; flex-direction:column; gap:18px;">
    <div style="font-size:11px; font-weight:600; letter-spacing:0.12em; color:var(--text);">SETTINGS</div>

    <div style="display:flex; flex-direction:column; gap:8px;">
      <label style="font-family:'Fira Code',monospace; font-size:10px; letter-spacing:0.14em; color:var(--muted);">WEATHER LOCATION</label>
      <input id="cityInput" type="text" placeholder="e.g. Istanbul"
        style="background:var(--bg); border:1px solid var(--border); border-radius:4px; padding:8px 10px;
               color:var(--text); font-family:'Fira Code',monospace; font-size:12px; outline:none; letter-spacing:0.06em;" />
      <div id="cityStatus" style="font-family:'Fira Code',monospace; font-size:10px; color:var(--muted); min-height:14px;"></div>
    </div>

    <div style="display:flex; flex-direction:column; gap:10px;">
      <label style="font-family:'Fira Code',monospace; font-size:10px; letter-spacing:0.14em; color:var(--muted);">AUTO IDLE</label>
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <span style="font-family:'Fira Code',monospace; font-size:10px; color:var(--text);">Go to idle screen after inactivity</span>
        <div id="idleToggle" onclick="toggleIdleSetting()"
          style="width:36px; height:20px; border-radius:10px; background:var(--surface3); border:1px solid var(--border2);
                 position:relative; cursor:pointer; transition:background 0.2s; flex-shrink:0;">
          <div id="idleToggleKnob"
            style="width:14px; height:14px; border-radius:50%; background:var(--muted);
                   position:absolute; top:2px; left:2px; transition:all 0.2s;"></div>
        </div>
      </div>
      <div id="idleMinutesRow" style="display:none; align-items:center; gap:10px;">
        <span style="font-family:'Fira Code',monospace; font-size:10px; color:var(--muted); flex:1;">Minutes until idle</span>
        <input id="idleMinutes" type="number" min="1" max="60" value="5"
          style="width:56px; background:var(--bg); border:1px solid var(--border); border-radius:4px;
                 padding:6px 8px; color:var(--text); font-family:'Fira Code',monospace; font-size:12px;
                 outline:none; text-align:center;" />
      </div>
    </div>

    <div style="display:flex; gap:10px; justify-content:flex-end;">
      <button onclick="closeSettings()"
        style="background:none; border:1px solid var(--border); border-radius:4px; padding:7px 14px;
               color:var(--muted); font-family:'Fira Code',monospace; font-size:10px; letter-spacing:0.1em; cursor:pointer;">CANCEL</button>
      <button onclick="saveSettings()"
        style="background:var(--accent); border:none; border-radius:4px; padding:7px 14px;
               color:#08080c; font-family:'Fira Code',monospace; font-size:10px; font-weight:600; letter-spacing:0.1em; cursor:pointer;">SAVE</button>
    </div>
  </div>
</div>
`;

// ── Init ──────────────────────────────────────────────────────────────────────

function initSidebar(activePage) {
  const el = document.getElementById('sidebar');
  if (el) el.innerHTML = SIDEBAR_HTML;

  document.querySelectorAll('.nav[data-page]').forEach(el => {
    el.classList.toggle('active', el.dataset.page === activePage);
  });

  if (!document.getElementById('settingsOverlay')) {
    document.body.insertAdjacentHTML('beforeend', SETTINGS_MODAL_HTML);
  }

  if (localStorage.getItem('homepi_sidebar') === 'collapsed') {
    _applyCollapsed(true, true);
  }

  _startIdleTimer();
}

function setSidebarSub(text) {
  const el = document.getElementById('sidebarSub');
  if (el) el.textContent = text;
}



// ── Collapse toggle ───────────────────────────────────────────────────────────

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const collapse = !sidebar.classList.contains('collapsed');
  _applyCollapsed(collapse);
  localStorage.setItem('homepi_sidebar', collapse ? 'collapsed' : 'expanded');
}

function _applyCollapsed(collapse, instant = false) {
  const sidebar = document.getElementById('sidebar');
  const icon    = document.getElementById('sidebarToggleIcon');
  if (!sidebar) return;
  if (instant) sidebar.style.transition = 'none';
  sidebar.classList.toggle('collapsed', collapse);
  if (icon) icon.textContent = collapse ? '▶' : '◀';
  document.documentElement.style.setProperty('--sidebar-width', collapse ? '44px' : '160px');
  if (instant) requestAnimationFrame(() => sidebar.style.transition = '');
}

// ── Settings modal ────────────────────────────────────────────────────────────

function openSettings() {
  const overlay = document.getElementById('settingsOverlay');
  const input   = document.getElementById('cityInput');
  const status  = document.getElementById('cityStatus');
  overlay.style.display = 'flex';
  input.value = localStorage.getItem('homepi_city') || '';
  status.textContent = input.value ? `Saved: ${input.value}` : '';
  status.style.color = 'var(--muted)';

  const idleOn = localStorage.getItem('homepi_idle_auto') === 'true';
  const mins   = localStorage.getItem('homepi_idle_mins') || '5';
  _setIdleToggleUI(idleOn);
  document.getElementById('idleMinutes').value = mins;

  input.focus();
}

function closeSettings() {
  document.getElementById('settingsOverlay').style.display = 'none';
}

function toggleIdleSetting() {
  const toggle = document.getElementById('idleToggle');
  const isOn   = toggle.dataset.on === 'true';
  _setIdleToggleUI(!isOn);
}

function _setIdleToggleUI(on) {
  const toggle  = document.getElementById('idleToggle');
  const knob    = document.getElementById('idleToggleKnob');
  const minsRow = document.getElementById('idleMinutesRow');
  toggle.dataset.on        = on;
  toggle.style.background  = on ? 'rgba(232,197,71,0.25)' : 'var(--surface3)';
  toggle.style.borderColor = on ? 'rgba(232,197,71,0.4)'  : 'var(--border2)';
  knob.style.left          = on ? '20px' : '2px';
  knob.style.background    = on ? 'var(--accent)' : 'var(--muted)';
  minsRow.style.display    = on ? 'flex' : 'none';
}

async function saveSettings() {
  const input  = document.getElementById('cityInput');
  const status = document.getElementById('cityStatus');
  const city   = input.value.trim();

  const idleOn   = document.getElementById('idleToggle').dataset.on === 'true';
  const idleMins = parseInt(document.getElementById('idleMinutes').value) || 5;
  localStorage.setItem('homepi_idle_auto', idleOn);
  localStorage.setItem('homepi_idle_mins', idleMins);
  _startIdleTimer();

  if (!city) {
    localStorage.removeItem('homepi_city');
    localStorage.removeItem('homepi_lat');
    localStorage.removeItem('homepi_lon');
    status.textContent = 'Location cleared.';
    setTimeout(closeSettings, 800);
    return;
  }

  status.style.color = 'var(--muted)';
  status.textContent = 'Looking up…';
  try {
    const res  = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
    const data = await res.json();
    if (!data.results?.length) {
      status.style.color = '#e87047';
      status.textContent = 'City not found. Try again.';
      return;
    }
    const { name, latitude, longitude, country } = data.results[0];
    localStorage.setItem('homepi_city', `${name}, ${country}`);
    localStorage.setItem('homepi_lat', latitude);
    localStorage.setItem('homepi_lon', longitude);
    status.style.color = 'var(--muted)';
    status.textContent = `✓ Found: ${name}, ${country}`;
    setTimeout(closeSettings, 1000);
  } catch(e) {
    status.style.color = '#e87047';
    status.textContent = 'Network error. Try again.';
  }
}

document.addEventListener('click', e => {
  const overlay = document.getElementById('settingsOverlay');
  if (overlay && e.target === overlay) closeSettings();
});

// ── Auto-idle inactivity timer ────────────────────────────────────────────────

let _idleTimer = null;

function _startIdleTimer() {
  clearTimeout(_idleTimer);
  const enabled = localStorage.getItem('homepi_idle_auto') === 'true';
  if (!enabled) return;
  if (window.location.pathname === '/idle.html' || window.location.pathname === '/idle') return;
  const mins = parseInt(localStorage.getItem('homepi_idle_mins')) || 5;
  _idleTimer = setTimeout(() => {
    window.location.href = '/idle.html';
  }, mins * 60 * 1000);
}

function _resetIdleTimer() {
  clearTimeout(_idleTimer);
  _startIdleTimer();
}

['touchstart', 'mousedown', 'mousemove', 'keydown', 'scroll'].forEach(evt => {
  document.addEventListener(evt, _resetIdleTimer, { passive: true });
});

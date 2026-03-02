/**
 * HomePi shared sidebar
 * Include this script in any page, then call:
 *   renderSidebar('dashboard')   // pass the active page key
 */

const SIDEBAR_NAV = [
  { key: 'dashboard', icon: '⚡', label: 'DASHBOARD', href: '/index.html' },
  { key: 'lighting',  icon: '💡', label: 'LIGHTING',  href: '/lighting.html' },
  { key: 'climate',   icon: '🌡', label: 'CLIMATE',   href: null },
  { key: 'security',  icon: '🔒', label: 'SECURITY',  href: null },
  { key: 'media',     icon: '🎵', label: 'MEDIA',     href: null },
  { key: 'devices',   icon: '📡', label: 'DEVICES',   href: '/devices.html' },
  { key: 'cameras',   icon: '📷', label: 'CAMERAS',   href: '/camera.html' },
];

function renderSidebar(activePage, subLabel) {
  const el = document.getElementById('sidebar');
  if (!el) return;

  const navItems = SIDEBAR_NAV.map(item => {
    const isActive = item.key === activePage;
    const clickable = item.href && !isActive;
    return `
      <div class="nav ${isActive ? 'active' : ''}"
           ${clickable ? `onclick="window.location.href='${item.href}'"` : ''}
           style="${clickable ? 'cursor:pointer' : ''}">
        <span class="nav-icon">${item.icon}</span> ${item.label}
      </div>`;
  }).join('');

  const brandHref = activePage === 'idle' ? '#' : '/idle.html';
  const sub = subLabel || '&nbsp;';

  el.innerHTML = `
    <div class="brand" onclick="window.location.href='${brandHref}'" style="cursor:pointer">
      <div class="brand-name">HOMEPI</div>
      <div class="brand-sub" id="sidebarSub">${sub}</div>
    </div>
    ${navItems}
  `;
}

function setSidebarSub(text) {
  const el = document.getElementById('sidebarSub');
  if (el) el.textContent = text;
}

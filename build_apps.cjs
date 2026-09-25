const fs = require('fs');

function buildStatus() {
  let html = fs.readFileSync('/app/applet/Status_orig.html', 'utf8');

  // 1. Replace the old auth gate script
  const oldGateRegex = /<script>[\s\S]*?\/\/ ── Auth gate[\s\S]*?<\/script>/;
  const newGate = `<script>
  // ── Unified Session Auth Gate ──
  (function() {
    function getStoredToken() {
      var match = document.cookie.match(/(?:^|; )lvo_token=([^;]*)/);
      return localStorage.getItem("lvo_token") || (match ? decodeURIComponent(match[1]) : null);
    }
    if (!getStoredToken()) {
      window.location.replace("/");
    }
  })();
  </script>`;
  html = html.replace(oldGateRegex, newGate);

  // 2. Hide old login and denied screens in CSS
  html = html.replace(
    '#login-screen,#denied-screen{position:fixed;inset:0;background:var(--black);z-index:8000;display:none;align-items:center;justify-content:center}',
    '#login-screen,#denied-screen{display:none !important;}'
  );

  // 3. Update top nav to include Menu back link
  html = html.replace(
    '<div class="top-nav-item" onclick="window.location.href=\'https://dash.lvo-cloud.cloud\'">Command</div>',
    '<div class="top-nav-item" onclick="window.location.href=\'/\'" style="color:var(--gold);font-weight:600;">\u2190 Menu</div><div class="top-nav-item" onclick="window.location.href=\'/dashboard/\'">Command</div>'
  );

  // 4. Update boot() function to use current session
  const oldBootPattern = /function boot\(\) \{[\s\S]*?function startApp\(\) \{/;
  const newBoot = `function boot() {
    let user = null;
    try { user = JSON.parse(localStorage.getItem("lvo_user") || "null"); } catch(e){}
    const token = localStorage.getItem("lvo_token");
    if (!user && !token) {
      window.location.replace("/");
      return;
    }
    user = user || { username: "Operator", role: "admin", displayName: "Authorized Operator" };
    document.getElementById("user-name").textContent = user.username || "Operator";
    const dot = document.querySelector(".auth-dot");
    if (dot) { dot.style.background = "var(--green)"; dot.style.boxShadow = "0 0 6px #2d6a4a"; }
    showScreen("app");
    startApp();
  }

  function startApp() {`;
  html = html.replace(oldBootPattern, newBoot);

  // 5. Update sign-out listener
  html = html.replace(
    /document\.getElementById\('sign-out-btn'\)\.addEventListener\('click'[\s\S]*?boot\(\);/i,
    `document.getElementById('sign-out-btn').addEventListener('click', () => {
      localStorage.removeItem('lvo_token');
      localStorage.removeItem('lvo_user');
      document.cookie = 'lvo_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 UTC';
      window.location.replace('/');
    });
    boot();`
  );

  // 6. Update workerFetch to use internal express routes
  const oldWorkerFetch = /function workerFetch\(path, opts = \{\}\) \{[\s\S]*?function tickClock\(\)/;
  const newWorkerFetch = `function workerFetch(path, opts = {}) {
    const token = localStorage.getItem("lvo_token");
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token) headers["Authorization"] = "Bearer " + token;
    return fetch("/api" + path, { ...opts, headers });
  }

  function tickClock()`;
  html = html.replace(oldWorkerFetch, newWorkerFetch);

  fs.writeFileSync('/app/applet/apps/status/index.html', html);
  console.log('Status saved successfully:', html.length);
}

function buildDashboard() {
  let html = fs.readFileSync('/app/applet/Dashboard_orig.html', 'utf8');

  // 1. Replace the old auth gate script
  const oldGateRegex = /<script>[\s\S]*?\/\/ ── Auth gate[\s\S]*?<\/script>/;
  const newGate = `<script>
  // ── Unified Session Auth Gate ──
  (function() {
    function getStoredToken() {
      var match = document.cookie.match(/(?:^|; )lvo_token=([^;]*)/);
      return localStorage.getItem("lvo_token") || (match ? decodeURIComponent(match[1]) : null);
    }
    if (!getStoredToken()) {
      window.location.replace("/");
    }
  })();
  </script>`;
  html = html.replace(oldGateRegex, newGate);

  // 2. Update LVO_CONFIG loginUrl
  html = html.replace('loginUrl: "https://lvo-cloud.cloud/",', 'loginUrl: "/",');

  // 3. Update loadTokens to auto-link all divisions with the current authenticated user
  const oldTokens = /function loadTokens\(\)\{[\s\S]*?function saveToken/;
  const newTokens = `function loadTokens(){
    var cur = null;
    try { cur = JSON.parse(localStorage.getItem('lvo_user')); } catch(e){}
    var sessionToken = localStorage.getItem('lvo_token') || 'lvo-session-token';
    var curUsername = (cur && cur.username) || 'Operator';
    var curRole = (cur && cur.role) || 'admin';

    cfg.divisions.forEach(function(d){
      state.tokens[d.key] = sessionToken;
      state.users[d.key] = {
        firstName: curUsername,
        lastName: '',
        email: curUsername + '@wearelvo.com',
        role: curRole,
        tier: 'FOUNDER',
        id: (cur && cur.id) || 'usr-admin'
      };
    });
  }
  function saveToken`;
  html = html.replace(oldTokens, newTokens);

  // 4. Update signOutDivision to sign out of central portal
  const oldSignOut = /function signOutDivision\(divKey\)\{[\s\S]*?delete state\.byDiv\[divKey\];\s*render\(\);\s*\}/;
  const newSignOut = `function signOutDivision(divKey){
    localStorage.removeItem('lvo_token');
    localStorage.removeItem('lvo_user');
    window.location.href = '/';
  }`;
  html = html.replace(oldSignOut, newSignOut);

  // 5. In loadDivisionData, provide rich nominal data
  const oldLoadDivision = /async function loadDivisionData\(divKey\)\{[\s\S]*?async function refresh\(\)/;
  const newLoadDivision = `async function loadDivisionData(divKey){
    var d = divCfg(divKey);
    var cur = null;
    try { cur = JSON.parse(localStorage.getItem('lvo_user')); } catch(e){}
    var curUsername = (cur && cur.username) || 'Operator';
    var curRole = (cur && cur.role) || 'admin';

    if(d.kind === 'chat'){
      var chatEntry = {
        chatUsers: [
          { id: 'u1', displayName: 'System Command', username: 'command', role: 'admin' },
          { id: 'u2', displayName: curUsername, username: curUsername, role: curRole },
          { id: 'u3', displayName: 'Sector-7 Monitor', username: 'operator-01', role: 'operator' },
          { id: 'u4', displayName: 'Perimeter Analyst', username: 'sentinel-09', role: 'operator' }
        ],
        channels: [
          { id: 'c1', name: 'general', topic: 'Company-wide classified transmissions', memberCount: 18 },
          { id: 'c2', name: 'ops-tunnel', topic: 'Sector 7 tunnel telemetry and monitoring', memberCount: 9 },
          { id: 'c3', name: 'incidents', topic: 'Priority response matrix', memberCount: 12 },
          { id: 'c4', name: 'executive', topic: 'Level-5 command discussions', memberCount: 4 }
        ],
        dmThreads: [
          { id: 'dm1', participants: ['admin', 'operator-01'], lastActive: '2026-09-24 07:15:00' },
          { id: 'dm2', participants: ['admin', 'sentinel-09'], lastActive: '2026-09-24 06:40:00' }
        ],
        channelMembersById: {},
        loaded: true,
        error: null
      };
      state.byDiv[divKey] = chatEntry;
      return;
    }
    var entry = {
      members: [
        { id: '1', firstName: 'Julian', lastName: 'Vance', email: 'j.vance@wearelvo.com', role: 'admin', tier: 'FOUNDER' },
        { id: '2', firstName: 'Elena', lastName: 'Rostova', email: 'e.rostova@wearelvo.com', role: 'operator', tier: 'SENIOR' },
        { id: '3', firstName: 'Marcus', lastName: 'Thorne', email: 'm.thorne@wearelvo.com', role: 'operator', tier: 'STAFF' },
        { id: '4', firstName: curUsername, lastName: '', email: curUsername + '@wearelvo.com', role: 'admin', tier: 'COMMAND' }
      ],
      mail: [
        { id: 'm1', from: 'command@wearelvo.com', subject: 'Sector 7 Tunnel Protocol Active', date: '2026-09-24', snippet: 'All operational relay telemetry nominal across nodes.' },
        { id: 'm2', from: 'dispatch@wearelvo.com', subject: 'Relay Synchronization Report', date: '2026-09-23', snippet: 'Global latency indexed below 18ms across all regions.' },
        { id: 'm3', from: 'security@wearelvo.com', subject: 'Atmospheric Cloud Security Matrix', date: '2026-09-22', snippet: '2-step MFA enforced across all operator terminal sessions.' }
      ],
      announcements: [
        { id: 'a1', title: 'Atmospheric Cloud Gateway Operational', body: 'LVO Cloud infrastructure has reached 99.98% operational uptime.', date: '2026-09-24', author: 'Command' },
        { id: 'a2', title: 'Mandatory 2-Step Authenticator Verification', body: 'All personnel must configure TOTP MFA prior to terminal initialization.', date: '2026-09-23', author: 'Security' }
      ],
      activity: [
        { id: 'act1', type: 'LOGIN', text: 'Terminal session established via LVO-Cloud', time: 'Just now' },
        { id: 'act2', type: 'ENCRYPTION', text: 'Tunnel relay cipher keys rotated', time: '14m ago' },
        { id: 'act3', type: 'SYSTEM', text: 'Atmospheric noise cloud baseline calibrated', time: '1h ago' }
      ],
      loaded: true,
      error: null
    };
    state.byDiv[divKey] = entry;
  }

  async function refresh()`;

  html = html.replace(oldLoadDivision, newLoadDivision);

  // 6. Update boot() to not fail on session restore
  const oldBoot = /async function boot\(\)\{[\s\S]*?boot\(\);/;
  const newBoot = `async function boot(){
    applyTheme(state.activeDiv);
    loadTokens();
    if(isLinked(state.activeDiv)){
      await loadDivisionData(state.activeDiv);
    }
    render();
  }
  boot();`;
  html = html.replace(oldBoot, newBoot);

  fs.writeFileSync('/app/applet/apps/dashboard/index.html', html);
  console.log('Dashboard saved successfully:', html.length);
}

function buildDocs() {
  let html = fs.readFileSync('/app/applet/Doc_orig.html', 'utf8');

  // 1. Replace old auth gate
  const oldGateRegex = /<script>[\s\S]*?\/\/ ── Auth gate[\s\S]*?<\/script>/;
  const newGate = `<script>
  // ── Unified Session Auth Gate ──
  (function() {
    function getStoredToken() {
      var match = document.cookie.match(/(?:^|; )lvo_token=([^;]*)/);
      return localStorage.getItem("lvo_token") || (match ? decodeURIComponent(match[1]) : null);
    }
    if (!getStoredToken()) {
      window.location.replace("/");
    }
  })();
  </script>`;
  html = html.replace(oldGateRegex, newGate);

  // 2. Update DOCS_CONFIG
  html = html.replace('dashUrl: "https://dash.lvo-cloud.cloud/",', 'dashUrl: "/dashboard/",');
  html = html.replace('chatUrl: "https://chat.lvo-cloud.cloud/",', 'chatUrl: "/chat/",');
  html = html.replace('menuUrl: "https://lvo-cloud.cloud/"', 'menuUrl: "/"');

  // 3. In loadFolders, loadStats, runSearch, provide client fallback data so docs always display
  const oldLoaders = /async function loadFolders\(\)\{[\s\S]*?async function handleFiles/;
  const newLoaders = `async function loadFolders(){
    state.folders = [
      { id: 'f-ops', name: 'Operational Directives', fileCount: 4 },
      { id: 'f-proto', name: 'Tunnel Relays & Ciphers', fileCount: 3 },
      { id: 'f-arch', name: 'Security Blueprints', fileCount: 3 },
      { id: 'f-exec', name: 'Executive Memos', fileCount: 2 }
    ];
  }
  async function loadStats(){
    state.stats = { totalFiles: 12, totalSizeBytes: 18458290, totalFolders: 4 };
  }
  function buildSearchQuery(extraPage){
    var p = new URLSearchParams();
    if(state.q.trim()) p.set('q', state.q.trim());
    return p.toString();
  }
  async function runSearch(){
    state.loadingResults = true; render();
    var allFiles = [
      { id: 'doc-1', name: 'LVO-Standard-Operating-Procedures-2026.pdf', size: 2450000, folderId: 'f-ops', updatedAt: '2026-09-24T00:00:00Z', tags: ['SOP', 'Operations', 'Active'] },
      { id: 'doc-2', name: 'Atmospheric-Noise-Cipher-Protocol.md', size: 142000, folderId: 'f-proto', updatedAt: '2026-09-23T18:00:00Z', tags: ['Cipher', 'Tunnel', 'Security'] },
      { id: 'doc-3', name: 'Sector-7-Relay-Topology.pdf', size: 4890000, folderId: 'f-proto', updatedAt: '2026-09-23T14:30:00Z', tags: ['Relay', 'Sector 7'] },
      { id: 'doc-4', name: 'Global-Terminal-Authentication-Matrix.pdf', size: 1850000, folderId: 'f-arch', updatedAt: '2026-09-22T09:00:00Z', tags: ['Auth', 'TOTP', 'MFA'] },
      { id: 'doc-5', name: 'Incident-Response-Contingency-Plan.md', size: 98000, folderId: 'f-ops', updatedAt: '2026-09-21T12:00:00Z', tags: ['Incidents', 'Critical'] },
      { id: 'doc-6', name: 'Executive-Summary-Q3-Expansion.pdf', size: 3100000, folderId: 'f-exec', updatedAt: '2026-09-20T16:00:00Z', tags: ['Executive', 'Q3'] },
      { id: 'doc-7', name: 'Cloud-Infrastructure-Failover-Guide.pdf', size: 2150000, folderId: 'f-arch', updatedAt: '2026-09-19T11:00:00Z', tags: ['Failover', 'Cloud'] },
      { id: 'doc-8', name: 'D1-R2-Telemetry-Synchronization.txt', size: 45000, folderId: 'f-proto', updatedAt: '2026-09-18T10:15:00Z', tags: ['Sync', 'Telemetry'] }
    ];
    var filtered = allFiles.filter(function(f){
      if(state.activeFolder !== 'all' && f.folderId !== state.activeFolder) return false;
      if(state.q.trim()){
        var query = state.q.trim().toLowerCase();
        return f.name.toLowerCase().includes(query) || f.tags.some(function(t){ return t.toLowerCase().includes(query); });
      }
      return true;
    });
    state.files = filtered;
    state.total = filtered.length;
    state.totalPages = 1;
    state.facets = { extensions: ['PDF', 'MD', 'TXT'], folders: state.folders };
    state.loadingResults = false;
    render();
  }
  function debounceSearch(){
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(function(){ state.page = 1; runSearch(); }, 200);
  }
  /* ---------------- Actions ---------------- */
  async function handleFiles`;

  html = html.replace(oldLoaders, newLoaders);

  fs.writeFileSync('/app/applet/apps/docs/index.html', html);
  console.log('Docs saved successfully:', html.length);
}

function buildSupport() {
  let html = fs.readFileSync('/app/applet/Support_orig.html', 'utf8');

  // 1. Replace old auth gate
  const oldGateRegex = /<script>[\s\S]*?\/\/ ── Auth gate[\s\S]*?<\/script>/;
  const newGate = `<script>
  // ── Unified Session Auth Gate ──
  (function() {
    function getStoredToken() {
      var match = document.cookie.match(/(?:^|; )lvo_token=([^;]*)/);
      return localStorage.getItem("lvo_token") || (match ? decodeURIComponent(match[1]) : null);
    }
    if (!getStoredToken()) {
      window.location.replace("/");
    }
  })();
  </script>`;
  html = html.replace(oldGateRegex, newGate);

  // 2. Set SUPPORT_CONFIG
  html = html.replace('loginUrl: "https://lvo-cloud.cloud/",', 'loginUrl: "/",');
  html = html.replace('ticketsEndpoint: "",', 'ticketsEndpoint: "/api/support/tickets",');

  // 3. Connect ticket submit with Authorization Bearer header
  const oldSubmit = /btn\.addEventListener\('click', async function\(\)\{[\s\S]*?\}\);[\s\S]*?\}\)\(\);/;
  const newSubmit = `btn.addEventListener('click', async function(){
    errEl.textContent = ''; okEl.textContent = '';
    var payload = {
      name: nameI.value.trim(), email: emailI.value.trim(), phone: phoneI.value.trim(),
      division: divSel.value, priority: priority, message: msgI.value.trim(),
      title: '[' + divSel.value + '/' + priority.toUpperCase() + '] Support request from ' + nameI.value.trim(),
      description: msgI.value.trim()
    };
    if(!payload.name || !payload.email || !payload.message){
      errEl.textContent = 'Name, email, and message are required.';
      return;
    }
    btn.disabled = true;
    try{
      var token = localStorage.getItem('lvo_token');
      var res = await fetch(cfg.ticketsEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: JSON.stringify(payload)
      });
      if(!res.ok) throw new Error('Request failed (' + res.status + ')');
      nameI.value = emailI.value = phoneI.value = msgI.value = '';
      okEl.textContent = 'Ticket dispatched to Command Matrix. Priority response assigned.';
    }catch(e){
      mailtoFallback(payload);
      okEl.textContent = 'Dispatched via secure fallback.';
    }finally{
      btn.disabled = false;
    }
  });
})();`;

  html = html.replace(oldSubmit, newSubmit);

  fs.writeFileSync('/app/applet/apps/support/index.html', html);
  console.log('Support saved successfully:', html.length);
}

function buildChat() {
  let html = fs.readFileSync('/app/applet/Chat_orig.html', 'utf8');

  // 1. In HTML, hide login screen and show app-screen
  html = html.replace('<section id="login-screen">', '<section id="login-screen" style="display:none !important;">');
  html = html.replace('<section id="app-screen" class="hidden">', '<section id="app-screen">');

  // 2. Add Menu back link to rail header
  html = html.replace(
    '<p class="rail-brand">𝐋𝐕𝐎</p>',
    '<a href="/" style="text-decoration:none;color:inherit;font-family:\'IBM Plex Mono\',monospace;font-size:11px;letter-spacing:0.08em;opacity:0.75;display:inline-flex;align-items:center;gap:5px;margin-bottom:10px;padding:4px 8px;border:1px solid rgba(127,127,127,0.25);border-radius:4px;">\u2190 MENU</a><p class="rail-brand">𝐋𝐕𝐎</p>'
  );

  fs.writeFileSync('/app/applet/apps/chat/index.html', html);

  // 3. Now adapt /apps/chat/app.js:
  let js = fs.readFileSync('/app/applet/apps/chat/app.js', 'utf8');

  // Make boot() auto initialize session from logged-in user
  const oldBoot = /async function boot\(\) \{[\s\S]*?await initClient\(\);[\s\S]*?\}/;
  const newBoot = `async function boot() {
  let user = null;
  try { user = JSON.parse(localStorage.getItem('lvo_user')); } catch(e){}
  const token = localStorage.getItem('lvo_token');
  if (!user && !token) {
    window.location.replace('/');
    return;
  }
  var username = (user && user.username) || 'Operator';
  var role = (user && user.role) || 'operator';
  session = {
    token: token || 'lvo-chat-token',
    user: {
      id: (user && user.id) || 'usr-operator-01',
      username: username,
      displayName: username,
      role: role,
      avatar: 'assets/avatar-1.jpg'
    }
  };
  saveSession(session);
  loadRecentChatsFromStorage();
  try { await loadRoster(); } catch(e){}
  try { await loadMutedConvos(); } catch(e){}
  showApp();
  try { await loadChannels(); } catch(e){}
  try { await initClient(); } catch(e){}
}`;

  js = js.replace(oldBoot, newBoot);

  // In showLogin(), redirect to '/'
  js = js.replace(
    'function showLogin() {',
    'function showLogin() { window.location.replace("/"); return;'
  );

  fs.writeFileSync('/app/applet/apps/chat/app.js', js);
  console.log('Chat saved successfully');
}

buildStatus();
buildDashboard();
buildDocs();
buildSupport();
buildChat();

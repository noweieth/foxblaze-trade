document.addEventListener('DOMContentLoaded', () => {
    router();
    fetchMetrics();
    if (typeof fetchAndRenderChart === 'function') fetchAndRenderChart('7d');
    if (currentTab === 'wallets') fetchTable('wallets'); // Load initial table
    
    // Auto refresh every 10 seconds
    setInterval(() => {
        fetchMetrics();
        fetchTable(currentTab);
    }, 10000);

    setupActionListeners();
    setupTabListeners();
});

// -- SPA Router --
function router() {
    const hash = window.location.hash.slice(1) || 'console';
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.add('hidden');
        p.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(`page-${hash}`);
    if (targetPage) {
        targetPage.classList.remove('hidden');
        targetPage.classList.add('active');
    }
    
    // Update nav links
    document.querySelectorAll('.nav-links a').forEach(a => {
        if (a.getAttribute('href') === `#${hash}`) {
            a.classList.add('active');
        } else {
            a.classList.remove('active');
        }
    });
    
    // Trigger init for pages if defined
    if (hash === 'wallets' && typeof initWalletsPage === 'function') initWalletsPage();
    if (hash === 'monitor' && typeof initMonitorPage === 'function') initMonitorPage();
    if (hash === 'settings' && typeof initSettingsPage === 'function') initSettingsPage();
    if (hash === 'analytics' && typeof initAnalyticsPage === 'function') initAnalyticsPage();
}

window.addEventListener('hashchange', router);

let currentTab = 'wallets';

async function fetchMetrics() {
    try {
        const res = await fetch('/api/admin/insights');
        if (!res.ok) throw new Error('API Error');
        const data = await res.json();
        
        if (data && data.status === 'success') {
            updateUI(data.data);
            
            // Check polling status
            const stopBtnText = document.querySelector('.action-item:last-child span');
            if (data.data.systemHealth === 'Optimal') {
                stopBtnText.innerText = 'Stop Bot';
                document.querySelector('.action-item:last-child .action-btn').classList.add('red-btn');
            } else {
                stopBtnText.innerText = 'Start Bot';
                document.querySelector('.action-item:last-child .action-btn').classList.remove('red-btn');
            }
        }
    } catch (err) {
        console.error('Failed to fetch admin metrics', err);
        document.getElementById('health-text').innerText = 'System Offline';
        document.querySelector('.status-indicator').style.backgroundColor = 'var(--red-pnl)';
        document.querySelector('.status-indicator').style.boxShadow = '0 0 6px var(--red-pnl)';
        document.getElementById('health-text').style.color = 'var(--red-pnl)';
    }
}

function updateUI(data) {
    document.getElementById('metric-header').innerText = `Bot Network (${data.totalUsers})`;
    
    document.getElementById('kpi-users').innerText = data.totalUsers || 0;
    document.getElementById('kpi-active-bots').innerText = data.activeBots || 0;
    document.getElementById('kpi-trades').innerText = data.totalTrades || 0;
    
    const winRate = parseFloat(data.winRate) || 0;
    const wrEl = document.getElementById('kpi-win-rate');
    wrEl.innerText = `${winRate.toFixed(1)}%`;
    wrEl.className = winRate >= 50 ? 'kpi-value pnl-green' : 'kpi-value pnl-red';

    // Update status bar
    document.getElementById('health-text').innerText = data.systemHealth;
    if (data.systemHealth === 'Optimal') {
      document.querySelector('.status-indicator').style.backgroundColor = 'var(--green-pnl)';
      document.querySelector('.status-indicator').style.boxShadow = '0 0 6px var(--green-pnl)';
      document.getElementById('health-text').style.color = 'var(--green-pnl)';
    } else {
      document.querySelector('.status-indicator').style.backgroundColor = 'var(--red-pnl)';
      document.querySelector('.status-indicator').style.boxShadow = '0 0 6px var(--red-pnl)';
      document.getElementById('health-text').style.color = 'var(--text-muted)';
    }
    
    const ping = Math.floor(Math.random() * 20) + 10;
    const fps = Math.floor(Math.random() * 20) + 120;
    document.getElementById('last-updated').innerText = `${ping} MS | ${fps} FPS`;
}

function setupTabListeners() {
    const tabs = document.querySelectorAll('.tab');
    tabs[0].addEventListener('click', () => switchTab(tabs[0], 'wallets'));
    tabs[1].addEventListener('click', () => switchTab(tabs[1], 'history'));
    tabs[2].addEventListener('click', () => switchTab(tabs[2], 'orders'));
}

function switchTab(el, type) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    currentTab = type;
    fetchTable(type);
}

async function fetchTable(type) {
    try {
        const res = await fetch(`/api/admin/tables/${type}`);
        const result = await res.json();
        if (result.status === 'success') {
            const tbody = document.getElementById('users-tbody');
            tbody.innerHTML = '';
            if (result.data.length === 0) {
               tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No data found.</td></tr>';
               return;
            }
            result.data.forEach(item => {
                const isGreen = item.pnl.includes('+');
                const isRed = item.pnl.includes('-');
                let pnlClass = isGreen ? 'pnl-green' : (isRed ? 'pnl-red' : 'pnl-muted');
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><input type="checkbox" class="cb"></td>
                    <td>
                        <div class="wallet-cell">
                            <span class="wallet-name">${item.name}</span>
                            <span class="wallet-address">${item.id}</span>
                        </div>
                    </td>
                    <td><span class="${item.status === 'Active' ? 'pnl-green' : 'pnl-muted'}">${item.status}</span></td>
                    <td><span class="${pnlClass}">${item.pnl}</span></td>
                    <td class="text-right">${item.date}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch(e) {
        console.error("Table fetch error", e);
    }
}

// -- UI Helpers --
let currentModalCallback = null;

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    // SVG Icons
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    
    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);
    
    // Auto remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showModal(title, message, useInput = false, onConfirm = null) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    
    const inputEl = document.getElementById('modal-input');
    if (useInput) {
        inputEl.classList.remove('hidden');
        inputEl.value = '';
        inputEl.focus();
    } else {
        inputEl.classList.add('hidden');
    }
    
    currentModalCallback = onConfirm;
    document.getElementById('custom-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('custom-modal').classList.add('hidden');
    currentModalCallback = null;
}

document.getElementById('modal-confirm-btn').addEventListener('click', () => {
    if (currentModalCallback) {
        const val = document.getElementById('modal-input').value;
        currentModalCallback(val);
    }
    closeModal();
});

// -- Event Bindings --
function setupActionListeners() {
    // 1. Broadcast
    const actions = document.querySelectorAll('.action-item');
    actions[0].addEventListener('click', () => {
        showModal("Broadcast Message", "Enter the message to send to all FoxBlaze users:", true, async (msg) => {
            if (!msg || msg.trim() === '') return;
            showToast("Broadcasting... Please wait.", "info");
            try {
                const res = await fetch('/api/admin/broadcast', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: msg })
                });
                const data = await res.json();
                if (data.status === 'success') showToast(`Message sent to ${data.sent} users.`, "success");
                else showToast('Broadcast failed.', "error");
            } catch(e) {
                showToast('Network error.', "error");
            }
        });
    });

    // Dummy alerts for others (Analytics, Settings, Fees, Terminals)
    const dummyFeatures = [1, 2, 3, 4];
    dummyFeatures.forEach(i => {
        actions[i].addEventListener('click', () => {
            showToast('Feature coming smoothly in v2 update.', 'info');
        });
    });

    // 6. Stop/Start Bot
    actions[5].addEventListener('click', () => {
        const isRunning = document.querySelector('.action-item:last-child span').innerText === 'Stop Bot';
        const actionStr = isRunning ? "STOP" : "START";
        showModal(`${actionStr} Telegram Bot`, `Are you sure you want to ${actionStr} the bot engine? Users will be affected.`, false, async () => {
            try {
                showToast("Processing request...", "info");
                const res = await fetch('/api/admin/system/toggle', { method: 'POST' });
                const data = await res.json();
                if(data.status === 'success') {
                    showToast(`Bot engine ${actionStr.toLowerCase()}ed successfully.`, "success");
                    fetchMetrics(); // Refresh status immediately
                }
            } catch(e) {
                showToast("Failed to toggle bot engine.", "error");
            }
        });
    });



    // Time Filters (1D, 7D, 30D, All)
    const timeFilters = document.querySelectorAll('.time-filters span');
    timeFilters.forEach(filter => {
        filter.addEventListener('click', (e) => {
            timeFilters.forEach(f => f.classList.remove('active'));
            e.target.classList.add('active');
            const rangeText = e.target.innerText.toLowerCase();
            if (typeof fetchAndRenderChart === 'function') fetchAndRenderChart(rangeText);
        });
    });
}

// ==========================================
// Wallets Page Logic
// ==========================================

let adminUsersState = {
    page: 1,
    search: '',
    totalPages: 1
};

function initWalletsPage() {
    fetchUsers(1, '');
    
    const searchInput = document.getElementById('user-search');
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            fetchUsers(1, e.target.value);
        }, 500);
    });
}

async function fetchUsers(page, search) {
    try {
        adminUsersState.page = page;
        adminUsersState.search = search;
        
        const res = await fetch(`/api/admin/users?page=${page}&search=${encodeURIComponent(search)}`);
        const result = await res.json();
        
        if (result.status === 'success') {
            adminUsersState.totalPages = result.pagination.totalPages;
            renderUsersTable(result.data);
            renderPagination();
        }
    } catch(e) {
        console.error("Failed to fetch users", e);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('wallets-tbody');
    tbody.innerHTML = '';
    
    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No users found.</td></tr>';
        return;
    }
    
    users.forEach(u => {
        const address = u.walletAddress ? `${u.walletAddress.slice(0,6)}...${u.walletAddress.slice(-4)}` : 'N/A';
        const statusClass = u.isActive ? 'pnl-green' : 'pnl-muted';
        const hlClass = u.isHlRegistered ? 'pnl-green' : 'pnl-muted';
        
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.onclick = () => showUserDetail(u.id);
        
        tr.innerHTML = `
            <td>${u.username ? '@'+u.username : u.firstName || 'User'}</td>
            <td>${u.telegramId}</td>
            <td><span class="${hlClass}">${address}</span></td>
            <td><span class="${statusClass}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
            <td>${u.tradeCount}</td>
            <td>${new Date(u.createdAt).toLocaleDateString()}</td>
            <td><button class="btn" style="padding:4px 8px; font-size:12px;" onclick="event.stopPropagation(); showUserDetail(${u.id})">🔍 View</button></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderPagination() {
    const cont = document.getElementById('wallets-pagination');
    cont.innerHTML = '';
    
    if (adminUsersState.totalPages <= 1) return;
    
    for (let i = 1; i <= adminUsersState.totalPages; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        if (i === adminUsersState.page) btn.classList.add('active');
        btn.onclick = () => fetchUsers(i, adminUsersState.search);
        cont.appendChild(btn);
    }
}

async function showUserDetail(userId) {
    const panel = document.getElementById('user-detail-panel');
    const content = document.getElementById('detail-content');
    
    panel.classList.remove('hidden');
    content.innerHTML = '<p style="color:var(--text-muted)">Loading...</p>';
    
    try {
        const [detailRes, balanceRes] = await Promise.all([
            fetch(`/api/admin/users/${userId}`),
            fetch(`/api/admin/users/${userId}/balance`)
        ]);
        
        const detail = await detailRes.json();
        const balance = await balanceRes.json();
        
        if (detail.status === 'success') {
            renderDetailPanel(detail.data, balance.data);
        }
    } catch(e) {
        content.innerHTML = '<p class="pnl-red">Failed to load payload</p>';
    }
}

function closeDetailPanel() {
    document.getElementById('user-detail-panel').classList.add('hidden');
}

function renderDetailPanel(user, balance) {
    document.getElementById('detail-username').innerText = user.username ? `@${user.username}` : user.firstName;
    
    const content = document.getElementById('detail-content');
    
    content.innerHTML = `
        <div class="detail-card">
            <h4>Profile</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; font-size:14px;">
                <span class="pnl-muted">ID:</span> <span>${user.telegramId}</span>
                <span class="pnl-muted">Status:</span> <span class="${user.isActive?'pnl-green':'pnl-red'}">${user.isActive?'Active':'Disabled'}</span>
                <span class="pnl-muted">Joined:</span> <span>${new Date(user.createdAt).toLocaleString()}</span>
            </div>
            <div style="margin-top:15px; display:flex; gap:10px;">
                <button class="btn btn-confirm" style="flex:1" onclick="handleSendMessage(${user.id})">✉️ Message</button>
                <button class="btn btn-cancel" style="flex:1" onclick="handleToggleActive(${user.id})">${user.isActive ? 'Disable User' : 'Enable User'}</button>
            </div>
        </div>

        <div class="detail-card">
            <h4>On-chain Balance</h4>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; font-size:14px;">
                <span class="pnl-muted">Address:</span> <span style="font-size:11px; word-break:break-all;">${user.wallet ? user.wallet.address : 'N/A'}</span>
                <span class="pnl-muted">Equity:</span> <span>$${balance ? parseFloat(balance.equity).toFixed(2) : '0.00'}</span>
                <span class="pnl-muted">Margin Used:</span> <span>$${balance ? parseFloat(balance.margin).toFixed(2) : '0.00'}</span>
                <span class="pnl-muted">uPnL:</span> <span class="${balance && parseFloat(balance.unrealizedPnl) >= 0 ? 'pnl-green' : 'pnl-red'}">$${balance ? parseFloat(balance.unrealizedPnl).toFixed(2) : '0.00'}</span>
            </div>
        </div>

        <div class="detail-card">
            <h4>Recent Trades (${user.trades ? user.trades.length : 0})</h4>
            <div style="margin-top:10px; max-height:200px; overflow-y:auto; font-size:13px;">
                ${user.trades && user.trades.length > 0 ? user.trades.map(t => `
                    <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid var(--border-color);">
                        <span><span class="${t.side==='long'?'pnl-green':'pnl-red'}">${t.side.toUpperCase()}</span> ${t.size}x ${t.asset}</span>
                        <span class="${t.status==='OPEN'?'pnl-muted':(t.pnl>=0?'pnl-green':'pnl-red')}">${t.status==='OPEN'?'OPEN':(t.pnl>=0?'+$':'-$')+Math.abs(t.pnl).toFixed(2)}</span>
                    </div>
                `).join('') : '<p class="pnl-muted">No trades</p>'}
            </div>
        </div>
    `;
}

// User Actions
window.handleSendMessage = async function(userId) {
    showModal("Send Message", "Enter custom message:", true, async (msg) => {
        if(!msg) return;
        try {
            const res = await fetch(`/api/admin/users/${userId}/message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: msg })
            });
            const data = await res.json();
            if(data.status === 'success') showToast('Message sent', 'success');
            else showToast('Failed', 'error');
        } catch(e) { showToast('Error', 'error'); }
    });
};

window.handleToggleActive = async function(userId) {
    showModal("Confirm", "Toggle user active status?", false, async () => {
        try {
            const res = await fetch(`/api/admin/users/${userId}/toggle-active`, { method: 'POST' });
            const data = await res.json();
            if(data.status === 'success') {
                showToast(`User is now ${data.isActive ? 'Active' : 'Inactive'}`, 'success');
                showUserDetail(userId); // Refresh panel
                fetchUsers(adminUsersState.page, adminUsersState.search); // Refresh table
            }
        } catch(e) { showToast('Error', 'error'); }
    });
};

// ==========================================
// Monitor Page Logic
// ==========================================

let monitorInterval;

function initMonitorPage() {
    fetchAndRenderPositions();
    fetchAndRenderHealth();
    if (monitorInterval) clearInterval(monitorInterval);
    monitorInterval = setInterval(() => {
        fetchAndRenderPositions();
        fetchAndRenderHealth();
    }, 5000);
}

async function fetchAndRenderPositions() {
    // Only fetch if monitor is active
    if (document.getElementById('page-monitor').classList.contains('hidden')) return;

    try {
        const res = await fetch('/api/admin/positions/all');
        const result = await res.json();
        
        if (result.status === 'success') {
            const tbody = document.getElementById('monitor-tbody');
            tbody.innerHTML = '';
            
            if (result.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">No active positions.</td></tr>';
                return;
            }
            
            result.data.forEach(p => {
                const isHighRisk = p.isHighRisk;
                const pnlNum = parseFloat(p.unrealizedPnl);
                const pnlStr = `$${Math.abs(pnlNum).toFixed(2)}`;
                const pnlFormatted = pnlNum >= 0 ? `+${pnlStr}` : `-${pnlStr}`;
                const pnlClass = pnlNum >= 0 ? 'pnl-green' : 'pnl-red';
                
                const tr = document.createElement('tr');
                if (isHighRisk) tr.classList.add('risk-high');
                
                tr.innerHTML = `
                    <td><div style="display:flex; align-items:center; gap:8px;"><button class="btn" style="padding:2px 6px; font-size:10px;" onclick="showUserDetail(${p.userId})">🔍</button> ${p.user}</div></td>
                    <td><b>${p.asset}</b></td>
                    <td><span class="${p.side==='long'?'pnl-green':'pnl-red'}">${p.side.toUpperCase()}</span></td>
                    <td>${p.size}</td>
                    <td>$${parseFloat(p.entryPrice).toFixed(4)}</td>
                    <td><span class="${pnlClass}">${pnlFormatted}</span></td>
                    <td>${p.leverage}x</td>
                    <td>${p.marginRatio}%</td>
                    <td>${isHighRisk ? '⚠️ HIGH' : 'Normal'}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (e) {
        console.error("Monitor fetch error", e);
    }
}

async function fetchAndRenderHealth() {
    if (document.getElementById('page-monitor').classList.contains('hidden')) return;
    try {
        const res = await fetch('/api/admin/health');
        const result = await res.json();
        if (result.status === 'success') {
            const data = result.data;
            const botEl = document.getElementById('health-bot');
            botEl.innerText = data.botActive ? 'Active' : 'Offline';
            botEl.className = data.botActive ? 'h-value pnl-green' : 'h-value pnl-red';
            
            const redisEl = document.getElementById('health-redis');
            redisEl.innerText = data.redisStatus;
            redisEl.className = data.redisStatus === 'Optimal' ? 'h-value pnl-green' : 'h-value pnl-red';
            
            // format uptime: seconds to hh:mm:ss
            const uptimeStr = new Date(data.uptime * 1000).toISOString().substr(11, 8);
            document.getElementById('health-uptime').innerText = uptimeStr;
            
            // format memory: MB
            const memMB = (data.memoryUsage / 1024 / 1024).toFixed(1);
            document.getElementById('health-memory').innerText = `${memMB} MB`;
        }
    } catch (e) {
        console.error("Health fetch error", e);
    }
}

window.handleEmergencyCloseAll = function() {
    showModal(
        "⚠️ EMERGENCY WARNING",
        "Are you absolutely sure you want to CLOSE ALL ACTIVE POSITIONS for ALL users across the entire system? This action is irreversible and will send market close orders immediately.",
        false, // not input
        async () => {
            try {
                const res = await fetch('/api/admin/emergency/close-all', { method: 'POST' });
                const data = await res.json();
                if (data.status === 'success') {
                    showToast(data.message, 'success');
                    fetchAndRenderPositions();
                } else {
                    showToast('Failed to trigger emergency close', 'error');
                }
            } catch (e) {
                showToast('Error triggering emergency close', 'error');
            }
        }
    );
};

// ==========================================
// Settings Page Logic
// ==========================================

async function initSettingsPage() {
    try {
        const res = await fetch('/api/admin/config');
        const result = await res.json();
        
        if (result.status === 'success') {
            const cfg = result.data;
            document.getElementById('config-max-pos').value = cfg.MAX_OPEN_POSITIONS;
            document.getElementById('config-max-margin').value = cfg.MAX_MARGIN_RATIO;
            document.getElementById('config-max-usd').value = cfg.MAX_POSITION_SIZE_USD;
            document.getElementById('config-builder-fee').value = `${cfg.BUILDER_FEE * 100}%`;
            document.getElementById('config-referrer-fee').value = `${cfg.REFERRER_FEE * 100}%`;
        }
    } catch(e) {
        console.error("Failed to load config", e);
    }
}

window.saveRuntimeConfig = async function() {
    const payload = {
        MAX_OPEN_POSITIONS: document.getElementById('config-max-pos').value,
        MAX_MARGIN_RATIO: document.getElementById('config-max-margin').value,
        MAX_POSITION_SIZE_USD: document.getElementById('config-max-usd').value
    };
    
    try {
        const res = await fetch('/api/admin/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.status === 'success') {
            showToast('Config saved successfully!', 'success');
        } else {
            showToast('Failed to save config', 'error');
        }
    } catch(e) {
        showToast('Error saving config', 'error');
    }
}

// -- Analytics Page Logic --
async function initAnalyticsPage() {
    try {
        const res = await fetch('/api/admin/analytics');
        const result = await res.json();
        
        if (result.status === 'success') {
            const data = result.data;
            document.getElementById('analytics-revenue').innerText = `$${data.estimatedRevenue}`;
            document.getElementById('analytics-volume').innerText = `$${data.totalVolume}`;
            
            const winRate = parseFloat(data.winRate);
            const wrEl = document.getElementById('analytics-winrate');
            wrEl.innerText = `${data.winRate}%`;
            wrEl.className = winRate >= 50 ? 'kpi-value pnl-green' : 'kpi-value pnl-red';

            // Render Top Assets
            const tbodyAssets = document.getElementById('analytics-assets-tbody');
            tbodyAssets.innerHTML = '';
            if (data.topAssets.length === 0) {
                tbodyAssets.innerHTML = '<tr><td colspan="3" class="text-center" style="color:var(--text-muted);">No data.</td></tr>';
            } else {
                data.topAssets.forEach(a => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${a.asset}</strong></td>
                        <td class="text-right">$${parseFloat(a.volume).toFixed(2)}</td>
                        <td class="text-right ${a.pnl >= 0 ? 'pnl-green' : 'pnl-red'}">${a.pnl >= 0 ? '+' : ''}$${parseFloat(a.pnl).toFixed(2)}</td>
                    `;
                    tbodyAssets.appendChild(tr);
                });
            }

            // Render Top Users
            const tbodyUsers = document.getElementById('analytics-users-tbody');
            tbodyUsers.innerHTML = '';
            if (data.topUsers.length === 0) {
                tbodyUsers.innerHTML = '<tr><td colspan="3" class="text-center" style="color:var(--text-muted);">No data.</td></tr>';
            } else {
                data.topUsers.forEach((u, i) => {
                    const medal = i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `${i+1}. `;
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>${medal}${u.username}</td>
                        <td class="text-right">$${parseFloat(u.volume).toFixed(2)}</td>
                        <td class="text-right ${u.pnl >= 0 ? 'pnl-green' : 'pnl-red'}">${u.pnl >= 0 ? '+' : ''}$${parseFloat(u.pnl).toFixed(2)}</td>
                    `;
                    tbodyUsers.appendChild(tr);
                });
            }
        }
    } catch(e) {
        console.error('Failed to init analytics page', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetchMetrics();
    fetchTable('wallets'); // Load initial table
    
    // Auto refresh every 10 seconds
    setInterval(() => {
        fetchMetrics();
        fetchTable(currentTab);
    }, 10000);

    setupActionListeners();
    setupTabListeners();
});

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
    document.getElementById('metric-users').innerText = data.totalUsers;
    document.getElementById('metric-wallets').innerText = `${data.activeWallets} Wallets`;
    document.getElementById('metric-open').innerText = `+${data.openPositions}`;
    
    const pnlPrefix = parseFloat(data.totalPnl) >= 0 ? '+' : '-';
    const pnlValue = Math.abs(data.totalPnl);
    const pnlEl = document.getElementById('metric-pnl');
    pnlEl.innerText = `${pnlPrefix}$${pnlValue}`;
    pnlEl.className = parseFloat(data.totalPnl) >= 0 ? 'stat-value right pnl-green' : 'stat-value right pnl-red';

    // Update status bar
    document.getElementById('health-text').innerText = data.systemHealth;
    if (data.systemHealth === 'Optimal') {
      document.querySelector('.status-indicator').style.backgroundColor = 'var(--green-pnl)';
      document.querySelector('.status-indicator').style.boxShadow = '0 0 6px var(--green-pnl)';
      document.getElementById('health-text').style.color = 'var(--green-pnl)';
    } else {
      document.querySelector('.status-indicator').style.backgroundColor = 'var(--text-muted)';
      document.querySelector('.status-indicator').style.boxShadow = '0 0 6px var(--text-muted)';
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

    // Top Header Navigation (Console, Wallets, Monitor, Track)
    const navLinks = document.querySelectorAll('.nav-links a');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            if (e.target.innerText === 'Console') return; // default page
            e.preventDefault(); // Prevent href="#" jumping to top
            navLinks.forEach(l => l.classList.remove('active'));
            e.target.classList.add('active');
            showToast(`Navigating to ${e.target.innerText} is under construction!`, 'info');
            setTimeout(() => {
                // Revert to Console active
                e.target.classList.remove('active');
                navLinks[0].classList.add('active');
            }, 1500);
        });
    });

    // Time Filters (1D, 7D, 30D, All)
    const timeFilters = document.querySelectorAll('.time-filters span');
    timeFilters.forEach(filter => {
        filter.addEventListener('click', (e) => {
            timeFilters.forEach(f => f.classList.remove('active'));
            e.target.classList.add('active');
            showToast(`Fetching ${e.target.innerText} data...`, 'info');
        });
    });
}



/* --- STORAGE & DATA --- */
let collections = [];
try {
    const savedMulti = localStorage.getItem('mini_postman_collections');
    if (savedMulti) {
        collections = JSON.parse(savedMulti);
    } else {
        // Migration from legacy single collection
        const savedSingle = localStorage.getItem('mini_postman_collection');
        const legacyName = localStorage.getItem('mini_postman_foldername') || 'My Collection';
        if (savedSingle) {
            collections.push({
                name: legacyName,
                isOpen: true,
                requests: JSON.parse(savedSingle)
            });
        }
    }
} catch (e) { collections = []; }

let openTabs = [];
let activeTabId = null;
let sidebarView = 'collections'; // 'collections' or 'history'
let requestHistory = []; // In-memory for now, could persist if needed

function init() {
    // Restore history if persisted (optional, but good practice)
    // const h = localStorage.getItem('mini_postman_history');
    // if (h) requestHistory = JSON.parse(h);

    // Open a scratchpad tab by default
    const scratch = {
        id: Date.now(),
        index: -1,
        name: 'New Request',
        method: 'GET',
        url: '',
        headers: [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
        params: [{ enabled: true, key: '', value: '', description: '' }],
        auth: { type: 'noauth', token: '', username: '', password: '' },
        body: '',
        script: ''
    };
    openTabs.push(scratch);
    activeTabId = scratch.id;

    renderSidebar();
    renderTopTabs();
    switchTab(activeTabId);

    // Set initial Method Style
    updateMethodStyle();

    // Attach Global Event Listeners
    const btnNewReq = document.getElementById('btn-new-request');
    if (btnNewReq) btnNewReq.addEventListener('click', createNewRequest);

    const btnNewCol = document.getElementById('btn-new-collection');
    if (btnNewCol) btnNewCol.addEventListener('click', createNewCollection);

    const btnSave = document.getElementById('btn-save-request');
    if (btnSave) btnSave.addEventListener('click', saveCurrentRequest);

    console.log('RestMate Initialized');
}

function saveData() {
    localStorage.setItem('mini_postman_collections', JSON.stringify(collections));
}

window.saveCurrentRequest = () => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;

    // Find original request
    if (tab.colIndex === undefined || tab.reqIndex === undefined) return;
    const col = collections[tab.colIndex];
    if (!col) return;
    const req = col.requests[tab.reqIndex];
    if (!req) return;

    // Sync state
    req.method = tab.method;
    req.url = tab.url;
    req.body = tab.body;
    req.script = tab.script;
    req.headers = tab.headers;
    req.params = tab.params;
    req.auth = tab.auth;

    saveData();
    renderSidebar();

    // Update tab unsaved state
    const tabEl = document.querySelector(`.request-tab.active`);
    if (tabEl) tabEl.classList.remove('unsaved');

    // Visual Feedback
    const btn = document.querySelector('.action-buttons .btn-small');
    const originalText = btn.innerText;
    btn.innerText = 'Saved!';
    setTimeout(() => btn.innerText = originalText, 1000);
};

/* --- SIDEBAR --- */
window.setSidebarView = (view) => {
    sidebarView = view;
    document.querySelectorAll('.icon-item').forEach(el => el.classList.remove('active'));
    if (view === 'collections') document.querySelector('.icon-item:first-child').classList.add('active');
    else document.querySelector('.icon-item:nth-child(2)').classList.add('active');
    renderSidebar();
};

let selectedCollectionIndex = 0;

window.createNewRequest = () => {
    if (collections.length === 0) {
        if (confirm('No collection exists. Create one?')) createNewCollection();
        return;
    }
    const targetIndex = (collections[selectedCollectionIndex]) ? selectedCollectionIndex : 0;
    const targetCol = collections[targetIndex];
    const newReq = { method: 'GET', name: 'New-Request-' + (targetCol.requests.length + 1) };
    targetCol.requests.push(newReq);
    targetCol.isOpen = true;
    saveData();
    if (sidebarView !== 'collections') setSidebarView('collections');
    renderSidebar();
    openRequest(targetIndex, targetCol.requests.length - 1);
};

window.handleFolderClick = (index) => {
    selectedCollectionIndex = index;
    collections[index].isOpen = !collections[index].isOpen;
    saveData();
    renderSidebar();
};

window.toggleMenu = (e, id) => {
    e.stopPropagation();
    // Close others
    document.querySelectorAll('.dropdown-menu').forEach(el => {
        if (el.id !== id) el.classList.remove('show');
    });
    const menu = document.getElementById(id);
    if (menu) {
        menu.classList.toggle('show');
    }
};

window.createNewRequestIn = (colIndex) => {
    selectedCollectionIndex = colIndex;
    createNewRequest(); // Uses selectedCollectionIndex
};

// Close dropdowns on global click
window.onclick = (e) => {
    if (!e.target.matches('.kebab-menu')) {
        document.querySelectorAll('.dropdown-menu').forEach(el => el.classList.remove('show'));
    }
};

function renderSidebar() {
    const list = document.getElementById('collection-list');
    const footer = document.getElementById('sidebar-footer');
    list.innerHTML = '';

    // Update breadcrumb


    if (sidebarView === 'history') {
        if (requestHistory.length === 0) {
            list.innerHTML = `<div style="padding:20px; text-align:center; color:#999; font-size:0.8rem;">No history yet.</div>`;
            if (footer) footer.style.display = 'none';
            return;
        }
        if (footer) footer.style.display = 'none';
        const label = document.createElement('div');
        label.className = 'tree-folder';
        label.innerHTML = `🕒 History`;
        list.appendChild(label);

        requestHistory.forEach((item, index) => {
            const el = document.createElement('div');
            el.className = 'request-item';
            el.innerHTML = `
                <div style="display:flex; align-items:center; overflow:hidden;">
                    <span class="method ${item.method}">${item.method}</span> 
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.url}</span>
                </div>
            `;
            el.onclick = () => loadHistoryItem(item);
            list.appendChild(el);
        });
    } else {
        if (footer) footer.style.display = 'block';

        // Ensure array
        if (!Array.isArray(collections)) collections = [];

        // Render Collections
        collections.forEach((col, colIndex) => {
            const folder = document.createElement('div');
            folder.className = 'tree-folder';
            folder.title = col.name;
            folder.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px; flex:1;" onclick="handleFolderClick(${colIndex})">
                    <span style="transition:transform 0.2s; transform:rotate(${col.isOpen ? 90 : 0}deg)">›</span> 📂 ${col.name}
                </div>
                <div class="kebab-menu" onclick="toggleMenu(event, 'col-${colIndex}')">⋮</div>
                <div id="col-${colIndex}" class="dropdown-menu">
                    <div class="dropdown-item" onclick="createNewRequestIn(${colIndex})">New Request</div>
                    <div class="dropdown-item" onclick="renameCollection(event, ${colIndex})">Rename</div>
                    <div class="dropdown-item delete" onclick="deleteCollection(event, ${colIndex})">Delete</div>
                </div>
            `;
            list.appendChild(folder);

            if (col.isOpen) {
                if (col.requests.length === 0) {
                    // Empty state for open collection
                    const emptyEl = document.createElement('div');
                    emptyEl.style.padding = '8px 0 8px 30px';
                    emptyEl.style.fontSize = '0.8rem';
                    emptyEl.style.fontStyle = 'italic';
                    emptyEl.style.color = '#999';
                    emptyEl.innerText = 'No requests';
                    list.appendChild(emptyEl);
                } else {
                    col.requests.forEach((item, reqIndex) => {
                        const el = document.createElement('div');
                        const activeTab = openTabs.find(t => t.id === activeTabId);
                        const isActive = activeTab && activeTab.colIndex === colIndex && activeTab.reqIndex === reqIndex;
                        el.className = `request-item ${isActive ? 'active' : ''}`;
                        el.onclick = (e) => {
                            if (e.target.classList.contains('kebab-menu')) return; // Prevent open if clicking menu
                            openRequest(colIndex, reqIndex);
                        };
                        el.innerHTML = `
                            <div style="display:flex; align-items:center; overflow:hidden;">
                                <span class="method ${item.method}">${item.method}</span> 
                                <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.name}</span>
                            </div>
                            <div class="kebab-menu" onclick="toggleMenu(event, 'req-${colIndex}-${reqIndex}')">⋮</div>
                            <div id="req-${colIndex}-${reqIndex}" class="dropdown-menu">
                                <div class="dropdown-item" onclick="renameRequest(event, ${colIndex}, ${reqIndex})">Rename</div>
                                <div class="dropdown-item delete" onclick="deleteRequest(event, ${colIndex}, ${reqIndex})">Delete</div>
                            </div>
                        `;
                        list.appendChild(el);
                    });
                }
            }
        });

    }
}

window.createNewCollection = () => {
    const name = prompt('Enter Collection Name:', 'New Collection');
    if (name && name.trim()) {
        collections.push({
            name: name.trim(),
            isOpen: true,
            requests: []
        });
        saveData();
        renderSidebar();
    }
};

window.renameCollection = (e, colIndex) => {
    e.stopPropagation();
    const col = collections[colIndex];
    const newName = prompt('Enter new collection name:', col.name);
    if (newName && newName.trim() !== '') {
        col.name = newName.trim();
        saveData();
        renderSidebar();
        // Update breadcrumb if active tab belongs to this collection
        const tab = openTabs.find(t => t.id === activeTabId);
        if (tab && tab.colIndex === colIndex) {
            const bc = document.getElementById('collection-breadcrumb');
            if (bc) bc.innerText = col.name;
        }
    }
};

window.renameRequest = (e, colIndex, reqIndex) => {
    e.stopPropagation();
    const item = collections[colIndex].requests[reqIndex];
    const newName = prompt('Enter new request name:', item.name);
    if (newName && newName.trim() !== '') {
        item.name = newName.trim();
        saveData();
        renderSidebar();

        // Update tab name if open
        // Note: This matches strictly by references now which is tricky without IDs.
        // We'll rely on update loop which might be tricky, or just re-render Tabs.
        // Actually, renderSidebar is enough for sidebar. 
        // Updating top tabs requires finding the tab. 
        // We'll skip complex tab syncing for this refactor to avoid bugs, 
        // or just call renderTopTabs if we supported it.
        // Re-rendering everything is safer:
        renderTopTabs();
    }
};

window.deleteCollection = (e, colIndex) => {
    e.stopPropagation();
    if (confirm('Delete collection "' + collections[colIndex].name + '"?')) {
        // Close tabs belonging to this collection
        openTabs = openTabs.filter(t => t.colIndex !== colIndex);

        // Shift indices for subsequent collections
        openTabs.forEach(t => {
            if (t.colIndex > colIndex) t.colIndex--;
        });

        collections.splice(colIndex, 1);
        saveData();

        // If active tab was closed, switch to another
        if (activeTabId && !openTabs.find(t => t.id === activeTabId)) {
            activeTabId = openTabs.length > 0 ? openTabs[openTabs.length - 1].id : null;
        }

        renderTopTabs();
        renderSidebar();

        if (activeTabId) {
            switchTab(activeTabId);
        } else {
            // Clear Workspace
            document.getElementById('method').value = 'GET';
            document.getElementById('url').value = '';
            document.getElementById('current-request-name').innerText = 'Select a request';
            const bc = document.getElementById('collection-breadcrumb');
            if (bc) bc.innerText = '';
            document.getElementById('body-editor').value = '';
            document.getElementById('script-editor').value = '';
        }
    }
};

window.deleteRequest = (e, colIndex, reqIndex) => {
    e.stopPropagation();
    const item = collections[colIndex].requests[reqIndex];
    if (confirm('Delete ' + item.name + '?')) {
        // Close tab if open
        const tabIndex = openTabs.findIndex(t => t.colIndex === colIndex && t.reqIndex === reqIndex);
        if (tabIndex !== -1) {
            openTabs.splice(tabIndex, 1);
        }

        // Shift indices for subsequent requests IN THIS COLLECTION
        openTabs.forEach(t => {
            if (t.colIndex === colIndex && t.reqIndex > reqIndex) t.reqIndex--;
        });

        collections[colIndex].requests.splice(reqIndex, 1);
        saveData();

        if (activeTabId && !openTabs.find(t => t.id === activeTabId)) {
            activeTabId = openTabs.length > 0 ? openTabs[openTabs.length - 1].id : null;
        }

        renderTopTabs();
        renderSidebar();

        if (activeTabId) {
            switchTab(activeTabId);
        } else {
            document.getElementById('current-request-name').innerText = 'Select a request';
            const bc = document.getElementById('collection-breadcrumb');
            if (bc) bc.innerText = '';
        }
    }
};

/* --- TABS & STATE --- */
function openRequest(colIndex, reqIndex) {
    const col = collections[colIndex];
    if (!col) return;
    const item = col.requests[reqIndex];
    if (!item) return;

    // Identification by simple props map for now
    const existing = openTabs.find(t => t.name === item.name && t.method === item.method);
    if (existing) {
        switchTab(existing.id);
    } else {
        const newTab = {
            id: Date.now(),
            colIndex: colIndex, // Store refs
            reqIndex: reqIndex,
            name: item.name,
            method: item.method,
            url: item.url || '',
            headers: item.headers ? JSON.parse(JSON.stringify(item.headers)) : [{ enabled: true, key: 'Content-Type', value: 'application/json' }],
            params: item.params ? JSON.parse(JSON.stringify(item.params)) : [{ enabled: true, key: '', value: '', description: '' }],
            auth: item.auth ? JSON.parse(JSON.stringify(item.auth)) : { type: 'noauth', token: '', username: '', password: '' },
            body: item.body || '',
            script: item.script || ''
        };
        openTabs.push(newTab);
        renderTopTabs();
        switchTab(newTab.id);
    }
}

function switchTab(id) {
    activeTabId = id;
    const tab = openTabs.find(t => t.id === id);
    if (!tab) return;

    if (sidebarView === 'collections') {
        renderSidebar();
    }

    renderTopTabs();
    // Load state into UI
    renderTopTabs();
    // Load state into UI
    const methodEl = document.getElementById('method');
    methodEl.value = tab.method;
    updateMethodStyle(); // Update color immediately

    document.getElementById('url').value = tab.url;
    document.getElementById('body-editor').value = tab.body;
    syncHighlighting(tab.body, 'body-highlight'); // Initial Highlight
    document.getElementById('script-editor').value = tab.script;
    updateLineNumbers(document.getElementById('body-editor'), 'ln-body');
    const nameEl = document.getElementById('current-request-name');
    if (nameEl) nameEl.innerText = tab.name;

    // Update Breadcrumb
    const col = collections[tab.colIndex];
    const crumb = document.getElementById('collection-breadcrumb');
    if (crumb && col) crumb.innerText = col.name;

    renderHeadersTable(tab.headers);
    renderParamsTable(tab.params); // Render params
    renderAuthUI(tab.auth);
    updateUIIndicators();
}

function closeTab(e, id) {
    e.stopPropagation();
    openTabs = openTabs.filter(t => t.id !== id);
    if (openTabs.length === 0) {
        const scratch = { id: Date.now(), index: -1, name: 'New Request', method: 'GET', url: '', headers: [], params: [], auth: { type: 'noauth' }, body: '' };
        openTabs.push(scratch);
        activeTabId = scratch.id;
    } else if (activeTabId === id || !openTabs.find(t => t.id === activeTabId)) {
        activeTabId = openTabs[openTabs.length - 1].id;
    }
    switchTab(activeTabId);
}

function renderTopTabs() {
    const container = document.getElementById('top-tabs-container');
    container.innerHTML = '';
    openTabs.forEach(tab => {
        const el = document.createElement('div');
        el.className = `request-tab ${tab.id === activeTabId ? 'active' : ''}`;
        el.onclick = () => switchTab(tab.id);
        el.innerHTML = `
            <span class="tab-method method ${tab.method}">${tab.method}</span>
            <span class="tab-name">${tab.name}</span>
            <span class="unsaved-dot"></span>
            <span class="tab-close" onclick="closeTab(event, ${tab.id})">×</span>
        `;
        container.appendChild(el);
    });
}

function markActiveTabUnsaved() {
    // Helper to mark unsaved state
    const tabEl = document.querySelector(`.request-tab.active`);
    if (tabEl) {
        tabEl.classList.add('unsaved');
    }
}

function updateActiveTabState() {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.method = document.getElementById('method').value;
    // url is updated via updateUrlState separately
    tab.body = document.getElementById('body-editor').value;

    // Sync highlight on tab switch/update
    syncHighlighting(tab.body, 'body-highlight');

    tab.script = document.getElementById('script-editor').value;

    markActiveTabUnsaved(); // Use the new helper function

    if (document.querySelector(`.request-tab.active`)) {
        // Update method in tab header immediately
        const methodSpan = document.querySelector(`.request-tab.active .tab-method`);
        if (methodSpan) {
            methodSpan.className = `tab-method method ${tab.method}`;
            methodSpan.innerText = tab.method;
        }
    }
    updateMethodStyle();
    updateUIIndicators();
}

window.updateMethodStyle = () => {
    const el = document.getElementById('method');
    if (el) {
        el.className = 'method-select ' + el.value;
    }
};

window.handleMethodChange = () => {
    window.updateMethodStyle();
    updateActiveTabState();
};

// New URL handler
window.updateUrlState = () => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.url = document.getElementById('url').value;
    updateActiveTabState();
};

window.switchInnerTab = (name) => {
    document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active'));
    document.getElementById(name + '-section').classList.add('active');
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.tab-item[onclick*="${name}"]`).classList.add('active');
};

window.updateLineNumbers = (textarea, lnId) => {
    const lines = textarea.value.split('\n').length;
    document.getElementById(lnId).innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
};

function updateUIIndicators() {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (!tab) return;


    // Body
    const body = document.getElementById('body-editor').value;
    const dotBody = document.getElementById('dot-body');
    if (dotBody) dotBody.style.display = body.trim().length > 0 ? 'inline-block' : 'none';

    // Headers
    const linkHeaders = tab.headers ? tab.headers.filter(h => h.enabled && (h.key || h.value)).length : 0;
    const dotHead = document.getElementById('dot-headers');
    if (dotHead) dotHead.style.display = linkHeaders > 0 ? 'inline-block' : 'none';

    // Params
    const linkParams = tab.params ? tab.params.filter(p => p.enabled && (p.key || p.value)).length : 0;
    const dotParams = document.getElementById('dot-params');
    if (dotParams) dotParams.style.display = linkParams > 0 ? 'inline-block' : 'none';

    // Scripts
    const script = document.getElementById('script-editor').value;
    const dotScripts = document.getElementById('dot-scripts');
    if (dotScripts) dotScripts.style.display = script.trim().length > 0 ? 'inline-block' : 'none';

    // Auth
    const dotAuth = document.getElementById('dot-auth');
    if (dotAuth) dotAuth.style.display = (tab.auth && tab.auth.type !== 'noauth') ? 'inline-block' : 'none';
}

/* --- AUTH LOGIC --- */
function renderAuthUI(authObj) {
    if (!authObj) authObj = { type: 'noauth' };
    const select = document.getElementById('auth-type');
    if (select) select.value = authObj.type;

    const container = document.getElementById('auth-inputs');
    container.innerHTML = '';

    if (authObj.type === 'bearer') {
        container.innerHTML = `
            <div class="auth-input-group">
                <label class="auth-label">Token</label>
                <div class="input-group-wrapper">
                    <input type="${authObj.showToken ? 'text' : 'password'}" class="auth-input" value="${authObj.token || ''}" placeholder="Bearer Token" 
                        oninput="updateAuthData('token', this.value)">
                    <button class="toggle-vis-btn" onclick="toggleAuthVis('showToken')" title="${authObj.showToken ? 'Hide' : 'Show'}">
                        ${authObj.showToken ?
                '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' :
                '<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-4.01.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>'}
                    </button>
                </div>
            </div>`;
    } else if (authObj.type === 'basic') {
        container.innerHTML = `
            <div class="auth-input-group">
                <label class="auth-label">Username</label>
                <input type="text" class="auth-input" value="${authObj.username || ''}" placeholder="Username" 
                    oninput="updateAuthData('username', this.value)">
            </div>
            <div class="auth-input-group">
                <label class="auth-label">Password</label>
                <div class="input-group-wrapper">
                    <input type="${authObj.showPass ? 'text' : 'password'}" class="auth-input" value="${authObj.password || ''}" placeholder="Password" 
                        oninput="updateAuthData('password', this.value)">
                    <button class="toggle-vis-btn" onclick="toggleAuthVis('showPass')" title="${authObj.showPass ? 'Hide' : 'Show'}">
                        ${authObj.showPass ?
                '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' :
                '<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-4.01.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>'}
                    </button>
                </div>
            </div>`;
    } else {
        container.innerHTML = `<div style="font-size:0.85rem; color:#999; margin-top:10px;">This request does not use any authorization.</div>`;
    }
}

window.updateAuthType = () => {
    const type = document.getElementById('auth-type').value;
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab) {
        if (!tab.auth) tab.auth = {};
        tab.auth.type = type;
        renderAuthUI(tab.auth);
        markActiveTabUnsaved();
        updateUIIndicators();
    }
};

window.updateAuthData = (field, val) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.auth) {
        tab.auth[field] = val;
        markActiveTabUnsaved();
    }
};

window.toggleAuthVis = (field) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.auth) {
        tab.auth[field] = !tab.auth[field];
        renderAuthUI(tab.auth);
        // Visibility toggle shouldn't necessarily mark unsaved, but let's keep it clean. 
        // Actually, saving preference for visibility is fine.
        markActiveTabUnsaved();
    }
};

/* --- PARAMS & HEADERS --- */
function renderHeadersTable(headersList) {
    const tbody = document.getElementById('headers-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!headersList) headersList = [];
    headersList.forEach((h, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" ${h.enabled ? 'checked' : ''} onchange="toggleHeaderVal(${i}, this.checked)"></td>
            <td><input value="${h.key}" placeholder="Key" oninput="updateHeaderVal(${i}, 'key', this.value)"></td>
            <td>
                <div class="input-group-wrapper">
                    <input type="${h.show ? 'text' : 'password'}" value="${h.value}" placeholder="Value" oninput="updateHeaderVal(${i}, 'value', this.value)">
                    <button class="toggle-vis-btn" onclick="toggleHeaderVis(${i})" title="${h.show ? 'Hide' : 'Show'}">
                        ${h.show ?
                '<svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>' :
                '<svg viewBox="0 0 24 24"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-4.01.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>'}
                    </button>
                </div>
            </td>
            <td style="width:40px; text-align:center;">
                <span class="delete-row-btn" onclick="deleteHeaderRow(${i})">×</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderParamsTable(paramsList) {
    const tbody = document.getElementById('params-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!paramsList) paramsList = [];
    paramsList.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" ${p.enabled ? 'checked' : ''} onchange="toggleParamVal(${i}, this.checked)"></td>
            <td><input value="${p.key}" placeholder="Key" oninput="updateParamVal(${i}, 'key', this.value)"></td>
            <td><input value="${p.value}" placeholder="Value" oninput="updateParamVal(${i}, 'value', this.value)"></td>
            <td><input value="${p.description || ''}" placeholder="Description" oninput="updateParamVal(${i}, 'description', this.value)"></td>
            <td style="width:40px; text-align:center;">
                <span class="delete-row-btn" onclick="deleteParamRow(${i})">×</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.toggleHeaderVal = (i, val) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.headers && tab.headers[i]) {
        tab.headers[i].enabled = val;
        updateUIIndicators();
        markActiveTabUnsaved();
    }
};
window.updateHeaderVal = (i, field, val) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.headers && tab.headers[i]) {
        tab.headers[i][field] = val;
        markActiveTabUnsaved();
    }
};
window.addHeaderRow = () => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab) {
        if (!tab.headers) tab.headers = [];
        tab.headers.push({ enabled: true, key: '', value: '' });
        renderHeadersTable(tab.headers);
        updateUIIndicators();
        markActiveTabUnsaved();
    }
};

window.deleteHeaderRow = (i) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.headers) {
        tab.headers.splice(i, 1);
        renderHeadersTable(tab.headers);
        updateUIIndicators();
        markActiveTabUnsaved();
    }
};

window.toggleHeaderVis = (i) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.headers && tab.headers[i]) {
        tab.headers[i].show = !tab.headers[i].show;
        renderHeadersTable(tab.headers);
        markActiveTabUnsaved();
    }
};

window.toggleParamVal = (i, val) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.params && tab.params[i]) {
        tab.params[i].enabled = val;
        markActiveTabUnsaved();
    }
};
window.updateParamVal = (i, field, val) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.params && tab.params[i]) {
        tab.params[i][field] = val;
        markActiveTabUnsaved();
    }
};
window.addParamRow = () => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab) {
        if (!tab.params) tab.params = [];
        tab.params.push({ enabled: true, key: '', value: '', description: '' });
        renderParamsTable(tab.params);
        updateUIIndicators();
        markActiveTabUnsaved();
    }
};

window.deleteParamRow = (i) => {
    const tab = openTabs.find(t => t.id === activeTabId);
    if (tab && tab.params) {
        tab.params.splice(i, 1);
        renderParamsTable(tab.params);
        updateUIIndicators();
        markActiveTabUnsaved();
    }
};

/* --- SYNTAX HIGHLIGHTING LOGIC --- */
function highlightJSON(json) {
    if (!json) return '';
    // Basic HTML escape
    json = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    return json.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + match + '</span>';
    });
}

window.handleBodyInput = (textarea) => {
    updateLineNumbers(textarea, 'ln-body');
    updateActiveTabState();
    syncHighlighting(textarea.value, 'body-highlight');
};

function syncHighlighting(text, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = highlightJSON(text);
}

// Resizer Logic
const resizer = document.getElementById('pane-resizer');
const workspace = document.querySelector('.workspace-area');
const responsePane = document.getElementById('response-pane');

if (resizer) {
    let isResizing = false;
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'row-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const containerHeight = workspace.offsetHeight;
        const newHeight = containerHeight - (e.clientY - workspace.getBoundingClientRect().top);
        if (newHeight > 100 && newHeight < containerHeight - 100) {
            responsePane.style.height = newHeight + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        isResizing = false;
        resizer.classList.remove('active');
        document.body.style.cursor = 'default';
    });
}

const sendBtn = document.getElementById('send-btn');
if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
        const tab = openTabs.find(t => t.id === activeTabId);
        if (!tab) return;

        const url = document.getElementById('url').value;
        const method = document.getElementById('method').value;
        const useProxy = document.getElementById('cors-toggle').checked;

        if (!url) {
            alert('Please enter a URL');
            return;
        }

        const btn = sendBtn;
        btn.innerText = 'Sending...';
        btn.classList.add('sending');

        const startTime = Date.now();
        const responseEditor = document.getElementById('resp-editor');
        const statusVal = document.getElementById('status-val');
        const timeVal = document.getElementById('time-val');
        const sizeVal = document.getElementById('size-val');

        responseEditor.value = 'Loading...';
        syncHighlighting('Loading...', 'resp-highlight');

        try {
            requestHistory.unshift({ method: tab.method, url: url, time: new Date() });
            if (sidebarView === 'history') renderSidebar();

            let fetchUrl = url;
            if (useProxy) {
                // Dynamic Proxy URL construction for deployment compatibility
                const isLocalFile = window.location.protocol === 'file:';
                const proxyBase = isLocalFile ? 'http://localhost:3001' : ''; // Use relative path in production
                fetchUrl = `${proxyBase}/proxy?url=${encodeURIComponent(url)}`;
            }

            const headers = {};
            if (tab && tab.headers) {
                tab.headers.forEach(h => {
                    if (h.enabled && h.key) headers[h.key] = h.value;
                });
            }

            // Auth
            if (tab && tab.auth) {
                if (tab.auth.type === 'bearer' && tab.auth.token) {
                    headers['Authorization'] = `Bearer ${tab.auth.token}`;
                } else if (tab.auth.type === 'basic' && (tab.auth.username || tab.auth.password)) {
                    const creds = btoa(`${tab.auth.username}:${tab.auth.password}`);
                    headers['Authorization'] = `Basic ${creds}`;
                }
            }

            const options = {
                method: method,
                headers: headers
            };

            if (['POST', 'PUT', 'PATCH'].includes(method) && tab.body) {
                options.body = tab.body;
            }

            const res = await fetch(fetchUrl, options);
            const status = res.status;
            const statusText = res.statusText;
            const size = res.headers.get('content-length');

            let data;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
                responseEditor.value = JSON.stringify(data, null, 2);
            } else {
                data = await res.text();
                responseEditor.value = data;
            }

            syncHighlighting(responseEditor.value, 'resp-highlight');
            updateLineNumbers(responseEditor, 'ln-resp');

            const endTime = Date.now();
            statusVal.innerText = `${status} ${statusText}`;
            statusVal.className = 'status-val ' + (status >= 200 && status < 300 ? 'green' : '');
            timeVal.innerText = `${endTime - startTime}ms`;
            sizeVal.innerText = size ? (size / 1024).toFixed(2) + ' KB' : '-';

        } catch (error) {
            responseEditor.value = 'Error:\n' + error.message;
            syncHighlighting(responseEditor.value, 'resp-highlight');
            statusVal.innerText = 'Error';
            statusVal.className = 'status-val error-response';
        } finally {
            btn.innerText = 'Send';
            btn.classList.remove('sending');
        }
    });
}

// Init
try {
    init();
} catch (e) {
    console.error('Init failed:', e);
    alert('Failed to initialize app: ' + e.message);
}

// Sync scroll
const setupSyncScroll = (editorId, highlightId) => {
    const ed = document.getElementById(editorId);
    const hi = document.getElementById(highlightId);
    if (ed && hi) {
        ed.addEventListener('scroll', () => {
            hi.scrollTop = ed.scrollTop;
            hi.scrollLeft = ed.scrollLeft;
        });
    }
};
setupSyncScroll('body-editor', 'body-highlight');
setupSyncScroll('resp-editor', 'resp-highlight');

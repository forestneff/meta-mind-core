/**
 * META-MIND SANDBOX CONTROLLER v14.4
 * Features: Restored Menu Visibility, Free-Nav Linking, Red/Green Connect Logic.
 */

class SandboxController {
    constructor(kernel, registry) {
        this.kernel = kernel;
        this.registry = registry;

        if (!this.kernel.state.session) {
            this.kernel.state.session = { viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }, selectedId: null };
        }

        this.dom = {
            viewport: document.getElementById('viewport'),
            worldLayer: document.getElementById('world-layer'),
            edgeSvg: document.getElementById('edge-svg'),
            overlay: document.getElementById('linking-overlay'),
            panelProperties: document.getElementById('panel-properties'),
            panelViews: document.getElementById('panel-views'),
            viewMap: document.getElementById('view-map'),
            viewContent: document.getElementById('view-content'),
            sidebar: document.getElementById('sidebar')
        };

        this.dom.edgeSvg.style.overflow = 'visible';

        this.viewMode = 'map';
        this.activeTab = 'properties';
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.clickStart = { x: 0, y: 0 };
        this.draggedNode = null;
        this.activeRadialNodeId = null;
        this.userHasPanned = false;

        this.activePointers = new Map();
        this.lastPinchDist = null;
        this.lastPinchCenter = null;

        this.ensureDomElements();
        this.initDOM();
        this.initEvents();
        this.kernel.subscribe(this.render.bind(this));

        this.animate();
        this.render();
    }

    ensureDomElements() {
        if (!document.getElementById('radial-menu')) {
            const menu = document.createElement('div');
            menu.id = 'radial-menu';
            document.body.appendChild(menu);
            this.dom.radialMenu = menu;
        } else {
            this.dom.radialMenu = document.getElementById('radial-menu');
        }
    }

    initDOM() {
        const list = document.getElementById('view-list');
        if (list) {
            list.innerHTML = `
                <div class="view-card active" onclick="SC.setView('map')"><span class="text-2xl">🗺️</span><div><div>Celestial Map</div><div>Spatial Graph</div></div></div>
                <div class="view-card" onclick="SC.setView('data')"><span class="text-2xl">🗄️</span><div><div>Data Manager</div><div>Library & API Sync</div></div></div>
                <div class="view-card" onclick="SC.setView('orbital')"><span class="text-2xl">🔮</span><div><div>Magic Circle</div><div>Orbital Focus</div></div></div>
                <div class="view-card" onclick="SC.setView('web')"><span class="text-2xl">🌐</span><div><div>Web Architect</div><div>HTML Renderer</div></div></div>
            `;
        }
    }

    initEvents() {
        window.SC = this;
        const vp = this.dom.viewport;

        vp.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));
        vp.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        window.addEventListener('resize', () => this.render());
    }

    toggleSidebar() {
        if (this.dom.sidebar) this.dom.sidebar.classList.toggle('open');
    }

    setTab(tab) { this.activeTab = tab; this.renderSidebar(); }

    setView(mode) {
        this.viewMode = mode;
        const cards = document.querySelectorAll('.view-card');
        cards.forEach(c => c.classList.remove('active'));
        const idx = ['map', 'data', 'orbital', 'web'].indexOf(mode);
        if (idx !== -1 && cards[idx]) cards[idx].classList.add('active');

        if (window.innerWidth <= 768 && this.dom.sidebar) {
            this.dom.sidebar.classList.remove('open');
        }

        this.render();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.kernel.state.session) return;

        const focalId = this.kernel.state.session.selectedId;

        // Position Radial Menu on the Focal Node
        if (focalId && this.viewMode === 'map') {
            const node = this.kernel.state.nodes.find(n => n.id === focalId);
            if (node) this.updateMenuPosition(node);
            else this.hideRadialMenu(true);
        } else {
            this.hideRadialMenu(true);
        }

        // Camera Lerp
        if (this.viewMode === 'map' && this.kernel.config.autoFocus && focalId && !this.userHasPanned && !this.isDragging) {
            const node = this.kernel.state.nodes.find(n => n.id === focalId);
            if (node) {
                const nx = node.data.x, ny = node.data.y, vp = this.kernel.state.session.viewport;
                const rect = this.dom.viewport.getBoundingClientRect();
                const targetX = (rect.width / 2) - (nx * vp.scale);
                const targetY = (rect.height / 2) - (ny * vp.scale);

                if (Math.abs(targetX - vp.x) > 0.1 || Math.abs(targetY - vp.y) > 0.1) {
                    vp.x += (targetX - vp.x) * 0.08; vp.y += (targetY - vp.y) * 0.08;
                    this.updateTransform();
                }
            }
        }
    }

    updateTransform() {
        const vp = this.kernel.state.session.viewport;
        const transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`;
        this.dom.worldLayer.style.transform = transform;
        this.dom.edgeSvg.style.transform = transform;
    }

    // --- Interaction ---
    handlePointerDown(e) {
        if (this.viewMode !== 'map') return;

        if (window.innerWidth <= 768 && this.dom.sidebar && this.dom.sidebar.classList.contains('open')) {
            this.dom.sidebar.classList.remove('open');
        }

        if (e.target.closest('.node')) return;

        this.activePointers.set(e.pointerId, e);

        if (this.activePointers.size === 1) {
            this.isDragging = true;
            this.userHasPanned = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.clickStart = { x: e.clientX, y: e.clientY };
        }
    }

    handlePointerMove(e) {
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, e);
        }

        if (this.activePointers.size === 2) {
            const pts = Array.from(this.activePointers.values());
            const p1 = pts[0], p2 = pts[1];

            const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
            const cx = (p1.clientX + p2.clientX) / 2;
            const cy = (p1.clientY + p2.clientY) / 2;

            if (this.lastPinchDist) {
                const zoomFactor = dist / this.lastPinchDist;
                const vp = this.kernel.state.session.viewport;

                const newScale = Math.max(0.1, Math.min(5, vp.scale * zoomFactor));
                const actualZoom = newScale / vp.scale;

                vp.x = cx - actualZoom * (cx - vp.x);
                vp.y = cy - actualZoom * (cy - vp.y);
                vp.scale = newScale;

                if (this.lastPinchCenter) {
                    vp.x += (cx - this.lastPinchCenter.x);
                    vp.y += (cy - this.lastPinchCenter.y);
                }
                this.updateTransform();
            }

            this.lastPinchDist = dist;
            this.lastPinchCenter = { x: cx, y: cy };
            this.userHasPanned = true;
            this.isDragging = false;
        }
        else if (this.isDragging && this.activePointers.size === 1) {
            const dx = e.clientX - this.lastMouse.x, dy = e.clientY - this.lastMouse.y;
            this.kernel.state.session.viewport.x += dx;
            this.kernel.state.session.viewport.y += dy;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.updateTransform();
        }
        else if (this.draggedNode) {
            const vp = this.kernel.state.session.viewport;
            const dx = (e.clientX - this.lastMouse.x) / vp.scale;
            const dy = (e.clientY - this.lastMouse.y) / vp.scale;
            this.draggedNode.data.x += dx;
            this.draggedNode.data.y += dy;
            this.kernel.updateNode(this.draggedNode.id, { x: this.draggedNode.data.x, y: this.draggedNode.data.y });
            this.lastMouse = { x: e.clientX, y: e.clientY };
        }
    }

    handlePointerUp(e) {
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.delete(e.pointerId);
        }

        if (this.activePointers.size < 2) {
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        }

        if (this.activePointers.size === 0) {
            if (this.isDragging) {
                const dist = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
                if (dist < 5) {
                    // Clicked Background -> Clear Selection & Cancel Linking
                    this.kernel.linkingMode = false;
                    this.dom.overlay.classList.add('hidden');
                    this.kernel.selectNode(null);
                    this.hideRadialMenu(true);
                }
            }
            this.isDragging = false;
        }

        if (this.draggedNode) this.userHasPanned = false;
        this.draggedNode = null;
    }

    handleWheel(e) {
        if (this.viewMode !== 'map') return;
        e.preventDefault();
        const s = this.kernel.state.session, factor = Math.exp(-e.deltaY * 0.001);
        s.viewport.scale = Math.max(0.1, Math.min(5, s.viewport.scale * factor));
        this.updateTransform();
    }

    // --- Radial Menu Logical Overlay ---
    updateMenuPosition(node) {
        const vp = this.kernel.state.session.viewport;
        const rect = this.dom.viewport.getBoundingClientRect();
        const screenX = (node.data.x * vp.scale) + vp.x + rect.left;
        const screenY = (node.data.y * vp.scale) + vp.y + rect.top;
        const menu = this.dom.radialMenu;

        menu.style.position = 'fixed';
        menu.style.width = '2px';
        menu.style.height = '2px';
        menu.style.left = `${Math.round(screenX)}px`;
        menu.style.top = `${Math.round(screenY)}px`;
    }

    showRadialMenu(node) {
        this.activeRadialNodeId = node.id;
        const menu = this.dom.radialMenu;
        menu.style.display = 'block';

        const isLinking = this.kernel.linkingMode;

        // Hash forces a re-render of the menu if the linking mode or target relative to THIS node changes
        const stateHash = `${node.id}-${isLinking}-${this.kernel.linkingSourceId === node.id}`;

        if (menu.dataset.activeNode === stateHash && menu.innerHTML !== '') {
            menu.classList.add('active');
            return;
        }

        menu.dataset.activeNode = stateHash;
        menu.classList.remove('active');

        const off = 80;
        const isCollapsed = node.data.collapsed;

        let actions = [
            { icon: '📝', action: 'Edit', title: 'Edit' },
            { icon: '🔗', action: 'Link', title: 'Link' },
            { icon: '➕', action: 'AddChild', title: 'Add Child' },
            { icon: '🗑️', action: 'Delete', title: 'Delete Downstream' },
            { icon: (isCollapsed ? '🌞' : '🌚'), action: 'ToggleCollapse', title: (isCollapsed ? 'Expand' : 'Collapse') }
        ];

        if (node.type === 'portal') actions.push({ icon: '🌀', action: 'EnterPortal', title: 'Enter' });
        else actions.push({ icon: '🌌', action: 'SaveConstellation', title: 'Save Submap' });

        let html = '';
        actions.forEach((action, i) => {
            const angle = -Math.PI / 2 + (i * (2 * Math.PI / actions.length));
            const tx = Math.cos(angle) * off;
            const ty = Math.sin(angle) * off;

            let btnStyle = `left:0; top:0; margin-left:-22px; margin-top:-22px; pointer-events:auto; position:absolute; --tx: ${tx}px; --ty: ${ty}px;`;

            // RED / GREEN LINKING LOGIC
            if (action.action === 'Link' && isLinking) {
                if (node.id === this.kernel.linkingSourceId) {
                    // It's the source node: Red (Cancel)
                    btnStyle += ` color: #ef4444; border-color: #ef4444; box-shadow: 0 0 15px rgba(239,68,68,0.6);`;
                    action.title = "Cancel Link";
                } else {
                    // It's an eligible target: Green (Confirm)
                    btnStyle += ` color: #10b981; border-color: #10b981; box-shadow: 0 0 15px rgba(16,185,129,0.6);`;
                    action.title = "Confirm Link";
                }
            }

            html += `<div class="radial-btn" style="${btnStyle}" onpointerdown="event.stopPropagation()" onclick="SC.action${action.action}('${node.id}'); event.stopPropagation();" title="${action.title}">${action.icon}</div>`;
        });
        menu.innerHTML = html;

        requestAnimationFrame(() => menu.classList.add('active'));
    }

    hideRadialMenu(force) {
        if (force) {
            this.dom.radialMenu.classList.remove('active');
            setTimeout(() => {
                if (!this.dom.radialMenu.classList.contains('active')) {
                    this.dom.radialMenu.style.display = 'none';
                    this.dom.radialMenu.innerHTML = '';
                    this.dom.radialMenu.dataset.activeNode = '';
                }
            }, 300);
        }
    }

    // --- Tools ---
    actionEdit(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.selectNode(tgt); this.setTab('properties'); }

    // TWO-CLICK LINKING WORKFLOW (Unblocked Navigation)
    actionLink(id) {
        const tgt = id || this.kernel.state.session.selectedId;

        if (this.kernel.linkingMode) {
            if (this.kernel.linkingSourceId !== tgt) {
                // Creates an association link
                this.kernel.addConnection(this.kernel.linkingSourceId, tgt, 'association');
            }
            // Reset mode whether clicked same node (cancel) or new node (confirm)
            this.kernel.linkingMode = false;
            this.dom.overlay.classList.add('hidden');
            this.render();
        } else {
            // Enter Linking Mode
            this.kernel.linkingMode = true;
            this.kernel.linkingSourceId = tgt;
            this.dom.overlay.classList.remove('hidden');
            this.render();
        }
    }

    actionDelete(id) { const tgt = id || this.kernel.state.session.selectedId; if (confirm("Delete this node and cascade to all children?")) this.kernel.deleteNode(tgt); }
    actionToggleCollapse(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.toggleCollapse(tgt); }

    actionAddChild(id) {
        const pid = id || this.kernel.state.session.selectedId;
        const p = this.kernel.state.nodes.find(n => n.id === pid);
        if (p) {
            const type = this.kernel.getSmartChildType(pid);
            if (typeof MetaMindSchema !== 'undefined' && !MetaMindSchema.canConnect(p.type, type)) {
                alert(`Schema constraint: Cannot add a [${type}] child to a [${p.type}] node.`);
                return;
            }
            const child = this.kernel.addNode({ title: "New " + type, type: type }, pid);
            this.kernel.addConnection(pid, child.id);
            this.kernel.selectNode(child.id);
            p.data.collapsed = false;
        }
    }

    actionEnterPortal(id) {
        const tgt = id || this.kernel.state.session.selectedId;
        const node = this.kernel.state.nodes.find(n => n.id === tgt);
        if (node && node.type === 'portal') {
            const lib = this.kernel.getLibrary();
            const map = lib.find(m => m.map_id === node.content);
            if (map && confirm("Import map?")) this.kernel.importSubmap(tgt, map);
        }
    }

    actionSaveConstellation(id) {
        const tgt = id || this.kernel.state.session.selectedId;
        const json = this.kernel.extractConstellation(tgt);
        if (json) { this.kernel.saveConstellationToLibrary(json); alert("Saved to Library."); }
    }

    // --- API Federation & File I/O Tools ---
    actionUpdateApi() {
        this.kernel.bridge.pushUrl = document.getElementById('api-push-url').value;
        this.kernel.bridge.pullUrl = document.getElementById('api-pull-url').value;
        alert(`Endpoints mapped temporarily.`);
    }
    actionPushApi() { alert(`POST to ${this.kernel.bridge.pushUrl}`); }
    actionPullApi() { alert(`GET from ${this.kernel.bridge.pullUrl}`); }

    actionSyncJson() {
        try {
            const val = document.getElementById('json-exchange').value;
            const state = JSON.parse(val);
            this.kernel.loadMapState(state);
            alert("Mapstate Applied Successfully.");
        } catch (e) { alert("Invalid JSON format."); }
    }

    actionCopyJson() {
        const val = document.getElementById('json-exchange');
        val.select(); document.execCommand('copy');
        alert("Copied to clipboard.");
    }

    actionExportJsonFile() {
        const json = this.kernel.exportMapState();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metamind_map_${this.kernel.state.map_id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    actionImportJsonFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const state = JSON.parse(e.target.result);
                this.kernel.loadMapState(state);
                alert("Mapstate Imported Successfully.");
                this.render();
            } catch (err) {
                alert("Invalid JSON file.");
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    actionSaveCurrentToLibrary() {
        const copy = JSON.parse(JSON.stringify(this.kernel.state));
        copy.map_id = this.kernel.generateId();
        copy.meta.title = (copy.meta.title || "Untitled") + " (Copy)";
        this.kernel.saveConstellationToLibrary(copy);
        alert("Session saved to Library!");
        this.render();
    }

    actionLoadFromLibrary(id) {
        const lib = this.kernel.getLibrary();
        const map = lib.find(m => m.map_id === id);
        if (map) { this.kernel.loadMapState(map); this.setView('map'); }
    }

    actionDeleteFromLibrary(id) {
        if (confirm("Permanently delete this saved constellation?")) {
            this.kernel.deleteFromLibrary(id);
            this.render();
        }
    }

    actionUpdateLibraryItem(id) {
        const titleInput = document.getElementById(`lib-title-${id}`);
        const notesInput = document.getElementById(`lib-notes-${id}`);
        const sharedInput = document.getElementById(`lib-shared-${id}`);
        if (titleInput) {
            this.kernel.updateLibraryItem(id, {
                title: titleInput.value,
                notes: notesInput.value,
                shared: sharedInput.checked
            });
            alert("Details Saved.");
            this.render();
        }
    }

    // --- Render Loop ---
    render() {
        this.renderSidebar();
        if (this.viewMode === 'map') {
            this.dom.viewMap.style.display = 'block';
            this.dom.viewContent.style.display = 'none';
            this.renderMap(this.kernel.state);
        } else {
            this.dom.viewMap.style.display = 'none';
            this.dom.viewContent.style.display = 'block';
            const eng = this.registry.get(this.viewMode);
            if (eng) eng.render(this.dom.viewContent, this.kernel.state);
        }
    }

    renderSidebar() {
        document.querySelectorAll('.sidebar-tab').forEach(el => el.classList.remove('active'));
        const activeTabEl = document.getElementById(`tab-${this.activeTab}`);
        if (activeTabEl) activeTabEl.classList.add('active');

        const propPanel = this.dom.panelProperties;
        const viewPanel = this.dom.panelViews;

        propPanel.classList.add('hidden');
        viewPanel.classList.add('hidden');

        if (this.activeTab === 'properties') {
            propPanel.classList.remove('hidden');
            const inspector = this.registry.get('inspector');
            if (inspector) inspector.render(propPanel, this.kernel.state);
        } else if (this.activeTab === 'views') {
            viewPanel.classList.remove('hidden');
        }
    }

    renderMap(state) {
        if (!state.nodes || !state.session) return;
        this.updateTransform();

        const selId = state.session.selectedId;

        const visibleNodes = new Set();
        state.nodes.forEach(n => visibleNodes.add(n.id));

        state.nodes.forEach(n => {
            if (n.data.collapsed) {
                const queue = [n.id];
                while (queue.length > 0) {
                    const curr = queue.shift();
                    const kids = state.connections.filter(c => c.from === curr && c.type === 'structural').map(c => c.to);
                    kids.forEach(k => { visibleNodes.delete(k); queue.push(k); });
                }
            }
        });

        // Edges Full Redraw
        this.dom.edgeSvg.innerHTML = '';
        state.connections.forEach(c => {
            if (visibleNodes.has(c.from) && visibleNodes.has(c.to)) {
                const s = state.nodes.find(n => n.id === c.from), t = state.nodes.find(n => n.id === c.to);
                if (s && t) {
                    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
                    l.setAttribute("x1", s.data.x); l.setAttribute("y1", s.data.y);
                    l.setAttribute("x2", t.data.x); l.setAttribute("y2", t.data.y);
                    l.setAttribute("class", "edge-vis");
                    if (c.type === 'association') l.style.strokeDasharray = "5,5";
                    this.dom.edgeSvg.appendChild(l);
                }
            }
        });

        // Nodes
        this.dom.worldLayer.innerHTML = '';
        state.nodes.forEach(node => {
            if (!visibleNodes.has(node.id)) return;

            const el = document.createElement('div');
            el.className = `node ${node.id === selId ? 'selected' : ''}`;
            el.style.left = `${node.data.x}px`;
            el.style.top = `${node.data.y}px`;
            el.dataset.nodeId = node.id;

            if (node.data.isCore) el.style.borderColor = '#ea580c';
            if (node.type === 'portal') el.style.borderColor = '#a855f7';
            if (node.data.collapsed) el.classList.add('collapsed');

            const bp = this.kernel.getBlueprint(node.type);
            el.innerHTML = `<div class="node-icon">${bp.icon}</div><div class="node-label">${node.title}</div>`;

            if (node.data.collapsed) {
                const children = state.connections
                    .filter(c => c.from === node.id && c.type === 'structural')
                    .map(c => state.nodes.find(n => n.id === c.to));

                children.forEach((child, i) => {
                    if (!child) return;
                    const angle = (i / children.length) * Math.PI * 2;
                    const mx = Math.cos(angle) * 55;
                    const my = Math.sin(angle) * 55;

                    const moon = document.createElement('div');
                    moon.className = "absolute w-6 h-6 bg-slate-800 border border-slate-500 rounded-full flex items-center justify-center text-[10px] cursor-pointer hover:bg-sky-600 hover:scale-125 transition-all shadow-md z-50";
                    moon.style.left = `calc(50% + ${mx}px - 12px)`;
                    moon.style.top = `calc(50% + ${my}px - 12px)`;
                    moon.style.pointerEvents = "auto";

                    moon.innerHTML = this.kernel.getBlueprint(child.type).icon;
                    moon.onpointerdown = (e) => {
                        e.stopPropagation();
                        this.kernel.updateNode(node.id, { data: { ...node.data, collapsed: false } });
                        this.kernel.selectNode(child.id);
                    };
                    el.appendChild(moon);
                });
            }

            // Bind pure pointer events for node dragging
            let startX = 0, startY = 0;
            el.onpointerdown = (e) => {
                if (e.target.closest('.radial-btn') || e.target.closest('.moon-btn')) return;
                e.stopPropagation();
                el.setPointerCapture(e.pointerId);
                startX = e.clientX; startY = e.clientY;
                this.draggedNode = node;
                this.lastMouse = { x: e.clientX, y: e.clientY };

                // Select node freely WITHOUT forcing link resolution
                this.kernel.selectNode(node.id);
                this.userHasPanned = false;
            };

            el.onpointerup = (e) => {
                if (e.target.closest('.radial-btn') || e.target.closest('.moon-btn')) return;
                e.stopPropagation();
                el.releasePointerCapture(e.pointerId);
                this.draggedNode = null;
                const dist = Math.hypot(e.clientX - startX, e.clientY - startY);

                if (dist < 5) {
                    this.setTab('properties');
                    if (window.innerWidth <= 768 && this.dom.sidebar && !this.dom.sidebar.classList.contains('open')) {
                        this.toggleSidebar();
                    }
                }
            };

            this.dom.worldLayer.appendChild(el);

            // Menu renders contextually if it is the selected node
            if (selId === node.id) {
                this.showRadialMenu(node);
            }
        });
    }
}
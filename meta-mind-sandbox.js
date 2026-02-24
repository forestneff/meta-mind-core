/**
 * META-MIND SANDBOX CONTROLLER v13.3
 * Features: Focal-Locked Radial Menu, New API Actions.
 */

class SandboxController {
    constructor(kernel, registry) {
        this.kernel = kernel;
        this.registry = registry;

        if (!this.kernel.state.session) {
            this.kernel.state.session = {
                viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 },
                selectedId: null
            };
        }

        this.ensureDomElements();

        this.dom = {
            viewport: document.getElementById('viewport'),
            worldLayer: document.getElementById('world-layer'),
            edgeSvg: document.getElementById('edge-svg'),
            radialMenu: document.getElementById('radial-menu'),
            overlay: document.getElementById('linking-overlay'),
            panelProperties: document.getElementById('panel-properties'),
            panelViews: document.getElementById('panel-views'),
            panelFederation: document.getElementById('panel-federation'),
            viewMap: document.getElementById('view-map'),
            viewContent: document.getElementById('view-content')
        };

        this.dom.edgeSvg.style.overflow = 'visible';

        this.viewMode = 'map';
        this.activeTab = 'properties';
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.draggedNode = null;
        this.userHasPanned = false;

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
        }
    }

    initDOM() {
        const list = document.getElementById('view-list');
        if (list) {
            list.innerHTML = `
                <div class="view-card active" onclick="SC.setView('map')"><span class="text-2xl">🗺️</span><div><div>Celestial Map</div><div>Spatial Graph</div></div></div>
                <div class="view-card" onclick="SC.setView('library')"><span class="text-2xl">📚</span><div><div>Library</div><div>Constellations</div></div></div>
                <div class="view-card" onclick="SC.setView('orbital')"><span class="text-2xl">🔮</span><div><div>Magic Circle</div><div>Orbital Focus</div></div></div>
                <div class="view-card" onclick="SC.setView('web')"><span class="text-2xl">🌐</span><div><div>Web Architect</div><div>HTML Renderer</div></div></div>
            `;
        }
    }

    initEvents() {
        window.SC = this;
        const vp = this.dom.viewport;

        vp.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        window.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        window.addEventListener('mouseup', (e) => this.handlePointerUp(e));
        vp.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Deselect if clicking empty space
        vp.addEventListener('click', (e) => {
            if (this.viewMode === 'map' && !e.target.closest('.node') && !e.target.closest('.radial-btn')) {
                this.kernel.selectNode(null);
                this.hideRadialMenu(true);
            }
        });

        window.addEventListener('resize', () => this.render());
    }

    setTab(tab) { this.activeTab = tab; this.renderSidebar(); }
    setView(mode) {
        this.viewMode = mode;
        const cards = document.querySelectorAll('.view-card');
        cards.forEach(c => c.classList.remove('active'));
        const idx = ['map', 'library', 'orbital', 'web'].indexOf(mode);
        if (idx !== -1 && cards[idx]) cards[idx].classList.add('active');
        this.render();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.kernel.state.session) return;

        const focalId = this.kernel.state.session.selectedId;

        // Position Radial Menu on Focal Node every frame
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
                const nx = node.data.x;
                const ny = node.data.y;
                const vp = this.kernel.state.session.viewport;
                const rect = this.dom.viewport.getBoundingClientRect();
                const targetX = (rect.width / 2) - (nx * vp.scale);
                const targetY = (rect.height / 2) - (ny * vp.scale);

                if (Math.abs(targetX - vp.x) > 0.1 || Math.abs(targetY - vp.y) > 0.1) {
                    vp.x += (targetX - vp.x) * 0.08;
                    vp.y += (targetY - vp.y) * 0.08;
                    this.renderMap(this.kernel.state);
                }
            }
        }
    }

    // --- Interaction ---
    handlePointerDown(e) {
        if (this.viewMode !== 'map') return;
        if (e.target.closest('.node') || e.target.closest('.radial-btn')) return;
        this.isDragging = true;
        this.userHasPanned = true;
        this.lastMouse = { x: e.clientX, y: e.clientY };
    }

    handlePointerMove(e) {
        if (this.isDragging) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            const sess = this.kernel.state.session;
            sess.viewport.x += dx; sess.viewport.y += dy;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.render();
        } else if (this.draggedNode) {
            const vp = this.kernel.state.session.viewport;
            const dx = (e.clientX - this.lastMouse.x) / vp.scale;
            const dy = (e.clientY - this.lastMouse.y) / vp.scale;
            this.draggedNode.data.x += dx;
            this.draggedNode.data.y += dy;
            this.kernel.updateNode(this.draggedNode.id, { x: this.draggedNode.data.x, y: this.draggedNode.data.y });
            this.lastMouse = { x: e.clientX, y: e.clientY };
        }
    }

    handlePointerUp() {
        this.isDragging = false;
        if (this.draggedNode) this.userHasPanned = false;
        this.draggedNode = null;
    }

    handleWheel(e) {
        e.preventDefault();
        const s = this.kernel.state.session;
        const factor = Math.exp(-e.deltaY * 0.001);
        s.viewport.scale = Math.max(0.1, Math.min(5, s.viewport.scale * factor));
        this.render();
    }

    // --- Radial Menu Focal Lock Logic ---
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
        const menu = this.dom.radialMenu;
        menu.style.display = 'block';

        // Critical Optimization: Prevents HTML rebuild if same focal node. 
        // This stops the animation reset loop!
        if (menu.dataset.activeNode === node.id && menu.innerHTML !== '') {
            menu.classList.add('active'); // Ensure visible
            return;
        }

        menu.dataset.activeNode = node.id;
        menu.classList.remove('active'); // Reset transition

        const off = 75;
        const s = `left:0; top:0; margin-left:-22px; margin-top:-22px; pointer-events:auto; position:absolute;`;
        const isCollapsed = node.data.collapsed;

        let actions = [
            { icon: '📝', onclick: `SC.actionEdit('${node.id}')`, title: 'Edit' },
            { icon: '🔗', onclick: `SC.actionLink('${node.id}')`, title: 'Link' },
            { icon: '➕', onclick: `SC.actionAddChild('${node.id}')`, title: 'Add Child' },
            { icon: '🗑️', onclick: `SC.actionDelete('${node.id}')`, title: 'Delete' },
            { icon: (isCollapsed ? '🌞' : '🌚'), onclick: `SC.actionToggleCollapse('${node.id}')`, title: (isCollapsed ? 'Expand' : 'Collapse') }
        ];

        if (node.type === 'portal') actions.push({ icon: '🌀', onclick: `SC.actionEnterPortal('${node.id}')`, title: 'Enter' });
        else actions.push({ icon: '🌌', onclick: `SC.actionSaveConstellation('${node.id}')`, title: 'Save' });

        let html = '';
        actions.forEach((action, i) => {
            const angle = -Math.PI / 2 + (i * (2 * Math.PI / actions.length));
            const tx = Math.cos(angle) * off;
            const ty = Math.sin(angle) * off;
            html += `<div class="radial-btn" style="${s} --tx: ${tx}px; --ty: ${ty}px;" onclick="${action.onclick}" title="${action.title}">${action.icon}</div>`;
        });
        menu.innerHTML = html;

        // Force reflow and apply active class for smooth pop-out animation
        requestAnimationFrame(() => {
            menu.classList.add('active');
        });
    }

    hideRadialMenu(force) {
        if (force) {
            this.dom.radialMenu.classList.remove('active');
            // Allow CSS transition to complete before totally wiping
            setTimeout(() => {
                if (!this.dom.radialMenu.classList.contains('active')) {
                    this.dom.radialMenu.style.display = 'none';
                    this.dom.radialMenu.innerHTML = '';
                    this.dom.radialMenu.dataset.activeNode = '';
                }
            }, 300);
        }
    }

    // Tools
    actionEdit(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.selectNode(tgt); this.setTab('properties'); }
    actionLink(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.linkingMode = true; this.kernel.linkingSourceId = tgt; this.dom.overlay.classList.remove('hidden'); }
    actionDelete(id) { const tgt = id || this.kernel.state.session.selectedId; if (confirm("Delete?")) this.kernel.deleteNode(tgt); }
    actionToggleCollapse(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.toggleCollapse(tgt); }

    actionAddChild(id) {
        const pid = id || this.kernel.state.session.selectedId;
        const p = this.kernel.state.nodes.find(n => n.id === pid);
        if (p) {
            const type = this.kernel.getSmartChildType(pid);
            const child = this.kernel.addNode({ title: "New " + type, type: type }, pid);
            this.kernel.addConnection(pid, child.id);
            this.kernel.selectNode(child.id); // Triggers menu to follow
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
        if (json) {
            this.kernel.saveConstellationToLibrary(json);
            alert("Saved to Library.");
        }
    }

    // API Federation Tools
    actionUpdateApi() {
        const url = document.getElementById('api-url').value;
        this.kernel.bridge.apiUrl = url;
        alert(`Host API set to ${url}`);
    }

    actionSyncJson() {
        try {
            const val = document.getElementById('json-exchange').value;
            const state = JSON.parse(val);
            this.kernel.loadMapState(state);
            alert("Mapstate Applied Successfully.");
        } catch (e) {
            alert("Invalid JSON format.");
        }
    }

    actionCopyJson() {
        const val = document.getElementById('json-exchange');
        val.select();
        document.execCommand('copy');
        alert("Copied to clipboard.");
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
        const propPanel = this.dom.panelProperties;
        const viewPanel = this.dom.panelViews;
        const fedPanel = this.dom.panelFederation;

        propPanel.classList.add('hidden');
        viewPanel.classList.add('hidden');
        fedPanel.classList.add('hidden');

        if (this.activeTab === 'properties') {
            propPanel.classList.remove('hidden');
            const inspector = this.registry.get('inspector');
            if (inspector) inspector.render(propPanel, this.kernel.state);
        } else if (this.activeTab === 'views') {
            viewPanel.classList.remove('hidden');
        } else if (this.activeTab === 'federation') {
            fedPanel.classList.remove('hidden');
            const fedEng = this.registry.get('federation');
            if (fedEng) fedEng.render(fedPanel, this.kernel.state);
        }
    }

    renderMap(state) {
        if (!state.nodes || !state.session) return;

        const vp = state.session.viewport;
        const selId = state.session.selectedId;
        const transform = `translate(${vp.x}px, ${vp.y}px) scale(${vp.scale})`;

        this.dom.worldLayer.style.transform = transform;
        this.dom.worldLayer.style.transformOrigin = '0 0';
        this.dom.edgeSvg.style.transform = transform;
        this.dom.edgeSvg.style.transformOrigin = '0 0';

        // 1. Visibility Filter (Halo)
        const visibleNodes = new Set();
        state.nodes.forEach(n => visibleNodes.add(n.id));

        state.nodes.forEach(n => {
            if (n.data.collapsed) {
                const children = state.connections
                    .filter(c => c.from === n.id && c.type === 'structural')
                    .map(c => c.to);
                children.forEach(cid => visibleNodes.delete(cid));
            }
        });

        // 2. Render Edges
        this.dom.edgeSvg.innerHTML = '';
        state.connections.forEach(c => {
            if (visibleNodes.has(c.from) && visibleNodes.has(c.to)) {
                const s = state.nodes.find(n => n.id === c.from);
                const t = state.nodes.find(n => n.id === c.to);
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

        // 3. Render Nodes
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

            // Halo Moons for collapsed children
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
                    moon.onclick = (e) => {
                        e.stopPropagation();
                        this.kernel.expandAndFocus(child.id);
                    };
                    el.appendChild(moon);
                });
            }

            el.onmousedown = (e) => {
                e.stopPropagation();
                if (e.button === 0) {
                    this.draggedNode = node;
                    this.lastMouse = { x: e.clientX, y: e.clientY };
                    this.kernel.selectNode(node.id);
                }
            };

            el.onclick = (e) => {
                e.stopPropagation();
                if (this.kernel.linkingMode) {
                    this.kernel.addConnection(this.kernel.linkingSourceId, node.id);
                    this.kernel.linkingMode = false;
                    this.dom.overlay.classList.add('hidden');
                } else {
                    this.kernel.selectNode(node.id);
                    this.setTab('properties');
                }
            };

            this.dom.worldLayer.appendChild(el);

            // Check if this is focal node, if so render menu HTML (DOM separation logic)
            if (selId === node.id) {
                this.showRadialMenu(node);
            }
        });
    }
}
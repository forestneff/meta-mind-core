/**
 * META-MIND SANDBOX CONTROLLER v14.3
 * Features: Multi-Touch Gestures (Pinch to Zoom), Responsive Sidebar.
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

        this.viewMode = 'map';
        this.activeTab = 'properties';

        // Interaction State
        this.activePointers = new Map(); // Tracks multi-touch
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.clickStart = { x: 0, y: 0 };
        this.lastPinchDist = null;
        this.lastPinchCenter = null;

        this.draggedNode = null;
        this.activeRadialNodeId = null;
        this.userHasPanned = false;

        this.initDOM();
        this.initEvents();
        this.kernel.subscribe(this.render.bind(this));

        this.animate();
        this.render();
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

        // Multi-touch tracking
        vp.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
        window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
        window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
        window.addEventListener('pointercancel', (e) => this.handlePointerUp(e));

        vp.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        window.addEventListener('resize', () => this.render());
    }

    toggleSidebar() {
        this.dom.sidebar.classList.toggle('open');
    }

    setTab(tab) {
        this.activeTab = tab;
        this.renderSidebar();
    }

    setView(mode) {
        this.viewMode = mode;
        const cards = document.querySelectorAll('.view-card');
        cards.forEach(c => c.classList.remove('active'));
        const idx = ['map', 'data', 'orbital', 'web'].indexOf(mode);
        if (idx !== -1 && cards[idx]) cards[idx].classList.add('active');

        // Auto-close sidebar on mobile after selecting a view
        if (window.innerWidth <= 768) {
            this.dom.sidebar.classList.remove('open');
        }

        this.render();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.kernel.state.session) return;

        const focalId = this.kernel.state.session.selectedId;

        // Camera Lerp tracking Focal Node
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

    // --- Interaction & Multi-Touch Gestures ---
    handlePointerDown(e) {
        if (this.viewMode !== 'map') return;

        // Auto-close sidebar on mobile if clicking the map
        if (window.innerWidth <= 768 && this.dom.sidebar.classList.contains('open')) {
            this.dom.sidebar.classList.remove('open');
        }

        if (e.target.closest('.node')) return;

        // Register pointer
        this.activePointers.set(e.pointerId, e);

        // Single touch initialization
        if (this.activePointers.size === 1) {
            this.isDragging = true;
            this.userHasPanned = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.clickStart = { x: e.clientX, y: e.clientY };
        }
    }

    handlePointerMove(e) {
        // Track the updated pointer coordinates
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.set(e.pointerId, e);
        }

        // Pinch-to-Zoom (2 Fingers)
        if (this.activePointers.size === 2) {
            const pts = Array.from(this.activePointers.values());
            const p1 = pts[0], p2 = pts[1];

            // Calculate distance and midpoint between two fingers
            const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
            const cx = (p1.clientX + p2.clientX) / 2;
            const cy = (p1.clientY + p2.clientY) / 2;

            if (this.lastPinchDist) {
                const zoomFactor = dist / this.lastPinchDist;
                const vp = this.kernel.state.session.viewport;

                // Math: Scale viewport relative to the pinch center point
                const newScale = Math.max(0.1, Math.min(5, vp.scale * zoomFactor));
                const actualZoom = newScale / vp.scale;

                // 1. Zoom calculation
                vp.x = cx - actualZoom * (cx - vp.x);
                vp.y = cy - actualZoom * (cy - vp.y);
                vp.scale = newScale;

                // 2. Dual-finger pan (drift of the center point)
                if (this.lastPinchCenter) {
                    vp.x += (cx - this.lastPinchCenter.x);
                    vp.y += (cy - this.lastPinchCenter.y);
                }
                this.updateTransform();
            }

            this.lastPinchDist = dist;
            this.lastPinchCenter = { x: cx, y: cy };
            this.userHasPanned = true;
            this.isDragging = false; // Disable single-finger drag
        }
        // Standard Pan (1 Finger / Mouse Drag)
        else if (this.isDragging && this.activePointers.size === 1) {
            const dx = e.clientX - this.lastMouse.x, dy = e.clientY - this.lastMouse.y;
            this.kernel.state.session.viewport.x += dx;
            this.kernel.state.session.viewport.y += dy;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.updateTransform();
        }
        // Node Dragging (Captured by Node)
        else if (this.draggedNode) {
            const vp = this.kernel.state.session.viewport;
            this.draggedNode.data.x += (e.clientX - this.lastMouse.x) / vp.scale;
            this.draggedNode.data.y += (e.clientY - this.lastMouse.y) / vp.scale;
            this.kernel.updateNode(this.draggedNode.id, { x: this.draggedNode.data.x, y: this.draggedNode.data.y });
            this.lastMouse = { x: e.clientX, y: e.clientY };
        }
    }

    handlePointerUp(e) {
        // Clear pointer from registry
        if (this.activePointers.has(e.pointerId)) {
            this.activePointers.delete(e.pointerId);
        }

        // Reset pinch tracking if we drop below 2 fingers
        if (this.activePointers.size < 2) {
            this.lastPinchDist = null;
            this.lastPinchCenter = null;
        }

        // Tap Detection (Only if all fingers are lifted and we barely moved)
        if (this.activePointers.size === 0) {
            if (this.isDragging) {
                const dist = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
                if (dist < 5) this.kernel.selectNode(null); // Clicked background
            }
            this.isDragging = false;
        }

        if (this.draggedNode) this.userHasPanned = false;
        this.draggedNode = null;
    }

    handleWheel(e) {
        if (this.viewMode !== 'map') return; // Restores native scroll in data/web engine!
        e.preventDefault();
        const s = this.kernel.state.session, factor = Math.exp(-e.deltaY * 0.001);
        s.viewport.scale = Math.max(0.1, Math.min(5, s.viewport.scale * factor));
        this.updateTransform();
    }

    // --- Actions ---
    actionEdit(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.selectNode(tgt); this.setTab('properties'); }
    actionLink(id) { const tgt = id || this.kernel.state.session.selectedId; this.kernel.linkingMode = true; this.kernel.linkingSourceId = tgt; this.dom.overlay.classList.remove('hidden'); }
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

    // --- HTML Generators ---
    generateRadialMenuHTML(node) {
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

        let html = `<div class="radial-menu-container">`;
        actions.forEach((action, i) => {
            const angle = -Math.PI / 2 + (i * (2 * Math.PI / actions.length));
            const tx = Math.cos(angle) * off;
            const ty = Math.sin(angle) * off;
            html += `<div class="radial-btn" style="--tx: ${tx}px; --ty: ${ty}px;" onpointerdown="event.stopPropagation()" onclick="SC.action${action.action}('${node.id}'); event.stopPropagation();" title="${action.title}">${action.icon}</div>`;
        });
        html += `</div>`;
        return html;
    }

    generateMoonsHTML(node, state) {
        const children = state.connections
            .filter(c => c.from === node.id && c.type === 'structural')
            .map(c => state.nodes.find(n => n.id === c.to))
            .filter(n => n);

        let html = '';
        children.forEach((child, i) => {
            const angle = (i / children.length) * Math.PI * 2;
            const mx = Math.cos(angle) * 55;
            const my = Math.sin(angle) * 55;
            const icon = this.kernel.getBlueprint(child.type).icon;
            html += `<div class="moon-btn" style="left: calc(50% + ${mx}px - 12px); top: calc(50% + ${my}px - 12px);" onpointerdown="event.stopPropagation(); SC.kernel.expandAndFocus('${child.id}');" title="${child.title}">${icon}</div>`;
        });
        return html;
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

        // Visibility Filter (Cascading downstream collapse detection)
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

        // Smart DOM Diffing for Nodes
        state.nodes.forEach(node => {
            if (!visibleNodes.has(node.id)) {
                const el = this.dom.worldLayer.querySelector(`[data-node-id="${node.id}"]`);
                if (el) el.remove();
                return;
            }

            let el = this.dom.worldLayer.querySelector(`[data-node-id="${node.id}"]`);
            if (!el) {
                el = document.createElement('div');
                el.dataset.nodeId = node.id;
                this.dom.worldLayer.appendChild(el);
            }

            el.className = `node ${node.id === selId ? 'selected' : ''} ${node.data.collapsed ? 'collapsed' : ''}`;
            el.style.left = `${node.data.x}px`;
            el.style.top = `${node.data.y}px`;
            el.style.borderColor = node.data.isCore ? '#ea580c' : (node.type === 'portal' ? '#a855f7' : '');

            const bp = this.kernel.getBlueprint(node.type);
            let inner = `<div class="node-icon">${bp.icon}</div><div class="node-label">${node.title}</div>`;

            if (node.id === selId) inner += this.generateRadialMenuHTML(node);
            if (node.data.collapsed) inner += this.generateMoonsHTML(node, state);

            const stateHash = `${node.title}-${node.type}-${node.id === selId}-${node.data.collapsed}`;
            if (el.dataset.stateHash !== stateHash) {
                el.innerHTML = inner;
                el.dataset.stateHash = stateHash;

                if (node.id === selId) {
                    requestAnimationFrame(() => {
                        const m = el.querySelector('.radial-menu-container');
                        if (m) m.classList.add('active');
                    });
                }
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
                    if (this.kernel.linkingMode) {
                        this.kernel.addConnection(this.kernel.linkingSourceId, node.id);
                        this.kernel.linkingMode = false;
                        this.dom.overlay.classList.add('hidden');
                    } else {
                        this.setTab('properties');
                        // On mobile, if sidebar is closed, open it to show properties
                        if (window.innerWidth <= 768 && !this.dom.sidebar.classList.contains('open')) {
                            this.toggleSidebar();
                        }
                    }
                }
            };
        });

        // Cleanup deleted nodes
        Array.from(this.dom.worldLayer.children).forEach(el => {
            if (!state.nodes.find(n => n.id === el.dataset.nodeId) || !visibleNodes.has(el.dataset.nodeId)) el.remove();
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
    }
}
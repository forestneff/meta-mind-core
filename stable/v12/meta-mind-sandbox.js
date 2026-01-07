/**
 * META-MIND SANDBOX CONTROLLER v4.1
 * Manages View Modes (Map/Web/Tree), Sidebar Tabs, and Smart Rendering.
 * Fixes: View duplication on switch & Radial Menu Logic.
 */

class SandboxController {
    constructor(kernel, registry) {
        this.kernel = kernel;
        this.registry = registry;
        
        // DOM Elements
        this.dom = {
            viewport: document.getElementById('viewport'),
            worldLayer: document.getElementById('world-layer'),
            edgeSvg: document.getElementById('edge-svg'),
            radialMenu: document.getElementById('radial-menu'),
            overlay: document.getElementById('linking-overlay'),
            title: document.getElementById('map-title'),
            
            // Sidebar Panels
            panelProperties: document.getElementById('panel-properties'),
            panelViews: document.getElementById('panel-views'),
            
            // View Containers
            viewMap: document.getElementById('view-map'),
            viewContent: document.getElementById('view-content')
        };

        // UI State
        this.viewMode = 'map'; // 'map', 'web', 'tree'
        this.activeTab = 'properties'; // 'properties', 'views'
        
        // Interaction State
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.draggedNode = null;
        this.activeRadialNodeId = null;
        this.menuHideTimer = null;
        this.isMenuPinned = false;

        // Init
        this.initDOM();
        this.initEvents();
        this.kernel.subscribe(this.render.bind(this));
        
        // Initial Render
        this.render();
    }

    initDOM() {
        // Setup Sidebar View List
        const list = document.getElementById('view-list');
        if(list) {
            list.innerHTML = `
                <div class="view-card active" onclick="SC.setView('map')">
                    <span class="text-xl">🗺️</span>
                    <div><div class="font-bold text-xs">Spatial Map</div><div class="text-[10px] text-slate-400">Node Graph</div></div>
                </div>
                <div class="view-card" onclick="SC.setView('web')">
                    <span class="text-xl">🌐</span>
                    <div><div class="font-bold text-xs">Web Preview</div><div class="text-[10px] text-slate-400">HTML Renderer</div></div>
                </div>
                <div class="view-card" onclick="SC.setView('tree')">
                    <span class="text-xl">📝</span>
                    <div><div class="font-bold text-xs">Outliner</div><div class="text-[10px] text-slate-400">List Editor</div></div>
                </div>
            `;
        }
    }

    initEvents() {
        // Global Window Actions (for HTML onclicks)
        window.SC = this;

        // Map Interaction (Only active when in Map Mode)
        const vp = this.dom.viewport;
        vp.addEventListener('mousedown', (e) => this.ifMap(e, () => this.handlePointerDown(e)));
        window.addEventListener('mousemove', (e) => this.handlePointerMove(e)); // Always listen for drag
        window.addEventListener('mouseup', (e) => this.handlePointerUp(e));
        vp.addEventListener('wheel', (e) => this.ifMap(e, () => this.handleWheel(e)), { passive: false });
        
        // Touch
        vp.addEventListener('touchstart', (e) => this.ifMap(e, () => this.handleTouchStart(e)), { passive: false });
        vp.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        vp.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        // Radial Menu Hover
        const menu = this.dom.radialMenu;
        menu.addEventListener('mouseenter', () => this.cancelHideTimer());
        menu.addEventListener('mouseleave', () => { if (!this.isMenuPinned) this.startHideTimer(); });
        
        // Background Click
        vp.addEventListener('click', (e) => {
             if(this.viewMode === 'map' && !e.target.closest('.node') && !e.target.closest('.radial-btn')) {
                 this.hideRadialMenu(true);
             }
        });

        window.addEventListener('resize', () => this.render());
    }
    
    // Helper: Only run fn if in Map Mode
    ifMap(e, fn) {
        if(this.viewMode === 'map') fn();
    }

    // --- ACTIONS ---
    setTab(tab) {
        this.activeTab = tab;
        this.renderSidebar();
    }

    setView(mode) {
        // CLEANUP: If changing to a new view that uses 'viewContent', we MUST clear it first
        if (this.viewMode !== mode) {
            // If we are leaving a non-map mode, or entering a non-map mode
            this.dom.viewContent.innerHTML = '';
        }

        this.viewMode = mode;
        
        // Update selection UI in sidebar
        const cards = document.querySelectorAll('.view-card');
        cards.forEach(c => c.classList.remove('active'));
        if(mode === 'map') cards[0].classList.add('active');
        if(mode === 'web') cards[1].classList.add('active');
        if(mode === 'tree') cards[2].classList.add('active');
        
        this.render();
    }

    triggerAI() {
        this.kernel.senseIntent().then(res => alert(res.content));
    }

    triggerDelete() {
        if(this.kernel.state.selectedId && confirm("Delete selected node?")) {
            this.kernel.deleteNode(this.kernel.state.selectedId);
        }
    }

    downloadWeb() {
        // Quick hack to trigger download on the Web Engine
        const engine = this.registry.get('web');
        const root = this.kernel.state.nodes.find(n => n.type === 'web-root') || this.kernel.state.nodes[0];
        const html = engine.generateHTML(root, this.kernel.state);
        const a = document.createElement('a');
        a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
        a.download = 'website_export.html';
        a.click();
    }

    // --- RENDER PIPELINE ---
    render() {
        const state = this.kernel.state;
        if(this.dom.title) this.dom.title.innerText = state.metadata.title;

        // 1. Sidebar Render
        this.renderSidebar();

        // 2. Viewport Render
        if (this.viewMode === 'map') {
            this.dom.viewMap.style.display = 'block';
            this.dom.viewContent.style.display = 'none';
            this.renderMap(state);
        } else {
            this.dom.viewMap.style.display = 'none';
            this.dom.viewContent.style.display = 'block';
            this.dom.radialMenu.style.display = 'none'; // Hide spatial menu
            
            // Delegate to Phase Engine
            const engine = this.registry.get(this.viewMode);
            if(engine) engine.render(this.dom.viewContent, state);
        }
    }

    renderSidebar() {
        // Toggle Panels
        document.getElementById('tab-props').classList.toggle('active', this.activeTab === 'properties');
        document.getElementById('tab-views').classList.toggle('active', this.activeTab === 'views');
        
        this.dom.panelProperties.style.display = this.activeTab === 'properties' ? 'block' : 'none';
        this.dom.panelViews.style.display = this.activeTab === 'views' ? 'block' : 'none';

        // Render Inspector (It handles its own Smart Rendering)
        if(this.activeTab === 'properties') {
            this.registry.get('inspector').render(this.dom.panelProperties, this.kernel.state);
        }
    }

    renderMap(state) {
        // World Transform
        this.dom.worldLayer.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
        
        // Nodes
        this.dom.worldLayer.innerHTML = '';
        state.nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = `node ${node.id === state.selectedId ? 'selected' : ''}`;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            el.innerHTML = `<div class="node-icon">${this.kernel.getBlueprint(node.type).icon}</div><div class="node-label">${node.title}</div>`;

            // Interactions
            const startDrag = (cx, cy) => {
                this.draggedNode = node;
                this.lastMouse = { x: cx, y: cy };
                this.kernel.selectNode(node.id);
            };
            el.addEventListener('mousedown', (e) => { e.stopPropagation(); if(e.button===0) startDrag(e.clientX, e.clientY); });
            el.addEventListener('touchstart', (e) => { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});
            
            // Hover Menu
            el.addEventListener('mouseenter', () => this.showRadialMenu(node, false)); 
            el.addEventListener('mouseleave', () => { if (!this.isMenuPinned) this.startHideTimer(); });
            
            el.onclick = (e) => {
                e.stopPropagation();
                if(this.kernel.linkingMode) {
                    this.kernel.addEdge(this.kernel.linkingSourceId, node.id);
                    this.exitLinkingMode();
                } else {
                    this.kernel.selectNode(node.id);
                    this.showRadialMenu(node, true);
                    // Ensure Properties tab is open to edit
                    this.setTab('properties');
                }
            };

            this.dom.worldLayer.appendChild(el);
        });

        // Edges
        this.dom.edgeSvg.innerHTML = '';
        state.edges.forEach(edge => {
            const s = state.nodes.find(n => n.id === edge.source);
            const t = state.nodes.find(n => n.id === edge.target);
            if (s && t) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                const sW = this.kernel.worldToScreen(s.x + 36, s.y + 36);
                const tW = this.kernel.worldToScreen(t.x + 36, t.y + 36);
                line.setAttribute("x1", sW.x); line.setAttribute("y1", sW.y);
                line.setAttribute("x2", tW.x); line.setAttribute("y2", tW.y);
                line.setAttribute("class", "edge-vis");
                this.dom.edgeSvg.appendChild(line);
            }
        });
    }

    // --- SHARED CONTROLLER LOGIC (Radial, Pointer) ---
    
    handlePointerDown(e) {
        if(this.viewMode !== 'map') return;
        if (e.target.closest('.node') || e.target.closest('.radial-btn')) return; 
        if (e.button === 0 || e.button === 1) {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.dom.viewport.style.cursor = 'grabbing';
            this.hideRadialMenu(true);
        }
    }
    
    handlePointerMove(e) {
        if(this.isDragging) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            this.kernel.state.viewport.x += dx;
            this.kernel.state.viewport.y += dy;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.render();
        } else if (this.draggedNode) {
            const v = this.kernel.state.viewport;
            const dx = (e.clientX - this.lastMouse.x) / v.scale;
            const dy = (e.clientY - this.lastMouse.y) / v.scale;
            this.kernel.updateNode(this.draggedNode.id, { x: this.draggedNode.x + dx, y: this.draggedNode.y + dy });
            this.lastMouse = { x: e.clientX, y: e.clientY };
            if(this.activeRadialNodeId === this.draggedNode.id) this.showRadialMenu(this.draggedNode, true);
        }
    }
    handlePointerUp() { this.isDragging = false; this.draggedNode = null; this.dom.viewport.style.cursor = 'grab'; }
    handleWheel(e) {
        e.preventDefault();
        const s = Math.exp(-e.deltaY * 0.001);
        this.kernel.state.viewport.scale = Math.max(0.1, Math.min(5, this.kernel.state.viewport.scale * s));
        this.render();
        this.hideRadialMenu(true);
    }
    handleTouchStart(e) {
        if(e.touches.length === 1 && !e.target.closest('.node')) {
             this.isDragging = true;
             this.lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
    }
    handleTouchMove(e) {
        if(this.isDragging && e.touches.length === 1) {
            e.preventDefault();
            const t = e.touches[0];
            const dx = t.clientX - this.lastMouse.x;
            const dy = t.clientY - this.lastMouse.y;
            this.kernel.state.viewport.x += dx;
            this.kernel.state.viewport.y += dy;
            this.lastMouse = { x: t.clientX, y: t.clientY };
            this.render();
        }
    }
    handleTouchEnd() { this.isDragging = false; }

    // Radial Menu
    showRadialMenu(node, pinned) {
        this.cancelHideTimer();
        if(this.activeRadialNodeId === node.id && this.dom.radialMenu.style.display === 'block') {
            if(pinned) this.isMenuPinned = true;
            return;
        }
        this.activeRadialNodeId = node.id;
        this.isMenuPinned = pinned;
        const menu = this.dom.radialMenu;
        const s = this.kernel.worldToScreen(node.x, node.y);
        menu.style.left = `${s.x+36-100}px`; menu.style.top = `${s.y+36-100}px`;
        menu.style.display = 'block';
        
        // Using global SC reference for string onclicks
        menu.innerHTML = `
            <div class="radial-btn r-top" onclick="SC.actionEdit()">📝</div>
            <div class="radial-btn r-right" onclick="SC.actionLink()">🔗</div>
            <div class="radial-btn r-bottom" onclick="SC.actionAddChild()">➕</div>
            <div class="radial-btn r-left" onclick="SC.actionDelete()">🗑️</div>
        `;
    }
    
    hideRadialMenu(force) {
        if(this.isMenuPinned && !force) return;
        this.dom.radialMenu.style.display = 'none';
        this.activeRadialNodeId = null;
        this.isMenuPinned = false;
    }
    startHideTimer() { this.cancelHideTimer(); this.menuHideTimer = setTimeout(() => this.hideRadialMenu(), 300); }
    cancelHideTimer() { if(this.menuHideTimer) clearTimeout(this.menuHideTimer); }
    
    actionEdit() { this.kernel.selectNode(this.activeRadialNodeId); this.setTab('properties'); this.hideRadialMenu(true); }
    actionLink() { this.kernel.linkingMode = true; this.kernel.linkingSourceId = this.activeRadialNodeId; this.dom.overlay.classList.add('active'); this.hideRadialMenu(true); }
    actionAddChild() { 
        const p = this.kernel.state.nodes.find(n => n.id === this.activeRadialNodeId);
        if(p) { const n = this.kernel.addNode({x:p.x, y:p.y, title:"Child"}); this.kernel.addEdge(p.id, n.id); this.hideRadialMenu(true); }
    }
    actionDelete() { if(confirm("Delete?")) { this.kernel.deleteNode(this.activeRadialNodeId); this.hideRadialMenu(true); } }
    exitLinkingMode() { this.kernel.linkingMode = false; this.dom.overlay.classList.remove('active'); }
}
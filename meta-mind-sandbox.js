/**
 * META-MIND SANDBOX CONTROLLER v3.2
 * Handles Mouse, Touch, Radial Menus (Hover/Click), and Rendering.
 * Updated to use new Kernel Auto-Layout features.
 */

class SandboxController {
    constructor(kernel, registry) {
        this.kernel = kernel;
        this.registry = registry;
        
        // DOM Caches
        this.dom = {
            stage: document.getElementById('stage'),
            viewport: document.getElementById('viewport'),
            world: document.getElementById('world-layer'),
            edgeSvg: document.getElementById('edge-svg'),
            inspector: document.getElementById('inspector-content'),
            phaseList: document.getElementById('phase-list'),
            radialMenu: document.getElementById('radial-menu'),
            overlay: document.getElementById('linking-overlay'),
            title: document.getElementById('map-title')
        };

        // State
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.draggedNode = null;
        this.activeRadialNodeId = null;
        
        // Menu Timer State
        this.menuHideTimer = null;
        this.isMenuPinned = false; 

        // Bind Methods
        this.render = this.render.bind(this);
        this.handleResize = this.handleResize.bind(this);
        
        // Init
        this.initEvents();
        this.kernel.subscribe(this.render);
        this.render();
    }

    initEvents() {
        const vp = this.dom.viewport;

        // Pointer Events
        vp.addEventListener('mousedown', (e) => this.handlePointerDown(e));
        window.addEventListener('mousemove', (e) => this.handlePointerMove(e));
        window.addEventListener('mouseup', (e) => this.handlePointerUp(e));
        vp.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });

        // Touch specific
        vp.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
        vp.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
        vp.addEventListener('touchend', (e) => this.handleTouchEnd(e));

        window.addEventListener('resize', this.handleResize);
        
        // Global Click to close pinned menu
        vp.addEventListener('click', (e) => {
            if(!e.target.closest('.node') && !e.target.closest('.radial-btn')) {
                this.hideRadialMenu(true);
            }
        });

        const menu = this.dom.radialMenu;
        menu.addEventListener('mouseenter', () => this.cancelHideTimer());
        menu.addEventListener('mouseleave', () => {
            if (!this.isMenuPinned) this.startHideTimer();
        });
    }

    // --- RADIAL MENU LOGIC ---
    showRadialMenu(node, pinned = false) {
        this.cancelHideTimer();
        if (this.activeRadialNodeId === node.id && this.dom.radialMenu.style.display === 'block') {
            if(pinned) this.isMenuPinned = true;
            return;
        }

        this.activeRadialNodeId = node.id;
        this.isMenuPinned = pinned;
        const menu = this.dom.radialMenu;
        
        const screenPos = this.kernel.worldToScreen(node.x, node.y);
        const left = (screenPos.x + 36) - 100;
        const top = (screenPos.y + 36) - 100;

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.display = 'block';
        
        menu.innerHTML = `
            <div class="radial-btn r-top" title="Edit" onclick="SC.actionEdit()">📝</div>
            <div class="radial-btn r-right" title="Link" onclick="SC.actionLink()">🔗</div>
            <div class="radial-btn r-bottom" title="Add Child" onclick="SC.actionAddChild()">➕</div>
            <div class="radial-btn r-left" title="Delete" onclick="SC.actionDelete()">🗑️</div>
        `;
    }

    hideRadialMenu(force = false) {
        if (this.isMenuPinned && !force) return;
        this.dom.radialMenu.style.display = 'none';
        this.activeRadialNodeId = null;
        this.isMenuPinned = false;
    }

    startHideTimer() {
        this.cancelHideTimer();
        this.menuHideTimer = setTimeout(() => {
            this.hideRadialMenu();
        }, 300);
    }

    cancelHideTimer() {
        if (this.menuHideTimer) {
            clearTimeout(this.menuHideTimer);
            this.menuHideTimer = null;
        }
    }

    // --- RADIAL ACTIONS ---
    actionEdit() {
        this.kernel.selectNode(this.activeRadialNodeId);
        this.registry.setActive('universal');
        this.render();
        this.hideRadialMenu(true);
    }

    actionLink() {
        this.kernel.linkingMode = true;
        this.kernel.linkingSourceId = this.activeRadialNodeId;
        this.dom.overlay.classList.add('active');
        this.hideRadialMenu(true);
    }

    actionAddChild() {
        const parent = this.kernel.state.nodes.find(n => n.id === this.activeRadialNodeId);
        if(parent) {
            // Kernel handles Layout & Focus automatically now
            const newNode = this.kernel.addNode({
                x: parent.x,
                y: parent.y, // Kernel will override this with autoLayout
                title: "New Child"
            });
            this.kernel.addEdge(parent.id, newNode.id);
            this.hideRadialMenu(true);
        }
    }

    actionDelete() {
        if(confirm("Delete node?")) {
            this.kernel.deleteNode(this.activeRadialNodeId);
            this.hideRadialMenu(true);
        }
    }

    // --- POINTER HANDLERS ---
    handlePointerDown(e) {
        if (e.target.closest('.node') || e.target.closest('.radial-btn')) return; 
        if (e.button === 0 || e.button === 1) {
            this.isDragging = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.dom.viewport.style.cursor = 'grabbing';
            this.hideRadialMenu(true);
        }
    }

    handlePointerMove(e) {
        if (this.isDragging) {
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
            this.kernel.updateNode(this.draggedNode.id, {
                x: this.draggedNode.x + dx,
                y: this.draggedNode.y + dy
            });
            this.lastMouse = { x: e.clientX, y: e.clientY };
            if(this.activeRadialNodeId === this.draggedNode.id) {
                this.showRadialMenu(this.draggedNode, true); 
            }
        }
    }

    handlePointerUp() {
        this.isDragging = false;
        this.draggedNode = null;
        this.dom.viewport.style.cursor = 'grab';
    }

    handleWheel(e) {
        e.preventDefault();
        const s = Math.exp(-e.deltaY * 0.001);
        this.kernel.state.viewport.scale = Math.max(0.1, Math.min(5, this.kernel.state.viewport.scale * s));
        this.render();
        this.hideRadialMenu(true);
    }
    
    // --- TOUCH HANDLERS ---
    handleTouchStart(e) {
        if(e.touches.length === 1) {
             const touch = e.touches[0];
             if(!e.target.closest('.node') && !e.target.closest('.radial-btn')) {
                 this.isDragging = true;
                 this.lastMouse = { x: touch.clientX, y: touch.clientY };
             }
        }
    }
    
    handleTouchMove(e) {
        if(this.isDragging && e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];
            const dx = touch.clientX - this.lastMouse.x;
            const dy = touch.clientY - this.lastMouse.y;
            this.kernel.state.viewport.x += dx;
            this.kernel.state.viewport.y += dy;
            this.lastMouse = { x: touch.clientX, y: touch.clientY };
            this.render();
        }
    }
    
    handleTouchEnd() { this.isDragging = false; }


    // --- RENDER ---
    render() {
        const state = this.kernel.state;
        if(this.dom.title) this.dom.title.innerText = state.metadata.title;

        this.registry.renderActive(this.dom.inspector, state);
        this.renderPhaseList();

        // Nodes
        this.dom.world.innerHTML = '';
        state.nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = `node ${node.id === state.selectedId ? 'selected' : ''}`;
            el.style.left = `${node.x}px`;
            el.style.top = `${node.y}px`;
            
            const bp = this.kernel.getBlueprint(node.type);
            el.innerHTML = `<div class="node-icon">${bp.icon}</div><div class="node-label">${node.title}</div>`;

            // Node Interaction
            const startDrag = (cx, cy) => {
                this.draggedNode = node;
                this.lastMouse = { x: cx, y: cy };
                this.kernel.selectNode(node.id);
            };

            el.addEventListener('mousedown', (e) => { e.stopPropagation(); if(e.button === 0) startDrag(e.clientX, e.clientY); });
            el.addEventListener('touchstart', (e) => { e.stopPropagation(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, {passive:false});

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
                }
            };

            this.dom.world.appendChild(el);
        });

        // Edges
        this.dom.edgeSvg.innerHTML = '';
        state.edges.forEach(edge => {
            const source = state.nodes.find(n => n.id === edge.source);
            const target = state.nodes.find(n => n.id === edge.target);
            if (source && target) {
                const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
                const sW = this.kernel.worldToScreen(source.x + 36, source.y + 36);
                const tW = this.kernel.worldToScreen(target.x + 36, target.y + 36);
                line.setAttribute("x1", sW.x); line.setAttribute("y1", sW.y);
                line.setAttribute("x2", tW.x); line.setAttribute("y2", tW.y);
                line.setAttribute("class", "edge-vis");
                this.dom.edgeSvg.appendChild(line);
            }
        });

        this.dom.world.style.transform = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
    }

    renderPhaseList() {
        if(!this.dom.phaseList) return;
        this.dom.phaseList.innerHTML = this.registry.engines.map(eng => `
            <div class="phase-option ${this.registry.activeEngineId === eng.id ? 'active' : ''}" data-id="${eng.id}">
                <span class="text-xl">${eng.icon}</span>
                <div class="flex flex-col"><span class="text-xs font-bold text-slate-700">${eng.label}</span></div>
            </div>
        `).join('');
        this.dom.phaseList.querySelectorAll('.phase-option').forEach(el => {
            el.addEventListener('click', () => { this.registry.setActive(el.dataset.id); this.render(); });
        });
    }

    exitLinkingMode() {
        this.kernel.linkingMode = false;
        this.kernel.linkingSourceId = null;
        this.dom.overlay.classList.remove('active');
    }

    centerView() { this.kernel.autoLayout(); } 
    handleResize() { this.render(); }
}
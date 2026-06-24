/**
 * META-MIND SANDBOX CONTROLLER v14.11
 * Features: Spatial Search, Auto-Parent Expansion, and Highlighting.
 */

class SandboxController {
    constructor(kernel, registry) {
        this.kernel = kernel;
        this.registry = registry;

        if (!this.kernel.state.session) {
            this.kernel.state.session = { viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }, selectedId: null, remoteTemplates: [] };
        }

        this.dom = {
            viewport: document.getElementById('viewport'),
            worldLayer: document.getElementById('world-layer'),
            edgeSvg: document.getElementById('edge-svg'),
            overlay: document.getElementById('linking-overlay'),
            panelProperties: document.getElementById('panel-properties'), 
            viewMap: document.getElementById('view-map'),
            viewContent: document.getElementById('view-content'),
            sidebar: document.getElementById('sidebar')
        };

        this.dom.edgeSvg.style.overflow = 'visible';

        this.viewMode = 'map';
        this.isDragging = false;
        this.lastMouse = { x: 0, y: 0 };
        this.clickStart = { x: 0, y: 0 }; 
        this.draggedNode = null;
        this.activeRadialNodeId = null;
        this.userHasPanned = false;
        
        // NEW: Tracks what to highlight in the inspector
        this.activeSearchHighlight = null; 
        
        this.activePointers = new Map();
        this.lastPinchDist = null;
        this.lastPinchCenter = null;

        this.ensureDomElements();
        
        if (window.innerWidth > 768) {
            this.dom.sidebar.classList.add('open');
        } else {
            this.dom.sidebar.classList.remove('open');
        }

        this.initEvents(); 
        
        setTimeout(() => this.actionLoadRemoteTemplates(), 200);

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

    escapeHTML(str) { 
        if(!str) return '';
        const d = document.createElement('div'); 
        d.textContent = str; 
        return d.innerHTML; 
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

        // --- GLOBAL ESCAPE HANDLER (CASCADING CLOSE) ---
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                // 1. Close Tutorial Menu Modal
                if (window.Tutorials && window.Tutorials.modalElement && !window.Tutorials.modalElement.classList.contains('hidden')) {
                    window.Tutorials.closeTutorialModal();
                    return;
                }
                // 2. Close AI Chat
                if (window.AI && window.AI.isVisible) {
                    window.AI.hideChat();
                    return;
                }
                // 3. Close Inspector Sidebar
                if (this.dom.sidebar && this.dom.sidebar.classList.contains('open')) {
                    this.closeSidebar();
                    return;
                }
            }
        });

        // --- WEB EDIT MODE MESSAGE LISTENER ---
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'mm-select-node' && e.data.id) {
                if (this.kernel.webEditMode) {
                    this.actionEdit(e.data.id);
                }
            }
        });

        // --- WEB EDIT BUTTON LOGIC ---
        const webEditBtn = document.getElementById('btn-web-edit');
        if (webEditBtn) {
            webEditBtn.addEventListener('click', () => {
                this.kernel.webEditMode = !this.kernel.webEditMode;
                webEditBtn.classList.toggle('bg-sky-600', this.kernel.webEditMode);
                webEditBtn.classList.toggle('bg-slate-800', !this.kernel.webEditMode);
                webEditBtn.classList.toggle('text-white', this.kernel.webEditMode);
                webEditBtn.classList.toggle('text-slate-400', !this.kernel.webEditMode);
                this.render();
            });
        }

        // --- MAP SEARCH BAR LOGIC ---
        const searchInput = document.getElementById('map-search-input');
        const searchResults = document.getElementById('map-search-results');
        
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                if (!query) {
                    searchResults.classList.add('hidden');
                    searchResults.classList.remove('flex');
                    return;
                }
                
                const results = this.kernel.state.nodes.filter(n => 
                    (n.title && n.title.toLowerCase().includes(query)) || 
                    (n.content && n.content.toLowerCase().includes(query)) ||
                    (n.type && n.type.toLowerCase().includes(query))
                );
                
                searchResults.innerHTML = '';
                if (results.length === 0) {
                    searchResults.innerHTML = '<div class="text-xs text-slate-500 text-center py-2">No matches found in active map.</div>';
                } else {
                    results.forEach(n => {
                        const div = document.createElement('div');
                        div.className = 'p-2 hover:bg-slate-800 rounded cursor-pointer transition-colors border border-transparent hover:border-slate-700 flex flex-col gap-1';
                        
                        let matchWhere = 'title';
                        if (n.content && n.content.toLowerCase().includes(query) && !(n.title && n.title.toLowerCase().includes(query))) {
                            matchWhere = 'content';
                        }
                        
                        div.innerHTML = `<div class="text-xs font-bold text-sky-400">${this.escapeHTML(n.title)} <span class="text-[9px] text-slate-500 uppercase ml-1">${n.type}</span></div>
                                         <div class="text-[10px] text-slate-400 truncate">${this.escapeHTML(n.content || '')}</div>`;
                        
                        div.onclick = () => {
                            searchInput.value = '';
                            searchResults.classList.add('hidden');
                            searchResults.classList.remove('flex');
                            
                            // 1. Force Uncollapse Parents if hidden
                            let currentId = n.id;
                            while (true) {
                                const parentConn = this.kernel.state.connections.find(c => c.to === currentId && c.type === 'structural');
                                if (!parentConn) break;
                                const parentNode = this.kernel.state.nodes.find(p => p.id === parentConn.from);
                                if (parentNode) {
                                    parentNode.data.collapsed = false;
                                    currentId = parentNode.id;
                                } else break;
                            }

                            // 2. Set Focus and Highlight
                            this.activeSearchHighlight = { nodeId: n.id, field: matchWhere, query: query };
                            this.userHasPanned = false; // Forces camera to glide to node!
                            
                            this.actionEdit(n.id);
                            
                            // Slight delay ensures the UI picks up the highlight state in case it was fast-diffed
                            setTimeout(() => this.render(), 50);
                        };
                        searchResults.appendChild(div);
                    });
                }
                searchResults.classList.remove('hidden');
                searchResults.classList.add('flex');
            });

            // Hide results when clicking outside
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                    searchResults.classList.add('hidden');
                    searchResults.classList.remove('flex');
                }
            });
        }
    }

    toggleSidebar() {
        if (this.dom.sidebar) {
            this.dom.sidebar.classList.toggle('open');
        }
    }
    
    setView(mode) {
        this.viewMode = mode;
        const btns = document.querySelectorAll('.phase-btn');
        btns.forEach(b => b.classList.remove('active'));
        const btn = document.getElementById(`btn-phase-${mode}`);
        if (btn) btn.classList.add('active');
        if (window.innerWidth <= 768 && this.dom.sidebar && this.dom.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }

        const webEditBtn = document.getElementById('btn-web-edit');
        if (webEditBtn) {
            if (mode === 'web') {
                webEditBtn.classList.remove('hidden');
                webEditBtn.classList.add('flex');
            } else {
                webEditBtn.classList.add('hidden');
                webEditBtn.classList.remove('flex');
                this.kernel.webEditMode = false;
                webEditBtn.classList.remove('bg-sky-600', 'text-white');
                webEditBtn.classList.add('bg-slate-800', 'text-slate-400');
            }
        }

        this.render();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        if (!this.kernel.state.session) return;

        const focalId = this.kernel.state.session.selectedId;

        if (focalId && this.viewMode === 'map') {
            const node = this.kernel.state.nodes.find(n => n.id === focalId);
            if (node) this.updateMenuPosition(node);
            else this.hideRadialMenu(true);
        } else {
            this.hideRadialMenu(true);
        }

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

    handlePointerDown(e) {
        if (this.viewMode !== 'map') return;
        if (window.innerWidth <= 768 && this.dom.sidebar && this.dom.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
        
        // Ignore clicks on floating UI that shouldn't deselect the map
        if (e.target.closest('#ai-chat-container')) return;

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
        if (this.activePointers.has(e.pointerId)) this.activePointers.delete(e.pointerId);
        if (this.activePointers.size < 2) { this.lastPinchDist = null; this.lastPinchCenter = null; }
        if (this.activePointers.size === 0) {
            if (this.isDragging) {
                const dist = Math.hypot(e.clientX - this.clickStart.x, e.clientY - this.clickStart.y);
                if (dist < 5) {
                    
                    // Cancel Modes on background click
                    if (this.kernel.linkingMode) {
                        this.kernel.linkingMode = false;
                        this.dom.overlay.classList.add('hidden');
                    }
                    if (this.aiImportMode) {
                        this.aiImportMode = false;
                        this.aiPendingData = null;
                        if(this.dom.aiOverlay) this.dom.aiOverlay.classList.add('hidden');
                    }

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
        const stateHash = `${node.id}-${isLinking}-${this.kernel.linkingSourceId === node.id}-${this.aiImportMode}`;

        if (menu.dataset.activeNode === stateHash && menu.innerHTML !== '') {
            menu.classList.add('active'); 
            if (!menu.classList.contains('ready')) {
                setTimeout(() => { if (menu.dataset.activeNode === stateHash) menu.classList.add('ready'); }, 300);
            }
            return;
        }
        
        menu.dataset.activeNode = stateHash;
        menu.classList.remove('active'); 
        menu.classList.remove('ready'); 

        const off = 80;
        const isCollapsed = node.data.collapsed;

        let linkTitle = 'Link to Node';
        if (isLinking) {
            linkTitle = (node.id === this.kernel.linkingSourceId) ? 'Cancel Link' : 'Confirm Link';
        }

        let actions = [];

        // NEW: Intercept menu if AI Import Mode is active and target is a Smart Portal
        if (this.aiImportMode) {
            if (node.type === 'smart-portal') {
                actions = [ { icon: '📥', action: 'ResolveAiImport', title: 'Inject AI Data Here' } ];
            } else {
                actions = [ { icon: '❌', action: 'CancelAiImport', title: 'Cancel AI Import' } ];
            }
        } else {
            // Normal Operations
            actions = [
                { icon: '📝', action: 'Edit', title: 'Edit' },
                { icon: '🔗', action: 'Link', title: linkTitle },
                { icon: '➕', action: 'AddChild', title: 'Add Child' },
                { icon: '🗑️', action: 'Delete', title: 'Delete Downstream' },
                { icon: (isCollapsed ? '🌞' : '🌚'), action: 'ToggleCollapse', title: (isCollapsed ? 'Expand' : 'Collapse') }
            ];
            if (node.type === 'portal') actions.push({ icon: '🌀', action: 'EnterPortal', title: 'Enter' });
            else actions.push({ icon: '🌌', action: 'SaveConstellation', title: 'Save Submap' });
        }

        let html = '';
        actions.forEach((action, i) => {
            const angle = -Math.PI / 2 + (i * (2 * Math.PI / actions.length));
            const tx = Math.cos(angle) * off;
            const ty = Math.sin(angle) * off;
            
            let btnStyle = `left:0; top:0; margin-left:-22px; margin-top:-22px; position:absolute; --tx: ${tx}px; --ty: ${ty}px;`;
            
            if (action.action === 'Link' && isLinking) {
                if (node.id === this.kernel.linkingSourceId) {
                    btnStyle += ` color: #ef4444; border-color: #ef4444; box-shadow: 0 0 15px rgba(239,68,68,0.6);`;
                } else {
                    btnStyle += ` color: #10b981; border-color: #10b981; box-shadow: 0 0 15px rgba(16,185,129,0.6);`;
                }
            } else if (action.action === 'ResolveAiImport') {
                btnStyle += ` color: #818cf8; border-color: #818cf8; box-shadow: 0 0 15px rgba(79,70,229,0.6); animation: pulse 2s infinite;`;
            }

            html += `<div class="radial-btn" style="${btnStyle}" onpointerdown="event.stopPropagation()" onclick="SC.action${action.action}('${node.id}'); event.stopPropagation();" title="${action.title}">${action.icon}</div>`;
        });
        menu.innerHTML = html;

        requestAnimationFrame(() => {
            menu.classList.add('active'); 
            setTimeout(() => {
                if (menu.dataset.activeNode === stateHash) {
                    menu.classList.add('ready');
                }
            }, 300);
        });
    }

    hideRadialMenu(force) {
        if (force) {
            this.dom.radialMenu.classList.remove('active');
            this.dom.radialMenu.classList.remove('ready'); 
            
            setTimeout(() => {
                if (!this.dom.radialMenu.classList.contains('active')) {
                    this.dom.radialMenu.style.display = 'none';
                    this.dom.radialMenu.innerHTML = ''; 
                    this.dom.radialMenu.dataset.activeNode = '';
                }
            }, 300);
        }
    }

    // --- AI WORKFLOW API ---
    enterAiImportMode(mapData) {
        this.aiImportMode = true;
        this.aiPendingData = mapData;
        if (this.dom.aiOverlay) this.dom.aiOverlay.classList.remove('hidden');
        this.render(); // Trigger render to show halos
    }

    actionCancelAiImport() {
        this.aiImportMode = false;
        this.aiPendingData = null;
        if (this.dom.aiOverlay) this.dom.aiOverlay.classList.add('hidden');
        this.hideRadialMenu(true);
        this.render(); // Remove halos
    }

    actionResolveAiImport(nodeId) {
        if (!this.aiPendingData) return;
        
        // Save the map to the library natively so the portal can reference it!
        this.kernel.saveConstellationToLibrary(this.aiPendingData);
        
        // Update the smart portal's payload to link to this new map
        this.kernel.updateNode(nodeId, { content: this.aiPendingData.map_id });
        
        // Actually import the physical nodes
        this.kernel.importSubmap(nodeId, this.aiPendingData);
        
        alert(`AI Generated Map "${this.aiPendingData.meta.title}" injected successfully!`);
        
        // Cleanup
        this.actionCancelAiImport();
        this.kernel.selectNode(nodeId);
    }

    actionEdit(id) { 
        const tgt = id || this.kernel.state.session.selectedId; 
        this.kernel.selectNode(tgt); 
        if (this.dom.sidebar && !this.dom.sidebar.classList.contains('open')) {
            this.toggleSidebar();
        }
    }
    
    actionLink(id) { 
        const tgt = id || this.kernel.state.session.selectedId; 
        if (this.kernel.linkingMode) {
            if (this.kernel.linkingSourceId !== tgt) {
                this.kernel.addConnection(this.kernel.linkingSourceId, tgt, 'association');
            }
            this.kernel.linkingMode = false;
            this.dom.overlay.classList.add('hidden');
            this.render(); 
        } else {
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
        if (node && (node.type === 'portal' || node.type === 'smart-portal')) {
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

    actionLoadRemoteTemplates() {
        this.kernel.loadRemoteTemplates();
    }
    
    async actionApplyTemplateToNode(nodeId, tplId) {
        try {
            const tplData = await this.kernel.bridge.fetchTemplateData(tplId);
            this.kernel.applyTemplateToNode(nodeId, tplData);
            alert(`Template "${tplData.meta.title}" applied!`);
            this.setView('map');
        } catch (e) {
            alert("Failed to apply template.");
            console.error(e);
        }
    }
    
    actionUpdateProfileField(nodeId, field, value) {
        this.kernel.updateProfileField(nodeId, field, value);
    }

    async processMapImport(parsedData, target) {
        let maps = Array.isArray(parsedData) ? parsedData : [parsedData];
        let added = 0, skipped = 0, overwritten = 0;

        for (let newMap of maps) {
            if (!newMap.map_id || !newMap.nodes) continue;

            let existingMaps = [];
            if (target === 'template') {
                existingMaps = typeof MetaMindLibrary !== 'undefined' ? MetaMindLibrary.getCustomTemplates() : [];
            } else {
                existingMaps = this.kernel.getLibrary();
            }

            let existing = existingMaps.find(m => m.map_id === newMap.map_id);

            if (existing) {
                let existingStr = JSON.stringify(existing);
                let newStr = JSON.stringify(newMap);
                if (existingStr === newStr) { skipped++; continue; }

                let msg = `Conflict: A map titled "${newMap.meta?.title || newMap.map_id}" already exists.\nOverwrite existing map?`;
                if (confirm(msg)) {
                    if (target === 'template') MetaMindLibrary.saveCustomTemplate(newMap);
                    else {
                        let lib = this.kernel.getLibrary();
                        let idx = lib.findIndex(m => m.map_id === newMap.map_id);
                        if (idx > -1) lib[idx] = newMap;
                        else lib.push(newMap);
                        localStorage.setItem("mm_constellation_lib", JSON.stringify(lib));
                    }
                    overwritten++;
                } else { skipped++; }
            } else {
                if (target === 'template') MetaMindLibrary.saveCustomTemplate(newMap);
                else {
                    let lib = this.kernel.getLibrary();
                    lib.push(newMap);
                    localStorage.setItem("mm_constellation_lib", JSON.stringify(lib));
                }
                added++;
            }
        }

        alert(`Import Complete:\n✅ ${added} Added\n🔄 ${overwritten} Overwritten\n⏭️ ${skipped} Skipped`);
        if (target === 'template') this.actionLoadRemoteTemplates();
        else this.render();
    }

    actionUploadTemplateFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try { const parsed = JSON.parse(e.target.result); await this.processMapImport(parsed, 'template'); } 
            catch (err) { alert("Invalid JSON format."); }
        };
        reader.readAsText(file);
        event.target.value = ''; 
    }

    actionUploadLibraryFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try { const parsed = JSON.parse(e.target.result); await this.processMapImport(parsed, 'constellation'); } 
            catch (err) { alert("Invalid JSON format."); }
        };
        reader.readAsText(file);
        event.target.value = ''; 
    }

    async actionDownloadTemplate(id) {
        try {
            const tplData = await this.kernel.bridge.fetchTemplateData(id);
            const json = JSON.stringify(tplData, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            let safeTitle = (tplData.meta?.title || id).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `meta_mind_template_${safeTitle}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) { alert("Failed to download template."); }
    }

    actionDeleteRemoteTemplate(id) {
        if(confirm("Permanently delete this custom template?")) {
            if (typeof MetaMindLibrary !== 'undefined') {
                if (MetaMindLibrary.deleteCustomTemplate(id)) this.actionLoadRemoteTemplates(); 
            }
        }
    }

    async actionSpawnTemplate(tplId) {
        try {
            const tplData = await this.kernel.bridge.fetchTemplateData(tplId);
            this.kernel.saveConstellationToLibrary(tplData);
            
            const vp = this.kernel.state.session.viewport;
            const rect = this.dom.viewport.getBoundingClientRect();
            const center_x = (rect.width / 2 - vp.x) / vp.scale;
            const center_y = (rect.height / 2 - vp.y) / vp.scale;

            const portal = this.kernel.addNode({ type: 'portal', title: tplData.meta.title, content: tplData.map_id, x: center_x, y: center_y });
            this.kernel.importSubmap(portal.id, tplData);
            alert(`Template imported successfully!`);
            this.setView('map');
            this.kernel.selectNode(portal.id);
        } catch (e) { alert("Failed to spawn template."); }
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
        if(map) { this.kernel.loadMapState(map); this.setView('map'); }
    }
    
    actionDeleteFromLibrary(id) {
        if(confirm("Permanently delete this saved constellation?")) { this.kernel.deleteFromLibrary(id); this.render(); }
    }

    actionDownloadLibrary() {
        const lib = this.kernel.getLibrary();
        if (!lib || lib.length === 0) { alert("Your library is empty."); return; }
        const json = JSON.stringify(lib, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `meta_mind_library_export.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    actionDownloadSingleConstellation(id) {
        const lib = this.kernel.getLibrary();
        const map = lib.find(m => m.map_id === id);
        if (!map) return;
        const json = JSON.stringify(map, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        let safeTitle = (map.meta?.title || id).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        a.download = `meta_mind_map_${safeTitle}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    actionUpdateLibraryItem(id) {
        const titleInput = document.getElementById(`lib-title-${id}`);
        const notesInput = document.getElementById(`lib-notes-${id}`);
        const sharedInput = document.getElementById(`lib-shared-${id}`);
        if(titleInput) {
            this.kernel.updateLibraryItem(id, { title: titleInput.value, notes: notesInput.value, shared: sharedInput.checked });
            alert("Details Saved.");
            this.render();
        }
    }

    actionSyncJson() {
        try {
            const val = document.getElementById('json-exchange').value;
            this.kernel.loadMapState(JSON.parse(val));
            alert("Mapstate Applied Successfully.");
        } catch (e) { alert("Invalid JSON format."); }
    }

    actionCopyJson() {
        const val = document.getElementById('json-exchange');
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(val.value).then(() => alert("Copied to clipboard.")).catch(() => {
                val.select(); document.execCommand('copy'); alert("Copied to clipboard.");
            });
        } else {
            val.select(); document.execCommand('copy'); alert("Copied to clipboard.");
        }
    }
    
    actionSaveEndpoints() {
        this.kernel.bridge.pushUrl = document.getElementById('api-push-url').value;
        this.kernel.bridge.pullUrl = document.getElementById('api-pull-url').value;
        alert(`Endpoints mapped temporarily.`);
    }
    actionPushApi() { alert(`POST to ${this.kernel.bridge.pushUrl}`); }
    actionPullApi() { alert(`GET from ${this.kernel.bridge.pullUrl}`); }
    
    actionExportJsonFile() {
        const json = this.kernel.exportMapState();
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `metamind_active_map_${this.kernel.state.map_id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    actionImportJsonFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try { this.kernel.loadMapState(JSON.parse(e.target.result)); alert("Mapstate Imported."); this.render(); } 
            catch (err) { alert("Invalid JSON file."); }
        };
        reader.readAsText(file);
        event.target.value = ''; 
    }

    render() {
        const inspector = this.registry.get('inspector');
        if (inspector && this.dom.panelProperties) inspector.render(this.dom.panelProperties, this.kernel.state);

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

    renderMap(state) {
        if (!state.nodes || !state.session) return;
        this.updateTransform();

        const selId = state.session.selectedId;

        const visibleNodes = new Set();
        state.nodes.forEach(n => visibleNodes.add(n.id));

        state.nodes.forEach(n => {
            if (n.data.collapsed) {
                const queue = [n.id];
                while(queue.length > 0) {
                    const curr = queue.shift();
                    const kids = state.connections.filter(c => c.from === curr && c.type === 'structural').map(c => c.to);
                    kids.forEach(k => { visibleNodes.delete(k); queue.push(k); });
                }
            }
        });

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

        this.dom.worldLayer.innerHTML = '';
        state.nodes.forEach(node => {
            if (!visibleNodes.has(node.id)) return;

            const el = document.createElement('div');
            el.className = `node ${node.id === selId ? 'selected' : ''}`;
            el.style.left = `${node.data.x}px`;
            el.style.top = `${node.data.y}px`;
            el.dataset.nodeId = node.id;
            
            if (node.data.isCore) el.style.borderColor = '#ea580c';
            if (node.type === 'portal' || node.type === 'smart-portal') {
                el.style.borderColor = '#a855f7';
                if (this.aiImportMode && node.type === 'smart-portal') {
                    el.style.boxShadow = "0 0 25px rgba(129,140,248, 0.8)";
                    el.classList.add('animate-pulse');
                }
            }
            if (node.data.collapsed) el.classList.add('collapsed');
            
            const bp = this.kernel.getBlueprint(node.type);
            el.innerHTML = `<div class="node-icon">${bp.icon}</div><div class="node-label">${node.title}</div>`;

            if (node.data.collapsed) {
                const children = state.connections
                    .filter(c => c.from === node.id && c.type === 'structural')
                    .map(c => state.nodes.find(n => n.id === c.to));
                
                children.forEach((child, i) => {
                    if(!child) return;
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
                        this.kernel.updateNode(node.id, { data: { ...node.data, collapsed: false }});
                        this.kernel.selectNode(child.id);
                    };
                    el.appendChild(moon);
                });
            }

            let startX = 0, startY = 0;
            el.onpointerdown = (e) => {
                if(e.target.closest('.radial-btn') || e.target.closest('.moon-btn')) return; 
                e.stopPropagation();
                el.setPointerCapture(e.pointerId);
                startX = e.clientX; startY = e.clientY;
                this.draggedNode = node;
                this.lastMouse = { x: e.clientX, y: e.clientY };
                
                this.kernel.selectNode(node.id);
                this.userHasPanned = false; 
            };
            
            el.onpointerup = (e) => {
                if(e.target.closest('.radial-btn') || e.target.closest('.moon-btn')) return;
                e.stopPropagation();
                el.releasePointerCapture(e.pointerId);
                this.draggedNode = null;
                const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
                
                if (dist < 5) {
                    if (window.innerWidth <= 768 && this.dom.sidebar && !this.dom.sidebar.classList.contains('open')) {
                        this.toggleSidebar();
                    }
                }
            };

            this.dom.worldLayer.appendChild(el);
            
            if (selId === node.id) {
                this.showRadialMenu(node);
            }
        });
    }
}
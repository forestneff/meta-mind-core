/**
 * META-MIND CORE KERNEL v14.10
 * Features: Template-to-Node Application, Profile Singleton, CMS Data Syncing.
 */

class HostBridge {
    constructor() { 
        this.pushUrl = "http://localhost:8000/api/push"; 
        this.pullUrl = "http://localhost:8000/api/pull";
        this.isConnected = false; 
    }
    async checkConnection() { return false; }
    async sync(mapState) { }

    async fetchTemplates() {
        try {
            if (typeof MetaMindLibrary !== 'undefined') return await MetaMindLibrary.getManifest();
            throw new Error("Library missing.");
        } catch (e) {
            console.warn(e);
            return [
                { id: "tpl_web_standard", target_type: "web-root", title: "Standard Landing Page (Fallback)", desc: "Responsive web layout.", nodes: 13 }
            ];
        }
    }

    async fetchTemplateData(id) {
        try {
            if (typeof MetaMindLibrary !== 'undefined') return await MetaMindLibrary.getTemplateData(id);
            throw new Error("Library missing.");
        } catch (e) {
            console.error(e);
            return { map_id: id, meta: { title: `Fallback: ${id}` }, nodes: [], connections: [], submaps: [] };
        }
    }
}

class MetaMindKernel {
    constructor() {
        this.config = { autoSaveInterval: 2000, autoFocus: true };
        this.bridge = new HostBridge();
        
        this.listeners = [];
        this.history = [];
        this.linkingMode = false;
        this.linkingSourceId = null;

        const rawState = this.loadFromStorage();
        this.state = this.ensureSchema(rawState);
        this.lastSaveState = JSON.stringify(this.state);

        if (this.state.nodes.length === 0) {
            this.addNode({ type: "root", title: "Universe Root", data: { x: 0, y: 0, isCore: true } });
        }

        setInterval(() => this.checkAutoSave(), this.config.autoSaveInterval);
    }

    getBlueprint(type) { return typeof MetaMindSchema !== 'undefined' ? MetaMindSchema.getDefinition(type) : { label: type, icon: "⚪" }; }
    getSmartChildType(pid) { const p = this.state.nodes.find(x => x.id === pid); return p && typeof MetaMindSchema !== 'undefined' ? MetaMindSchema.getDefaultChild(p.type) : 'note'; }

    getEmptyState() {
        return {
            map_id: this.generateId(),
            meta: { title: "New Map", created: new Date().toISOString() },
            nodes: [], connections: [], submaps: [],
            session: { viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }, selectedId: null, remoteTemplates: [] }
        };
    }

    ensureSchema(state) {
        if (!state) return this.getEmptyState();
        if (!Array.isArray(state.nodes)) state.nodes = [];
        if (!Array.isArray(state.connections)) state.connections = state.edges || [];
        delete state.edges;
        if (!state.session) state.session = { viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }, selectedId: null, remoteTemplates: [] };
        if (!state.session.remoteTemplates) state.session.remoteTemplates = []; 
        state.nodes.forEach(n => {
            if (!n.data) n.data = { x: 0, y: 0 };
            if (n.data.collapsed === undefined) n.data.collapsed = false;
        });
        return state;
    }

    resolveOverlaps(iterations = 30, kRepel = 0.08, kSpring = 0.05) {
        const repulsionDist = 240; 
        const springLength = 160;

        for (let step = 0; step < iterations; step++) {
            let moved = false;
            for (let i = 0; i < this.state.nodes.length; i++) {
                for (let j = i + 1; j < this.state.nodes.length; j++) {
                    const n1 = this.state.nodes[i], n2 = this.state.nodes[j];
                    const dx = n1.data.x - n2.data.x, dy = n1.data.y - n2.data.y;
                    const d = Math.sqrt(dx*dx + dy*dy);
                    
                    if (d < repulsionDist && d > 0.1) {
                        const force = (repulsionDist - d) * kRepel;
                        const fx = (dx / d) * force, fy = (dy / d) * force;
                        n1.data.x += fx; n1.data.y += fy;
                        n2.data.x -= fx; n2.data.y -= fy;
                        moved = true;
                    }
                }
            }

            this.state.connections.forEach(conn => {
                if (conn.type !== 'structural') return; 
                const source = this.state.nodes.find(n => n.id === conn.from);
                const target = this.state.nodes.find(n => n.id === conn.to);
                if (source && target) {
                    const dx = target.data.x - source.data.x, dy = target.data.y - source.data.y;
                    const d = Math.sqrt(dx * dx + dy * dy);
                    if (d > 0.1 && Math.abs(d - springLength) > 2) {
                        const force = (d - springLength) * kSpring;
                        const nx = (dx / d) * force, ny = (dy / d) * force;
                        source.data.x += nx; source.data.y += ny;
                        target.data.x -= nx; target.data.y -= ny;
                        moved = true;
                    }
                }
            });
            if (!moved) break;
        }
        this.notify();
    }

    autoLayout() { this.resolveOverlaps(150, 0.15, 0.08); } 

    getDownstreamNodes(startId) {
        const result = new Set([startId]);
        const queue = [startId];
        while (queue.length > 0) {
            const curr = queue.shift();
            const kids = this.state.connections.filter(c => c.from === curr && c.type === 'structural').map(c => c.to);
            kids.forEach(k => { if (!result.has(k)) { result.add(k); queue.push(k); } });
        }
        return result;
    }

    toggleCollapse(nodeId) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if (node) { node.data.collapsed = !node.data.collapsed; this.notify(); }
    }

    deleteNode(id) {
        this.saveHistory();
        const toDelete = this.getDownstreamNodes(id);
        this.state.nodes = this.state.nodes.filter(n => !toDelete.has(n.id));
        this.state.connections = this.state.connections.filter(c => !toDelete.has(c.from) && !toDelete.has(c.to));
        if (toDelete.has(this.state.session.selectedId)) this.state.session.selectedId = null;
        this.notify();
    }

    findSmartPosition(pid) {
        const p = this.state.nodes.find(n => n.id === pid);
        if (!p) return { x: 0, y: 0 }; 
        const r = 250; const steps = 16; 
        let bestAngle = 0, maxClearance = 0;
        for (let i = 0; i < steps; i++) {
            const theta = (i * (360 / steps)) * (Math.PI / 180);
            const checkX = p.data.x + Math.cos(theta) * r;
            const checkY = p.data.y + Math.sin(theta) * r;
            let nearestDist = Infinity;
            this.state.nodes.forEach(n => {
                if (n.id === pid) return; 
                const d = Math.sqrt((n.data.x - checkX)**2 + (n.data.y - checkY)**2);
                if (d < nearestDist) nearestDist = d;
            });
            if (nearestDist > maxClearance) { maxClearance = nearestDist; bestAngle = theta; }
        }
        return { x: p.data.x + Math.cos(bestAngle) * r, y: p.data.y + Math.sin(bestAngle) * r };
    }

    addNode(data, pid = null) {
        data = data || {};
        
        // SINGLETON PROFILE CHECK
        if (data.type === 'profile') {
            const existingProfile = this.state.nodes.find(n => n.type === 'profile');
            if (existingProfile) {
                alert("A User Profile already exists in this map. Focus shifted.");
                this.selectNode(existingProfile.id);
                return existingProfile;
            }
        }

        this.saveHistory();
        const id = data.id || this.generateId();
        let posX = data.x, posY = data.y;
        
        if (this.state.nodes.length === 0) {
            data.type = 'root'; data.title = 'Universe Root'; data.isCore = true; posX = 0; posY = 0;
        } else if (posX === undefined && pid) {
            const pos = this.findSmartPosition(pid);
            posX = pos.x; posY = pos.y;
        }

        const node = { 
            id: id, type: data.type || 'note', title: data.title || (data.type ? data.type.toUpperCase() : 'NODE'), 
            content: data.content || '', data: { x: posX || 0, y: posY || 0, isCore: data.isCore || false, collapsed: false }, submaps: [] 
        };
        
        this.state.nodes.push(node);
        setTimeout(() => this.resolveOverlaps(40), 10);
        this.notify();
        return node;
    }

    addConnection(f, t, connType = 'structural') {
        if (f === t || this.state.connections.find(c => c.from === f && c.to === t)) return { success: false };
        if (typeof MetaMindSchema !== 'undefined') {
            const s = this.state.nodes.find(n => n.id === f), tg = this.state.nodes.find(n => n.id === t);
            if (s && tg && !MetaMindSchema.canConnect(s.type, tg.type)) return { success: false };
        }
        this.saveHistory();
        this.state.connections.push({ id: this.generateId(), from: f, to: t, type: connType });
        if (connType === 'structural') setTimeout(() => this.resolveOverlaps(40), 10);
        this.notify();
        return { success: true };
    }

    updateNode(id, up) { 
        const n = this.state.nodes.find(x => x.id === id); 
        if (!n) return; 
        
        if (up.type === 'profile') {
            const existingProfile = this.state.nodes.find(x => x.type === 'profile' && x.id !== id);
            if (existingProfile) {
                alert("Only one User Profile node is permitted per constellation.");
                return;
            }
        }

        Object.keys(up).forEach(k => { if (k === 'x' || k === 'y') n.data[k] = up[k]; else n[k] = up[k]; }); 
        this.notify(); 
    }

    // CMS Field Auto-Child Generator
    updateProfileField(nodeId, field, value) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if (!node) return;

        let data = {};
        try { data = JSON.parse(node.content || '{}'); } catch(e) {}
        data[field] = value;
        node.content = JSON.stringify(data);

        // Find or create structural child note dedicated to this field
        const childConns = this.state.connections.filter(c => c.from === nodeId && c.type === 'structural');
        const children = childConns.map(c => this.state.nodes.find(n => n.id === c.to)).filter(n => n);
        
        let fieldNode = children.find(n => n.title === field);
        
        if (fieldNode) {
            fieldNode.content = value;
        } else {
            // Silently spawn a child node using smart positioning
            const childId = this.generateId();
            const pos = this.findSmartPosition(nodeId);
            this.state.nodes.push({
                id: childId, type: 'note', title: field, content: value,
                data: { x: pos.x, y: pos.y, isCore: false, collapsed: false }, submaps: []
            });
            this.state.connections.push({ id: this.generateId(), from: nodeId, to: childId, type: 'structural' });
            this.resolveOverlaps(40);
        }
        this.notify();
    }

    async loadRemoteTemplates() {
        try {
            const tpls = await this.bridge.fetchTemplates();
            this.state.session.remoteTemplates = tpls;
            this.notify();
        } catch(e) { console.error(e); }
    }

    // TEMPLATE BOLT-ON ENGINE
    applyTemplateToNode(targetNodeId, templateState) {
        this.saveHistory();
        const targetNode = this.state.nodes.find(x => x.id === targetNodeId);
        if (!targetNode || !templateState || !templateState.nodes || templateState.nodes.length === 0) return;

        // Root of the template is mapped to the currently selected node
        const root = templateState.nodes.find(n => n.data && n.data.isCore) || templateState.nodes[0];
        const idMap = {};
        const newNodes = [];

        templateState.nodes.forEach(n => {
            if (n.id === root.id) {
                idMap[n.id] = targetNodeId;
                // If template root has JSON payload and target doesn't, inherit it.
                if (targetNode.type === 'profile' && !targetNode.content && n.content) {
                    targetNode.content = n.content;
                }
            } else {
                const newId = this.generateId();
                idMap[n.id] = newId;
                // Offset position relative to the target node
                newNodes.push({
                    ...n,
                    id: newId,
                    data: { 
                        ...n.data, 
                        x: targetNode.data.x + (n.data.x - root.data.x), 
                        y: targetNode.data.y + (n.data.y - root.data.y) 
                    }
                });
            }
        });

        const newConns = [];
        templateState.connections.forEach(c => {
            const fromId = idMap[c.from];
            const toId = idMap[c.to];
            if (fromId && toId && fromId !== toId) {
                newConns.push({ ...c, id: this.generateId(), from: fromId, to: toId });
            }
        });

        this.state.nodes.push(...newNodes);
        this.state.connections.push(...newConns);
        
        this.resolveOverlaps(80);
        this.notify();
    }

    importSubmap(portalId, submapState) {
        this.saveHistory();
        const portal = this.state.nodes.find(n => n.id === portalId);
        if(!portal || !submapState || !submapState.nodes) return;

        const validSub = this.ensureSchema(submapState);
        const idMap = {};
        const newNodes = validSub.nodes.map(n => {
            const newId = this.generateId();
            idMap[n.id] = newId;
            return { ...n, id: newId, data: { ...n.data, x: n.data.x + portal.data.x + 300, y: n.data.y + portal.data.y } };
        });
        
        const newConns = [];
        validSub.connections.forEach(c => {
            if (idMap[c.from] && idMap[c.to]) newConns.push({ id: this.generateId(), from: idMap[c.from], to: idMap[c.to], type: c.type || 'structural' });
        });

        this.state.nodes.push(...newNodes);
        this.state.connections.push(...newConns);
        
        if(newNodes.length > 0) {
            const linkTarget = (validSub.meta && validSub.meta.original_root && idMap[validSub.meta.original_root]) ? idMap[validSub.meta.original_root] : newNodes[0].id;
            this.addConnection(portalId, linkTarget);
        }
        this.resolveOverlaps(150); 
        this.notify();
    }

    extractConstellation(rootId) {
        const root = this.state.nodes.find(n => n.id === rootId);
        if (!root) return null;
        const included = this.getDownstreamNodes(root.id);
        return {
            map_id: this.generateId(),
            meta: { title: root.title + " (Submap)", original_root: rootId, notes: "", shared: false },
            nodes: this.state.nodes.filter(n => included.has(n.id)),
            connections: this.state.connections.filter(c => included.has(c.from) && included.has(c.to)),
            submaps: []
        };
    }

    generateId() { return Math.random().toString(36).substr(2, 9); }
    subscribe(fn) { this.listeners.push(fn); }
    notify() { this.listeners.forEach(fn => fn(this.state)); this.bridge.sync(this.state); }
    exportMapState() { return JSON.stringify(this.state, null, 2); }
    loadFromStorage() { try { const data = localStorage.getItem("mm_core_state"); return data ? JSON.parse(data) : null; } catch (e) { return null; } }
    checkAutoSave() { 
        const c = JSON.stringify(this.state); 
        if (c !== this.lastSaveState) { 
            localStorage.setItem("mm_core_state", c); this.lastSaveState = c; 
            const e = document.getElementById('save-status'); 
            if (e) { e.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></span> Saving...'; setTimeout(() => e.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Local', 500); } 
        } 
    }
    saveHistory() { try { this.history.push(JSON.stringify(this.state)); if(this.history.length > 50) this.history.shift(); } catch(e){} }
    undo() { if(this.history.length > 0) { this.state = this.ensureSchema(JSON.parse(this.history.pop())); this.notify(); } }
    
    saveConstellationToLibrary(data) { let lib = this.getLibrary(); lib.push(data); localStorage.setItem("mm_constellation_lib", JSON.stringify(lib)); }
    getLibrary() { try { return JSON.parse(localStorage.getItem("mm_constellation_lib")) || []; } catch(e) { return []; } }
    deleteFromLibrary(id) { let lib = this.getLibrary().filter(x => x.map_id !== id); localStorage.setItem("mm_constellation_lib", JSON.stringify(lib)); }
    updateLibraryItem(id, metaUpdates) {
        let lib = this.getLibrary();
        const idx = lib.findIndex(x => x.map_id === id);
        if (idx !== -1) {
            lib[idx].meta = { ...lib[idx].meta, ...metaUpdates };
            localStorage.setItem("mm_constellation_lib", JSON.stringify(lib));
            this.notify();
        }
    }
    loadMapState(data) { this.saveHistory(); this.state = this.ensureSchema(data); this.notify(); }
    selectNode(id) { this.state.session.selectedId = id; this.notify(); }
}
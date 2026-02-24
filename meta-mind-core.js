/**
 * META-MIND CORE KERNEL v13.2
 * FIXED: Array initialization order and defensive state parsing.
 */

class HostBridge {
    constructor() {
        this.apiUrl = "http://localhost:8000/api"; 
        this.isConnected = false;
    }
    async checkConnection() { return false; }
    async sync(mapState) { /* Ready for Python API */ }
}

class MetaMindKernel {
    constructor() {
        this.config = {
            autoSaveInterval: 2000,
            autoFocus: true
        };

        this.bridge = new HostBridge();
        
        // CRITICAL FIX: Arrays must be initialized before loading state
        this.listeners = [];
        this.history = [];
        this.linkingMode = false;
        this.linkingSourceId = null;

        const rawState = this.loadFromStorage();
        this.state = this.ensureSchema(rawState);
        this.lastSaveState = JSON.stringify(this.state);

        // Fail-safe: Create Root if map is completely empty
        if (this.state.nodes.length === 0) {
            this.addNode({ type: "root", title: "Universe Root", data: { x: 0, y: 0, isCore: true } });
        }

        setInterval(() => this.checkAutoSave(), this.config.autoSaveInterval);
    }

    getBlueprint(type) {
        if (typeof MetaMindSchema !== 'undefined') return MetaMindSchema.getDefinition(type);
        return { label: type, icon: "⚪" };
    }

    getSmartChildType(pid) {
        if (typeof MetaMindSchema !== 'undefined') {
            const p = this.state.nodes.find(x => x.id === pid);
            return p ? MetaMindSchema.getDefaultChild(p.type) : 'note';
        }
        return 'note';
    }

    getEmptyState() {
        return {
            map_id: this.generateId(),
            meta: { title: "New Map", created: new Date().toISOString() },
            nodes: [],
            connections: [],
            submaps: [],
            session: { viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }, selectedId: null }
        };
    }

    ensureSchema(state) {
        if (!state) return this.getEmptyState();
        if (!Array.isArray(state.nodes)) state.nodes = [];
        if (!Array.isArray(state.connections)) state.connections = state.edges || [];
        delete state.edges; // Clean legacy
        
        if (!state.session) {
            state.session = { viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }, selectedId: null };
        }
        
        state.nodes.forEach(n => {
            if (!n.data) n.data = { x: 0, y: 0 };
            if (n.data.collapsed === undefined) n.data.collapsed = false;
        });

        return state;
    }

    findSmartPosition(pid) {
        const p = this.state.nodes.find(n => n.id === pid);
        if (!p) return { x: 0, y: 0 }; 
        
        const r = 250; 
        const steps = 16; 
        let bestAngle = 0;
        let maxClearance = 0;

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

            if (nearestDist > maxClearance) {
                maxClearance = nearestDist;
                bestAngle = theta;
            }
        }

        return { x: p.data.x + Math.cos(bestAngle) * r, y: p.data.y + Math.sin(bestAngle) * r };
    }

    resolveOverlaps() {
        const iter = 15;
        const repulsion = 180;
        const k = 0.1;

        for (let step = 0; step < iter; step++) {
            let moved = false;
            for (let i = 0; i < this.state.nodes.length; i++) {
                for (let j = i + 1; j < this.state.nodes.length; j++) {
                    const n1 = this.state.nodes[i];
                    const n2 = this.state.nodes[j];
                    
                    const dx = n1.data.x - n2.data.x;
                    const dy = n1.data.y - n2.data.y;
                    const d = Math.sqrt(dx*dx + dy*dy);
                    
                    if (d < repulsion && d > 1) {
                        const force = (repulsion - d) * k;
                        const fx = (dx / d) * force;
                        const fy = (dy / d) * force;
                        n1.data.x += fx; n1.data.y += fy;
                        n2.data.x -= fx; n2.data.y -= fy;
                        moved = true;
                    }
                }
            }
            if (!moved) break;
        }
        this.notify();
    }

    toggleCollapse(nodeId) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if (node) { node.data.collapsed = !node.data.collapsed; this.notify(); }
    }

    expandAndFocus(nodeId) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if (!node) return;

        node.data.collapsed = false;
        const kids = this.state.connections
            .filter(c => c.from === nodeId && c.type === 'structural')
            .map(c => this.state.nodes.find(n => n.id === c.to));
        
        kids.forEach(k => { if(k) k.data.collapsed = true; });
        this.selectNode(nodeId);
    }

    addNode(data, pid = null) {
        data = data || {};
        this.saveHistory();
        
        const id = data.id || this.generateId();
        let posX = data.x;
        let posY = data.y;
        
        if (this.state.nodes.length === 0) {
            data.type = 'root';
            data.title = 'Universe Root';
            data.isCore = true;
            posX = 0; posY = 0;
        } else if (posX === undefined && pid) {
            const pos = this.findSmartPosition(pid);
            posX = pos.x; posY = pos.y;
        } else if (posX === undefined) {
            posX = 0; posY = 0;
        }

        const node = { 
            id: id, 
            type: data.type || 'note', 
            title: data.title || (data.type ? data.type.toUpperCase() : 'NODE'), 
            content: data.content || '', 
            data: { x: posX, y: posY, isCore: data.isCore || false, collapsed: false }, 
            submaps: [] 
        };
        
        this.state.nodes.push(node);
        setTimeout(() => this.resolveOverlaps(), 10);
        this.notify();
        return node;
    }

    addConnection(f, t) {
        if (f === t) return { success: false };
        if (this.state.connections.find(c => c.from === f && c.to === t)) return { success: false };
        
        if (typeof MetaMindSchema !== 'undefined') {
            const s = this.state.nodes.find(n => n.id === f);
            const tg = this.state.nodes.find(n => n.id === t);
            if (s && tg && !MetaMindSchema.canConnect(s.type, tg.type)) return { success: false };
        }

        this.saveHistory();
        this.state.connections.push({ id: this.generateId(), from: f, to: t, type: 'structural' });
        this.notify();
        return { success: true };
    }

    updateNode(id, up) { 
        const n = this.state.nodes.find(x => x.id === id); 
        if (!n) return; 
        Object.keys(up).forEach(k => { 
            if (k === 'x' || k === 'y') n.data[k] = up[k]; else n[k] = up[k]; 
        }); 
        this.notify(); 
    }

    deleteNode(id) {
        this.saveHistory();
        this.state.nodes = this.state.nodes.filter(n => n.id !== id);
        this.state.connections = this.state.connections.filter(c => c.from !== id && c.to !== id);
        if (this.state.session.selectedId === id) this.state.session.selectedId = null;
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
            return {
                ...n, 
                id: newId, 
                data: { ...n.data, x: n.data.x + portal.data.x + 300, y: n.data.y + portal.data.y }
            };
        });
        
        const newConns = [];
        validSub.connections.forEach(c => {
            if (idMap[c.from] && idMap[c.to]) {
                newConns.push({ id: this.generateId(), from: idMap[c.from], to: idMap[c.to], type: c.type || 'structural' });
            }
        });

        this.state.nodes.push(...newNodes);
        this.state.connections.push(...newConns);
        
        if(newNodes.length > 0) {
            const linkTarget = (validSub.meta && validSub.meta.original_root && idMap[validSub.meta.original_root]) 
                ? idMap[validSub.meta.original_root] : newNodes[0].id;
            this.addConnection(portalId, linkTarget);
        }
        this.resolveOverlaps();
        this.notify();
    }

    extractConstellation(rootId) {
        const root = this.state.nodes.find(n => n.id === rootId);
        if (!root) return null;
        
        const included = new Set([root.id]);
        const queue = [root.id];
        
        while(queue.length > 0) {
            const curr = queue.shift();
            const kids = this.state.connections.filter(c => c.from === curr).map(c => c.to);
            kids.forEach(k => { if(!included.has(k)) { included.add(k); queue.push(k); } });
        }

        return {
            map_id: this.generateId(),
            meta: { title: root.title + " (Submap)", original_root: rootId },
            nodes: this.state.nodes.filter(n => included.has(n.id)),
            connections: this.state.connections.filter(c => included.has(c.from) && included.has(c.to)),
            submaps: []
        };
    }

    generateId() { return Math.random().toString(36).substr(2, 9); }
    subscribe(fn) { this.listeners.push(fn); }
    notify() { this.listeners.forEach(fn => fn(this.state)); this.bridge.sync(this.state); }
    exportMapState() { return JSON.stringify(this.state, null, 2); }
    
    loadFromStorage() { 
        try { 
            const data = localStorage.getItem("mm_core_state");
            return data ? JSON.parse(data) : null;
        } catch (e) { return null; } 
    }
    
    checkAutoSave() { 
        const c = JSON.stringify(this.state); 
        if (c !== this.lastSaveState) { 
            localStorage.setItem("mm_core_state", c); 
            this.lastSaveState = c; 
            const e = document.getElementById('save-status'); 
            if (e) { e.innerText = "Saving..."; setTimeout(() => e.innerText = "Local", 500); } 
        } 
    }
    
    saveHistory() { try { this.history.push(JSON.stringify(this.state)); if(this.history.length > 50) this.history.shift(); } catch(e){} }
    undo() { if(this.history.length > 0) { this.state = this.ensureSchema(JSON.parse(this.history.pop())); this.notify(); } }
    
    saveConstellationToLibrary(data) { let lib = this.getLibrary(); lib.push(data); localStorage.setItem("mm_constellation_lib", JSON.stringify(lib)); }
    getLibrary() { try { return JSON.parse(localStorage.getItem("mm_constellation_lib")) || []; } catch(e) { return []; } }
    deleteFromLibrary(id) { let lib = this.getLibrary().filter(x => x.map_id !== id); localStorage.setItem("mm_constellation_lib", JSON.stringify(lib)); }
    
    selectNode(id) { this.state.session.selectedId = id; this.notify(); }
    autoLayout() { this.resolveOverlaps(); }
}
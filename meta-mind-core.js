/**
 * META-MIND CORE KERNEL v4.2
 * The central "Webkit" logic.
 */
export class MetaMindKernel {
    constructor() {
        const saved = this.loadFromStorage();
        this.state = saved || {
            nodes: [], edges: [], selectedId: null, viewport: { x: 0, y: 0, scale: 1 }, history: [],
            metadata: { title: "Untitled Map", created: new Date().toISOString(), version: "4.2.0" }
        };
        this.listeners = new Set();
        this.config = { spacing: { x: 250, y: 150 } };
        this.saveTimeout = null;
    }

    // Reactivity
    subscribe(callback) { this.listeners.add(callback); return () => this.listeners.delete(callback); }
    notify(eventType = 'update', payload = null) {
        this.scheduleSave();
        this.listeners.forEach(cb => cb(this.state, eventType, payload));
    }

    // Spatial
    pan(dx, dy) { this.state.viewport.x += dx; this.state.viewport.y += dy; this.notify('viewport'); }
    zoom(delta, cx, cy) {
        const oldScale = this.state.viewport.scale;
        const newScale = Math.max(0.1, Math.min(5, oldScale + delta));
        const ratio = newScale / oldScale;
        if (cx !== undefined && cy !== undefined) {
             this.state.viewport.x = cx - (cx - this.state.viewport.x) * ratio;
             this.state.viewport.y = cy - (cy - this.state.viewport.y) * ratio;
        }
        this.state.viewport.scale = newScale;
        this.notify('viewport');
    }
    screenToWorld(sx, sy) { return { x: (sx - this.state.viewport.x) / this.state.viewport.scale, y: (sy - this.state.viewport.y) / this.state.viewport.scale }; }

    // Blueprints
    getBlueprint(type) {
        const blueprints = {
            'profile': { icon: '👤', allowed: [{type:'detail', label:'Detail'}, {type:'social', label:'Link'}] },
            'hero': { icon: '🚀', allowed: [{type:'button', label:'Button'}] },
            'section': { icon: '📑', allowed: [{type:'widget', label:'Widget'}] },
            'default': { icon: '⚪', allowed: [{type:'concept', label:'Node'}] }
        };
        return blueprints[type] || blueprints['default'];
    }

    // CRUD
    addNode(config = {}) {
        const id = crypto.randomUUID();
        const bp = this.getBlueprint(config.type || 'concept');
        const node = {
            id, title: config.title || bp.allowed?.[0]?.label || "New Node", 
            content: config.content || "", type: config.type || "concept",
            position: config.position || { x: 0, y: 0 }, style: config.style || {}, 
            metadata: { created: new Date().toISOString() }
        };
        this.state.nodes.push(node);
        this.state.selectedId = id;
        this.notify('node_add', node);
        return id;
    }

    addEdge(source, target, type = "default") {
        if (source === target) return;
        if (!this.state.edges.find(e => e.source === source && e.target === target)) {
            this.state.edges.push({ id: crypto.randomUUID(), source, target, type });
            this.notify('edge_add');
        }
    }

    deleteNode(id) {
        this.state.nodes = this.state.nodes.filter(n => n.id !== id);
        this.state.edges = this.state.edges.filter(e => e.source !== id && e.target !== id);
        this.state.selectedId = null;
        this.notify('node_delete', id);
    }

    updateNode(id, updates) {
        const node = this.state.nodes.find(n => n.id === id);
        if (node) { Object.assign(node, updates); this.notify('node_update', id); }
    }

    // Layout
    autoLayout() {
        const targets = new Set(this.state.edges.map(e => e.target));
        const roots = this.state.nodes.filter(n => !targets.has(n.id));
        if (roots.length === 0 && this.state.nodes.length > 0) this._layoutRecursive(this.state.nodes[0].id, 0, 0);
        else {
            let startY = 0;
            roots.forEach(root => {
                this._layoutRecursive(root.id, 0, startY);
                startY += this._getBranchHeight(root.id) + this.config.spacing.y;
            });
        }
        this.notify('layout');
    }

    _layoutRecursive(nodeId, x, y) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if (!node) return;
        node.position = {x, y};
        const children = this.state.edges.filter(e => e.source === nodeId).map(e => this.state.nodes.find(n => n.id === e.target));
        if (children.length > 0) {
            const width = (children.length - 1) * this.config.spacing.x;
            let cx = x - (width / 2);
            children.forEach(c => {
                this._layoutRecursive(c.id, cx, y + this.config.spacing.y);
                cx += this.config.spacing.x;
            });
        }
    }

    _getBranchHeight(nodeId) {
        const children = this.state.edges.filter(e => e.source === nodeId);
        if (children.length === 0) return this.config.spacing.y;
        return children.reduce((acc, e) => acc + this._getBranchHeight(e.target), 0);
    }

    // Persistence
    loadFromStorage() { try { return JSON.parse(localStorage.getItem("mm_core_v4_state")); } catch(e) { return null; } }
    scheduleSave() { if (this.saveTimeout) clearTimeout(this.saveTimeout); this.saveTimeout = setTimeout(() => { localStorage.setItem("mm_core_v4_state", JSON.stringify(this.state)); }, 1000); }
    resetStorage() { localStorage.removeItem("mm_core_v4_state"); window.location.reload(); }
}
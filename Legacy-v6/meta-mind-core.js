/**
 * META-MIND CORE KERNEL v3.7 (Quest Ready)
 * The central "Webkit" for Federated Mapstate Management.
 * Includes Node Blueprints and Persistence.
 */

class MetaMindKernel {
    constructor() {
        this.state = this.loadFromStorage() || {
            nodes: [],
            edges: [],
            selectedId: null,
            viewport: { x: 0, y: 0, scale: 1 },
            history: [],
            metadata: {
                title: "Untitled Map",
                created: new Date().toISOString(),
                version: "3.7.0"
            }
        };
        this.listeners = [];
        this.config = { spacing: { x: 250, y: 150 } };
        
        this.lastSaveState = JSON.stringify(this.state);
        setInterval(() => this.checkAutoSave(), 2000);
    }

    // --- NODE BLUEPRINTS ---
    getBlueprint(type) {
        const blueprints = {
            'profile': {
                label: "User Profile",
                icon: "👤",
                allowedChildren: [{type: 'detail', label: 'Bio / Detail'}, {type: 'social', label: 'Social Link'}],
                defaultContent: "User Identity Root"
            },
            'web-root': {
                label: "Website",
                icon: "🌐",
                allowedChildren: [{type: 'section', label: 'Section'}, {type: 'nav', label: 'Navbar'}],
                defaultContent: "Main Container"
            },
            'section': {
                label: "Section",
                icon: "📑",
                allowedChildren: [{type: 'widget', label: 'Widget'}, {type: 'hero', label: 'Hero'}],
                defaultContent: "Content Area"
            },
            'default': {
                label: "Concept",
                icon: "⚪",
                allowedChildren: [{type: 'concept', label: 'Sub-Concept'}],
                defaultContent: ""
            }
        };
        return blueprints[type] || blueprints['default'];
    }

    // --- Reactivity ---
    subscribe(callback) { this.listeners.push(callback); }
    notify() { this.listeners.forEach(cb => cb(this.state)); }

    // --- Spatial ---
    pan(dx, dy) {
        this.state.viewport.x += dx;
        this.state.viewport.y += dy;
        this.notify();
    }

    zoom(delta, cx, cy) {
        const oldScale = this.state.viewport.scale;
        const newScale = Math.max(0.1, Math.min(5, oldScale + delta));
        const ratio = newScale / oldScale;
        this.state.viewport.x = cx - (cx - this.state.viewport.x) * ratio;
        this.state.viewport.y = cy - (cy - this.state.viewport.y) * ratio;
        this.state.viewport.scale = newScale;
        this.notify();
    }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.state.viewport.x) / this.state.viewport.scale,
            y: (sy - this.state.viewport.y) / this.state.viewport.scale
        };
    }

    // --- Layout ---
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
        this.notify();
    }

    _layoutRecursive(nodeId, x, y) {
        const node = this.state.nodes.find(n => n.id === nodeId);
        if(!node) return;
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

    // --- CRUD ---
    addNode(config = {}) {
        const id = crypto.randomUUID();
        const type = config.type || "concept";
        const bp = this.getBlueprint(type);
        this.state.nodes.push({
            id,
            title: config.title || bp.label,
            content: config.content !== undefined ? config.content : bp.defaultContent,
            type: type,
            position: config.position || { x: 0, y: 0 },
            style: config.style || {}
        });
        this.state.selectedId = id;
        this.saveHistory();
        this.notify();
        return id;
    }

    addEdge(source, target, type = "default") {
        if(source === target) return;
        if(!this.state.edges.find(e => e.source === source && e.target === target)) {
            this.state.edges.push({ id: crypto.randomUUID(), source, target, type });
            this.saveHistory();
            this.notify();
        }
    }

    deleteNode(id) {
        this.state.nodes = this.state.nodes.filter(n => n.id !== id);
        this.state.edges = this.state.edges.filter(e => e.source !== id && e.target !== id);
        this.state.selectedId = null;
        this.saveHistory();
        this.notify();
    }

    updateNode(id, updates) {
        const node = this.state.nodes.find(n => n.id === id);
        if (node) { Object.assign(node, updates); this.notify(); }
    }

    // --- Persistence ---
    loadFromStorage() { const data = localStorage.getItem("mm_core_state"); return data ? JSON.parse(data) : null; }
    checkAutoSave() {
        const current = JSON.stringify(this.state);
        if (current !== this.lastSaveState) { localStorage.setItem("mm_core_state", current); this.lastSaveState = current; }
    }
    resetStorage() { localStorage.removeItem("mm_core_state"); location.reload(); }
    saveHistory() { 
        this.state.history.push(JSON.stringify({ nodes: this.state.nodes, edges: this.state.edges })); 
        if(this.state.history.length > 50) this.state.history.shift(); 
    }
    undo() {
        if(this.state.history.length < 2) return;
        this.state.history.pop();
        const prev = JSON.parse(this.state.history[this.state.history.length-1]);
        this.state.nodes = prev.nodes; this.state.edges = prev.edges;
        this.notify();
    }
    
    async senseIntent(context) { return { type: "suggestion", content: "Expand hierarchy." }; }
}

const MM = new MetaMindKernel();
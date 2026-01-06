/**
 * META-MIND CORE KERNEL v3.2 (Phase & Chain)
 * The central "Webkit" for Federated Mapstate Management.
 * Includes Auto-Save, Spatial Logic, UIP, and Phase Renderers.
 */

class MetaMindKernel {
    constructor() {
        this.state = this.loadFromStorage() || {
            nodes: [],
            edges: [], // Now supports Nodechain weighting
            selectedId: null,
            viewport: { x: 0, y: 0, scale: 1 },
            history: [],
            identity: {
                userId: "local-user-" + Math.floor(Math.random()*10000),
                homeServer: "local"
            },
            metadata: {
                title: "Untitled Federated Map",
                created: new Date().toISOString(),
                version: "3.2.0"
            }
        };
        this.listeners = [];
        this.config = {
            spacing: { x: 250, y: 150 },
            gridSize: 30
        };
        
        this.lastSaveState = JSON.stringify(this.state);
        setInterval(() => this.checkAutoSave(), 2000);
    }

    // --- Phase Rendering Engine (New Module) ---
    renderPhase(phase, rootId = null) {
        if (phase === 'web') return this._generateWebHTML(rootId);
        if (phase === 'text') return this._generateTextOutline(rootId);
        return "";
    }

    _generateWebHTML(rootId) {
        // Recursive HTML Generator for "Web Architect"
        // If no rootId, find all roots
        const targets = new Set(this.state.edges.map(e => e.target));
        const roots = rootId ? [this.state.nodes.find(n => n.id === rootId)] : this.state.nodes.filter(n => !targets.has(n.id));
        
        let html = "";
        roots.forEach(node => {
            if(!node) return;
            html += this._nodeToHTML(node);
        });
        return html;
    }

    _nodeToHTML(node) {
        let content = `<div id="${node.id}" class="mm-node-${node.type} p-8 mb-4 rounded-xl bg-white shadow-sm border border-slate-200">`;
        
        // Widget Logic
        if (node.type === 'hero') content += `<h1 class="text-4xl font-black mb-4">${node.title}</h1><p class="text-xl text-slate-500">${node.content}</p>`;
        else if (node.type === 'button') content += `<button class="px-6 py-2 bg-orange-600 text-white rounded-full font-bold">${node.title}</button>`;
        else if (node.type === 'nav') content += `<nav class="flex justify-between p-4 border-b"><span class="font-bold">LOGO</span><span>${node.content}</span></nav>`;
        else content += `<h2 class="text-2xl font-bold mb-2">${node.title}</h2><div class="prose text-slate-600">${node.content}</div>`;

        // Render Children
        const children = this.state.edges
            .filter(e => e.source === node.id)
            .map(e => this.state.nodes.find(n => n.id === e.target))
            .sort((a,b) => a.position.x - b.position.x); // Visual order left-to-right

        if (children.length > 0) {
            content += `<div class="mm-children grid grid-cols-1 md:grid-cols-${children.length} gap-4 mt-6">`;
            children.forEach(c => { content += this._nodeToHTML(c); });
            content += `</div>`;
        }

        content += `</div>`;
        return content;
    }

    // --- Persistence ---
    loadFromStorage() {
        const data = localStorage.getItem("mm_core_state");
        return data ? JSON.parse(data) : null;
    }

    checkAutoSave() {
        const current = JSON.stringify(this.state);
        if (current !== this.lastSaveState) {
            localStorage.setItem("mm_core_state", current);
            this.lastSaveState = current;
            console.log("[Kernel] Auto-saved.");
        }
    }

    resetStorage() {
        localStorage.removeItem("mm_core_state");
        location.reload();
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
        const timestamp = new Date().toISOString();
        this.state.nodes.push({
            id,
            title: config.title || "New Node",
            content: config.content || "",
            type: config.type || "concept",
            position: config.position || { x: 0, y: 0 },
            style: config.style || {},
            origin: { creator: this.state.identity.userId, created: timestamp },
            policy: { access: "public" }
        });
        this.state.selectedId = id;
        this.saveHistory();
        this.notify();
        return id;
    }

    addEdge(source, target, type = "default", meta = {}) {
        if(source === target) return;
        if(!this.state.edges.find(e => e.source === source && e.target === target)) {
            this.state.edges.push({ 
                id: crypto.randomUUID(), 
                source, target, type,
                meta: { weight: meta.weight || 1.0, ...meta } // Nodechain support
            });
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
        if (node) {
            Object.assign(node, updates);
            this.notify();
        }
    }

    // --- Intelligence ---
    async senseIntent(context) {
        return new Promise(resolve => setTimeout(() => resolve({ type: "suggestion", content: "Expand 'Feature' branch." }), 800));
    }

    // --- History ---
    saveHistory() {
        this.state.history.push(JSON.stringify({ nodes: this.state.nodes, edges: this.state.edges }));
        if(this.state.history.length > 50) this.state.history.shift();
    }

    undo() {
        if(this.state.history.length < 2) return;
        this.state.history.pop();
        const prev = JSON.parse(this.state.history[this.state.history.length-1]);
        this.state.nodes = prev.nodes;
        this.state.edges = prev.edges;
        this.notify();
    }
}

const MM = new MetaMindKernel();
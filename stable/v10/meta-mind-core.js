/**
 * META-MIND CORE KERNEL v4.0
 * The central "Webkit" for Federated Mapstate Management.
 * Added Graph Traversal Helpers for Radial Menus & Tree Views.
 */

class MetaMindKernel {
    constructor() {
        this.config = {
            autoSaveInterval: 2000,
            spacing: { x: 300, y: 180 }
        };
        
        this.state = this.loadFromStorage() || this.getEmptyState();
        
        // Runtime props
        this.listeners = [];
        this.lastSaveState = JSON.stringify(this.state);
        this.linkingMode = false;
        this.linkingSourceId = null;

        setInterval(() => this.checkAutoSave(), this.config.autoSaveInterval);
    }

    getEmptyState() {
        return {
            nodes: [],
            edges: [],
            selectedId: null,
            viewport: { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 },
            history: [],
            metadata: {
                title: "Untitled Map",
                created: new Date().toISOString(),
                version: "4.0.0"
            }
        };
    }

    // --- NODE BLUEPRINTS ---
    getBlueprint(type) {
        const blueprints = {
            'profile': { label: "User Profile", icon: "👤", defaultContent: "Identity Root" },
            'note': { label: "Sticky Note", icon: "📝", defaultContent: "Quick thought..." },
            'logic-gate': { label: "Logic Gate", icon: "⚡", defaultContent: "IF (condition) THEN" },
            'hub': { label: "Central Hub", icon: "💠", defaultContent: "Category Root" },
            
            // Web Dev Nodes
            'web-root': { label: "Website Root", icon: "🌐", defaultContent: "My Awesome Site" },
            'web-nav': { label: "Navigation Bar", icon: "🧭", defaultContent: "Home | About | Contact" },
            'web-hero': { label: "Hero Section", icon: "⭐", defaultContent: "Welcome to the future." },
            'web-feature': { label: "Feature Block", icon: "✨", defaultContent: "<h3>Feature Name</h3><p>Description...</p>" },
            'web-footer': { label: "Footer", icon: "🦶", defaultContent: "© 2026 Company Name" }
        };
        return blueprints[type] || { label: "Unknown Node", icon: "⚪", defaultContent: "..." };
    }

    // --- GRAPH TRAVERSAL HELPERS (New) ---
    getChildren(nodeId) {
        return this.state.edges
            .filter(e => e.source === nodeId)
            .map(e => this.state.nodes.find(n => n.id === e.target))
            .filter(n => n); // filter undefined
    }

    getParents(nodeId) {
        return this.state.edges
            .filter(e => e.target === nodeId)
            .map(e => this.state.nodes.find(n => n.id === e.source))
            .filter(n => n);
    }

    // --- STATE MUTATION ---
    addNode(nodeData) {
        this.saveHistory();
        const id = nodeData.id || this.generateId();
        const bp = this.getBlueprint(nodeData.type || 'note');
        
        const newNode = {
            id: id,
            x: nodeData.x || 0,
            y: nodeData.y || 0,
            title: nodeData.title || bp.label,
            type: nodeData.type || 'note',
            content: nodeData.content || bp.defaultContent,
            metadata: nodeData.metadata || {}
        };
        
        this.state.nodes.push(newNode);
        this.notify();
        return newNode;
    }

    updateNode(id, updates) {
        const node = this.state.nodes.find(n => n.id === id);
        if (node) {
            if (updates.title || updates.content || updates.type) this.saveHistory();
            Object.assign(node, updates);
            this.notify();
        }
    }

    deleteNode(id) {
        this.saveHistory();
        this.state.nodes = this.state.nodes.filter(n => n.id !== id);
        this.state.edges = this.state.edges.filter(e => e.source !== id && e.target !== id);
        if (this.state.selectedId === id) this.state.selectedId = null;
        this.notify();
    }

    addEdge(sourceId, targetId) {
        if (sourceId === targetId) return;
        const exists = this.state.edges.find(e => e.source === sourceId && e.target === targetId);
        if (exists) return;

        this.saveHistory();
        this.state.edges.push({
            id: this.generateId(),
            source: sourceId,
            target: targetId,
            relation: "linked"
        });
        this.notify();
    }

    deleteEdge(id) {
        this.saveHistory();
        this.state.edges = this.state.edges.filter(e => e.id !== id);
        this.notify();
    }

    selectNode(id) {
        this.state.selectedId = id;
        this.notify();
    }

    // --- AUTO LAYOUT ---
    autoLayout() {
        this.saveHistory();
        const roots = this.state.nodes.filter(n => !this.state.edges.find(e => e.target === n.id));
        if (roots.length === 0 && this.state.nodes.length > 0) roots.push(this.state.nodes[0]); 

        const visited = new Set();
        let currentY = 0;

        const layoutNode = (nodeId, x, level) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const node = this.state.nodes.find(n => n.id === nodeId);
            if (!node) return;

            const children = this.getChildren(nodeId);

            node.x = x;
            
            if (children.length === 0) {
                node.y = currentY;
                currentY += this.config.spacing.y;
            } else {
                let firstChildY = currentY;
                children.forEach(child => layoutNode(child.id, x + this.config.spacing.x, level + 1));
                let lastChildY = currentY - this.config.spacing.y;
                node.y = (firstChildY + lastChildY) / 2;
            }
        };

        roots.forEach(root => layoutNode(root.id, 0, 0));
        
        if(roots.length > 0) {
            this.state.viewport.x = window.innerWidth/2 - roots[0].x;
            this.state.viewport.y = window.innerHeight/2 - roots[0].y;
        }
        this.notify();
    }

    // --- AI STUB ---
    async senseIntent(context) {
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({ content: "Idea: Add a 'Testimonials' section to build trust." });
            }, 800);
        });
    }

    // --- UTILS ---
    generateId() { return Math.random().toString(36).substr(2, 9); }

    screenToWorld(screenX, screenY) {
        const v = this.state.viewport;
        return { x: (screenX - v.x) / v.scale, y: (screenY - v.y) / v.scale };
    }

    worldToScreen(worldX, worldY) {
        const v = this.state.viewport;
        return { x: (worldX * v.scale) + v.x, y: (worldY * v.scale) + v.y };
    }

    subscribe(listener) { this.listeners.push(listener); }
    notify() { this.listeners.forEach(fn => fn(this.state)); }

    loadFromStorage() {
        try { return JSON.parse(localStorage.getItem("mm_core_state")); } 
        catch (e) { return null; }
    }

    checkAutoSave() {
        const current = JSON.stringify(this.state);
        if (current !== this.lastSaveState) {
            localStorage.setItem("mm_core_state", current);
            this.lastSaveState = current;
            const statusEl = document.getElementById('save-status');
            if(statusEl) {
                statusEl.innerText = "Saving...";
                setTimeout(() => statusEl.innerText = "Synced", 500);
            }
        }
    }

    resetStorage() {
        if(confirm("Wipe local data?")) {
            localStorage.removeItem("mm_core_state");
            location.reload();
        }
    }

    saveHistory() {
        this.state.history.push(JSON.stringify({ nodes: this.state.nodes, edges: this.state.edges }));
        if (this.state.history.length > 50) this.state.history.shift();
    }

    undo() {
        if (this.state.history.length === 0) return;
        const prev = JSON.parse(this.state.history.pop());
        this.state.nodes = prev.nodes;
        this.state.edges = prev.edges;
        this.state.selectedId = null;
        this.notify();
    }
}
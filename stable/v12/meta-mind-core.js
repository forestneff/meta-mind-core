/**
 * META-MIND CORE KERNEL v4.1
 * The central "Webkit" for Federated Mapstate Management.
 * Includes Auto-Arrange, Smart Sorting, and Viewport Centering.
 */

class MetaMindKernel {
    constructor() {
        this.config = {
            autoSaveInterval: 2000,
            spacing: { x: 300, y: 120 }, // Tighter vertical spacing
            autoArrangeEnabled: true     // Toggle for auto-layout on changes
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
                version: "4.1.0"
            }
        };
    }

    // --- NODE BLUEPRINTS ---
    getBlueprint(type) {
        const blueprints = {
            'profile': { label: "User Profile", icon: "👤", defaultContent: "Identity Root", priority: 0 },
            'hub': { label: "Central Hub", icon: "💠", defaultContent: "Category Root", priority: 1 },
            'web-root': { label: "Website Root", icon: "🌐", defaultContent: "My Awesome Site", priority: 2 },
            'web-nav': { label: "Navigation Bar", icon: "🧭", defaultContent: "Home | About | Contact", priority: 3 },
            'logic-gate': { label: "Logic Gate", icon: "⚡", defaultContent: "IF (condition) THEN", priority: 5 },
            'web-hero': { label: "Hero Section", icon: "⭐", defaultContent: "Welcome.", priority: 6 },
            'web-feature': { label: "Feature Block", icon: "✨", defaultContent: "<h3>Feature</h3>", priority: 7 },
            'web-footer': { label: "Footer", icon: "🦶", defaultContent: "© 2026", priority: 9 },
            'note': { label: "Sticky Note", icon: "📝", defaultContent: "Quick thought...", priority: 10 }
        };
        return blueprints[type] || { label: "Unknown Node", icon: "⚪", defaultContent: "...", priority: 99 };
    }

    // --- GRAPH HELPERS ---
    getChildren(nodeId) {
        return this.state.edges
            .filter(e => e.source === nodeId)
            .map(e => this.state.nodes.find(n => n.id === e.target))
            .filter(n => n);
    }

    getParents(nodeId) {
        return this.state.edges
            .filter(e => e.target === nodeId)
            .map(e => this.state.nodes.find(n => n.id === e.source))
            .filter(n => n);
    }

    // --- SORTING LOGIC (The "Generic" Sorter) ---
    nodeComparator(a, b) {
        // 1. Sort by Blueprint Priority (Hubs/Roots first)
        const bpA = this.getBlueprint(a.type).priority || 99;
        const bpB = this.getBlueprint(b.type).priority || 99;
        if (bpA !== bpB) return bpA - bpB;

        // 2. Sort Alphabetically by Title
        if (a.title && b.title) return a.title.localeCompare(b.title);

        // 3. Fallback to ID
        return a.id.localeCompare(b.id);
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

        // Trigger Auto-Arrange if enabled
        if (this.config.autoArrangeEnabled) {
            this.autoLayout(id); // Layout and focus new node
        } else {
            this.notify();
        }

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
        
        if (this.config.autoArrangeEnabled) {
            this.autoLayout(); // Re-layout (focuses root default)
        } else {
            this.notify();
        }
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
        
        if (this.config.autoArrangeEnabled) {
            this.autoLayout(targetId); // Re-layout focusing the child
        } else {
            this.notify();
        }
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

    // --- AUTO LAYOUT & CENTERING ---
    autoLayout(focusNodeId = null) {
        // 1. Identify Roots (Nodes with no incoming edges)
        let roots = this.state.nodes.filter(n => !this.state.edges.find(e => e.target === n.id));
        
        // Safety: If circular or everything connected, pick first node
        if (roots.length === 0 && this.state.nodes.length > 0) roots.push(this.state.nodes[0]); 

        const visited = new Set();
        let currentY = 0;

        // Recursive Layout Function
        const layoutNode = (nodeId, x) => {
            if (visited.has(nodeId)) return;
            visited.add(nodeId);

            const node = this.state.nodes.find(n => n.id === nodeId);
            if (!node) return;

            // Get Sorted Children
            const children = this.getChildren(nodeId).sort((a, b) => this.nodeComparator(a, b));

            // Position X (Depth)
            node.x = x;
            
            if (children.length === 0) {
                // Leaf Node: Dictates vertical spacing
                node.y = currentY;
                currentY += this.config.spacing.y;
            } else {
                // Parent Node: Centered relative to children
                let firstChildY = currentY;
                
                // Recurse
                children.forEach(child => layoutNode(child.id, x + this.config.spacing.x));
                
                let lastChildY = currentY - this.config.spacing.y;
                node.y = (firstChildY + lastChildY) / 2;
            }
        };

        // Run Layout for each root forest
        roots.sort((a,b) => this.nodeComparator(a,b)).forEach(root => layoutNode(root.id, 0));
        
        // 2. Center Viewport
        if (focusNodeId) {
            const target = this.state.nodes.find(n => n.id === focusNodeId);
            if (target) this.centerOnNode(target);
        } else if (roots.length > 0) {
            this.centerOnNode(roots[0]);
        } else {
            this.notify(); // Just render if empty
        }
    }

    centerOnNode(node) {
        // Goal: Node (world coords) should be at Screen Center
        // ScreenX = WorldX * Scale + ViewportX
        // ViewportX = ScreenCenter - (WorldX * Scale)
        
        const screenCX = window.innerWidth / 2;
        const screenCY = window.innerHeight / 2;
        
        // Animate? For now, snap.
        this.state.viewport.x = screenCX - (node.x * this.state.viewport.scale);
        this.state.viewport.y = screenCY - (node.y * this.state.viewport.scale);
        
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
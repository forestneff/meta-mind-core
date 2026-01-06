/**
 * META-MIND PHASE ENGINE SYSTEM v2.0
 * Modular "Plugin" Architecture for Mapstate Interpretation.
 */

// --- BASE CLASS (The Contract) ---
class PhaseEngine {
    constructor(kernel) {
        this.kernel = kernel;
        this.id = 'base';
        this.label = 'Base Phase';
        this.icon = '⚪';
    }

    // The core function: Interpret State -> DOM
    render(container, state) {
        console.warn(`${this.label} has not implemented render()`);
    }

    // Optional: Handle clicks inside the phase view
    handleSelection(nodeId) {
        this.kernel.state.selectedId = nodeId;
        this.kernel.notify();
    }
}

// --- ENGINE 1: TEXTUAL OUTLINER ---
class TextPhase extends PhaseEngine {
    constructor(kernel) {
        super(kernel);
        this.id = 'text';
        this.label = 'Text Outline';
        this.icon = '≡';
    }

    render(container, state) {
        container.innerHTML = `<div class="space-y-1">` + 
            state.nodes.map(n => `
                <div class="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex items-center gap-3 ${state.selectedId === n.id ? 'bg-orange-50' : ''}" 
                     onclick="PhaseRegistry.handleNodeClick('${n.id}')">
                    <span class="text-xl opacity-30">⦿</span>
                    <div>
                        <div class="text-sm font-bold text-slate-800">${n.title}</div>
                        <div class="text-[10px] text-slate-400 font-mono uppercase tracking-wider">${n.type}</div>
                    </div>
                </div>
            `).join('') + 
        `</div>`;
    }
}

// --- ENGINE 2: WEB ARCHITECT ---
class WebPhase extends PhaseEngine {
    constructor(kernel) {
        super(kernel);
        this.id = 'web';
        this.label = 'Web Architect';
        this.icon = '🌐';
    }

    render(container, state) {
        container.innerHTML = "";
        
        // Interpretation Logic: Find Roots
        const targets = new Set(state.edges.map(e => e.target));
        const roots = state.nodes.filter(n => !targets.has(n.id));

        if (roots.length === 0 && state.nodes.length > 0) {
            state.nodes.forEach(n => container.appendChild(this._createWidget(n, state)));
        } else {
            roots.forEach(root => this._renderRecursive(root, container, state));
        }
    }

    _renderRecursive(node, parentEl, state) {
        const el = this._createWidget(node, state);
        parentEl.appendChild(el);

        // Find Children
        const childEdges = state.edges.filter(e => e.source === node.id);
        const childNodes = childEdges.map(e => state.nodes.find(n => n.id === e.target)).filter(n => n);
        
        // Visual Sort (Left-to-Right in Map = Top-to-Bottom in Web)
        childNodes.sort((a,b) => a.position.x - b.position.x);

        if (childNodes.length > 0) {
            const wrapper = document.createElement('div');
            // Contextual Layout: Grid vs Stack
            if (node.type === 'grid' || node.type === 'section') wrapper.className = "grid grid-cols-1 md:grid-cols-3 gap-6 mt-6";
            else wrapper.className = "flex flex-col gap-4 mt-6 pl-4 border-l-2 border-slate-100";
            
            childNodes.forEach(child => this._renderRecursive(child, wrapper, state));
            el.appendChild(wrapper);
        }
    }

    _createWidget(node, state) {
        const div = document.createElement('div');
        div.className = `p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-orange-400 transition-all cursor-pointer relative group ${state.selectedId === node.id ? 'ring-2 ring-orange-500' : ''}`;
        div.onclick = (e) => { e.stopPropagation(); PhaseRegistry.handleNodeClick(node.id); };

        // Type Badge
        div.innerHTML = `<div class="absolute top-2 right-2 text-[9px] font-bold text-slate-300 uppercase opacity-0 group-hover:opacity-100">${node.type}</div>`;

        // Content Interpretation
        if (node.type === 'hero') {
            div.className += " bg-slate-900 text-white text-center py-12";
            div.innerHTML += `<h1 class="text-4xl font-black mb-2">${node.title}</h1><div class="text-slate-400 prose prose-invert mx-auto">${node.content}</div>`;
        } else if (node.type === 'button') {
            div.className = "inline-block bg-orange-600 text-white px-8 py-3 rounded-full font-bold text-center shadow-lg hover:bg-orange-700 transform hover:-translate-y-1 transition-all";
            div.innerHTML = node.title;
        } else if (node.type === 'nav') {
            div.className += " flex justify-between items-center";
            div.innerHTML += `<div class="font-black text-xl tracking-tighter">LOGO</div><div class="text-sm font-bold text-slate-500">${node.content}</div>`;
        } else {
            div.innerHTML += `<h3 class="font-bold text-lg mb-2 text-slate-800">${node.title}</h3><div class="text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">${node.content || "Empty content..."}</div>`;
        }
        return div;
    }
}

// --- THE REGISTRY (Singleton) ---
class PhaseRegistrySystem {
    constructor() {
        this.engines = [];
        this.activeEngineId = null;
        this.kernel = null;
    }

    init(kernel) {
        this.kernel = kernel;
        // Register Standard Phases
        this.register(new TextPhase(kernel));
        this.register(new WebPhase(kernel));
    }

    register(engine) {
        this.engines.push(engine);
        console.log(`[PhaseRegistry] Registered: ${engine.label}`);
    }

    setActive(id) {
        const engine = this.engines.find(e => e.id === id);
        if (engine) {
            this.activeEngineId = id;
            console.log(`[PhaseRegistry] Switched to: ${engine.label}`);
        }
    }

    getActive() {
        return this.engines.find(e => e.id === this.activeEngineId);
    }

    renderActive(containerId) {
        const engine = this.getActive();
        const container = document.getElementById(containerId);
        if (engine && container) {
            container.innerHTML = ""; // Clear
            engine.render(container, this.kernel.state);
        }
    }

    handleNodeClick(id) {
        if(this.kernel) {
            this.kernel.state.selectedId = id;
            this.kernel.notify();
        }
    }
}

const PhaseRegistry = new PhaseRegistrySystem();
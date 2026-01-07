/**
 * META-MIND PHASE ENGINE SYSTEM v2.6
 * Modular "Plugin" Architecture for Mapstate Interpretation.
 * Includes Text-to-Map Parsing Logic.
 */

// --- BASE CLASS ---
class PhaseEngineBase {
    constructor(kernel) {
        this.kernel = kernel;
        this.id = 'base';
        this.label = 'Base Phase';
        this.icon = '⚪';
    }
    render(container, state) { console.warn(`[PhaseEngine] ${this.label} render() not implemented.`); }
    renderNode(node) { return `<div class="p-2 border rounded">${node.title}</div>`; }
}

// --- ENGINE 1: TEXTUAL EDITOR (Code/List View) ---
class TextPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'text';
        this.label = 'Text Editor';
        this.icon = '📝';
        this.isEditing = false;
    }

    render(container, state) {
        // If user is editing, don't overwrite with state render
        if (this.isEditing) return;

        // Convert Mapstate to Bulleted List
        const targets = new Set(state.edges.map(e => e.target));
        const roots = state.nodes.filter(n => !targets.has(n.id));
        
        let textContent = "";
        
        const serialize = (node, depth) => {
            const indent = "  ".repeat(depth);
            textContent += `${indent}- ${node.title}\n`; // Markdown style
            const children = state.edges
                .filter(e => e.source === node.id)
                .map(e => state.nodes.find(n => n.id === e.target));
            children.forEach(c => serialize(c, depth + 1));
        };

        if (roots.length === 0 && state.nodes.length > 0) {
            // Fallback for non-hierarchical
            state.nodes.forEach(n => textContent += `- ${n.title}\n`);
        } else {
            roots.forEach(r => serialize(r, 0));
        }

        container.innerHTML = `
            <div class="h-full flex flex-col bg-slate-50 border border-slate-200 rounded-lg overflow-hidden">
                <div class="flex justify-between items-center px-4 py-2 bg-white border-b border-slate-200">
                    <h3 class="text-xs font-bold uppercase text-slate-400 tracking-wider">Quick Edit</h3>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-slate-400 font-mono">Markdown Format</span>
                        <button id="btn-parse-text" class="px-3 py-1 bg-slate-900 text-white text-[10px] font-bold rounded hover:bg-orange-600 transition-colors">Apply Changes</button>
                    </div>
                </div>
                <textarea id="text-phase-input" class="w-full h-full bg-slate-50 p-6 font-mono text-sm text-slate-700 focus:outline-none resize-none leading-relaxed" 
                placeholder="- Root\n  - Child A\n  - Child B">${textContent}</textarea>
            </div>
        `;

        // Bind Events
        const ta = document.getElementById('text-phase-input');
        const btn = document.getElementById('btn-parse-text');
        
        ta.addEventListener('focus', () => { this.isEditing = true; });
        ta.addEventListener('blur', () => { this.isEditing = false; });
        
        btn.addEventListener('click', () => {
            this.parseTextToMap(ta.value);
            this.isEditing = false;
        });
    }

    // PARSER: Converts indented text back into Nodes/Edges
    parseTextToMap(text) {
        console.log("Parsing text to map...");
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        
        // Reset Kernel (Optional: or merge?)
        // For this prototype, we clear and rebuild to match the text exacty
        this.kernel.state.nodes = [];
        this.kernel.state.edges = [];
        
        const stack = []; // To track parents by indentation
        
        lines.forEach(line => {
            // Calculate depth (2 spaces = 1 level)
            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[0].length : 0;
            const depth = Math.floor(indent / 2);
            
            // Clean content
            let content = line.trim();
            if (content.startsWith('- ')) content = content.substring(2);
            if (content.startsWith('* ')) content = content.substring(2);
            
            // Create Node
            const id = this.kernel.addNode({ title: content });
            
            // Link to Parent
            if (depth > 0) {
                // Find nearest parent in stack
                let parent = stack[depth - 1];
                // Fallback search
                if (!parent) {
                    for(let i = depth - 1; i >= 0; i--) {
                        if(stack[i]) { parent = stack[i]; break; }
                    }
                }
                
                if (parent) {
                    this.kernel.addEdge(parent.id, id);
                }
            }
            
            stack[depth] = { id, depth };
            stack.splice(depth + 1); 
        });
        
        // Trigger Auto Layout and Refresh
        this.kernel.autoLayout();
        this.kernel.notify();
    }
    
    renderNode(node) {
        return `<pre class="text-[10px] font-mono bg-slate-50 p-2 rounded text-slate-600 overflow-x-auto">${JSON.stringify(node, null, 2)}</pre>`;
    }
}

// --- ENGINE 2: WEB ARCHITECT ---
class WebPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'web';
        this.label = 'Web Architect';
        this.icon = '🌐';
    }

    render(container, state) {
        container.innerHTML = "";
        const targets = new Set(state.edges.map(e => e.target));
        const roots = state.nodes.filter(n => !targets.has(n.id));
        const renderList = roots.length > 0 ? roots : state.nodes;

        renderList.forEach(root => {
            if (roots.length > 0) this._renderRecursive(root, container, state);
            else container.appendChild(this._createWidget(root, state));
        });
    }

    _renderRecursive(node, parentEl, state) {
        const el = this._createWidget(node, state);
        parentEl.appendChild(el);
        const childEdges = state.edges.filter(e => e.source === node.id);
        const childNodes = childEdges.map(e => state.nodes.find(n => n.id === e.target)).filter(n => n);
        childNodes.sort((a,b) => a.position.x - b.position.x);

        if (childNodes.length > 0) {
            const wrapper = document.createElement('div');
            if (node.type === 'grid' || node.type === 'section') wrapper.className = "grid grid-cols-1 md:grid-cols-3 gap-6 mt-6";
            else wrapper.className = "flex flex-col gap-4 mt-6 pl-4 border-l-2 border-slate-100";
            childNodes.forEach(child => this._renderRecursive(child, wrapper, state));
            el.appendChild(wrapper);
        }
    }

    _createWidget(node, state) {
        const div = document.createElement('div');
        div.className = `p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-orange-400 transition-all cursor-pointer relative group ${state.selectedId === node.id ? 'ring-2 ring-orange-500' : ''}`;
        div.onclick = (e) => { 
            e.stopPropagation(); 
            if(window.MM) { window.MM.state.selectedId = node.id; window.MM.notify(); }
        };
        // Widget Logic
        if (node.type === 'hero') {
            div.className += " bg-slate-900 text-white text-center py-12";
            div.innerHTML += `<h1 class="text-4xl font-black mb-2">${node.title}</h1><div class="text-slate-400 opacity-80">${node.content}</div>`;
        } else if (node.type === 'button') {
            div.className = "inline-block bg-orange-600 text-white px-8 py-3 rounded-full font-bold text-center shadow-lg hover:bg-orange-700 transform hover:-translate-y-1 transition-all";
            div.innerHTML = node.title;
        } else if (node.type === 'nav') {
             div.className += " flex justify-between items-center bg-white border-b border-gray-100 py-4";
             div.innerHTML += `<div class="font-bold text-xl">LOGO</div><div class="text-sm text-gray-500">${node.content}</div>`;
        } else {
            div.innerHTML = `<h3 class="font-bold text-lg mb-2 text-slate-800">${node.title}</h3><div class="text-sm text-slate-500 leading-relaxed whitespace-pre-wrap">${node.content || ""}</div>`;
        }
        return div;
    }
}

// --- ENGINE 3: UNIVERSAL ---
class UniversalPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'universal';
        this.label = 'Universal View';
        this.icon = '♾️';
    }
    render(container, state) {
        const content = state.nodes.map(node => {
            const rendererId = node.metadata?.renderer || 'web'; 
            const engine = PhaseRegistry.engines.find(e => e.id === rendererId) || PhaseRegistry.engines.find(e => e.id === 'web');
            return `<div class="mb-8"><div class="flex justify-between items-center mb-2 px-2"><span class="text-xs font-bold text-slate-400 uppercase tracking-widest">${node.title}</span><span class="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-mono">${engine.label}</span></div>${engine ? engine._createWidget(node, state).outerHTML : '<div class="text-red-500">Error</div>'}</div>`;
        }).join('');
        container.innerHTML = `<div class="max-w-2xl mx-auto py-8">${content}</div>`;
    }
}

// --- REGISTRY ---
class PhaseRegistrySystem {
    constructor() { this.engines = []; this.activeEngineId = 'map'; this.kernel = null; }
    init(kernel) {
        this.kernel = kernel;
        this.register(new TextPhaseEngine(kernel));
        this.register(new WebPhaseEngine(kernel));
        this.register(new UniversalPhaseEngine(kernel));
    }
    register(engine) { this.engines.push(engine); }
    setActive(id) { this.activeEngineId = id; }
    getActive() { return this.engines.find(e => e.id === this.activeEngineId); }
    renderActive(containerId) {
        const engine = this.getActive();
        const container = document.getElementById(containerId);
        if (engine && container) { container.innerHTML = ""; engine.render(container, this.kernel.state); }
    }
}
const PhaseRegistry = new PhaseRegistrySystem();
/**
 * META-MIND PHASE ENGINE SYSTEM v5.0
 * Smart Rendering Edition (Fixes Input Lockout)
 */

class PhaseRegistrySystem {
    constructor() {
        this.engines = [];
        this.activeViewMode = 'map'; // 'map', 'web', 'tree'
        this.kernel = null;
    }

    init(kernel) {
        this.kernel = kernel;
        this.register(new UniversalPhaseEngine(kernel)); // Inspector
        this.register(new WebPhaseEngine(kernel));       // View
        this.register(new TreePhaseEngine(kernel));      // View
    }

    register(engine) { this.engines.push(engine); }
    
    // Get engine by ID
    get(id) { return this.engines.find(e => e.id === id); }
}

class PhaseEngineBase {
    constructor(kernel) {
        this.kernel = kernel;
        this.id = 'base';
        this.label = 'Base Phase';
        this.icon = '⚪';
    }
    render(container, state) {}
}

// --- ENGINE 1: UNIVERSAL INSPECTOR (Sidebar Property Editor) ---
class UniversalPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'inspector';
        this.label = 'Properties';
        this.lastRenderedId = null;
    }

    render(container, state) {
        const node = state.nodes.find(n => n.id === state.selectedId);
        
        // 1. Empty State
        if (!node) {
            container.innerHTML = `<div class="text-center mt-10 text-slate-400 italic text-xs">Select a node to edit properties.</div>`;
            this.lastRenderedId = null;
            return;
        }

        // 2. Check if we need a full rebuild (Node Changed)
        if (this.lastRenderedId !== node.id) {
            this.buildDOM(container, node);
            this.lastRenderedId = node.id;
        }

        // 3. Smart Update (Values Only)
        this.updateValues(container, node);
    }

    buildDOM(container, node) {
        container.innerHTML = ''; // Clear
        const wrapper = document.createElement('div');
        wrapper.className = "animate-fade-in";

        // Helper
        const group = (lbl, el) => {
            const d = document.createElement('div'); d.className = "mb-4";
            const l = document.createElement('label'); 
            l.className = "text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1";
            l.innerText = lbl;
            d.appendChild(l); d.appendChild(el);
            return d;
        };

        // Title
        const titleInp = document.createElement('input');
        titleInp.id = 'insp-title';
        titleInp.type = "text";
        titleInp.className = "w-full bg-slate-50 border border-slate-200 p-2 rounded font-bold text-slate-800 text-sm focus:outline-none focus:border-orange-500";
        titleInp.oninput = (e) => this.kernel.updateNode(node.id, { title: e.target.value });
        wrapper.appendChild(group("Title", titleInp));

        // Type
        const typeSel = document.createElement('select');
        typeSel.id = 'insp-type';
        typeSel.className = "w-full bg-white border border-slate-200 p-2 rounded text-xs";
        ['note','profile','hub','logic-gate','web-root','web-nav','web-hero','web-feature','web-footer'].forEach(t => {
            const opt = document.createElement('option');
            opt.value = t; opt.innerText = t.toUpperCase();
            typeSel.appendChild(opt);
        });
        typeSel.onchange = (e) => this.kernel.updateNode(node.id, { type: e.target.value });
        wrapper.appendChild(group("Type", typeSel));

        // Content
        const contentArea = document.createElement('textarea');
        contentArea.id = 'insp-content';
        contentArea.className = "w-full bg-white border border-slate-200 p-2 rounded text-xs font-mono min-h-[120px] focus:outline-none focus:border-orange-500";
        contentArea.oninput = (e) => this.kernel.updateNode(node.id, { content: e.target.value });
        wrapper.appendChild(group("Content / HTML", contentArea));

        // AI & Delete
        const actions = document.createElement('div');
        actions.className = "flex gap-2 mt-6";
        actions.innerHTML = `
            <button onclick="SC.triggerAI()" class="flex-1 py-2 bg-indigo-50 text-indigo-600 text-xs font-bold rounded hover:bg-indigo-100">✨ AI Assist</button>
            <button onclick="SC.triggerDelete()" class="flex-1 py-2 bg-red-50 text-red-500 text-xs font-bold rounded hover:bg-red-100">Delete</button>
        `;
        wrapper.appendChild(actions);

        container.appendChild(wrapper);
    }

    updateValues(container, node) {
        // Safe Update: Only update if element is NOT focused
        const setVal = (id, val) => {
            const el = container.querySelector(`#${id}`);
            if (el && document.activeElement !== el) {
                el.value = val || '';
            }
            // For Selects, always update if value mismatch
            if (el && el.tagName === 'SELECT' && el.value !== val) {
                el.value = val;
            }
        };

        setVal('insp-title', node.title);
        setVal('insp-type', node.type);
        setVal('insp-content', node.content);
    }
}

// --- ENGINE 2: WEB ARCHITECT (View Mode) ---
class WebPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'web';
        this.label = 'Web Architect';
        this.icon = '🌐';
    }

    render(container, state) {
        // Simple full re-render for Web View (Preview is usually read-only or full refresh)
        // Find Root
        const root = state.nodes.find(n => n.type === 'web-root') || state.nodes[0];
        
        if (!root) {
            container.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400">No Web Root Found</div>`;
            return;
        }

        const html = this.generateHTML(root, state);
        
        // Toolbar
        let toolbar = document.getElementById('web-toolbar');
        if(!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'web-toolbar';
            toolbar.className = "flex justify-between items-center mb-4 pb-4 border-b border-slate-100";
            toolbar.innerHTML = `
                <span class="font-bold text-slate-700">Live Preview</span>
                <button onclick="SC.downloadWeb()" class="bg-slate-900 text-white text-xs px-3 py-1 rounded">Export HTML</button>
            `;
            container.appendChild(toolbar);
        }

        // IFrame
        let frame = document.getElementById('web-frame');
        if(!frame) {
            frame = document.createElement('iframe');
            frame.id = 'web-frame';
            frame.className = "w-full flex-1 bg-white border border-slate-200 rounded shadow-sm";
            frame.style.minHeight = "500px";
            container.appendChild(frame);
        }
        
        // Update IFrame Content
        if(frame.srcdoc !== html) frame.srcdoc = html;
    }

    generateHTML(root, state) {
        const getKids = (id) => state.edges.filter(e => e.source === id).map(e => state.nodes.find(n => n.id === e.target)).filter(n => n);
        const render = (node) => {
            const kids = getKids(node.id).map(render).join('');
            switch(node.type) {
                case 'web-root': return `<!DOCTYPE html><html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50">${kids}</body></html>`;
                case 'web-nav': return `<nav class="bg-white shadow p-4"><div class="container mx-auto font-bold flex justify-between"><span>${node.title}</span><div class="text-sm font-normal">${node.content}</div></div></nav>`;
                case 'web-hero': return `<header class="bg-blue-600 text-white py-20 text-center"><h1 class="text-4xl font-bold mb-4">${node.title}</h1><div class="text-xl opacity-90">${node.content}</div></header>`;
                case 'web-feature': return `<section class="py-12 px-4 container mx-auto border-b"><h2 class="text-2xl font-bold mb-2">${node.title}</h2><div class="prose">${node.content}</div>${kids}</section>`;
                case 'web-footer': return `<footer class="bg-slate-900 text-white py-8 text-center mt-12"><div class="container mx-auto text-sm">${node.content}</div></footer>`;
                default: return `<div class="p-4">${node.content || node.title}${kids}</div>`;
            }
        };
        return render(root);
    }
}

// --- ENGINE 3: OUTLINER (View Mode) ---
class TreePhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'tree';
        this.label = 'Outliner';
        this.icon = '📝';
    }

    render(container, state) {
        // This needs smart rendering for the list items
        const roots = state.nodes.filter(n => !state.edges.find(e => e.target === n.id));
        if(roots.length === 0 && state.nodes.length > 0) roots.push(state.nodes[0]);

        // Helper to check/create row
        const ensureRow = (node, depth) => {
            let row = document.getElementById(`tree-row-${node.id}`);
            if(!row) {
                row = document.createElement('div');
                row.id = `tree-row-${node.id}`;
                row.className = "tree-row";
                row.style.paddingLeft = `${depth * 20}px`;
                
                const icon = document.createElement('span');
                icon.className = "text-xs select-none";
                icon.innerText = this.kernel.getBlueprint(node.type).icon;
                
                const input = document.createElement('input');
                input.id = `tree-input-${node.id}`;
                input.type = "text";
                input.oninput = (e) => this.kernel.updateNode(node.id, { title: e.target.value });
                input.onfocus = () => this.kernel.selectNode(node.id);

                row.appendChild(icon);
                row.appendChild(input);
                container.appendChild(row);
            }
            
            // Smart Value Update
            const input = row.querySelector('input');
            if(document.activeElement !== input) {
                input.value = node.title;
            }
            
            // Highlight Selection
            row.style.background = (state.selectedId === node.id) ? '#fff7ed' : 'transparent';
        };

        const renderTree = (nodeId, depth) => {
            const node = state.nodes.find(n => n.id === nodeId);
            if(!node) return;
            ensureRow(node, depth);
            
            // Children
            const kids = this.kernel.getChildren(nodeId).sort((a,b) => this.kernel.nodeComparator(a,b));
            kids.forEach(k => renderTree(k.id, depth + 1));
        };

        // We append to container, but we need to manage order
        // Simple approach: Clear if total count differs drastically, otherwise assume stability
        // Better: Just re-append existing rows in correct order to sort them
        if (container.children.length === 0) {
            roots.forEach(r => renderTree(r.id, 0));
        } else {
            // Re-ordering pass (cheap in DOM if elements exist)
            roots.forEach(r => renderTree(r.id, 0));
        }
    }
}
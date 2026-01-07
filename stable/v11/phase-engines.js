/**
 * META-MIND PHASE ENGINE SYSTEM v4.0
 * Includes:
 * 1. Web Architect (Preview/Export)
 * 2. Tree Editor (Interactive Text List)
 * 3. Universal Inspector
 */

class PhaseRegistrySystem {
    constructor() {
        this.engines = [];
        this.activeEngineId = 'universal';
        this.kernel = null;
    }

    init(kernel) {
        this.kernel = kernel;
        this.register(new UniversalPhaseEngine(kernel));
        this.register(new WebPhaseEngine(kernel));
        this.register(new TreePhaseEngine(kernel)); // Replaces old TextPhase
    }

    register(engine) { this.engines.push(engine); }
    setActive(id) { this.activeEngineId = id; }
    getActive() { return this.engines.find(e => e.id === this.activeEngineId); }

    renderActive(container, state) {
        if (!container) return;
        const engine = this.getActive();
        if (engine) {
            container.innerHTML = '';
            engine.render(container, state);
        }
    }
}

class PhaseEngineBase {
    constructor(kernel) {
        this.kernel = kernel;
        this.id = 'base';
        this.label = 'Base Phase';
        this.icon = '⚪';
    }
    render(container, state) {}
    createInputGroup(labelText, inputElement) {
        const section = document.createElement('section');
        section.className = "mb-4";
        const label = document.createElement('label');
        label.className = "text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1";
        label.innerText = labelText;
        section.appendChild(label);
        section.appendChild(inputElement);
        return section;
    }
}

// --- ENGINE 1: UNIVERSAL INSPECTOR ---
class UniversalPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'universal';
        this.label = 'Inspector';
        this.icon = '🏗️';
    }

    render(container, state) {
        const node = state.nodes.find(n => n.id === state.selectedId);
        
        if (!node) {
            container.innerHTML = `<div class="text-center mt-10 text-slate-400 italic">Select a node to inspect properties.</div>`;
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.className = "p-2 animate-fade-in";

        // Title Input
        const titleInput = document.createElement('input');
        titleInput.type = "text";
        titleInput.value = node.title;
        titleInput.className = "w-full bg-slate-100 border border-slate-200 p-2 rounded-lg font-bold text-slate-800 focus:outline-none focus:border-orange-500 transition-colors";
        titleInput.oninput = (e) => this.kernel.updateNode(node.id, { title: e.target.value });
        wrapper.appendChild(this.createInputGroup("Node Title", titleInput));

        // Type Selector
        const typeSelect = document.createElement('select');
        typeSelect.className = "w-full bg-white border border-slate-200 p-2 rounded-lg text-sm";
        const types = ['note', 'profile', 'web-root', 'web-nav', 'web-hero', 'web-feature', 'web-footer', 'logic-gate', 'hub'];
        types.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt;
            option.innerText = opt.toUpperCase();
            if (node.type === opt) option.selected = true;
            typeSelect.appendChild(option);
        });
        typeSelect.onchange = (e) => this.kernel.updateNode(node.id, { type: e.target.value });
        wrapper.appendChild(this.createInputGroup("Blueprint Type", typeSelect));

        // Content
        const contentArea = document.createElement('textarea');
        contentArea.value = node.content || '';
        contentArea.className = "w-full bg-white border border-slate-200 p-2 rounded-lg text-sm min-h-[150px] font-mono text-xs focus:outline-none focus:border-orange-500";
        contentArea.oninput = (e) => this.kernel.updateNode(node.id, { content: e.target.value });
        wrapper.appendChild(this.createInputGroup("Inner Content (HTML/Text)", contentArea));

        // AI Sense
        const aiBtn = document.createElement('button');
        aiBtn.className = "w-full bg-indigo-50 text-indigo-600 font-bold text-xs py-2 rounded-lg hover:bg-indigo-100 mt-2";
        aiBtn.innerHTML = `✨ AI Sense`;
        aiBtn.onclick = async () => {
            aiBtn.innerText = "...";
            const res = await this.kernel.senseIntent(node.content);
            alert(`AI Suggestion:\n${res.content}`);
            aiBtn.innerHTML = `✨ AI Sense`;
        };
        wrapper.appendChild(aiBtn);

        container.appendChild(wrapper);
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
        // Look for Root
        const selected = state.nodes.find(n => n.id === state.selectedId);
        let root = (selected && selected.type === 'web-root') ? selected : state.nodes.find(n => n.type === 'web-root');

        if (!root) {
            container.innerHTML = `
                <div class="p-4 text-center">
                    <p class="text-sm text-slate-500 mb-4">No 'Website Root' node found.</p>
                    <button id="create-web-root" class="bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-lg shadow-blue-200">
                        + Create New Website
                    </button>
                </div>
            `;
            setTimeout(() => {
                const btn = document.getElementById('create-web-root');
                if(btn) btn.onclick = () => {
                    this.kernel.addNode({ type: 'web-root', title: "My Website", x: 0, y: 0 });
                };
            }, 0);
            return;
        }

        const html = this.generateSiteHTML(root, state);

        const wrapper = document.createElement('div');
        wrapper.className = "flex flex-col h-full";
        
        const toolbar = document.createElement('div');
        toolbar.className = "flex justify-between items-center mb-2 px-2";
        toolbar.innerHTML = `<span class="text-xs font-bold text-slate-700">Preview: ${root.title}</span>`;
        
        const exportBtn = document.createElement('button');
        exportBtn.className = "text-xs bg-slate-800 text-white px-2 py-1 rounded hover:bg-black";
        exportBtn.innerText = "⬇ Export";
        exportBtn.onclick = () => this.downloadHTML(root.title, html);
        toolbar.appendChild(exportBtn);

        const frame = document.createElement('iframe');
        frame.className = "w-full flex-1 border border-slate-200 rounded bg-white";
        frame.srcdoc = html;

        wrapper.appendChild(toolbar);
        wrapper.appendChild(frame);
        container.appendChild(wrapper);
    }

    generateSiteHTML(rootNode, state) {
        const getChildren = (id) => state.edges.filter(e => e.source === id).map(e => state.nodes.find(n => n.id === e.target)).filter(n => n);
        
        const renderNodeHTML = (node) => {
            const children = getChildren(node.id);
            const childHTML = children.map(c => renderNodeHTML(c)).join('\n');
            
            // Simple Component Switch
            switch (node.type) {
                case 'web-root':
                    return `<!DOCTYPE html><html><head><title>${node.title}</title><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-50 text-gray-900">${childHTML}</body></html>`;
                case 'web-nav': return `<nav class="bg-white shadow p-4 mb-4"><div class="container mx-auto font-bold">${node.content}</div></nav>`;
                case 'web-hero': return `<section class="bg-blue-600 text-white py-20 px-4 text-center"><div class="container mx-auto"><h1 class="text-4xl font-bold mb-4">${node.title}</h1><div class="text-xl">${node.content}</div></div></section>`;
                case 'web-feature': return `<section class="py-12 px-4 container mx-auto border-b"><h2 class="text-2xl font-bold mb-2">${node.title}</h2><div>${node.content}</div>${childHTML}</section>`;
                case 'web-footer': return `<footer class="bg-slate-900 text-white py-8 text-center mt-12"><div class="container mx-auto">${node.content}</div></footer>`;
                default: return `<div class="p-4 border my-4 rounded bg-white shadow-sm"><h3 class="font-bold">${node.title}</h3><div>${node.content}</div>${childHTML}</div>`;
            }
        };
        return renderNodeHTML(rootNode);
    }

    downloadHTML(filename, content) {
        const element = document.createElement('a');
        element.setAttribute('href', 'data:text/html;charset=utf-8,' + encodeURIComponent(content));
        element.setAttribute('download', `${filename.replace(/\s+/g, '_')}.html`);
        document.body.appendChild(element); element.click(); document.body.removeChild(element);
    }
}

// --- ENGINE 3: INTERACTIVE TREE EDITOR (New) ---
class TreePhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'tree';
        this.label = 'Outliner';
        this.icon = '📝';
    }

    render(container, state) {
        container.innerHTML = `<h3 class="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Interactive Tree</h3>`;
        
        const listContainer = document.createElement('div');
        listContainer.className = "flex flex-col gap-1";

        // Logic: Find roots or render everything if flat
        // For simplicity in this editor, we render all nodes, but grouped by hierarchy if possible
        // Actually, let's just render the Selected Node's lineage + children to keep it focused
        
        let targetId = state.selectedId;
        if (!targetId && state.nodes.length > 0) targetId = state.nodes[0].id;
        if (!targetId) {
            container.innerHTML += `<div class="text-slate-400 italic text-xs">Map is empty.</div>`;
            return;
        }

        // 1. Render Parents (Ghosts)
        const parents = this.kernel.getParents(targetId);
        parents.forEach(p => {
            const el = document.createElement('div');
            el.className = "ghost-parent";
            el.innerText = `↑ ${p.title}`;
            el.onclick = () => this.kernel.selectNode(p.id);
            listContainer.appendChild(el);
        });

        // 2. Render Current Node (Editable)
        const currentNode = state.nodes.find(n => n.id === targetId);
        if(currentNode) {
            const wrapper = document.createElement('div');
            wrapper.className = "flex items-center gap-2 p-2 bg-orange-50 rounded border border-orange-200 mb-2";
            
            const icon = document.createElement('span');
            icon.innerText = this.kernel.getBlueprint(currentNode.type).icon;
            
            const input = document.createElement('input');
            input.value = currentNode.title;
            input.className = "bg-transparent font-bold text-slate-900 w-full focus:outline-none";
            input.oninput = (e) => this.kernel.updateNode(currentNode.id, { title: e.target.value });

            wrapper.appendChild(icon);
            wrapper.appendChild(input);
            listContainer.appendChild(wrapper);
        }

        // 3. Render Children (Editable List)
        const children = this.kernel.getChildren(targetId);
        if(children.length === 0) {
            const empty = document.createElement('div');
            empty.className = "text-xs text-slate-400 italic pl-4";
            empty.innerText = "No children. Use Radial Menu to add.";
            listContainer.appendChild(empty);
        }

        children.forEach(child => {
            const row = document.createElement('div');
            row.className = "tree-item pl-4";
            
            // Visual Guide
            const line = document.createElement('div');
            line.className = "tree-line";
            
            const input = document.createElement('input');
            input.value = child.title;
            input.className = "tree-input";
            input.oninput = (e) => this.kernel.updateNode(child.id, { title: e.target.value });
            input.onfocus = () => this.kernel.selectNode(child.id); // Selecting child focuses it

            row.appendChild(line);
            row.appendChild(input);
            listContainer.appendChild(row);
        });

        container.appendChild(listContainer);
    }
}
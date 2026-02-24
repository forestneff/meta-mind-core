/**
 * META-MIND PHASE ENGINE SYSTEM v13.3
 * Added Federation Engine, Fixed Quick Action arguments.
 */

class PhaseRegistrySystem {
    constructor() {
        this.engines = [];
        this.activeViewMode = 'map';
        this.kernel = null;
    }
    init(kernel) {
        this.kernel = kernel;
        this.register(new UniversalPhaseEngine(kernel));
        this.register(new WebPhaseEngine(kernel));
        this.register(new OrbitalPhaseEngine(kernel));
        this.register(new LibraryPhaseEngine(kernel));
        this.register(new FederationPhaseEngine(kernel)); // New!
    }
    register(engine) { this.engines.push(engine); }
    get(id) { return this.engines.find(e => e.id === id); }
}

class PhaseEngineBase {
    constructor(kernel) { this.kernel = kernel; this.id = 'base'; }
    render(container, state) { }
    escapeHTML(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
}

// --- FEDERATION ENGINE (NEW) ---
class FederationPhaseEngine extends PhaseEngineBase {
    constructor(kernel) { super(kernel); this.id = 'federation'; }
    render(container, state) {
        container.innerHTML = `
            <div class="p-4 flex flex-col gap-6 h-full">
                <div>
                    <h2 class="text-sky-400 font-black uppercase text-xs tracking-widest mb-1">Host Integration</h2>
                    <p class="text-[10px] text-slate-500 mb-2">Connect to local Python desktop host.</p>
                    <div class="flex gap-2">
                        <input type="text" id="api-url" value="${this.kernel.bridge.apiUrl}" class="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-300 outline-none focus:border-sky-500">
                        <button onclick="SC.actionUpdateApi()" class="px-3 py-1 bg-slate-800 hover:bg-sky-600 hover:text-white transition-colors text-xs text-slate-300 rounded">Set</button>
                    </div>
                </div>

                <div class="flex-1 flex flex-col min-h-0 border-t border-slate-800 pt-4">
                    <div class="flex justify-between items-center mb-2">
                        <h2 class="text-emerald-400 font-black uppercase text-xs tracking-widest">Mapstate JSON</h2>
                        <button onclick="SC.actionCopyJson()" class="text-[10px] text-slate-400 hover:text-white">Copy</button>
                    </div>
                    <textarea id="json-exchange" class="w-full flex-1 bg-slate-950 border border-slate-800 rounded p-2 font-mono text-[10px] text-emerald-400 focus:border-emerald-500 outline-none resize-none">${JSON.stringify(state, null, 2)}</textarea>
                    <button onclick="SC.actionSyncJson()" class="w-full mt-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded shadow-lg shadow-emerald-900/20 transition-colors">Import / Sync State</button>
                </div>
            </div>
        `;
    }
}

// --- LIBRARY ENGINE ---
class LibraryPhaseEngine extends PhaseEngineBase {
    constructor(kernel) { super(kernel); this.id = 'library'; }
    render(container, state) {
        container.innerHTML = '<div class="p-4"><h3 class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Saved Constellations</h3></div>';
        const lib = this.kernel.getLibrary();

        const sessDiv = document.createElement('div');
        sessDiv.className = "px-4 pb-4 border-b border-slate-800 mb-4";
        sessDiv.innerHTML = `<h4 class="text-xs font-bold text-emerald-400 mb-2">Current Session</h4>`;
        const saveBtn = document.createElement('button');
        saveBtn.className = "w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded transition-colors";
        saveBtn.innerText = "Save Current to Library";
        saveBtn.onclick = () => {
            const copy = JSON.parse(JSON.stringify(state));
            copy.map_id = this.kernel.generateId();
            copy.meta.title = (state.meta.title || "Untitled") + " (Copy)";
            this.kernel.saveConstellationToLibrary(copy);
            this.render(container, state);
        };
        sessDiv.appendChild(saveBtn);
        container.appendChild(sessDiv);

        const list = document.createElement('div');
        list.className = "px-4 space-y-2 pb-4";

        if (lib.length === 0) list.innerHTML = `<div class="text-slate-600 text-xs italic text-center">Library Empty</div>`;

        lib.forEach(item => {
            const card = document.createElement('div');
            card.className = "bg-slate-800 border border-slate-700 p-3 rounded hover:border-sky-500 cursor-pointer transition-colors group";
            card.innerHTML = `
                <div class="flex justify-between items-center mb-2">
                    <div class="font-bold text-sm text-sky-400 truncate">${item.meta.title}</div>
                    <div class="text-[10px] text-slate-500">${item.nodes.length} nodes</div>
                </div>
            `;

            const btnRow = document.createElement('div');
            btnRow.className = "flex gap-2 opacity-50 group-hover:opacity-100 transition-opacity";

            const btnLoad = document.createElement('button');
            btnLoad.className = "flex-1 bg-slate-700 hover:bg-sky-600 text-white text-[10px] py-1 rounded";
            btnLoad.innerText = "Load";
            btnLoad.onclick = () => { if (confirm("Overwrite current session?")) this.kernel.loadMapState(item); };

            const btnDel = document.createElement('button');
            btnDel.className = "bg-slate-700 hover:bg-red-600 text-white text-[10px] py-1 px-3 rounded";
            btnDel.innerText = "✕";
            btnDel.onclick = () => { if (confirm("Delete from library?")) { this.kernel.deleteFromLibrary(item.map_id); this.render(container, state); } };

            btnRow.appendChild(btnLoad);
            btnRow.appendChild(btnDel);
            card.appendChild(btnRow);
            list.appendChild(card);
        });
        container.appendChild(list);
    }
}

// --- INSPECTOR ENGINE ---
class UniversalPhaseEngine extends PhaseEngineBase {
    constructor(kernel) { super(kernel); this.id = 'inspector'; }
    render(container, state) {
        const node = state.nodes.find(n => n.id === state.session.selectedId);

        if (!node) {
            container.innerHTML = '<div class="text-slate-500 italic text-xs text-center mt-10">Select a node to inspect.</div>';
            return;
        }

        // CRITICAL FIX: Pass node.id directly to SC actions so Quick Tools work without relying on Radial Menu state!
        container.innerHTML = `
            <div class="p-4 flex flex-col gap-4 h-full">
                <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Title</label>
                    <input id="edit-title" value="${this.escapeHTML(node.title)}" class="w-full bg-slate-800 border border-slate-700 text-white p-2 rounded text-sm focus:border-sky-500 outline-none transition-colors">
                </div>
                <div>
                    <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Type</label>
                    <select id="edit-type" class="w-full bg-slate-800 border border-slate-700 text-white p-2 rounded text-sm focus:border-sky-500 outline-none"></select>
                </div>
                <div class="flex-1 flex flex-col min-h-0">
                    <label class="text-[10px] font-bold text-slate-500 uppercase block mb-1">Content / Payload</label>
                    <div id="content-area" class="flex-1 overflow-hidden flex flex-col"></div>
                </div>
                
                <div class="pt-4 border-t border-slate-800 mt-auto">
                    <label class="text-[10px] font-bold text-slate-500 uppercase block mb-2">Node Actions</label>
                    <div class="grid grid-cols-4 gap-2">
                        <button onclick="SC.actionLink('${node.id}')" class="p-2 bg-slate-800 hover:bg-sky-600 rounded text-slate-300 hover:text-white transition-colors" title="Link">🔗</button>
                        <button onclick="SC.actionAddChild('${node.id}')" class="p-2 bg-slate-800 hover:bg-emerald-600 rounded text-slate-300 hover:text-white transition-colors" title="Add Child">➕</button>
                        <button onclick="SC.actionSaveConstellation('${node.id}')" class="p-2 bg-slate-800 hover:bg-purple-600 rounded text-slate-300 hover:text-white transition-colors" title="Save as Submap">🌌</button>
                        <button onclick="SC.actionDelete('${node.id}')" class="p-2 bg-slate-800 hover:bg-red-600 rounded text-slate-300 hover:text-white transition-colors" title="Delete">🗑️</button>
                    </div>
                </div>
                <div class="text-[9px] text-slate-600 font-mono text-center pt-2">ID: ${node.id}</div>
            </div>
        `;

        const sel = container.querySelector('#edit-type');
        if (typeof MetaMindSchema !== 'undefined') {
            Object.keys(MetaMindSchema.definitions).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t; opt.text = MetaMindSchema.definitions[t].label;
                if (node.type === t) opt.selected = true;
                sel.appendChild(opt);
            });
        }

        container.querySelector('#edit-title').oninput = (e) => this.kernel.updateNode(node.id, { title: e.target.value });
        sel.onchange = (e) => { this.kernel.updateNode(node.id, { type: e.target.value }); this.render(container, state); };

        const contentArea = container.querySelector('#content-area');
        if (node.type === 'portal') {
            const lib = this.kernel.getLibrary();
            const portSel = document.createElement('select');
            portSel.className = "w-full bg-slate-800 border border-slate-700 p-2 rounded text-xs text-white";
            portSel.innerHTML = '<option value="">-- Select Destination --</option>';
            lib.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.map_id; opt.innerText = c.meta.title;
                if (node.content === c.map_id) opt.selected = true;
                portSel.appendChild(opt);
            });
            portSel.onchange = (e) => this.kernel.updateNode(node.id, { content: e.target.value });
            contentArea.appendChild(portSel);

            const enterBtn = document.createElement('button');
            enterBtn.className = "mt-2 w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded";
            enterBtn.innerText = "Enter Portal 🌀";
            enterBtn.onclick = () => SC.actionEnterPortal(node.id);
            contentArea.appendChild(enterBtn);

        } else {
            const ta = document.createElement('textarea');
            ta.className = "w-full flex-1 bg-slate-800 border border-slate-700 text-white p-2 rounded text-sm font-mono focus:border-sky-500 outline-none resize-none";
            ta.value = node.content || '';
            ta.oninput = (e) => this.kernel.updateNode(node.id, { content: e.target.value });
            contentArea.appendChild(ta);
        }
    }
}

// --- ORBITAL ENGINE ---
class OrbitalPhaseEngine extends PhaseEngineBase {
    constructor(kernel) { super(kernel); this.id = 'orbital'; }
    render(container, state) {
        container.innerHTML = '';
        container.style.background = 'radial-gradient(circle at 50% 50%, #1e293b 0%, #020617 100%)';

        const sunId = state.session.selectedId || (state.nodes[0] ? state.nodes[0].id : null);
        if (!sunId) { container.innerHTML = '<div class="text-slate-500 p-10 text-center">Select a node to enter orbit.</div>'; return; }

        const sun = state.nodes.find(n => n.id === sunId);

        const parentConn = state.connections.find(c => c.to === sunId);
        if (parentConn) {
            const parent = state.nodes.find(n => n.id === parentConn.from);
            if (parent) {
                const halo = document.createElement('div');
                halo.className = "absolute border border-dashed border-indigo-500/20 rounded-full pointer-events-none";
                halo.style.width = "500px"; halo.style.height = "500px";
                halo.style.left = "calc(50% - 250px)"; halo.style.top = "calc(50% - 250px)";
                container.appendChild(halo);

                const pEl = this.createBody(parent, 'parent');
                pEl.style.left = "calc(50% - 30px)"; pEl.style.top = "calc(50% - 280px)";
                pEl.onclick = () => { this.kernel.selectNode(parent.id); this.render(container, state); };
                container.appendChild(pEl);
            }
        }

        const center = this.createBody(sun, 'sun');
        center.style.left = "calc(50% - 60px)"; center.style.top = "calc(50% - 60px)";
        container.appendChild(center);

        const kids = state.connections.filter(c => c.from === sunId).map(c => state.nodes.find(n => n.id === c.to));
        kids.forEach((k, i) => {
            if (!k) return;
            const angle = (i / kids.length) * Math.PI * 2 - Math.PI / 2;
            const r = 220;
            const planet = this.createBody(k, 'child');
            planet.style.left = `calc(50% + ${Math.cos(angle) * r}px - 25px)`;
            planet.style.top = `calc(50% + ${Math.sin(angle) * r}px - 25px)`;
            planet.onclick = () => { this.kernel.selectNode(k.id); this.render(container, state); };

            const line = document.createElement('div');
            line.className = "absolute bg-sky-500/10 h-px pointer-events-none";
            line.style.width = `${r}px`; line.style.left = "50%"; line.style.top = "50%";
            line.style.transformOrigin = "0 0"; line.style.transform = `rotate(${angle * 180 / Math.PI}deg)`;
            container.appendChild(line);
            container.appendChild(planet);
        });
    }

    createBody(node, role) {
        const el = document.createElement('div');
        el.className = "absolute flex flex-col items-center justify-center rounded-full border cursor-pointer transition-all z-10 shadow-lg";
        if (role === 'sun') {
            el.className += " bg-slate-800 border-sky-500 text-sky-100 w-[120px] h-[120px]";
        } else if (role === 'parent') {
            el.className += " bg-slate-900 border-indigo-500/50 text-indigo-300 w-[60px] h-[60px] hover:border-indigo-400";
        } else {
            el.className += " bg-slate-900 border-sky-500/30 text-sky-200 w-[50px] h-[50px] hover:border-sky-400 hover:scale-110";
        }
        el.innerHTML = `<div class="text-xl">${(typeof MetaMindSchema !== 'undefined') ? MetaMindSchema.getDefinition(node.type).icon : '⚪'}</div><div class="text-[8px] uppercase mt-1 max-w-full truncate px-1">${node.title}</div>`;
        return el;
    }
}

// --- WEB ENGINE ---
class WebPhaseEngine extends PhaseEngineBase {
    constructor(kernel) { super(kernel); this.id = 'web'; }

    render(container, state) {
        container.innerHTML = '';
        container.style.background = '#f8fafc';

        const root = state.nodes.find(n => n.type === 'web-root') || state.nodes[0];
        if (!root) {
            container.innerHTML = `<div class="flex items-center justify-center h-full text-slate-400">No Web Root Found</div>`;
            return;
        }

        const html = this.generateHTML(root, state);
        const frame = document.createElement('iframe');
        frame.className = "w-full h-full bg-white shadow-inner";
        frame.style.border = "none";
        frame.srcdoc = html;
        container.appendChild(frame);
    }

    generateHTML(root, state) {
        const getKids = (id) => state.connections.filter(c => c.from === id).map(c => state.nodes.find(n => n.id === c.to)).filter(n => n);

        const render = (node) => {
            const kids = getKids(node.id).map(render).join('');
            const title = this.escapeHTML(node.title);
            let content = node.content;

            if (node.type === 'web-link') {
                if (state.nodes.find(n => n.id === content)) content = `#${content}`;
                else if (content && !content.startsWith('http') && !content.startsWith('#')) content = `https://${content}`;
                return `<a id="${node.id}" href="${content}" class="text-blue-600 hover:text-blue-800 hover:underline transition-colors block py-1">${title}</a>`;
            }

            switch (node.type) {
                case 'web-root': return `<html><head><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-slate-50 font-sans text-slate-900">${kids}</body></html>`;
                case 'web-nav': return `<nav class="flex items-center gap-6 p-4 bg-white shadow-sm sticky top-0 z-50 border-b border-slate-100">${kids}</nav>`;
                case 'web-hero': return `<header class="bg-gradient-to-r from-blue-600 to-indigo-700 text-white py-24 px-8 text-center"><h1 class="text-5xl font-black mb-6 tracking-tight">${title}</h1><div class="text-xl opacity-90 max-w-2xl mx-auto">${content || ''}</div>${kids}</header>`;
                case 'web-section': return `<section id="${node.id}" class="py-16 px-8 max-w-5xl mx-auto">${kids}</section>`;
                case 'web-button': return `<button class="px-6 py-2 bg-blue-600 text-white font-bold rounded hover:bg-blue-700 transition-colors mt-4 inline-block">${title}</button>`;
                default: return `<div id="${node.id}" class="mb-6"><h3 class="font-bold text-lg text-slate-800 mb-2">${title}</h3><div class="prose text-slate-600 leading-relaxed">${content || ''}</div>${kids}</div>`;
            }
        };
        return render(root);
    }
}
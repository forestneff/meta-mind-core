/**
 * META-MIND PHASE ENGINE SYSTEM v3.0
 * Modular "Plugin" Architecture using ES Modules.
 */

export class PhaseEngineBase {
    constructor(kernel) {
        this.kernel = kernel;
        this.id = 'base';
        this.label = 'Base Phase';
        this.icon = '⚪';
    }
    render(container, state) { console.warn(`[PhaseEngine] ${this.label} render() not implemented.`); }
}

export class TextPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'text';
        this.label = 'Text Editor';
        this.icon = '📝';
    }

    render(container, state) {
        const textContent = JSON.stringify(state.nodes, null, 2);
        // Only update if content changed to avoid losing cursor focus (Diffing Lite)
        const existing = container.querySelector('textarea');
        if (!existing) {
             container.innerHTML = `<textarea class="w-full h-full p-4 font-mono text-xs bg-slate-50 resize-none outline-none">${textContent}</textarea>`;
        } else {
             if(document.activeElement !== existing) existing.value = textContent;
        }
    }
}

export class WebPhaseEngine extends PhaseEngineBase {
    constructor(kernel) {
        super(kernel);
        this.id = 'web';
        this.label = 'Web Architect';
        this.icon = '🌐';
    }

    render(container, state) {
        container.innerHTML = ""; // Full re-render for Web Phase is safer for now
        
        // Find roots
        const targets = new Set(state.edges.map(e => e.target));
        const roots = state.nodes.filter(n => !targets.has(n.id));

        if(roots.length === 0) {
             state.nodes.forEach(n => container.appendChild(this._createWidget(n)));
        } else {
             roots.forEach(root => this._renderRecursive(root, container, state));
        }
    }

    _renderRecursive(node, parentEl, state) {
        const el = this._createWidget(node);
        parentEl.appendChild(el);
        const children = state.edges.filter(e => e.source === node.id)
            .map(e => state.nodes.find(n => n.id === e.target))
            .sort((a,b) => a.position.x - b.position.x);
            
        if (children.length > 0) {
            const wrapper = document.createElement('div');
            wrapper.className = "pl-6 mt-4 border-l-2 border-slate-100 flex flex-col gap-4";
            children.forEach(c => this._renderRecursive(c, wrapper, state));
            el.appendChild(wrapper);
        }
    }

    _createWidget(node) {
        const div = document.createElement('div');
        div.className = "p-4 bg-white border border-slate-200 rounded-lg shadow-sm";
        div.innerHTML = `<h3 class="font-bold text-sm">${node.title}</h3><div class="text-xs text-slate-500 mt-1">${node.content || ''}</div>`;
        return div;
    }
}

export class PhaseRegistry {
    constructor(kernel) {
        this.kernel = kernel;
        this.engines = new Map();
        this.activeId = 'map';
    }
    
    register(engine) { this.engines.set(engine.id, engine); }
    
    renderActive(containerId) {
        const engine = this.engines.get(this.activeId);
        const container = document.getElementById(containerId);
        if (engine && container) engine.render(container, this.kernel.state);
    }
}
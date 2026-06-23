/**
 * META-MIND AI ENGINE v1.0
 * Capstone Feature: Native Language to MapState Generation.
 */

class MetaMindAI {
    constructor(kernel, sandbox) {
        this.kernel = kernel;
        this.sandbox = sandbox;
        this.isOpen = false;
        this.selectedModel = 'native-mock';
        this.chatHistory = [];
        this.pendingMapData = null; // Holds the generated JSON until assigned
        this.env = {};
        this.envLoaded = false;

        // The exact instructions the AI needs to generate valid maps
        this.systemPrompt = `
You are an expert System Architect for the Meta-Mind Platform. 
Your task is to generate valid, structurally sound "MapState" JSON objects based on user requests.
Output ONLY valid JSON matching this schema, with no markdown formatting or conversational text:
{
  "map_id": "unique_string",
  "meta": { "title": "Map Title", "created": "2026-03-01T00:00:00Z" },
  "nodes": [ { "id": "n1", "type": "hub", "title": "Root", "content": "", "data": { "x": 0, "y": 0, "isCore": true, "collapsed": false } } ],
  "connections": [ { "id": "c1", "from": "n1", "to": "n2", "type": "structural" } ],
  "submaps": []
}
Allowed types: root, hub, note, portal, smart-portal, logic-gate, web-root, web-nav, web-hero, web-section, web-card, web-link, web-button, web-text, web-image, web-video, web-form, web-input, web-grid, web-list, web-modal, web-carousel.
Ensure spatial x/y positioning prevents exact overlaps (space by 150px).

SPECIAL RULES FOR WEB MAPS (Websites/Dashboards):
If the user requests a website or web UI:
1. You MUST use 'web-root' as the main root node.
2. Follow strict hierarchical structure (e.g., web-root -> web-nav, web-hero, web-section -> web-card, web-text, web-image).
3. MAXIMIZE DESIGN QUALITY: For all 'web-*' type nodes, the 'content' field will be injected into the DOM as innerHTML. You MUST embed rich, modern HTML and TailwindCSS class names in the 'content' field. Use vibrant colors, dark modes (e.g. bg-slate-900), glassmorphism (backdrop-blur), gradients (bg-gradient-to-r), hover states, and smooth micro-animations to create a stunning, premium aesthetic. Do not use generic placeholders; use realistic copy and real Unsplash image URLs for 'web-image'.
        `.trim();

        this.initDOM();
    }

    initDOM() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <!-- Chat Toggle Button -->
            <button id="ai-toggle-btn" class="absolute bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-500 rounded-full shadow-[0_0_20px_rgba(79,70,229,0.5)] flex items-center justify-center text-2xl transition-transform hover:scale-110 z-50 text-white border-2 border-indigo-400">
                ✨
            </button>

            <!-- Chat Interface -->
            <div id="ai-chat-panel" class="absolute bottom-24 right-6 w-[380px] max-w-[calc(100vw-3rem)] h-[500px] max-h-[60vh] bg-slate-900/95 backdrop-blur-xl border border-indigo-500/30 rounded-2xl shadow-2xl flex flex-col hidden z-50 overflow-hidden transform transition-all translate-y-4 opacity-0">
                
                <!-- Header -->
                <div class="p-3 border-b border-slate-800 bg-slate-950/50 flex justify-between items-center shrink-0">
                    <div class="flex items-center gap-2">
                        <span class="text-indigo-400 text-lg">✨</span>
                        <span class="font-black text-sm text-slate-200 tracking-wide uppercase">Meta-Mind AI</span>
                    </div>
                    <select id="ai-model-select" class="bg-slate-800 border border-slate-700 text-xs text-slate-300 rounded px-2 py-1 outline-none focus:border-indigo-500">
                        <option value="native-mock">Native (Mock)</option>
                        <option value="gemini-api">Gemini 2.5 (API Key)</option>
                    </select>
                </div>

                <!-- Messages Area -->
                <div id="ai-messages" class="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
                    <div class="text-xs text-slate-400 bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 self-start max-w-[85%]">
                        Hello! I am your structural AI. Describe a concept, project, or website, and I will generate a spatial mapstate for it.
                    </div>
                </div>

                <!-- Input Area -->
                <div class="p-3 border-t border-slate-800 bg-slate-950/50 shrink-0">
                    <div class="relative flex items-end gap-2">
                        <textarea id="ai-input" rows="1" placeholder="Generate a map for..." class="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500 resize-none custom-scrollbar max-h-32" oninput="this.style.height = ''; this.style.height = this.scrollHeight + 'px'"></textarea>
                        <button id="ai-send-btn" class="shrink-0 w-9 h-9 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center transition-colors shadow">
                            <svg class="w-4 h-4 translate-x-px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"></path></svg>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('ai-toggle-btn').onclick = () => this.toggleChat();
        document.getElementById('ai-send-btn').onclick = () => this.handleSend();
        
        const input = document.getElementById('ai-input');
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });

        document.getElementById('ai-model-select').onchange = (e) => this.selectedModel = e.target.value;
    }

    toggleChat() {
        const panel = document.getElementById('ai-chat-panel');
        this.isOpen = !this.isOpen;
        if (this.isOpen) {
            panel.classList.remove('hidden');
            // Small delay for CSS transition
            setTimeout(() => {
                panel.classList.remove('translate-y-4', 'opacity-0');
                document.getElementById('ai-input').focus();
            }, 10);
        } else {
            panel.classList.add('translate-y-4', 'opacity-0');
            setTimeout(() => panel.classList.add('hidden'), 300);
        }
    }

    addMessage(role, text, actionHtml = '') {
        const msgs = document.getElementById('ai-messages');
        const div = document.createElement('div');
        div.className = `text-xs p-3 rounded-xl border max-w-[90%] ${role === 'user' ? 'self-end bg-sky-900/40 border-sky-700/50 text-sky-100' : 'self-start bg-slate-800/80 border-indigo-700/30 text-slate-300'}`;
        div.innerHTML = text.replace(/\n/g, '<br>') + actionHtml;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;
    }

    async handleSend() {
        const input = document.getElementById('ai-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        input.style.height = 'auto';
        this.addMessage('user', text);

        // Loading state
        const msgs = document.getElementById('ai-messages');
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'ai-loading';
        loadingDiv.className = 'text-xs text-indigo-400 self-start animate-pulse p-2';
        loadingDiv.innerText = 'Synthesizing matrix...';
        msgs.appendChild(loadingDiv);
        msgs.scrollTop = msgs.scrollHeight;

        try {
            if (!this.envLoaded && this.selectedModel === 'gemini-api') {
                await this.loadEnv();
            }

            let jsonString = '';
            
            const contextStr = this.buildContextString();
            const contextualPrompt = text + (contextStr ? "\n\n" + contextStr : "");

            if (this.selectedModel === 'native-mock') {
                jsonString = await this.mockAIGeneration(contextualPrompt);
            } else {
                jsonString = await this.geminiAPIGeneration(contextualPrompt);
            }

            const mapData = JSON.parse(jsonString);
            
            // Assign valid unique IDs to the generated map immediately to prevent collisions
            mapData.map_id = "ai_" + this.kernel.generateId();
            
            this.pendingMapData = mapData;

            const actionHtml = `
                <div class="mt-3 flex flex-col gap-2 border-t border-indigo-500/30 pt-3">
                    <button onclick="window.AI.initiateTargetedImport()" class="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold shadow transition-colors flex justify-center items-center gap-2">
                        🎯 Assign to Existing Smart-Portal
                    </button>
                    <button onclick="window.AI.injectIntoNewSmartPortal()" class="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold shadow transition-colors flex justify-center items-center gap-2">
                        🌟 Assign to New Smart-Portal
                    </button>
                    <button onclick="window.AI.actionExpandSelected()" class="w-full py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold shadow transition-colors flex justify-center items-center gap-2">
                        🌱 Expand Selected Node
                    </button>
                    <button onclick="window.AI.actionUpdateSelected()" class="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white rounded font-bold shadow transition-colors flex justify-center items-center gap-2">
                        ✏️ Update Selected Node
                    </button>
                    <button onclick="window.AI.loadAsNewSession()" class="w-full py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded font-bold shadow transition-colors flex justify-center items-center gap-2">
                        🌌 Load as New Session
                    </button>
                </div>
            `;
            
            document.getElementById('ai-loading').remove();
            this.addMessage('system', `Map generated: **${mapData.meta.title}** (${mapData.nodes.length} nodes). How would you like to deploy it?`, actionHtml);

        } catch (e) {
            document.getElementById('ai-loading').remove();
            this.addMessage('system', `Error: Failed to generate valid MapState. ${e.message}`);
        }
    }

    // --- Actions Triggered by Chat Buttons ---

    initiateTargetedImport() {
        if (!this.pendingMapData) return;
        this.sandbox.enterAiImportMode(this.pendingMapData);
        this.toggleChat(); // Hide chat to focus on selection
    }

    injectIntoNewSmartPortal() {
        if (!this.pendingMapData) return;
        
        let parentId = this.kernel.state.session.selectedId;
        if (!parentId && this.kernel.state.nodes.length > 0) {
            parentId = this.kernel.state.nodes[0].id;
        }
        
        if (!parentId) {
            alert("Please select a node first to attach the new portal.");
            return;
        }

        const child = this.kernel.addNode({ title: this.pendingMapData.meta.title || "AI Portal", type: "smart-portal" }, parentId);
        this.kernel.addConnection(parentId, child.id);
        
        this.kernel.saveConstellationToLibrary(this.pendingMapData);
        this.kernel.updateNode(child.id, { content: this.pendingMapData.map_id });
        this.kernel.importSubmap(child.id, this.pendingMapData);
        
        alert(`AI Map injected into a new Smart Portal!`);
        
        this.kernel.selectNode(child.id);
        this.sandbox.render();
        this.pendingMapData = null;
        this.toggleChat();
    }

    actionExpandSelected() {
        if (!this.pendingMapData) return;
        const parentId = this.kernel.state.session.selectedId;
        if (!parentId) {
            alert("No node selected to expand!");
            return;
        }

        this.kernel.saveConstellationToLibrary(this.pendingMapData);
        // importSubmap links the imported roots to the parentId
        this.kernel.importSubmap(parentId, this.pendingMapData);
        
        alert(`AI Map expanded into selected node!`);
        this.sandbox.render();
        this.pendingMapData = null;
        this.toggleChat();
    }

    actionUpdateSelected() {
        if (!this.pendingMapData) return;
        const targetId = this.kernel.state.session.selectedId;
        if (!targetId) {
            alert("No node selected to update!");
            return;
        }
        
        const targetNode = this.kernel.state.nodes.find(n => n.id === targetId);
        if (!targetNode) return;

        // Grab the root node of the generated map
        const rootNodes = this.pendingMapData.nodes.filter(n => !this.pendingMapData.connections.find(c => c.to === n.id && c.type === 'structural'));
        const genRoot = rootNodes.length > 0 ? rootNodes[0] : this.pendingMapData.nodes[0];
        
        if (genRoot) {
            // Schema Guardrails
            let newType = genRoot.type;
            if (typeof MetaMindSchema !== 'undefined' && !MetaMindSchema.nodeTypes[newType]) {
                console.warn(`Type ${newType} not allowed by schema. Keeping ${targetNode.type}`);
                newType = targetNode.type;
            }

            // Repositioning logic: keep original x/y unless valid new coordinates provided
            let newX = genRoot.data?.x !== undefined ? genRoot.data.x : targetNode.data.x;
            let newY = genRoot.data?.y !== undefined ? genRoot.data.y : targetNode.data.y;

            this.kernel.updateNode(targetId, {
                title: genRoot.title || targetNode.title,
                type: newType,
                content: genRoot.content !== undefined ? genRoot.content : targetNode.content,
                data: {
                    ...targetNode.data,
                    x: newX,
                    y: newY,
                }
            });
        }
        
        alert(`Selected node updated with AI content!`);
        this.sandbox.render();
        this.pendingMapData = null;
        this.toggleChat();
    }

    loadAsNewSession() {
        if (!this.pendingMapData) return;
        
        // Save current to library
        this.sandbox.actionSaveCurrentToLibrary();
        
        // Load new map
        this.kernel.loadMapState(this.pendingMapData);
        alert(`Session Saved. AI Map "${this.pendingMapData.meta.title}" loaded successfully.`);
        this.pendingMapData = null;
    }

    // --- Context Building ---
    
    buildContextString() {
        const selectedId = this.kernel.state.session.selectedId;
        if (!selectedId) return "";

        const state = this.kernel.state;
        const node = state.nodes.find(n => n.id === selectedId);
        if (!node) return "";

        const parentConn = state.connections.find(c => c.to === selectedId && c.type === 'structural');
        let parentNode = null;
        let siblings = [];
        
        if (parentConn) {
            parentNode = state.nodes.find(n => n.id === parentConn.from);
            if (parentNode) {
                const siblingIds = state.connections.filter(c => c.from === parentNode.id && c.type === 'structural' && c.to !== selectedId).map(c => c.to);
                siblings = state.nodes.filter(n => siblingIds.includes(n.id));
            }
        }

        let ctx = "--- CURRENT MAP CONTEXT ---\n";
        ctx += "Selected Node (Local Context):\n";
        ctx += `- Title: ${node.title}\n`;
        ctx += `- Type: ${node.type}\n`;
        if (node.content) ctx += `- Content: ${node.content}\n`;
        
        if (parentNode) {
            ctx += "\nParent Node (Upstream Context):\n";
            ctx += `- Title: ${parentNode.title}\n`;
            ctx += `- Type: ${parentNode.type}\n`;
        }

        if (siblings.length > 0) {
            ctx += "\nSibling Nodes (Lateral Context):\n";
            siblings.forEach(s => {
                ctx += `- Title: ${s.title} (Type: ${s.type})\n`;
            });
        }
        
        ctx += "---------------------------\n";
        ctx += "When generating nodes, you can consider this context to align your response with the existing structure. If editing, apply updates to the generated root node.\n";
        return ctx;
    }

    // --- AI Generation Handlers ---

    async mockAIGeneration(prompt) {
        return new Promise(resolve => {
            setTimeout(() => {
                // Return a structured mockup based on the fact we requested a mock
                const response = {
                    "map_id": "ai_mock",
                    "meta": { "title": "AI Generated Structure", "created": new Date().toISOString(), "notes": "Generated from prompt: " + prompt, "shared": false },
                    "nodes": [
                        { "id": "m1", "type": "hub", "title": "Core Concept", "content": prompt, "data": { "x": 0, "y": 0, "isCore": true, "collapsed": false }, "submaps": [] },
                        { "id": "m2", "type": "note", "title": "Detail 1", "content": "Synthesized detail.", "data": { "x": -150, "y": -150, "isCore": false, "collapsed": false }, "submaps": [] },
                        { "id": "m3", "type": "note", "title": "Detail 2", "content": "Synthesized detail.", "data": { "x": 150, "y": -150, "isCore": false, "collapsed": false }, "submaps": [] },
                        { "id": "m4", "type": "smart-portal", "title": "Deep Dive", "content": "", "data": { "x": 0, "y": 150, "isCore": false, "collapsed": false }, "submaps": [] }
                    ],
                    "connections": [
                        { "id": "mc1", "from": "m1", "to": "m2", "type": "structural" },
                        { "id": "mc2", "from": "m1", "to": "m3", "type": "structural" },
                        { "id": "mc3", "from": "m1", "to": "m4", "type": "structural" }
                    ],
                    "submaps": []
                };
                resolve(JSON.stringify(response));
            }, 1500); // Simulate API latency
        });
    }

    async loadEnv() {
        if (this.envLoaded) return;
        try {
            const res = await fetch('.env');
            if (!res.ok) throw new Error("Could not fetch .env (Server returned " + res.status + ")");
            const text = await res.text();
            
            text.split('\n').forEach(line => {
                const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
                if (match) {
                    let key = match[1];
                    let val = match[2] || '';
                    val = val.replace(/^['"](.*)['"]$/, '$1').trim();
                    this.env[key] = val;
                }
            });
            this.envLoaded = true;
        } catch (e) {
            console.warn("Failed to load .env:", e.message);
            
            // Fallback for file:// protocol or servers that block .env
            let key = localStorage.getItem('GEMINI_API_KEY');
            if (!key) {
                key = prompt("Could not read .env file (browsers block local file access). Please paste your Gemini API Key here to continue:");
                if (key) localStorage.setItem('GEMINI_API_KEY', key);
            }
            if (key) {
                this.env['GEMINI_API_KEY'] = key;
            }
            this.envLoaded = true; 
        }
    }

    async geminiAPIGeneration(prompt) {
        const apiKey = this.env['GEMINI_API_KEY'];
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY not found in .env. Please ensure the .env file exists and is served correctly.");
        }

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                systemInstruction: {
                    parts: [{ text: this.systemPrompt }]
                },
                contents: [{
                    role: "user",
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.2,
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API Error ${response.status}`);
        }

        const data = await response.json();
        const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!outputText) {
            throw new Error("Invalid response format from Gemini API");
        }

        return outputText;
    }
}
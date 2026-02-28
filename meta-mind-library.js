/**
 * META-MIND LIBRARY SYSTEM v1.2
 * Features: Targeted Templates (Node-Specific Application) & Profile Defaults.
 */

const MetaMindLibrary = {
    defaults: [
        {
            map_id: "tpl_web_standard",
            meta: {
                title: "Standard Landing Page",
                target_type: "web-root",
                created: "2026-02-25T12:00:00Z",
                notes: "A pre-configured, responsive website structure.",
                shared: true
            },
            nodes: [
                { id: "t_wr", type: "web-root", title: "Site Root", content: "", data: { x: 0, y: 0, isCore: true, collapsed: false }, submaps: [] },
                { id: "t_wn", type: "web-nav", title: "Top Navigation", content: "", data: { x: -150, y: -120, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wl1", type: "web-link", title: "Features", content: "#features", data: { x: -250, y: -200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wl2", type: "web-link", title: "Pricing", content: "#pricing", data: { x: -150, y: -200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wb1", type: "web-button", title: "Login", content: "#login", data: { x: -50, y: -200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wh", type: "web-hero", title: "The Future of Federation", content: "Build dynamic, spatial graphs that compile into live web experiences instantly.", data: { x: 150, y: -120, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wb2", type: "web-button", title: "Get Started Free", content: "#signup", data: { x: 150, y: -200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_ws1", type: "web-section", title: "Core Features", content: "", data: { x: -150, y: 120, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wt1", type: "web-text", title: "Decoupled Architecture", content: "Your logic remains pure, completely independent from the visual DOM rendering.", data: { x: -220, y: 200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wt2", type: "web-text", title: "Organic Physics", content: "A beautiful force-directed graph provides an intuitive, clutter-free spatial workspace.", data: { x: -80, y: 200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_ws2", type: "web-section", title: "Join the Network", content: "", data: { x: 150, y: 120, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wt3", type: "web-text", title: "Global Synchronization", content: "Seamlessly map and deploy to nodes around the world using the Universal Identity Protocol.", data: { x: 150, y: 200, isCore: false, collapsed: false }, submaps: [] },
                { id: "t_wf", type: "web-footer", title: "Site Footer", content: "© 2026 Meta-Mind Platform. All rights reserved.", data: { x: 0, y: 250, isCore: false, collapsed: false }, submaps: [] }
            ],
            connections: [
                { id: "c1", from: "t_wr", to: "t_wn", type: "structural" },
                { id: "c2", from: "t_wn", to: "t_wl1", type: "structural" },
                { id: "c3", from: "t_wn", to: "t_wl2", type: "structural" },
                { id: "c4", from: "t_wn", to: "t_wb1", type: "structural" },
                { id: "c5", from: "t_wr", to: "t_wh", type: "structural" },
                { id: "c6", from: "t_wh", to: "t_wb2", type: "structural" },
                { id: "c7", from: "t_wr", to: "t_ws1", type: "structural" },
                { id: "c8", from: "t_ws1", to: "t_wt1", type: "structural" },
                { id: "c9", from: "t_ws1", to: "t_wt2", type: "structural" },
                { id: "c10", from: "t_wr", to: "t_ws2", type: "structural" },
                { id: "c11", from: "t_ws2", to: "t_wt3", type: "structural" },
                { id: "c12", from: "t_wr", to: "t_wf", type: "structural" }
            ],
            submaps: []
        },
        {
            map_id: "tpl_sw_arch",
            meta: {
                title: "Software Architecture",
                target_type: "hub",
                created: "2026-02-25T12:00:00Z",
                notes: "A basic starting node framework for mapping out a web application stack.",
                shared: true
            },
            nodes: [
                { id: "sa_root", type: "hub", title: "Platform Architecture", content: "Master node", data: { x: 0, y: 0, isCore: true, collapsed: false }, submaps: [] },
                { id: "sa_db", type: "note", title: "Database Layer", content: "PostgreSQL / Redis Cache", data: { x: 0, y: 150, isCore: false, collapsed: false }, submaps: [] },
                { id: "sa_api", type: "note", title: "API Gateway", content: "Node.js REST API", data: { x: -150, y: 0, isCore: false, collapsed: false }, submaps: [] },
                { id: "sa_client", type: "note", title: "Web Client", content: "React Frontend", data: { x: 150, y: 0, isCore: false, collapsed: false }, submaps: [] }
            ],
            connections: [
                { id: "sa_c1", from: "sa_root", to: "sa_db", type: "structural" },
                { id: "sa_c2", from: "sa_root", to: "sa_api", "type": "structural" },
                { id: "sa_c3", from: "sa_root", to: "sa_client", "type": "structural" },
                { id: "sa_c4", from: "sa_client", "to": "sa_api", type: "flow" },
                { id: "sa_c5", "from": "sa_api", "to": "sa_db", type: "flow" }
            ],
            submaps: []
        },
        {
            map_id: "tpl_user_profile",
            meta: {
                title: "Standard User Profile",
                target_type: "profile",
                created: "2026-02-27T12:00:00Z",
                notes: "Generates the standard data fields for a user identity node.",
                shared: true
            },
            nodes: [
                { id: "p_root", type: "profile", title: "User Profile", content: '{"Name":"","Email":"","Phone":"","Address":""}', data: { x: 0, y: 0, isCore: true, collapsed: false }, submaps: [] },
                { id: "p_name", type: "note", title: "Name", content: "", data: { x: 0, y: -120, isCore: false, collapsed: false }, submaps: [] },
                { id: "p_email", type: "note", title: "Email", content: "", data: { x: 120, y: 0, isCore: false, collapsed: false }, submaps: [] },
                { id: "p_phone", type: "note", title: "Phone", content: "", data: { x: 0, y: 120, isCore: false, collapsed: false }, submaps: [] },
                { id: "p_addr", type: "note", title: "Address", content: "", data: { x: -120, y: 0, isCore: false, collapsed: false }, submaps: [] }
            ],
            connections: [
                { id: "pc1", from: "p_root", to: "p_name", type: "structural" },
                { id: "pc2", from: "p_root", to: "p_email", type: "structural" },
                { id: "pc3", from: "p_root", to: "p_phone", type: "structural" },
                { id: "pc4", from: "p_root", to: "p_addr", type: "structural" }
            ],
            submaps: []
        }
    ],

    getCustomTemplates() {
        try {
            const data = localStorage.getItem('mm_custom_templates');
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    },

    saveCustomTemplate(templateData) {
        try {
            const customs = this.getCustomTemplates();
            const idx = customs.findIndex(t => t.map_id === templateData.map_id);
            if (idx > -1) customs[idx] = templateData;
            else customs.push(templateData);
            localStorage.setItem('mm_custom_templates', JSON.stringify(customs));
            return true;
        } catch (e) { return false; }
    },

    deleteCustomTemplate(id) {
        try {
            let customs = this.getCustomTemplates();
            customs = customs.filter(t => t.map_id !== id);
            localStorage.setItem('mm_custom_templates', JSON.stringify(customs));
            return true;
        } catch (e) { return false; }
    },

    async getManifest() {
        const allTemplates = [...this.defaults, ...this.getCustomTemplates()];
        return allTemplates.map(t => ({
            id: t.map_id,
            title: t.meta?.title || "Untitled Template",
            desc: t.meta?.notes || "A pre-configured mapstate.",
            target_type: t.meta?.target_type || "any",
            nodes: t.nodes?.length || 0,
            isCustom: !this.defaults.find(d => d.map_id === t.map_id)
        }));
    },

    async getTemplateData(id) {
        const allTemplates = [...this.defaults, ...this.getCustomTemplates()];
        const tpl = allTemplates.find(t => t.map_id === id);
        if (!tpl) throw new Error(`Template ${id} not found.`);
        return JSON.parse(JSON.stringify(tpl));
    }
};
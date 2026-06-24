/**
 * Multi-Map ONTOLOGY v14.11
 * Source of Truth for Node Types, Constraints, and Halo Logic.
 */

const MultiMapSchema = {
    definitions: {
        'root': { label: "Universe Root", icon: "🌌", priority: 0, description: "The Singularity" },
        'profile': { label: "User Profile", icon: "👤", priority: 1, description: "Identity" },
        'hub': { label: "Central Hub", icon: "💠", priority: 2, description: "Router" },
        'portal': { label: "Portal", icon: "🌀", priority: 3, description: "Gateway" },
        'smart-portal': { label: "Smart Portal", icon: "🪄", priority: 4, description: "AI Injection Target" },
        'note': { label: "Note", icon: "📝", priority: 10, description: "Text" },
        'constellation': { label: "Constellation", icon: "✨", priority: 12, description: "Submap" },
        'logic-gate': { label: "Logic Gate", icon: "⚡", priority: 15, description: "Flow Control" },
        'web-root': { label: "Web Page", icon: "🌐", priority: 20, description: "<html>" },
        'web-nav': { label: "Nav Bar", icon: "🧭", priority: 21, description: "<nav>" },
        'web-hero': { label: "Hero", icon: "🎉", priority: 22, description: "Header" },
        'web-section': { label: "Section", icon: "🪟", priority: 23, description: "<section>" },
        'web-footer': { label: "Footer", icon: "🦶", priority: 24, description: "<footer>" },
        'web-card': { label: "Card", icon: "🗂️", priority: 25, description: "<article>" },
        'web-link': { label: "Link", icon: "🔗", priority: 30, description: "<a>" },
        'web-button': { label: "Button", icon: "💡", priority: 31, description: "<button>" },
        'web-text': { label: "Text", icon: "¶", priority: 32, description: "<p>" },
        'web-image': { label: "Image", icon: "🖼️", priority: 33, description: "<img>" },
        'web-video': { label: "Video", icon: "🎥", priority: 34, description: "<video>" },
        'web-form': { label: "Form", icon: "📝", priority: 35, description: "<form>" },
        'web-input': { label: "Input", icon: "⌨️", priority: 36, description: "<input>" },
        'web-grid': { label: "Grid", icon: "🔲", priority: 37, description: "Layout" },
        'web-list': { label: "List", icon: "📋", priority: 38, description: "<ul>" },
        'web-modal': { label: "Modal", icon: "🪟", priority: 39, description: "Dialog" },
        'web-carousel': { label: "Carousel", icon: "🎠", priority: 40, description: "Slider" }
    },

    rules: {
        'root': { allowed: ['hub', 'profile', 'web-root', 'portal', 'smart-portal', 'note', 'logic-gate'], default: 'hub', strict: true },
        'hub': { allowed: ['note', 'hub', 'portal', 'smart-portal', 'constellation', 'web-root'], default: 'note', strict: false },
        'profile': { allowed: ['hub', 'constellation'], default: 'hub', strict: false },
        'portal': { allowed: ['note'], default: 'note', strict: false },
        'smart-portal': { allowed: ['note', 'hub'], default: 'note', strict: false },
        'note': { allowed: ['note', 'portal', 'smart-portal', 'logic-gate'], default: 'note', strict: false },
        'constellation': { allowed: ['note', 'hub'], default: 'note', strict: false },
        'web-root': { allowed: ['web-nav', 'web-hero', 'web-section', 'web-footer', 'web-modal'], default: 'web-section', strict: true },
        'web-nav': { allowed: ['web-link', 'web-button', 'web-image'], default: 'web-link', strict: true },
        'web-hero': { allowed: ['web-text', 'web-button', 'web-image', 'web-video'], default: 'web-text', strict: false },
        'web-section': { allowed: ['web-text', 'web-image', 'web-card', 'web-button', 'web-link', 'web-grid', 'web-list', 'web-video', 'web-form', 'web-carousel'], default: 'web-text', strict: false },
        'web-card': { allowed: ['web-text', 'web-image', 'web-button', 'web-link', 'web-list'], default: 'web-text', strict: false },
        'web-footer': { allowed: ['web-link', 'web-text'], default: 'web-link', strict: true },
        'web-link': { allowed: [], default: 'note', strict: true },
        'web-button': { allowed: ['logic-gate'], default: 'logic-gate', strict: false },
        'web-text': { allowed: [], default: 'note', strict: true },
        'web-image': { allowed: [], default: 'note', strict: true },
        'web-video': { allowed: [], default: 'note', strict: true },
        'web-form': { allowed: ['web-input', 'web-button', 'web-text'], default: 'web-input', strict: true },
        'web-input': { allowed: [], default: 'note', strict: true },
        'web-grid': { allowed: ['web-card', 'web-image', 'web-text', 'web-video', 'web-form'], default: 'web-card', strict: false },
        'web-list': { allowed: ['web-text', 'web-link'], default: 'web-text', strict: true },
        'web-modal': { allowed: ['web-text', 'web-image', 'web-button', 'web-form', 'web-grid'], default: 'web-text', strict: false },
        'web-carousel': { allowed: ['web-image', 'web-card', 'web-video'], default: 'web-image', strict: true }
    },

    getDefinition(type) {
        return this.definitions[type] || { label: "Unknown", icon: "⚪", priority: 99 };
    },

    getDefaultChild(type) {
        return (this.rules[type] && this.rules[type].default) || 'note';
    },

    canConnect(parentType, childType) {
        if (childType === 'note') return true; // Universal exception: Any node can have a note attached.
        const rule = this.rules[parentType];
        if (!rule || !rule.strict) return true;
        return rule.allowed.includes(childType);
    }
};
const controlGuidance = require('./controlGuidance');

function clean(value, limit = 600) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function isPageAwarenessQuestion(question) {
    const value = clean(question, 10000).toLowerCase();
    if (!value) return false;
    const explicitPerception = /\b(?:see|read|view|visual|visually|aware|inspect|look at)\b/.test(value)
        && /\b(?:page|screen|content|table|form|displayed|visible)\b/.test(value);
    const explicitContent = /\b(?:content|information|details|records?|rows?|headings?|sections?|tables?)\b.*\b(?:this|current|visible|page|screen)\b/.test(value)
        || /\b(?:this|current|visible)\s+(?:page|screen)\b.*\b(?:contain|show|display|say|content|information|details)\b/.test(value);
    const summary = /\b(?:summari[sz]e|describe|explain|read)\b.*\b(?:this|current|visible)\s+(?:page|screen|content)\b/.test(value);
    return explicitPerception || explicitContent || summary;
}

function tokens(question) {
    const ignored = new Set(['about', 'aware', 'can', 'content', 'current', 'displayed', 'does', 'from', 'have', 'information', 'into', 'page', 'please', 'read', 'screen', 'see', 'show', 'that', 'this', 'visible', 'visual', 'visually', 'what', 'which', 'with', 'you', 'your']);
    return [...new Set(clean(question, 10000).toLowerCase().match(/[a-z0-9]{3,}/g) || [])].filter(word => !ignored.has(word));
}

function concise(value, limit = 180) {
    const text = clean(value, limit + 1);
    return text.length > limit ? `${text.slice(0, limit - 3).trim()}...` : text;
}

function contentLabel(item) {
    const title = clean(item.title, 160);
    const text = concise(item.text);
    if (item.kind === 'heading') return title || text;
    return title && !text.toLowerCase().startsWith(title.toLowerCase()) ? `${title}: ${text}` : text || title;
}

function answer(question, pageKey, user, screenContext = {}) {
    const controlAnswer = controlGuidance.answer(question, pageKey, user, screenContext);
    if (controlAnswer) return controlAnswer;
    if (!isPageAwarenessQuestion(question)) return null;
    const pageTitle = clean(screenContext.pageTitle, 160) || clean(pageKey, 160) || 'the current page';
    const dialogTitle = clean(screenContext.dialogTitle, 160);
    const content = Array.isArray(screenContext.content) ? screenContext.content : [];
    const fields = Array.isArray(screenContext.fields) ? screenContext.fields : [];
    const controls = Array.isArray(screenContext.controls) ? screenContext.controls : [];
    const queryTokens = tokens(question);
    const matches = queryTokens.length ? content.filter(item => {
        const searchable = `${item.title || ''} ${item.text || ''}`.toLowerCase();
        return queryTokens.some(word => searchable.includes(word));
    }) : [];
    const chosen = (matches.length ? matches : content).map(contentLabel).filter(Boolean).slice(0, 6);
    const fieldLabels = fields.map(field => clean(field.label || field.id, 100)).filter(Boolean).slice(0, 6);
    const controlLabels = controls.filter(control => !control.disabled)
        .map(control => clean(control.label || control.id, 100)).filter(Boolean).slice(0, 6);
    const parts = [`Yes. I can read the governed visible-page context for ${pageTitle}.`];
    if (dialogTitle) parts.push(`The open dialog is ${dialogTitle}.`);
    if (chosen.length) parts.push(`${matches.length ? 'Relevant visible content' : 'Visible content'}: ${chosen.join(' | ')}.`);
    if (fieldLabels.length) parts.push(`Visible fields include: ${fieldLabels.join(', ')}.`);
    if (controlLabels.length) parts.push(`Available controls include: ${controlLabels.join(', ')}.`);
    if (!chosen.length && !fieldLabels.length && !controlLabels.length) {
        parts.push('This page has not exposed any readable headings, fields, tables, notices or controls in the current snapshot.');
    }
    parts.push('I only receive rendered, role-authorised page structure; passwords, hidden inputs, files and non-visible content are excluded. I remain read-only.');
    return {
        title: `Visible page - ${pageTitle}`,
        answer: parts.join(' '),
        pageTitle,
        dialogTitle,
        matchedContentCount: matches.length,
        capturedContentCount: content.length,
        role: clean(user?.role, 100)
    };
}

module.exports = { answer, isPageAwarenessQuestion };

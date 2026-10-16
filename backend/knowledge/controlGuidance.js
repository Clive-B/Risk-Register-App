function clean(value, limit = 400) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalise(value) {
    return clean(value, 1000).toLowerCase().replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function hasPurposeIntent(value) {
    return /\b(?:what does|what is|what will|why|purpose|used for|use for|happen|if i|when i|explain|tell me about)\b/.test(value);
}

function isControlQuestion(question) {
    const value = normalise(question);
    const namedControl = /\b(?:button|control|link|option|action)\b/.test(value);
    const actionIntent = /\b(?:click|press|select|choose|use)\b/.test(value);
    return hasPurposeIntent(value) && (namedControl || actionIntent);
}

function matchControl(question, controls) {
    const prompt = ` ${normalise(question)} `;
    const scored = controls.map(control => {
        const label = normalise(control.label);
        const id = normalise(control.id);
        let score = 0;
        if (label && prompt.includes(` ${label} `)) score = 1000 + label.length;
        else if (id && prompt.includes(` ${id} `)) score = 800 + id.length;
        else if (label) {
            const meaningful = label.split(' ').filter(word => word.length > 2 && !['button', 'open', 'the'].includes(word));
            const hits = meaningful.filter(word => prompt.includes(` ${word} `)).length;
            if (hits && hits === meaningful.length) score = 500 + hits;
        }
        return { control, score };
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    return scored[0]?.control || null;
}

function fallbackPurpose(control) {
    const label = normalise(control.label);
    const context = clean(control.context, 160) || 'the current page';
    if (control.destination) return `Opens ${clean(control.label, 160)} within the application.`;
    if (control.controlType === 'submit') return `Submits the ${context} form after its required fields pass validation.`;
    if (/^(?:close|cancel|back|dismiss)$/.test(label)) return `Closes or leaves ${context} without submitting the current form.`;
    if (/\b(?:history|view|preview|details?)\b/.test(label)) return `Opens the available ${clean(control.label, 160).toLowerCase()} information for the selected item.`;
    if (/\b(?:download|export|print)\b/.test(label)) return `Creates or opens the labelled output from ${context}.`;
    if (/\b(?:refresh|reload|retry)\b/.test(label)) return `Requests the latest available ${context} information again.`;
    if (/\b(?:filter|search|apply)\b/.test(label)) return `Applies the current ${context} selections to the visible results.`;
    if (/\bsave draft\b/.test(label)) return `Saves the current entries as a draft without representing them as a completed approval.`;
    if (/\b(?:edit|replace|assign|map|clear|delete|remove|approve|reject|submit|save|send|create|add|update)\b/.test(label)) {
        return `Starts the ${clean(control.label, 160)} action in ${context}; the page has not supplied a more specific verified description for this control.`;
    }
    return `The control is available in ${context}, but this page has not supplied a verified purpose description. I will not guess at its effect.`;
}

function answer(question, pageKey, user, screenContext = {}) {
    const controls = Array.isArray(screenContext.controls) ? screenContext.controls : [];
    const control = matchControl(question, controls);
    if (!control || (!isControlQuestion(question) && !hasPurposeIntent(normalise(question)))) return null;
    const label = clean(control.label || control.id, 160) || 'Selected control';
    const purpose = clean(control.purpose, 400) || fallbackPurpose(control);
    const effect = clean(control.effect, 400);
    const requirements = clean(control.requirements, 400);
    const parts = [`The visible ${label} ${control.tag === 'a' ? 'link' : 'button'}: ${purpose}`];
    if (effect) parts.push(`Effect: ${effect}`);
    if (requirements) parts.push(`Before using it: ${requirements}`);
    if (control.disabled) parts.push('It is currently disabled, so its prerequisites have not yet been met.');
    else parts.push('It is currently available on the page.');
    parts.push('I can explain the control, but I cannot press it or perform the action for you.');
    return {
        title: `Visible control - ${label}`,
        answer: parts.join(' '),
        pageTitle: clean(screenContext.pageTitle, 160) || clean(pageKey, 160) || 'Current page',
        dialogTitle: clean(screenContext.dialogTitle, 160),
        matchedContentCount: 1,
        capturedContentCount: controls.length,
        role: clean(user?.role, 100),
        kind: 'control-guidance',
        control: { id: clean(control.id, 160), label, disabled: control.disabled === true }
    };
}

module.exports = { answer, isControlQuestion, matchControl };

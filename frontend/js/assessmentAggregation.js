(function exposeAssessmentAggregation(root) {
    function programmeName(risk) {
        return String(risk?.programme_project || '').trim();
    }

    function programmeEntries(risks) {
        const entries = new Map();
        (risks || []).forEach((risk, index) => {
            const name = programmeName(risk);
            const key = name
                ? `programme:${name.toLocaleLowerCase()}`
                : `unassigned:${risk?.id ?? risk?.risk_id ?? index}`;
            if (!entries.has(key)) {
                entries.set(key, {
                    key,
                    label: name || 'Unassigned',
                    unassigned: !name,
                    risks: []
                });
            }
            entries.get(key).risks.push(risk);
        });
        return [...entries.values()].sort((first, second) => {
            if (first.unassigned !== second.unassigned) return first.unassigned ? 1 : -1;
            return first.label.localeCompare(second.label);
        });
    }

    const api = { programmeEntries, programmeName };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.NCAGRCAssessmentAggregation = api;
})(typeof window !== 'undefined' ? window : globalThis);

function text(value) {
    return String(value ?? '').trim();
}

function availableActions(action) {
    if (Array.isArray(action?.available_actions)) return action.available_actions;
    try {
        const parsed = JSON.parse(action?.available_actions || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
        return [];
    }
}

async function assessActionCompletion(action, client) {
    if (action?.source_type !== 'TreatmentPlan') {
        return {ready: true, requirements: []};
    }

    if (!/^\d+$/.test(text(action.source_id))) {
        return {
            ready: false,
            code: 'TREATMENT_UNAVAILABLE',
            message: 'The linked treatment plan could not be identified.',
            requirements: ['Open the Treatment Plans page and verify the linked plan.']
        };
    }

    const result = await client.query(
        `SELECT id,plan_title,progress_percent,status,lifecycle_status,due_date,
                evidence_required,evidence_file_name,evidence_url,evidence_notes
         FROM treatment_plans
         WHERE id=$1`,
        [Number(action.source_id)]
    );
    const treatment = result.rows[0];
    if (!treatment) {
        return {
            ready: false,
            code: 'TREATMENT_UNAVAILABLE',
            message: 'The linked treatment plan is no longer available.',
            requirements: ['Open the Treatment Plans page and verify the treatment record.']
        };
    }

    const requirements = [];
    if (Number(treatment.progress_percent) !== 100) {
        requirements.push(`Treatment progress must reach 100% (currently ${Number(treatment.progress_percent) || 0}%).`);
    }
    if (treatment.status !== 'Completed') {
        requirements.push(`Treatment status must be Completed (currently ${treatment.status || 'Not recorded'}).`);
    }
    if (text(treatment.evidence_required)
        && ![treatment.evidence_file_name,treatment.evidence_url,treatment.evidence_notes].some(text)) {
        requirements.push('Required treatment completion evidence has not been recorded.');
    }

    return {
        ready: requirements.length === 0,
        code: requirements.length ? 'TREATMENT_INCOMPLETE' : null,
        message: requirements.length
            ? 'This treatment action cannot be completed until the linked treatment plan is finished.'
            : 'The linked treatment plan is complete.',
        requirements,
        treatment: {
            id: treatment.id,
            title: treatment.plan_title,
            progressPercent: Number(treatment.progress_percent) || 0,
            status: treatment.status,
            lifecycleStatus: treatment.lifecycle_status,
            dueDate: treatment.due_date,
            evidenceRequired: Boolean(text(treatment.evidence_required))
        },
        actionUrl: action.action_url || 'pages/treatment.html'
    };
}

function canDismissAction(action) {
    return availableActions(action).map(value => text(value).toLowerCase()).includes('dismiss');
}

module.exports = {assessActionCompletion, canDismissAction, availableActions};

const XLSX = require('xlsx');
const {
    CORRECTION_RULES_VERSION,
    ruleRecord
} = require('./workbookCorrectionEngine');

const WORKPLAN_RULES_VERSION = `${CORRECTION_RULES_VERSION}-WORKPLAN-1`;
const APPROVED_RESPONSES = ['Terminate','Treat','Transfer','Tolerate'];
const MONTHS = {
    january:1,february:2,march:3,april:4,may:5,june:6,
    july:7,august:8,september:9,october:10,november:11,december:12,
    quarterly:12
};
const MONTH_LABELS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December','Quarterly'
];
const FIELD_ALIASES = {
    programme_number:['no','no.','number','programme number','program number','s/n'],
    strategic_pillar:['strategic pillar','pillar','strategic objective'],
    programme:['programmes','programs','programme','program','programme/project','program/project'],
    goal:['goal(s)','goals','goal','objective','strategic goal'],
    kpi:['kpi','key performance indicator','performance indicator'],
    target:['target','annual target','planned target'],
    baseline:['baseline','current baseline'],
    action_point:['key action point','key action points','action point','action points','activity','activities','key activity'],
    budget:['budget (ghc)','budget ghc','budget','estimated budget','cost'],
    weight:['weight (100%)','weight 100','weight','percentage weight'],
    start:['start','start month','start date'],
    end:['end','end month','end date','completion month']
};
const EDITABLE_FIELDS = [
    'programme_number','strategic_pillar','programme','goal','kpi','target','baseline',
    'action_point','budget','weight','start','end',
    'risk_title','risk_description','risk_category','likelihood','impact',
    'risk_response','treatment_recommendation'
];

function text(value) {
    return String(value ?? '').replace(/\r/g, '').trim();
}

function normalizeHeader(value) {
    return text(value)
        .replace(/&/g,' and ')
        .replace(/[^a-zA-Z0-9]+/g,' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g,' ');
}

const HEADER_LOOKUP = Object.entries(FIELD_ALIASES).reduce((map,[field,aliases]) => {
    aliases.forEach(alias => map.set(normalizeHeader(alias),field));
    return map;
},new Map());

function numeric(value) {
    if (value === null || value === undefined || text(value) === '') return null;
    const number = Number(text(value).replace(/[%,$GHC\s]/gi,''));
    return Number.isFinite(number) ? number : null;
}

function canonicalMonth(value) {
    const raw = text(value);
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    if (normalized === 'decenmber') return 'December';
    return MONTH_LABELS.find(month => month.toLowerCase() === normalized) || null;
}

function monthNumber(label) {
    return MONTHS[text(label).toLowerCase()] || null;
}

function endOfMonth(year,label) {
    const month = monthNumber(label);
    return month ? new Date(Date.UTC(year,month,0)).toISOString().slice(0,10) : `${year}-12-31`;
}

function splitActions(value) {
    const source = text(value);
    if (!source) return [];
    const matches = [];
    const pattern = /(?:^|\n)\s*(\d+)\s*[.)]\s*([\s\S]*?)(?=(?:\n\s*\d+\s*[.)]\s)|$)/g;
    let match;
    while ((match = pattern.exec(source))) {
        const action = text(match[2]).replace(/\s+/g,' ');
        if (action) matches.push({number:match[1],action});
    }
    return matches.length ? matches : [{number:null,action:source.replace(/\s+/g,' ')}];
}

function correction(input) {
    return {
        ...ruleRecord(input),
        rules_version:WORKPLAN_RULES_VERSION
    };
}

function detectSheet(workbook) {
    let best = null;
    workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const rangeStartRow = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']).s.r : 0;
        const rows = XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false,blankrows:true});
        rows.forEach((row,index) => {
            const mapped = row.map(cell => HEADER_LOOKUP.get(normalizeHeader(cell)) || null);
            const fields = new Set(mapped.filter(Boolean));
            const anchors = ['programme','action_point'].filter(field => fields.has(field)).length;
            const score = anchors * 100 + fields.size;
            if (anchors === 2 && (!best || score > best.score)) {
                best = {sheetName,rows,rangeStartRow,headerIndex:index,mapped,score};
            }
        });
    });
    if (!best) {
        throw Object.assign(new Error('A supported work-plan header row containing Programme and Key Action Point could not be detected.'),{statusCode:400});
    }
    return best;
}

function resolveColumns(detected) {
    const columns = {};
    detected.mapped.forEach((field,index) => {
        if (field && columns[field] === undefined) columns[field] = index;
    });
    const nextRow = detected.rows[detected.headerIndex + 1] || [];
    const timeIndex = detected.rows[detected.headerIndex].findIndex(cell => /time schedule/i.test(text(cell)));
    if (columns.start === undefined && timeIndex >= 0 && /^start$/i.test(text(nextRow[timeIndex]))) columns.start = timeIndex;
    if (columns.end === undefined && timeIndex >= 0 && /^end$/i.test(text(nextRow[timeIndex + 1]))) columns.end = timeIndex + 1;
    return columns;
}

function valueAt(row,columns,field) {
    return columns[field] === undefined ? null : row[columns[field]];
}

function buildActionProposal({programme,action,assess,categories}) {
    const system = assess(programme,action);
    const corrections = [...action.corrections];
    [
        ['risk_title','Generated risk title',system.risk_title],
        ['risk_description','Generated risk statement',system.risk_description],
        ['risk_category','ERM risk category',system.risk_category],
        ['likelihood','Pre-Mitigation Likelihood',system.likelihood],
        ['impact','Pre-Mitigation Impact',system.impact],
        ['risk_response','ERM risk response',system.risk_response],
        ['treatment_recommendation','Treatment recommendation',system.treatment_recommendation]
    ].forEach(([field,label,proposed]) => {
        corrections.push(correction({
            ruleId:`WORKPLAN-ASSESS-${field.toUpperCase().replaceAll('_','-')}`,
            mistakeType:'System-generated ERM assessment',
            field,original:null,proposed,
            detection:`The work plan supplies an action but no governed ${label}.`,
            explanation:`The authoritative ERM assessment rules generated the ${label}. The baseline is retained even if the Focal Person proposes an edited upload value.`,
            confidence:system.confidence || 'Medium',
            validation:field === 'risk_category'
                ? `Choose an approved ERM category: ${categories.join(', ')}.`
                : field === 'risk_response'
                    ? `Choose ${APPROVED_RESPONSES.join(', ')}.`
                    : ['likelihood','impact'].includes(field)
                        ? 'Choose an integer from 1 to 5.'
                        : `${label} must not be blank.`
        }));
    });
    return {
        programme_key:String(programme.source_row),
        action_key:action.action_key,
        source_row:action.source_row,
        original:action.original,
        values:{
            programme_number:programme.number,
            strategic_pillar:programme.pillar,
            programme:programme.programme,
            goal:programme.goal,
            kpi:programme.kpi,
            target:programme.target,
            baseline:programme.baseline,
            action_point:action.action,
            budget:programme.budget,
            weight:action.weight,
            start:action.start,
            end:action.end,
            risk_title:system.risk_title,
            risk_description:system.risk_description,
            risk_category:system.risk_category,
            likelihood:system.likelihood,
            impact:system.impact,
            risk_response:system.risk_response,
            treatment_recommendation:system.treatment_recommendation
        },
        system_assessment:system,
        corrections,
        rules_version:WORKPLAN_RULES_VERSION
    };
}

function parseWorkplanWorkbook(buffer,year,{assess,categories=[]}) {
    let workbook;
    try {
        workbook = XLSX.read(buffer,{type:'buffer',cellDates:true});
    } catch (_) {
        throw Object.assign(new Error('The Excel workbook is corrupt, encrypted or cannot be read.'),{statusCode:400});
    }
    const detected = detectSheet(workbook);
    const columns = resolveColumns(detected);
    const programmes = [];
    const warnings = [];
    let current = null;
    let programmeSequence = 0;

    for (let index = detected.headerIndex + 1; index < detected.rows.length; index += 1) {
        const row = detected.rows[index];
        const programmeValue = text(valueAt(row,columns,'programme'));
        const actionValue = text(valueAt(row,columns,'action_point'));
        if (!programmeValue && !actionValue) continue;
        if (programmeValue) {
            const rawNumber = text(valueAt(row,columns,'programme_number'));
            const repeatedProgramme = rawNumber
                ? programmes.find(item => text(item.number).toLowerCase() === rawNumber.toLowerCase())
                : null;
            if (repeatedProgramme) {
                current = repeatedProgramme;
                if (text(current.programme).toLowerCase() !== programmeValue.toLowerCase()) {
                    warnings.push(`Programme Number ${rawNumber} is repeated with different Programme text on row ${detected.rangeStartRow + index + 1}. The first Programme value was retained for grouping.`);
                }
            } else {
                programmeSequence += 1;
                current = {
                    number:rawNumber || String(programmeSequence),
                    pillar:text(valueAt(row,columns,'strategic_pillar')),
                    programme:programmeValue,
                    goal:text(valueAt(row,columns,'goal')),
                    kpi:text(valueAt(row,columns,'kpi')),
                    target:text(valueAt(row,columns,'target')),
                    baseline:text(valueAt(row,columns,'baseline')),
                    budget:numeric(valueAt(row,columns,'budget')),
                    source_row:detected.rangeStartRow + index + 1,
                    actions:[]
                };
                programmes.push(current);
            }
        }
        if (!current || !actionValue) continue;

        const rawWeight = valueAt(row,columns,'weight');
        const rawStart = text(valueAt(row,columns,'start'));
        const rawEnd = text(valueAt(row,columns,'end'));
        let weight = numeric(rawWeight);
        let start = canonicalMonth(rawStart);
        let end = canonicalMonth(rawEnd);
        const structuralCorrections = [];

        if (!programmeValue) {
            [
                ['programme_number',current.number],
                ['strategic_pillar',current.pillar],
                ['programme',current.programme],
                ['goal',current.goal],
                ['kpi',current.kpi],
                ['target',current.target],
                ['baseline',current.baseline],
                ['budget',current.budget]
            ].forEach(([field,proposed]) => {
                structuralCorrections.push(correction({
                    ruleId:`WORKPLAN-MERGED-${field.toUpperCase().replaceAll('_','-')}`,
                    mistakeType:'Merged or carried programme value',
                    field,original:null,proposed,
                    detection:`The ${field.replaceAll('_',' ')} cell is blank on an action row beneath a populated programme.`,
                    explanation:'The parent programme value was carried into this independently monitored action.',
                    confidence:'High',
                    validation:'Confirm or edit the carried programme value.'
                }));
            });
        }
        if (!text(valueAt(row,columns,'programme_number')) && current.actions.length === 0) {
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-PROGRAMME-NUMBER',mistakeType:'Missing programme number',
                field:'programme_number',original:null,proposed:current.number,
                detection:'The Programme Number cell is blank.',
                explanation:'A sequential programme number was proposed for traceability.',
                confidence:'Medium',validation:'Enter a programme number or reference.'
            }));
        }
        if (rawStart && !start && canonicalMonth(rawWeight) && canonicalMonth(rawStart) && !rawEnd) {
            weight = null;
            start = canonicalMonth(rawWeight);
            end = canonicalMonth(rawStart);
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-SHIFTED-SCHEDULE',mistakeType:'Shifted schedule columns',
                field:'start',original:rawStart,proposed:start,
                detection:'The Weight cell contains a month, the Start cell contains a month and End is blank.',
                explanation:'The two schedule values were shifted into Start and End.',
                confidence:'High',validation:'Start and End must use recognised month labels.'
            }));
        }
        if (rawStart && !start) {
            start = 'January';
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-INVALID-START',mistakeType:'Invalid schedule value',
                field:'start',original:rawStart,proposed:start,
                detection:'The Start value is not a recognised month.',
                explanation:'January is proposed as a safe plan-year boundary and remains editable.',
                confidence:'Low',validation:'Choose a recognised start month.'
            }));
        }
        if (!rawStart) {
            start = 'January';
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-MISSING-START',mistakeType:'Missing schedule value',
                field:'start',original:null,proposed:start,
                detection:'The Start value is blank.',
                explanation:'January is proposed as the plan-year start and remains editable.',
                confidence:'Low',validation:'Choose a recognised start month.'
            }));
        }
        if (rawEnd.toLowerCase() === 'decenmber') {
            end = 'December';
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-DECEMBER-TYPO',mistakeType:'Recognised spelling error',
                field:'end',original:rawEnd,proposed:end,
                detection:'The End value is “Decenmber”.',
                explanation:'The recognised spelling error was corrected to December.',
                confidence:'High',validation:'Choose a recognised end month.'
            }));
        } else if (rawEnd && !end) {
            end = 'December';
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-INVALID-END',mistakeType:'Invalid schedule value',
                field:'end',original:rawEnd,proposed:end,
                detection:'The End value is not a recognised month.',
                explanation:'December is proposed as a safe plan-year boundary and remains editable.',
                confidence:'Low',validation:'Choose a recognised end month.'
            }));
        } else if (!rawEnd) {
            end = 'December';
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-MISSING-END',mistakeType:'Missing schedule value',
                field:'end',original:null,proposed:end,
                detection:'The End value is blank.',
                explanation:'December is proposed as the plan-year end and remains editable.',
                confidence:'Low',validation:'Choose a recognised end month.'
            }));
        }
        if (text(rawWeight) && weight === null) {
            structuralCorrections.push(correction({
                ruleId:'WORKPLAN-INVALID-WEIGHT',mistakeType:'Invalid numeric value',
                field:'weight',original:rawWeight,proposed:null,
                detection:'Weight is populated but is not numeric.',
                explanation:'The invalid value was cleared for Focal Person correction.',
                confidence:'High',validation:'Weight may be blank or a number from 0 to 100.'
            }));
        }

        const parts = splitActions(actionValue);
        parts.forEach((part,partIndex) => {
            const sourceRow = detected.rangeStartRow + index + 1;
            const action = {
                action_key:`${sourceRow}:${partIndex + 1}`,
                number:part.number || (parts.length > 1 ? String(partIndex + 1) : null),
                action:part.action,
                weight:parts.length === 1 ? weight : null,
                start,end,due_date:endOfMonth(year,end),
                source_row:sourceRow,
                corrections:[...structuralCorrections],
                original:{
                    programme_number:text(valueAt(row,columns,'programme_number')) || null,
                    strategic_pillar:text(valueAt(row,columns,'strategic_pillar')) || null,
                    programme:programmeValue || null,
                    goal:text(valueAt(row,columns,'goal')) || null,
                    kpi:text(valueAt(row,columns,'kpi')) || null,
                    target:text(valueAt(row,columns,'target')) || null,
                    baseline:text(valueAt(row,columns,'baseline')) || null,
                    action_point:actionValue,
                    budget:valueAt(row,columns,'budget'),
                    weight:rawWeight,
                    start:rawStart || null,
                    end:rawEnd || null
                }
            };
            current.actions.push(action);
        });
    }
    if (!programmes.length) throw Object.assign(new Error('No programmes were found in the workbook.'),{statusCode:400});
    const proposals = programmes.flatMap(programme => programme.actions.map(action =>
        buildActionProposal({programme,action,assess,categories})
    ));
    if (!proposals.length) throw Object.assign(new Error('No action points were found in the workbook.'),{statusCode:400});
    return {
        sheet_name:detected.sheetName,
        header_row:detected.rangeStartRow + detected.headerIndex + 1,
        format:'Supported flexible work-plan format',
        programmes,warnings,proposals,
        rules_version:WORKPLAN_RULES_VERSION
    };
}

function validateValues(values,categories) {
    const errors = [];
    ['programme','action_point','risk_title','risk_description','treatment_recommendation'].forEach(field => {
        if (!text(values[field])) errors.push(`${field.replaceAll('_',' ')} is required.`);
    });
    if (!categories.includes(values.risk_category)) errors.push('Select an approved ERM risk category.');
    if (![values.likelihood,values.impact].every(value => Number.isInteger(Number(value)) && Number(value) >= 1 && Number(value) <= 5)) {
        errors.push('Likelihood and impact must be integers from 1 to 5.');
    }
    if (!APPROVED_RESPONSES.includes(values.risk_response)) errors.push('Select an approved ERM risk response.');
    if (!canonicalMonth(values.start) || !canonicalMonth(values.end)) errors.push('Start and End must use recognised month labels.');
    if (text(values.weight) && (numeric(values.weight) === null || numeric(values.weight) < 0 || numeric(values.weight) > 100)) {
        errors.push('Weight must be blank or a number from 0 to 100.');
    }
    return errors;
}

function applyWorkplanCorrections(parsed,correctedRows,{assess,categories,year}) {
    if (!Array.isArray(correctedRows) || correctedRows.length !== parsed.proposals.length) {
        throw Object.assign(new Error('Review and confirm every work-plan action before upload.'),{statusCode:400});
    }
    const submitted = new Map(correctedRows.map(row => [String(row.action_key),row]));
    for (const programme of parsed.programmes) {
        const programmeFields = [
            'programme_number','strategic_pillar','programme','goal','kpi','target','baseline','budget'
        ];
        let programmeValues = null;
        for (const action of programme.actions) {
            const confirmed = submitted.get(action.action_key);
            if (!confirmed || confirmed.confirmed !== true || !confirmed.values) {
                throw Object.assign(new Error(`Confirm the proposed correction for work-plan row ${action.source_row}.`),{statusCode:400});
            }
            const values = Object.fromEntries(EDITABLE_FIELDS.map(field => [field,confirmed.values[field] ?? null]));
            const errors = validateValues(values,categories);
            if (errors.length) {
                throw Object.assign(new Error(`Work-plan row ${action.source_row}: ${errors[0]}`),{statusCode:422});
            }
            if (!programmeValues) {
                programmeValues = Object.fromEntries(programmeFields.map(field => [field,values[field]]));
            } else if (programmeFields.some(field => String(values[field] ?? '') !== String(programmeValues[field] ?? ''))) {
                throw Object.assign(new Error(`Programme-level corrections must be consistent for every action under “${programme.programme}”.`),{statusCode:422});
            }
            programme.number = text(values.programme_number);
            programme.pillar = text(values.strategic_pillar);
            programme.programme = text(values.programme);
            programme.goal = text(values.goal);
            programme.kpi = text(values.kpi);
            programme.target = text(values.target);
            programme.baseline = text(values.baseline);
            programme.budget = numeric(values.budget);
            action.action = text(values.action_point);
            action.weight = numeric(values.weight);
            action.start = canonicalMonth(values.start);
            action.end = canonicalMonth(values.end);
            action.due_date = endOfMonth(year,action.end);
            const system = assess(programme,action);
            const likelihood = Number(values.likelihood);
            const impact = Number(values.impact);
            action.assessment = {
                ...system,
                risk_title:text(values.risk_title),
                risk_description:text(values.risk_description),
                risk_category:values.risk_category,
                likelihood,impact,
                risk_score:likelihood * impact,
                risk_level:require('./riskMatrix').calculateRiskLevel(likelihood * impact),
                risk_response:values.risk_response,
                treatment_recommendation:text(values.treatment_recommendation),
                system_assessment:system
            };
            const proposal = parsed.proposals.find(item => item.action_key === action.action_key);
            action.correction_audit = {
                rules_version:WORKPLAN_RULES_VERSION,
                original:proposal.original,
                system_proposal:proposal.values,
                confirmed_values:values,
                explanations:proposal.corrections,
                confirmed:true
            };
        }
    }
    parsed.correction_audit = {
        rules_version:WORKPLAN_RULES_VERSION,
        confirmed_actions:parsed.proposals.length
    };
    return parsed;
}

module.exports = {
    APPROVED_RESPONSES,
    EDITABLE_FIELDS,
    MONTH_LABELS,
    WORKPLAN_RULES_VERSION,
    applyWorkplanCorrections,
    parseWorkplanWorkbook,
    validateValues
};

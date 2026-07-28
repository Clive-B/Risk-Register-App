const XLSX = require('xlsx');

const MAX_WORKBOOK_BYTES = 8 * 1024 * 1024;
const MAX_DATA_ROWS = 10000;
const ALLOWED_EXTENSIONS = new Set(['.xlsx', '.xls']);

const FIELD_ALIASES = {
    risk_id: ['risk id', 'risk identifier', 'risk reference', 'risk reference number', 'risk no', 'risk number', 'reference no', 'reference number', 'ref no', 's/n', 's no', 'sn', 'serial no', 'serial number', 'no'],
    risk_title: ['risk title', 'risk name', 'identified risk', 'risk', 'risk event'],
    risk_description: ['risk description', 'risk statement', 'description', 'risk event cause and consequence'],
    risk_source: ['risk source', 'source of risk', 'risk origin'],
    risk_cause: ['risk cause', 'root cause', 'cause of risk', 'risk driver'],
    risk_category: ['risk category', 'category', 'risk type'],
    directorate: ['directorate', 'division', 'department', 'directorate division'],
    business_unit: ['business unit', 'unit', 'centre', 'center', 'section', 'workstream'],
    programme_project: ['programme project', 'program project', 'programme/project', 'program/project', 'project programme', 'project/programme', 'program', 'objective process', 'objective/process'],
    risk_owner: ['risk owner', 'owner'],
    date_identified: ['date identified', 'identification date', 'date risk identified', 'risk identification date', 'date captured'],
    likelihood: ['likelihood', 'risk likelihood', 'inherent likelihood', 'initial likelihood', 'likelihood rating', 'pre mitigation likelihood'],
    impact: ['impact', 'risk impact', 'inherent impact', 'initial impact', 'impact rating', 'pre mitigation impact'],
    inherent_risk_score: ['inherent risk score', 'inherent score', 'initial risk score', 'inherent rating', 'initial rating', 'pre mitigation score', 'inherent risk rating'],
    risk_level: ['risk level', 'inherent risk level', 'inherent risk rating', 'initial risk level'],
    existing_controls: ['existing controls', 'existing control', 'controls', 'control measures', 'existing mitigation controls'],
    control_effectiveness: ['control effectiveness', 'controls effectiveness', 'effectiveness of controls', 'control effectiveness rating'],
    control_type: ['control type', 'type of control', 'control classification'],
    control_owner: ['control owner', 'owner of control'],
    control_design_adequacy: ['control design adequacy', 'design adequacy', 'control design'],
    control_evidence: ['control evidence', 'evidence of control', 'control evidence reference', 'evidence reference'],
    control_last_tested_date: ['control last tested date', 'last control test date', 'control test date', 'last tested date'],
    control_exceptions: ['control exceptions', 'control exception', 'control weaknesses', 'control gaps'],
    control_next_review_date: ['control next review date', 'next control review date', 'control review date'],
    control_assessment_basis: ['control assessment basis', 'basis for control assessment', 'control assessment rationale'],
    risk_treatment: ['risk treatment', 'risk response', 'treatment option', 'response strategy', 'risk treatment option'],
    initial_mitigation_plan: ['initial mitigation plan', 'mitigation plan', 'mitigation plan actions', 'further action', 'further actions', 'additional controls', 'action plan'],
    responsible_officer: ['responsible officer', 'action owner', 'responsible person', 'responsibility', 'risk action owner lead officer', 'risk action owner/lead officer'],
    target_completion_date: ['target completion date', 'completion date', 'target date', 'due date', 'action due date'],
    current_impact: ['current impact', 'current impact rating'],
    current_likelihood: ['current likelihood', 'current likelihood rating'],
    current_risk_score: ['current risk score', 'current score', 'current rating'],
    treatment_status: ['treatment status', 'action status', 'mitigation status', 'current status'],
    progress_notes: ['progress notes', 'progress update', 'progress', 'historical progress', 'comments remarks', 'remarks'],
    next_review_date: ['next review date', 'review date', 'date of next review'],
    residual_impact: ['residual impact', 'residual impact rating', 'post mitigation impact'],
    residual_likelihood: ['residual likelihood', 'residual likelihood rating', 'post mitigation likelihood'],
    residual_score: ['residual score', 'residual risk score', 'residual risk', 'residual rating', 'post mitigation score'],
    closure_date: ['closure date', 'date closed', 'closed date'],
    closure_comments: ['closure comments', 'closure comment', 'closure remarks'],
    status: ['status', 'risk status'],
    workflow_status: ['workflow status', 'approval status', 'workflow state']
};

const TRACKING_TEMPLATE_SIGNATURE = new Set([
    'risk id',
    'program',
    'risk name',
    'pre mitigation impact',
    'pre mitigation likelihood',
    'post mitigation impact',
    'post mitigation likelihood'
]);

const LEGAL_TEMPLATE_SIGNATURE = new Set([
    'no',
    'objective process',
    'risk category',
    'risk description',
    'risk source',
    'risk event',
    'risk cause',
    'existing control',
    'risk owner',
    'risk action owner lead officer',
    'risk likelihood',
    'risk impact',
    'inherent risk rating'
]);

const TRACKING_REQUIRED_FIELDS = [
    'risk_id',
    'programme_project',
    'risk_title',
    'risk_description',
    'date_identified',
    'risk_owner',
    'likelihood',
    'impact',
    'risk_treatment',
    'initial_mitigation_plan',
    'target_completion_date'
];

const LEGAL_REQUIRED_FIELDS = [
    'programme_project',
    'risk_category',
    'risk_description',
    'risk_source',
    'risk_title',
    'risk_cause',
    'existing_controls',
    'risk_owner',
    'responsible_officer',
    'likelihood',
    'impact'
];

const TRACKING_IGNORED_HEADERS = new Set([
    'risk proximity',
    'operational or project risk',
    'escalation level',
    'last review date',
    'notes'
]);

const REQUIRED_FIELDS = [
    'risk_title',
    'risk_description',
    'risk_category',
    'directorate',
    'risk_owner',
    'likelihood',
    'impact',
    'existing_controls',
    'control_effectiveness',
    'risk_treatment',
    'initial_mitigation_plan',
    'responsible_officer',
    'target_completion_date'
];

function normalizeHeader(value) {
    return String(value ?? '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/^\d+\s+/, '');
}

const HEADER_LOOKUP = Object.entries(FIELD_ALIASES).reduce((lookup, [field, aliases]) => {
    aliases.forEach(alias => lookup.set(normalizeHeader(alias), field));
    lookup.set(normalizeHeader(field), field);
    return lookup;
}, new Map());

function getExtension(fileName) {
    const match = String(fileName || '').toLowerCase().match(/\.[^.]+$/);
    return match ? match[0] : '';
}

function decodeWorkbook(fileName, fileData) {
    if (!fileName || String(fileName).length > 255) throw new Error('The Excel file name is invalid.');
    const extension = getExtension(fileName);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
        throw new Error('Only .xlsx and .xls files are allowed.');
    }

    const encoded = String(fileData || '').replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw new Error('The uploaded workbook data is invalid.');
    }

    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length || buffer.length > MAX_WORKBOOK_BYTES) {
        throw new Error(`The workbook must be smaller than ${MAX_WORKBOOK_BYTES / 1024 / 1024} MB.`);
    }

    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    const isCompound = buffer.length >= 8
        && buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    if ((extension === '.xlsx' && !isZip) || (extension === '.xls' && !isCompound)) {
        throw new Error('The file contents do not match the selected Excel file type.');
    }

    return buffer;
}

function cellIsPopulated(value) {
    return value !== null && value !== undefined && String(value).trim() !== '';
}

function detectRegisterSheet(workbook) {
    let best = null;

    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const rangeStartRow = worksheet['!ref']
            ? XLSX.utils.decode_range(worksheet['!ref']).s.r
            : 0;
        const matrix = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            raw: true,
            defval: null,
            blankrows: true
        });

        matrix.forEach((row, rowIndex) => {
            const mappedFields = row.map(value => HEADER_LOOKUP.get(normalizeHeader(value)) || null);
            const uniqueFields = new Set(mappedFields.filter(Boolean));
            const requiredMatches = REQUIRED_FIELDS.filter(field => uniqueFields.has(field)).length;
            const anchorMatches = ['risk_title', 'risk_description', 'directorate', 'likelihood', 'impact']
                .filter(field => uniqueFields.has(field)).length;
            const normalizedHeaders = new Set(row.map(normalizeHeader).filter(Boolean));
            const trackingTemplate = [...TRACKING_TEMPLATE_SIGNATURE].every(header => normalizedHeaders.has(header));
            const legalTemplate = [...LEGAL_TEMPLATE_SIGNATURE].every(header => normalizedHeaders.has(header));
            const score = (requiredMatches * 10) + uniqueFields.size + (trackingTemplate ? 1000 : 0) + (legalTemplate ? 900 : 0);

            if ((anchorMatches >= 3 || legalTemplate) && (!best || score > best.score)) {
                best = {
                    sheetName,
                    matrix,
                    rangeStartRow,
                    headerRowIndex:rowIndex,
                    mappedFields,
                    score,
                    templateType:trackingTemplate
                        ? 'Risk Register Tracking Template'
                        : legalTemplate
                            ? 'Legal Legacy Risk Register'
                            : 'Generic Risk Register'
                };
            }
        });
    });

    if (!best) {
        throw new Error('The NCA Risk Register header row could not be detected.');
    }

    return best;
}

function displayValue(value) {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value === null || value === undefined ? '' : String(value);
}

function excelDate(value) {
    if (!cellIsPopulated(value)) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
    const text = String(value).trim();
    const dayFirst = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (dayFirst) {
        const [,day,month,year] = dayFirst;
        const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
        if (candidate.getUTCFullYear() === Number(year) && candidate.getUTCMonth() === Number(month) - 1 && candidate.getUTCDate() === Number(day)) {
            return candidate.toISOString().slice(0, 10);
        }
    }
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? text : date.toISOString().slice(0, 10);
}

function normalizeCellValue(field, value) {
    if (!cellIsPopulated(value)) return null;
    if ([
        'date_identified', 'target_completion_date', 'next_review_date', 'closure_date',
        'control_last_tested_date', 'control_next_review_date'
    ].includes(field)) {
        return excelDate(value);
    }
    if (['likelihood', 'impact', 'inherent_risk_score', 'current_impact', 'current_likelihood', 'current_risk_score', 'residual_impact', 'residual_likelihood', 'residual_score'].includes(field)) {
        return Number(value);
    }
    return String(value).trim();
}

function appendText(current, addition) {
    const next = displayValue(addition).trim();
    if (!next) return current || null;
    const existing = displayValue(current).trim();
    if (!existing) return next;
    return `${existing}\n${next}`;
}

function legalRiskId(value, fileName, sequence) {
    const supplied = displayValue(value).trim();
    if (supplied && !/^\d+$/.test(supplied)) return supplied;
    const year = String(fileName || '').match(/\b(20\d{2})\b/)?.[1] || String(new Date().getFullYear());
    return `LEGAL-RSK-${year}-${String(sequence).padStart(4, '0')}`;
}

function proposeSpelling(value) {
    const original = displayValue(value);
    const corrected = original
        .replace(/\bqaulity\b/gi, 'quality')
        .replace(/\bresponsivenss\b/gi, 'responsiveness');
    return corrected === original ? null : corrected;
}

function parseRiskWorkbook(fileName, fileData) {
    const buffer = decodeWorkbook(fileName, fileData);
    let workbook;
    try {
        workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, cellFormula: true });
    } catch (_) {
        throw new Error('The Excel workbook is corrupt, encrypted, or cannot be read.');
    }

    const detected = detectRegisterSheet(workbook);
    const headers = detected.matrix[detected.headerRowIndex].map(displayValue);
    const nonEmptyHeaderIndexes = headers.reduce((indexes, header, index) => {
        if (cellIsPopulated(header)) indexes.push(index);
        return indexes;
    }, []);
    const ignoredHeaders = nonEmptyHeaderIndexes
        .filter(index => !detected.mappedFields[index] && detected.templateType === 'Risk Register Tracking Template' && TRACKING_IGNORED_HEADERS.has(normalizeHeader(headers[index])))
        .map(index => headers[index]);
    const unmappedHeaders = nonEmptyHeaderIndexes
        .filter(index => !detected.mappedFields[index])
        .filter(index => !ignoredHeaders.includes(headers[index]))
        .map(index => headers[index]);
    const duplicateFields = detected.mappedFields.filter((field, index, fields) => field && fields.indexOf(field) !== index);
    const requiredFields = detected.templateType === 'Risk Register Tracking Template'
        ? TRACKING_REQUIRED_FIELDS
        : detected.templateType === 'Legal Legacy Risk Register'
            ? LEGAL_REQUIRED_FIELDS
            : REQUIRED_FIELDS;
    const missingHeaders = requiredFields.filter(field => !detected.mappedFields.includes(field));

    if (unmappedHeaders.length) {
        throw new Error(`Unsupported template column(s): ${unmappedHeaders.join(', ')}.`);
    }
    if (duplicateFields.length) {
        throw new Error(`The template contains duplicate mapped column(s): ${[...new Set(duplicateFields)].join(', ')}.`);
    }
    if (missingHeaders.length) {
        throw new Error(`The template is missing required column(s): ${missingHeaders.map(field => field.replaceAll('_', ' ')).join(', ')}.`);
    }

    const seenRiskIds = new Set();
    const trackingContext = {
        parentRiskId:null,
        programmeProject:null,
        riskTitle:null,
        childIndex:0
    };
    let legalSequence = 0;
    const rows = detected.matrix.slice(detected.headerRowIndex + 1).reduce((items, row, offset) => {
        if (!nonEmptyHeaderIndexes.some(index => cellIsPopulated(row[index]))) return items;

        const mappedData = {};
        const values = {};
        nonEmptyHeaderIndexes.forEach(index => {
            const header = headers[index];
            const field = detected.mappedFields[index];
            values[header] = displayValue(row[index]);
            if (field) mappedData[field] = normalizeCellValue(field, row[index]);
        });

        const excelRow = detected.rangeStartRow + detected.headerRowIndex + offset + 2;
        if (detected.templateType === 'Risk Register Tracking Template' && !mappedData.risk_id && !mappedData.risk_title && !mappedData.risk_description) return items;
        if (detected.templateType === 'Legal Legacy Risk Register') {
            const isPrimaryRisk = Boolean(
                mappedData.risk_id
                || mappedData.programme_project
                || mappedData.risk_title
                || mappedData.risk_description
            );
            if (!isPrimaryRisk) {
                const parent = items[items.length - 1];
                if (parent) {
                    if (mappedData.risk_source) {
                        parent.data.risk_source = appendText(parent.data.risk_source,mappedData.risk_source);
                        parent.original_data.risk_source = appendText(parent.original_data.risk_source,mappedData.risk_source);
                        parent.corrections.push({
                            field:'risk_source',
                            original:mappedData.risk_source,
                            proposed:parent.data.risk_source,
                            reason:`Excel row ${excelRow} continues the preceding merged Risk Source and was combined with that risk.`,
                            rule:'Continuation rows containing only source or cause details must remain part of their parent risk.'
                        });
                    }
                    if (mappedData.risk_cause) {
                        parent.data.risk_cause = appendText(parent.data.risk_cause,mappedData.risk_cause);
                        parent.original_data.risk_cause = appendText(parent.original_data.risk_cause,mappedData.risk_cause);
                        parent.corrections.push({
                            field:'risk_cause',
                            original:mappedData.risk_cause,
                            proposed:parent.data.risk_cause,
                            reason:`Excel row ${excelRow} continues the preceding merged Risk Cause and was combined with that risk.`,
                            rule:'Continuation rows containing only source or cause details must remain part of their parent risk.'
                        });
                    }
                }
                return items;
            }
        }
        const originalData = {...mappedData};
        const corrections = [];
        if (detected.templateType === 'Risk Register Tracking Template') {
            if (mappedData.risk_id) {
                trackingContext.parentRiskId = String(mappedData.risk_id);
                trackingContext.programmeProject = mappedData.programme_project;
                trackingContext.riskTitle = mappedData.risk_title;
                trackingContext.childIndex = 0;
            }
            if (!mappedData.programme_project && trackingContext.programmeProject) {
                mappedData.programme_project = trackingContext.programmeProject;
                corrections.push({
                    field:'programme_project',
                    original:null,
                    proposed:mappedData.programme_project,
                    reason:'The Program cell is merged in Excel. The system carried the parent Program into this separately monitored risk.',
                    rule:'Every imported risk requires its own Program value.'
                });
            }
            if (!mappedData.risk_title && trackingContext.riskTitle) {
                mappedData.risk_title = trackingContext.riskTitle;
                corrections.push({
                    field:'risk_title',
                    original:null,
                    proposed:mappedData.risk_title,
                    reason:'The Risk Name cell is merged in Excel. The system carried the parent Risk Name into this separately monitored risk.',
                    rule:'Every imported risk requires its own Risk Name.'
                });
            }
            if (trackingContext.parentRiskId) {
                trackingContext.childIndex += 1;
                const childRiskId = `${trackingContext.parentRiskId}-${String(trackingContext.childIndex).padStart(2, '0')}`;
                corrections.push({
                    field:'risk_id',
                    original:mappedData.risk_id,
                    proposed:childRiskId,
                    reason:`The parent Risk ID covers ${trackingContext.childIndex === 1 ? 'multiple' : 'another'} risk event. A unique child ID is required for separate monitoring.`,
                    rule:'Risk IDs must be unique across the enterprise register.'
                });
                mappedData.parent_risk_id = trackingContext.parentRiskId;
                mappedData.risk_id = childRiskId;
            }
        }
        if (detected.templateType === 'Legal Legacy Risk Register') {
            legalSequence += 1;
            const proposedRiskId = legalRiskId(mappedData.risk_id,fileName,legalSequence);
            if (proposedRiskId !== displayValue(mappedData.risk_id).trim()) {
                corrections.push({
                    field:'risk_id',
                    original:mappedData.risk_id,
                    proposed:proposedRiskId,
                    reason:'The Legal workbook serial number is not a unique enterprise Risk ID. The system proposed a governed Legal reference.',
                    rule:'Risk IDs must be unique, meaningful and no longer than 30 characters.'
                });
                mappedData.risk_id = proposedRiskId;
            }
            const spellingProposal = proposeSpelling(mappedData.programme_project);
            if (spellingProposal) {
                corrections.push({
                    field:'programme_project',
                    original:mappedData.programme_project,
                    proposed:spellingProposal,
                    reason:'The Objective/Process contains recognised spelling errors. The original wording remains in the audit record.',
                    rule:'The Focal Person must review and confirm proposed text corrections.'
                });
                mappedData.programme_project = spellingProposal;
            }
        }
        const errors = [];
        if (mappedData.risk_id) {
            const key = String(mappedData.risk_id).toLowerCase();
            if (seenRiskIds.has(key)) errors.push('Risk ID is duplicated within the workbook.');
            seenRiskIds.add(key);
        }
        items.push({
            excel_row: excelRow,
            values,
            data: mappedData,
            original_data: originalData,
            corrections,
            errors
        });
        return items;
    }, []);

    if (!rows.length) throw new Error('No populated risk data rows were found below the header row.');
    if (rows.length > MAX_DATA_ROWS) throw new Error(`A maximum of ${MAX_DATA_ROWS} populated risk rows can be imported at once.`);

    return {
        file_name: fileName,
        sheet_name: detected.sheetName,
        template_type: detected.templateType,
        header_row: detected.rangeStartRow + detected.headerRowIndex + 1,
        ignored_headers: ignoredHeaders,
        headers: nonEmptyHeaderIndexes.map(index => headers[index]),
        rows
    };
}

module.exports = {
    MAX_WORKBOOK_BYTES,
    REQUIRED_FIELDS,
    parseRiskWorkbook
};

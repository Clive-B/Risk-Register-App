const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const {
    BULK_USER_RULES_VERSION,
    applyConfirmedUsers,
    buildManualUserPreview,
    parseUserWorkbook
} = require('../utils/bulkUserWorkbookCorrectionEngine');

test('blank Staff ID and phone remain blank and are never generated', () => {
    const [row] = buildManualUserPreview([{
        full_name:'Ama Mensah',
        email:'ama.mensah@nca.org.gh',
        role:'Risk Focal Person',
        division:'Internal Audit',
        staff_id:'',
        phone:'',
        status:'Active'
    }]);

    assert.equal(row.values.staff_id, null);
    assert.equal(row.values.phone, null);
    assert.equal(row.valid, true);
    assert.match(
        row.corrections.find(rule => rule.rule_id === 'USER-STAFF-ID-OPTIONAL').explanation,
        /remain blank.*not generate/i
    );

    const [confirmed] = applyConfirmedUsers([row], [{
        row_key:row.row_key,
        confirmed:true,
        values:row.values
    }]);
    assert.equal(confirmed.values.staff_id, null);
    assert.equal(confirmed.values.phone, null);
    assert.equal(confirmed.audit.confirmed_values.staff_id, null);
});

test('ambiguous access values require approved dropdown selections', () => {
    const [row] = buildManualUserPreview([{
        full_name:'Kojo Owusu',
        email:'kojo.owusu@nca.org.gh',
        role:'Auditor',
        division:'Audit Team',
        status:'Active'
    }]);

    assert.equal(row.values.role, null);
    assert.equal(row.values.division, null);
    assert.equal(row.valid, false);
    assert.ok(row.errors.includes('Select an approved role.'));
    assert.ok(row.corrections.some(rule => rule.rule_id === 'USER-ROLE-SELECTION'));
});

test('template headers are reusable and optional Staff ID is recognised', () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([
        ['Instructions'],
        [],
        ['Official Email Address','Staff ID (Optional)','Division','Full Name','Phone Number (Optional)','Role','Status (Optional)'],
        ['audit.user@nca.org.gh','IA-001','Internal Audit','Audit User','','Risk Champion','Active']
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Users');
    const parsed = parseUserWorkbook(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
    const row = parsed.rows[0];

    assert.equal(parsed.header_row, 3);
    assert.equal(row.values.staff_id, 'IA-001');
    assert.equal(row.values.phone, null);
    assert.equal(row.valid, true);
});

test('every proposed correction contains the governed rule and audit schema', () => {
    const [row] = buildManualUserPreview([{
        full_name:'',
        email:' TEST.USER@NCA.ORG.GH ',
        role:'',
        division:'',
        staff_id:'',
        phone:'',
        status:''
    }]);

    assert.ok(row.corrections.length >= 5);
    row.corrections.forEach(rule => {
        assert.equal(rule.rules_version, BULK_USER_RULES_VERSION);
        assert.ok(rule.detection_rule);
        assert.ok(Object.hasOwn(rule, 'proposed_correction'));
        assert.ok(rule.explanation);
        assert.ok(['High','Medium','Low'].includes(rule.confidence_level));
        assert.equal(rule.editable_value, true);
        assert.ok(rule.validation_rule);
        assert.ok(rule.audit_record);
    });
});

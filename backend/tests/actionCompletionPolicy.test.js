const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
    assessActionCompletion,
    canDismissAction
} = require('../services/actionCompletionPolicy');

function clientWith(treatment) {
    return {
        async query() {
            return {rows: treatment ? [treatment] : []};
        }
    };
}

test('treatment actions remain open until progress and status are complete', async () => {
    const result = await assessActionCompletion(
        {source_type:'TreatmentPlan',source_id:'42',action_url:'pages/treatment.html'},
        clientWith({
            id:42,
            plan_title:'Strengthen monitoring',
            progress_percent:75,
            status:'In Progress',
            lifecycle_status:'Active Monitoring',
            due_date:'2026-08-31',
            evidence_required:'',
            evidence_file_name:null,
            evidence_url:null,
            evidence_notes:null
        })
    );
    assert.equal(result.ready,false);
    assert.equal(result.code,'TREATMENT_INCOMPLETE');
    assert.equal(result.treatment.progressPercent,75);
    assert.equal(result.requirements.length,2);
});

test('required treatment evidence is validated before Action Centre completion', async () => {
    const result = await assessActionCompletion(
        {source_type:'TreatmentPlan',source_id:'7'},
        clientWith({
            id:7,
            plan_title:'Complete control testing',
            progress_percent:100,
            status:'Completed',
            lifecycle_status:'Completed',
            due_date:'2026-07-31',
            evidence_required:'Approved control test',
            evidence_file_name:null,
            evidence_url:null,
            evidence_notes:null
        })
    );
    assert.equal(result.ready,false);
    assert.match(result.requirements.join(' '),/evidence/i);
});

test('completed treatment with evidence passes the source-aware check', async () => {
    const result = await assessActionCompletion(
        {source_type:'TreatmentPlan',source_id:'7'},
        clientWith({
            id:7,
            plan_title:'Complete control testing',
            progress_percent:100,
            status:'Completed',
            lifecycle_status:'Completed',
            due_date:'2026-07-31',
            evidence_required:'Approved control test',
            evidence_file_name:'control-test.pdf',
            evidence_url:null,
            evidence_notes:null
        })
    );
    assert.equal(result.ready,true);
    assert.deepEqual(result.requirements,[]);
});

test('only actions explicitly marked dismissible may be dismissed', () => {
    assert.equal(canDismissAction({available_actions:['view','dismiss']}),true);
    assert.equal(canDismissAction({available_actions:['view','complete']}),false);
    assert.equal(canDismissAction({available_actions:'["view","dismiss"]'}),true);
});

test('Action Centre presents incomplete treatment requirements in a governed dialog', () => {
    const root = path.resolve(__dirname,'..','..');
    const page = fs.readFileSync(path.join(root,'frontend/pages/action-centre.html'),'utf8');
    const script = fs.readFileSync(path.join(root,'frontend/js/action-centre.js'),'utf8');
    assert.match(page,/id="treatmentCompletionDialog"/);
    assert.match(page,/Open Treatment Plan/);
    assert.match(script,/TREATMENT_INCOMPLETE/);
    assert.match(script,/showTreatmentCompletionCheck/);
    assert.match(script,/commands\.includes\('complete'\)/);
    assert.match(script,/commands\.includes\('dismiss'\)/);
});

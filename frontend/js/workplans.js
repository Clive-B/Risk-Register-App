(() => {
    const app = window.NCAGRC;
    const user = app.getUser();
    const state = {
        plans: [],
        selected: null,
        pendingFocalApproval: null,
        workplanImport: null,
        requestedPlanId: Number(new URLSearchParams(window.location.search).get('workplan_id')) || null
    };
    const $ = id => document.getElementById(id);
    const categories = ['Strategic','Financial','Operational','Reputational','Human Capital','Regulatory Compliance','Supervision'];
    const likelihoodLabels = {1:'Rare (Very Low)',2:'Unlikely (Low)',3:'Possible (Medium)',4:'Likely (High)',5:'Almost Certain (Very High)'};
    const impactLabels = {1:'Insignificant (Very Low)',2:'Minor (Low)',3:'Moderate (Medium)',4:'Major (High)',5:'Catastrophic (Very High)'};
    const responses = ['Terminate','Treat','Transfer','Tolerate'];
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December','Quarterly'];
    const correctionLabels = {
        programme_number:'Programme Number',strategic_pillar:'Strategic Pillar',programme:'Programme',
        goal:'Goal',kpi:'KPI',target:'Target',baseline:'Baseline',action_point:'Action Point',
        budget:'Budget (GHC)',weight:'Weight (%)',start:'Start',end:'End',
        risk_title:'Generated Risk Title',risk_description:'Generated Risk Statement',
        risk_category:'Risk Category',likelihood:'Likelihood',impact:'Impact',
        risk_response:'Risk Response',treatment_recommendation:'Treatment Recommendation'
    };
    const levelFor = score => app.riskMatrix.calculateLevel(score);
    const responseFor = (impact, likelihood) => {
        const score = Number(impact) * Number(likelihood);
        if (score === 25) return 'Terminate';
        if (score >= 11) return 'Treat';
        if (Number(impact) >= 4 && Number(likelihood) <= 2) return 'Transfer';
        if (score >= 6) return 'Treat';
        return 'Tolerate';
    };
    const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[character]));

    function toast(message, type = '') {
        const element = $('toast');
        element.textContent = message;
        element.className = type;
        element.style.display = 'block';
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => { element.style.display = 'none'; }, 3500);
    }

    function fileData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    function workplanCorrectionErrors(row,rows) {
        const values=row.edited || {};
        const errors=[...(row.errors || [])];
        ['programme','action_point','risk_title','risk_description','treatment_recommendation'].forEach(field => {
            if (!String(values[field] ?? '').trim()) errors.push(`${correctionLabels[field]} is required.`);
        });
        if (!categories.includes(values.risk_category)) errors.push('Select an approved ERM risk category.');
        if (![values.likelihood,values.impact].every(value => Number.isInteger(Number(value)) && Number(value)>=1 && Number(value)<=5)) {
            errors.push('Likelihood and impact must be between 1 and 5.');
        }
        if (!responses.includes(values.risk_response)) errors.push('Select an approved ERM risk response.');
        if (!months.includes(values.start) || !months.includes(values.end)) errors.push('Choose recognised Start and End values.');
        if (String(values.weight ?? '').trim() && (!Number.isFinite(Number(values.weight)) || Number(values.weight)<0 || Number(values.weight)>100)) {
            errors.push('Weight must be blank or between 0 and 100.');
        }
        const duplicateKey=`${String(values.programme||'').trim().toLowerCase()}|${String(values.action_point||'').trim().toLowerCase()}`;
        if (duplicateKey !== '|' && rows.filter(item => `${String(item.edited?.programme||'').trim().toLowerCase()}|${String(item.edited?.action_point||'').trim().toLowerCase()}`===duplicateKey).length>1) {
            errors.push('This programme and action combination is duplicated in the upload.');
        }
        return [...new Set(errors)];
    }

    function workplanCorrectionInput(row,index,field) {
        const value=row.edited?.[field] ?? '';
        const original=row.original?.[field];
        const originalText=original===null||original===undefined||String(original).trim()===''
            ? 'Blank or system-generated'
            : `Original: ${escape(original)}`;
        const attributes=`data-workplan-row="${index}" data-workplan-field="${field}"`;
        let control;
        if (field==='risk_category') {
            control=`<select ${attributes}>${categories.map(option=>`<option${option===value?' selected':''}>${escape(option)}</option>`).join('')}</select>`;
        } else if (field==='risk_response') {
            control=`<select ${attributes}>${responses.map(option=>`<option${option===value?' selected':''}>${escape(option)}</option>`).join('')}</select>`;
        } else if (['likelihood','impact'].includes(field)) {
            control=`<select ${attributes}>${[1,2,3,4,5].map(option=>`<option value="${option}"${Number(option)===Number(value)?' selected':''}>${option}</option>`).join('')}</select>`;
        } else if (['start','end'].includes(field)) {
            control=`<select ${attributes}>${months.map(option=>`<option${option===value?' selected':''}>${option}</option>`).join('')}</select>`;
        } else if (['programme','goal','kpi','target','baseline','action_point','risk_title','risk_description','treatment_recommendation'].includes(field)) {
            const rowsCount=['action_point','risk_description','treatment_recommendation'].includes(field)?3:2;
            control=`<textarea rows="${rowsCount}" ${attributes}>${escape(value)}</textarea>`;
        } else {
            const type=['budget','weight'].includes(field)?'number':'text';
            const limits=field==='weight'?' min="0" max="100" step="0.01"':field==='budget'?' min="0" step="0.01"':'';
            control=`<input type="${type}" value="${escape(value)}"${limits} ${attributes}>`;
        }
        const wide=['programme','goal','kpi','target','baseline','action_point','risk_title','risk_description','treatment_recommendation'].includes(field);
        return `<label class="workplan-correction-field${wide?' wide':''}"><span>${correctionLabels[field]}</span>${control}<small>${originalText}</small></label>`;
    }

    function renderWorkplanCorrectionWorkspace() {
        const preview=state.workplanImport?.preview;
        if (!preview) return;
        const rows=preview.rows;
        rows.forEach(row=>{
            if (!row.edited) row.edited={...row.values};
            row.clientErrors=workplanCorrectionErrors(row,rows);
            if (row.clientErrors.length) row.confirmed=false;
        });
        const confirmed=rows.filter(row=>row.confirmed && !row.clientErrors.length).length;
        $('workplanCorrectionMeta').textContent=`${preview.file_name} · ${preview.sheet_name} · header row ${preview.header_row} · rules ${preview.rules_version}`;
        $('workplanCorrectionEducationTitle').textContent=preview.education?.title || 'How governed correction works';
        $('workplanCorrectionEducationSteps').innerHTML=(preview.education?.steps||[]).map(step=>`<li>${escape(step)}</li>`).join('');
        $('workplanCorrectionProgrammes').textContent=preview.summary.programme_count;
        $('workplanCorrectionTotal').textContent=rows.length;
        $('workplanCorrectionConfirmed').textContent=confirmed;
        $('workplanCorrectionWorkspace').innerHTML=rows.map((row,index)=>{
            const valid=!row.clientErrors.length;
            const system=row.system_assessment;
            return `<article class="workplan-correction-card ${valid?'ready':'invalid'}">
                <header><div><small>Workbook row ${row.source_row} · action ${index+1}</small><h4>${escape(row.edited.programme)} — ${escape(row.edited.action_point)}</h4></div><span class="status">${valid?(row.confirmed?'Confirmed':'Ready'):`${row.clientErrors.length} issue${row.clientErrors.length===1?'':'s'}`}</span></header>
                <details${!valid||index===0?' open':''}>
                    <summary>Review corrections and ERM assessment <strong>L${row.edited.likelihood} × I${row.edited.impact} = ${Number(row.edited.likelihood)*Number(row.edited.impact)}</strong></summary>
                    <ol class="workplan-rule-list">${(row.corrections||[]).map(rule=>`<li><strong>${escape(correctionLabels[rule.field]||rule.field)}:</strong> ${escape(rule.explanation||rule.reason)} <em class="workplan-confidence workplan-confidence-${String(rule.confidence_level||'high').toLowerCase()}">${escape(rule.confidence_level||'High')} confidence</em><small>Detection: ${escape(rule.detection_rule||rule.reason)} · Proposal: ${escape(rule.proposed_correction??'User selection required')} · Validation: ${escape(rule.validation_rule||rule.rule)} · Audit: ${escape(rule.audit_record)}</small></li>`).join('')}</ol>
                    ${row.clientErrors.length?`<div class="workplan-correction-errors">${row.clientErrors.map(error=>`<span>${escape(error)}</span>`).join('')}</div>`:''}
                    <div class="workplan-correction-grid">
                        <div class="workplan-system-baseline"><span>Immutable ERM system baseline</span><strong>L${system.likelihood} × I${system.impact} = ${system.risk_score} · ${escape(system.risk_level)} · ${escape(system.risk_response)}</strong><small>${escape(system.assessment_explanation||system.assessment_rationale)}</small></div>
                        ${Object.keys(correctionLabels).map(field=>workplanCorrectionInput(row,index,field)).join('')}
                    </div>
                    <label class="workplan-correction-confirm"><input type="checkbox" data-workplan-confirm="${index}"${row.confirmed?' checked':''}${valid?'':' disabled'}><span>I reviewed this action, its corrections and the ERM assessment proposal.</span></label>
                </details>
            </article>`;
        }).join('');
        const allValid=rows.length>0&&rows.every(row=>!row.clientErrors.length);
        $('confirmAllWorkplanCorrections').disabled=!allValid;
        $('confirmAllWorkplanCorrections').textContent=confirmed===rows.length?'All Actions Confirmed':`Confirm All ${rows.length} Valid Actions`;
        $('admitCorrectedWorkplan').disabled=confirmed!==rows.length;
        $('admitCorrectedWorkplan').textContent=confirmed===rows.length?`Admit ${rows.length} Confirmed Actions`:`Confirm ${rows.length-confirmed} Remaining`;
    }

    async function previewWorkplan(file) {
        const data=await fileData(file);
        const request={file_name:file.name,file_data:data,plan_year:Number($('planYear').value),division:$('division').value.trim()};
        const result=await app.apiRequest('/workplans/preview',{method:'POST',body:JSON.stringify(request)});
        state.workplanImport={file,fileData:data,request,preview:result.preview};
        renderWorkplanCorrectionWorkspace();
        $('workplanCorrectionDialog').showModal();
    }

    async function admitCorrectedWorkplan() {
        const current=state.workplanImport;
        if (!current || current.preview.rows.some(row=>!row.confirmed||row.clientErrors.length)) return;
        try {
            $('admitCorrectedWorkplan').disabled=true;
            $('admitCorrectedWorkplan').textContent='Admitting work plan…';
            const result=await app.apiRequest('/workplans/upload',{
                method:'POST',
                body:JSON.stringify({...current.request,corrected_rows:current.preview.rows.map(row=>({action_key:row.action_key,confirmed:row.confirmed===true,values:row.edited}))})
            });
            $('workplanCorrectionDialog').close();
            state.workplanImport=null;
            $('workbook').value='';
            $('fileName').textContent='Choose an .xlsx or .xls file';
            toast(result.message);
            state.selected=null;
            await loadPlans();
            await loadDetail(result.workplan.id);
        } catch(error) {
            toast(error.message,'error');
            renderWorkplanCorrectionWorkspace();
        }
    }

    function formatBytes(value) {
        const bytes = Number(value || 0);
        if (!bytes) return '—';
        return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
    }

    function updateSummary() {
        $('totalPlans').textContent = state.plans.length;
        $('totalProgrammes').textContent = state.plans.reduce((sum, plan) => sum + Number(plan.programme_count || 0), 0);
        $('totalActions').textContent = state.plans.reduce((sum, plan) => sum + Number(plan.action_count || 0), 0);
        $('totalEscalated').textContent = state.plans.reduce((sum, plan) => sum + Number(plan.high_critical_count || 0), 0);
    }

    function filteredPlans() {
        const query = $('archiveSearch').value.trim().toLowerCase();
        const year = $('archiveYear').value;
        const status = $('archiveStatus').value;
        return state.plans.filter(plan => {
            const haystack = `${plan.file_name} ${plan.division} ${plan.uploaded_by_name || ''}`.toLowerCase();
            return (!query || haystack.includes(query)) && (!year || String(plan.plan_year) === year) && (!status || plan.status === status);
        });
    }

    function populateYears() {
        const select = $('archiveYear');
        const current = select.value;
        const years = [...new Set(state.plans.map(plan => String(plan.plan_year)))].sort().reverse();
        select.innerHTML = '<option value="">All years</option>' + years.map(year => `<option>${escape(year)}</option>`).join('');
        if (years.includes(current)) select.value = current;
    }

    function renderPlans() {
        const root = $('plans');
        const plans = filteredPlans();
        root.innerHTML = '';
        $('archiveEmpty').hidden = Boolean(plans.length);
        plans.forEach(plan => {
            const row = document.createElement('tr');
            if (Number(state.selected?.workplan?.id) === Number(plan.id)) row.classList.add('selected');
            const retained = plan.original_available ? `JSON + source until ${new Date(plan.original_expires_at).toLocaleDateString()}` : 'Compressed JSON';
            row.innerHTML = `<td><strong>${escape(plan.plan_year)}</strong><small>Version ${escape(plan.version_number)}</small></td><td>${escape(plan.division)}</td><td><strong>${escape(plan.file_name)}</strong><small>${new Date(plan.created_at).toLocaleString()}</small></td><td>${escape(plan.uploaded_by_name || 'Former user')}</td><td>${plan.programme_count} programmes<small>${plan.action_count} actions · ${plan.high_critical_count} escalated</small></td><td><span class="status">${escape(plan.status)}</span></td><td>${escape(retained)}<small>${formatBytes(plan.snapshot_size_bytes)} JSON snapshot</small></td><td><div class="row-actions"><button type="button" data-view="${plan.id}">Open</button><button type="button" data-json="${plan.id}">JSON</button></div></td>`;
            root.append(row);
        });
        root.querySelectorAll('[data-view]').forEach(button => { button.onclick = () => loadDetail(button.dataset.view); });
        root.querySelectorAll('[data-json]').forEach(button => { button.onclick = () => downloadSnapshot(button.dataset.json); });
    }

    async function downloadSnapshot(id) {
        try {
            const data = await app.apiRequest(`/workplans/${id}/archive`);
            const blob = new Blob([JSON.stringify(data.snapshot, null, 2)], { type:'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `${String(data.workplan.file_name).replace(/\.xlsx$/i, '')}-archive-v${data.workplan.version_number}.json`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (error) { toast(error.message, 'error'); }
    }

    async function loadPlans() {
        try {
            const data = await app.apiRequest('/workplans');
            state.plans = data.workplans || [];
            $('uploadPanel').hidden = !data.canUpload;
            if (user.role === 'Risk Focal Person') {
                $('division').value = user.division || user.directorate || '';
                $('divisionLabel').hidden = true;
            } else $('divisionLabel').hidden = false;
            populateYears();
            updateSummary();
            renderPlans();
            if (!state.selected) {
                const requested = state.plans.find(plan => Number(plan.id) === state.requestedPlanId);
                if (requested) await loadDetail(requested.id);
                else if (state.plans[0]) await loadDetail(state.plans[0].id);
            }
        } catch (error) { toast(error.message, 'error'); }
    }

    function renderFocalReviewSummary(assessments) {
        const visible = ['Risk Champion','System Administrator'].includes(user.role);
        const reviewed = assessments.filter(item => item.focal_at || (Array.isArray(item.focal_review_history) && item.focal_review_history.length));
        $('focalReviewSummary').hidden = !visible || !reviewed.length;
        if (!visible || !reviewed.length) {
            $('focalReviewItems').innerHTML = '';
            return;
        }
        const revisionCount = reviewed.reduce((sum,item) => sum + Math.max((item.focal_review_history || []).length,1),0);
        $('focalReviewCount').textContent = reviewed.length;
        $('focalReviewSummaryText').textContent = `${reviewed.length} risk${reviewed.length === 1 ? '' : 's'} reviewed · ${revisionCount} Focal Person version${revisionCount === 1 ? '' : 's'}. Each record shows the original system assessment and the Champion decision.`;
        $('focalReviewItems').innerHTML = reviewed.map(item => {
            const history = item.focal_review_history?.length ? item.focal_review_history : [{reviewed_at:item.focal_at,reviewed_by:'Risk Focal Person',proposal:{likelihood:item.focal_likelihood,impact:item.focal_impact,score:item.focal_score,reason:item.focal_reason,category:item.focal_category}}];
            const versions = history.map((entry,index) => {
                const proposal=entry.proposal||{};
                const calculation=proposal.score ? `L${proposal.likelihood} (${likelihoodLabels[proposal.likelihood]}) × I${proposal.impact} (${impactLabels[proposal.impact]}) = ${proposal.score}` : 'No alternative likelihood and impact recorded';
                return `<div class="review-stage focal"><span class="review-stage-role">Focal Person review · Version ${index+1}</span><strong>${escape(calculation)}</strong><small>${escape(proposal.category || item.focal_category || item.risk_category)} · ${escape(entry.reviewed_by || 'Risk Focal Person')} · ${entry.reviewed_at ? new Date(entry.reviewed_at).toLocaleString() : 'Time unavailable'}</small><p><b>Focal Person reason:</b> ${escape(proposal.reason || 'No reason recorded.')}</p></div>`;
            }).join('');
            const status=item.champion_focal_decision || (item.focal_score ? 'Awaiting Champion' : 'Reviewed');
            const systemLikelihood=item.system_likelihood || item.likelihood;
            const systemImpact=item.system_impact || item.impact;
            const systemScore=item.system_score || (Number(systemLikelihood)*Number(systemImpact));
            const systemStage=`<div class="review-stage system"><span class="review-stage-role">System-generated assessment</span><strong>L${systemLikelihood} (${likelihoodLabels[systemLikelihood]}) × I${systemImpact} (${impactLabels[systemImpact]}) = ${systemScore}</strong><small>${escape(item.risk_category)} · NCA GRC Assessment Engine · Rules ${escape(item.rules_version || 'legacy')}</small><p><b>System basis:</b> ${escape(item.assessment_explanation || item.assessment_rationale || 'System assessment rules and workbook evidence.')}</p></div>`;
            const championCalculation=item.champion_score ? `L${item.champion_likelihood} (${likelihoodLabels[item.champion_likelihood]}) × I${item.champion_impact} (${impactLabels[item.champion_impact]}) = ${item.champion_score}` : 'No Champion decision recorded yet';
            const championOutcome=item.champion_focal_decision ? `${item.champion_focal_decision} Focal Person proposal` : 'Awaiting Risk Champion';
            const championStage=`<div class="review-stage champion"><span class="review-stage-role">Risk Champion decision · ${escape(championOutcome)}</span><strong>${escape(championCalculation)}</strong><small>Risk Champion${item.champion_at ? ` · ${new Date(item.champion_at).toLocaleString()}` : ''}</small><p><b>Risk Champion reason:</b> ${escape(item.champion_decision_reason || item.champion_reason || 'No Champion reason recorded yet.')}</p></div>`;
            const latestFocal=history[history.length-1]?.proposal || {};
            const valueSummary=`<div class="decision-value-grid"><div class="system"><span>System generated</span><strong>L${systemLikelihood} × I${systemImpact}</strong></div><div class="focal"><span>Focal Person</span><strong>${latestFocal.likelihood && latestFocal.impact ? `L${latestFocal.likelihood} × I${latestFocal.impact}` : 'No proposal'}</strong></div><div class="champion"><span>Risk Champion</span><strong>${item.champion_likelihood && item.champion_impact ? `L${item.champion_likelihood} × I${item.champion_impact}` : 'Awaiting decision'}</strong></div></div>`;
            return `<article class="focal-review-card"><div class="focal-review-card-head"><div><strong>${escape(item.risk_title)}</strong><span>${escape(item.programme_number)} · ${escape(item.action_point)}</span></div><span class="challenge-status ${String(status).toLowerCase().replaceAll(' ','-')}">Champion: ${escape(status)}</span></div>${valueSummary}<details class="assessment-trail-details"><summary>View assessment trail and reasons</summary><div class="review-decision-trail">${systemStage}${versions}${championStage}</div><button type="button" data-open-focal-review="${item.assessment_id}">Open full risk row</button></details></article>`;
        }).join('');
        $('focalReviewItems').querySelectorAll('[data-open-focal-review]').forEach(button => {
            button.onclick=()=>document.getElementById(`assessment-${button.dataset.openFocalReview}`)?.scrollIntoView({behavior:'smooth',block:'center'});
        });
    }

    async function loadDetail(id) {
        try {
            state.selected = await app.apiRequest(`/workplans/${id}`);
            renderPlans();
            const { workplan, assessments, permissions = {} } = state.selected;
            $('emptyDetail').hidden = true;
            $('detail').hidden = false;
            $('detailMeta').textContent = `${workplan.division} · ${workplan.plan_year} · Version ${workplan.version_number} · ${workplan.programme_count} programmes · ${workplan.action_count} actions`;
            $('detailTitle').textContent = workplan.file_name;
            $('detailStatus').textContent = `Status: ${workplan.status}. High assessments: ${workplan.high_critical_count}. Archived as compressed JSON.`;
            $('submissionBar').hidden = !permissions.canSubmit;
            $('submissionMessage').textContent = permissions.submissionMessage || '';
            const isChairmanReview = Boolean(permissions.canChairmanEdit);
            const hasReviewerAccess = Boolean(permissions.canChampionEdit || isChairmanReview);
            $('championReviewBar').hidden = !hasReviewerAccess;
            $('openBatchApproval').hidden = !(permissions.canBatchApprove || permissions.canChairmanBatchApprove);
            $('individualApprovalLink').hidden = !permissions.canChampionEdit;
            if (permissions.canChampionEdit) {
                $('championReviewBar').querySelector('.eyebrow').textContent = 'Risk Champion review';
                $('championReviewTitle').textContent = Number(permissions.unresolvedChallengeCount) > 0 ? 'Resolve Focal Person challenges' : permissions.canBatchApprove ? 'Review and send all risks as one batch' : 'Work-plan batch already submitted';
                $('championReviewMessage').textContent = Number(permissions.unresolvedChallengeCount) > 0
                    ? `${permissions.unresolvedChallengeCount} challenged risk${Number(permissions.unresolvedChallengeCount) === 1 ? ' requires' : 's require'} an explicit Champion decision before the batch can go to the Chairman.`
                    : permissions.canBatchApprove
                        ? `All ${permissions.championEscalationCount} work-plan risks are ready for one Champion approval and one submission to the Chairman.`
                        : 'There are no work-plan risks awaiting Champion batch approval.';
                $('openBatchApproval').textContent = 'Approve & Send Batch';
                $('individualApprovalLink').textContent = 'Open Non-Workplan Approvals';
            } else if (isChairmanReview) {
                $('championReviewBar').querySelector('.eyebrow').textContent = 'Risk Committee Chairman review';
                $('championReviewTitle').textContent = 'Review and finalize the complete batch';
                $('championReviewMessage').textContent = `All ${permissions.chairmanPendingCount} work-plan risk${Number(permissions.chairmanPendingCount) === 1 ? ' is' : 's are'} awaiting one final Chairman decision. Open the Consolidated Risk Register for amendments before approving the batch.`;
                $('openBatchApproval').textContent = 'Approve Final Batch';
            }
            renderFocalReviewSummary(assessments);
            const warnings = Array.isArray(workplan.warnings) ? workplan.warnings : [];
            $('warnings').hidden = !warnings.length;
            $('warnings').innerHTML = warnings.length ? `<strong>Workbook corrections</strong><ul>${warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul>` : '';
            const body = $('assessmentRows');
            body.innerHTML = '';
            assessments.forEach(item => {
                const recommendation = item.intelligent_recommendation || {};
                const cases = Array.isArray(recommendation.supporting_cases) ? recommendation.supporting_cases : [];
                const support = cases.length ? `${cases.length} successful enterprise case${cases.length === 1 ? '' : 's'}` : 'Baseline until matching outcomes exist';
                const row = document.createElement('tr');
                row.id = `assessment-${item.assessment_id}`;
                const reviewState = Number(item.edit_count || 0) ? `<small>Edited ${item.edit_count} time${Number(item.edit_count) === 1 ? '' : 's'} and reassessed</small>` : '<small>Original assessment</small>';
                const hasFocalChallenge = Boolean(item.focal_score);
                const challengeStatus = hasFocalChallenge ? (item.champion_focal_decision || 'Awaiting Champion') : '';
                const editButton = item.generated_risk_id
                    ? `<a class="edit-assessment" href="risks.html?risk_id=${Number(item.generated_risk_id)}&mode=edit">Open in Consolidated Register</a>`
                    : `<small>Submit the work plan to create this risk in the Consolidated Register.</small>`;
                const keywords = Array.isArray(item.matched_keywords) && item.matched_keywords.length ? item.matched_keywords.join(', ') : 'No specialist keywords';
                const stages = [
                    `<strong>System:</strong> L${item.system_likelihood || item.likelihood} (${likelihoodLabels[item.system_likelihood || item.likelihood]}) × I${item.system_impact || item.impact} (${impactLabels[item.system_impact || item.impact]}) = ${item.system_score || item.risk_score}`,
                    item.focal_score ? `<strong>Focal proposal:</strong> L${item.focal_likelihood} (${likelihoodLabels[item.focal_likelihood]}) × I${item.focal_impact} (${impactLabels[item.focal_impact]}) = ${item.focal_score}${item.focal_reason ? ` — ${escape(item.focal_reason)}` : ''}` : '',
                    item.champion_score ? `<strong>Champion${item.champion_focal_decision ? ` ${escape(item.champion_focal_decision)} Focal proposal` : ''}:</strong> L${item.champion_likelihood} (${likelihoodLabels[item.champion_likelihood]}) × I${item.champion_impact} (${impactLabels[item.champion_impact]}) = ${item.champion_score}${item.champion_decision_reason || item.champion_reason ? ` — ${escape(item.champion_decision_reason || item.champion_reason)}` : ''}` : '',
                    item.chairman_score ? `<strong>Chairman final:</strong> L${item.chairman_likelihood} (${likelihoodLabels[item.chairman_likelihood]}) × I${item.chairman_impact} (${impactLabels[item.chairman_impact]}) = ${item.chairman_score}${item.chairman_reason ? ` — ${escape(item.chairman_reason)}` : ''}` : ''
                ].filter(Boolean).map(value => `<p>${value}</p>`).join('');
                const explanation = `<details class="assessment-explanation"><summary>View reasoning</summary><p>${escape(item.assessment_explanation || item.assessment_rationale)}</p><p><strong>Keywords:</strong> ${escape(keywords)}</p>${stages}</details>`;
                row.innerHTML = `<td><strong>${escape(item.programme_number)}. ${escape(item.programme)}</strong><small>${escape(item.action_point)}</small>${editButton}</td><td><strong>${escape(item.risk_title)}</strong><small>${escape(item.assessment_rationale)}</small></td><td><span class="risk-category">${escape(item.risk_category)}</span></td><td>${item.likelihood}</td><td>${item.impact}</td><td><strong>${item.risk_score}</strong></td><td><span class="level ${String(item.risk_level).toLowerCase()}">${escape(item.risk_level)}</span></td><td>${escape(item.risk_response)}</td><td>${explanation}</td><td>${escape(item.treatment_recommendation)}</td><td><span class="ai-label">AI-assisted · ${escape(recommendation.confidence || item.confidence)}</span><strong>${escape(recommendation.suggested_treatment || item.treatment_recommendation)}</strong><small>${escape(support)}. ${escape(recommendation.explanation || '')}</small></td><td>${item.generated_risk_id ? `Risk #${item.generated_risk_id}` : 'Draft'}${reviewState}</td>`;
                body.append(row);
            });
        } catch (error) { toast(error.message, 'error'); }
    }

    async function approveFocalProposal(assessmentId) {
        const item = state.selected?.assessments?.find(row => Number(row.assessment_id) === Number(assessmentId));
        if (!item || !state.selected?.permissions?.canChampionEdit || !item.focal_score) return toast('This Focal Person challenge is not available for decision.', 'error');
        state.pendingFocalApproval = item;
        $('approveFocalRiskTitle').textContent = item.risk_title;
        $('approveFocalLikelihood').textContent = `L${item.focal_likelihood}`;
        $('approveFocalImpact').textContent = `I${item.focal_impact}`;
        $('approveFocalScore').textContent = item.focal_score;
        $('approveFocalDialog').showModal();
    }

    async function confirmFocalProposal() {
        const item = state.pendingFocalApproval;
        if (!item || !state.selected?.permissions?.canChampionEdit) return;
        try {
            $('confirmFocalApproval').disabled = true;
            $('confirmFocalApproval').textContent = 'Approving…';
            const result = await app.apiRequest(`/workplans/${state.selected.workplan.id}/assessments/${item.assessment_id}`, {
                method:'PATCH',
                body:JSON.stringify({
                    programme:item.programme,
                    action_point:item.action_point,
                    treatment_recommendation:item.treatment_recommendation,
                    risk_category:item.risk_category,
                    likelihood:item.focal_likelihood,
                    impact:item.focal_impact,
                    reason:'',
                    challenge_decision:'approve'
                })
            });
            $('approveFocalDialog').close();
            state.pendingFocalApproval = null;
            toast(result.message);
            await loadDetail(state.selected.workplan.id);
        } catch (error) { toast(error.message, 'error'); }
        finally {
            $('confirmFocalApproval').disabled = false;
            $('confirmFocalApproval').textContent = 'Approve Focal Proposal';
        }
    }

    function openAssessmentEdit(assessmentId, challengeDecision = '') {
        const item = state.selected?.assessments?.find(row => Number(row.assessment_id) === Number(assessmentId));
        if (!item || !state.selected?.permissions?.canEdit) return toast('This assessment is not editable.', 'error');
        $('editAssessmentId').value = item.assessment_id;
        $('challengeDecision').value = challengeDecision;
        $('editProgramme').value = item.programme || '';
        $('editActionPoint').value = item.action_point || '';
        $('editTreatment').value = item.treatment_recommendation || '';
        $('editRiskCategory').innerHTML = categories.map(category => `<option>${escape(category)}</option>`).join('');
        $('editRiskCategory').value = item.risk_category;
        const focal = user.role !== 'Risk Champion' && user.role !== 'Risk Committee Chairman';
        const champion = user.role === 'Risk Champion';
        const chairman = user.role === 'Risk Committee Chairman';
        const rejectingChallenge = champion && Boolean(item.focal_score) && challengeDecision === 'reject';
        const likelihood = focal ? item.focal_likelihood : rejectingChallenge ? (item.champion_focal_decision === 'Rejected' ? item.champion_likelihood : '') : champion ? (item.champion_likelihood || item.system_likelihood || item.likelihood) : (item.chairman_likelihood || item.champion_likelihood || item.likelihood);
        const impact = focal ? item.focal_impact : rejectingChallenge ? (item.champion_focal_decision === 'Rejected' ? item.champion_impact : '') : champion ? (item.champion_impact || item.system_impact || item.impact) : (item.chairman_impact || item.champion_impact || item.impact);
        $('editLikelihood').value = likelihood || '';
        $('editImpact').value = impact || '';
        $('editLikelihood').required = !focal;
        $('editImpact').required = !focal;
        $('editRiskCategory').disabled = !focal;
        $('editAssessmentReason').value = focal ? (item.focal_reason || '') : rejectingChallenge ? (item.champion_decision_reason || '') : champion ? (item.champion_reason || '') : (item.chairman_reason || '');
        $('editAssessmentReason').required = chairman;
        $('editAssessmentReasonRequirement').textContent = chairman ? '(required)' : '(optional)';
        $('focalChallengeContext').hidden = !rejectingChallenge && !chairman;
        $('focalChallengeContext').innerHTML = rejectingChallenge
            ? `<span>Focal Person challenge</span><strong>L${item.focal_likelihood} (${likelihoodLabels[item.focal_likelihood]}) × I${item.focal_impact} (${impactLabels[item.focal_impact]}) = ${item.focal_score}</strong><p>${escape(item.focal_reason || 'No Focal reason recorded.')}</p><small>Record Champion values that differ from the rejected proposal. A comment is optional.</small>`
            : chairman
                ? `<span>Risk Champion assessment</span><strong>${item.champion_score ? `L${item.champion_likelihood} (${likelihoodLabels[item.champion_likelihood]}) × I${item.champion_impact} (${impactLabels[item.champion_impact]}) = ${item.champion_score}` : 'No Champion assessment recorded.'}</strong><p>${escape(item.champion_decision_reason || item.champion_reason || 'No Champion comment provided.')}</p>`
                : '';
        $('systemAssessment').innerHTML = `<span>Immutable system baseline · rules ${escape(item.rules_version || 'legacy')}</span><strong>L${item.system_likelihood || item.likelihood} (${likelihoodLabels[item.system_likelihood || item.likelihood]}) × I${item.system_impact || item.impact} (${impactLabels[item.system_impact || item.impact]}) = ${item.system_score || item.risk_score} · ${escape(item.system_level || item.risk_level)} · ${escape(item.system_response || item.risk_response)}</strong><p>${escape(item.assessment_explanation || item.assessment_rationale)}</p>`;
        $('editDialogEyebrow').textContent = user.role === 'Risk Committee Chairman'
            ? 'Risk Committee Chairman assessment review'
            : user.role === 'Risk Champion'
                ? 'Risk Champion assessment review'
                : 'Draft assessment review';
        $('saveAssessmentEdit').textContent = rejectingChallenge ? 'Save Rejection & Champion Version' : user.role === 'Risk Committee Chairman' ? 'Save Chairman Final Decision' : 'Save Assessment Changes';
        updateReviewerCalculation();
        $('assessmentDialog').showModal();
        $('editProgramme').focus();
    }

    function updateReviewerCalculation() {
        const likelihood = Number($('editLikelihood').value);
        const impact = Number($('editImpact').value);
        const label = user.role === 'Risk Committee Chairman' ? 'Chairman final decision' : user.role === 'Risk Champion' ? 'Champion review' : 'Focal Person proposal';
        if (!likelihood || !impact) {
            $('reviewerCalculation').innerHTML = `<span>${label}</span><strong>No alternative likelihood and impact proposed.</strong>`;
            return;
        }
        const score = likelihood * impact;
        $('reviewerCalculation').innerHTML = `<span>${label}</span><strong>Likelihood ${likelihood} (${likelihoodLabels[likelihood]}) × impact ${impact} (${impactLabels[impact]}) = ${score} · ${levelFor(score)} · ${responseFor(impact,likelihood)}</strong>`;
    }

    $('workbook').addEventListener('change', () => { $('fileName').textContent = $('workbook').files[0]?.name || 'Choose an .xlsx file'; });
    $('uploadForm').addEventListener('submit', async event => {
        event.preventDefault();
        const file = $('workbook').files[0];
        if (!file) return toast('Choose an Excel workbook.', 'error');
        try {
            $('uploadButton').disabled = true;
            $('uploadButton').textContent = 'Assessing…';
            await previewWorkplan(file);
        } catch (error) { toast(error.message, 'error'); }
        finally { $('uploadButton').disabled = false; $('uploadButton').textContent = 'Analyse Workbook'; }
    });
    $('workplanCorrectionWorkspace').addEventListener('change',event=>{
        const field=event.target.closest('[data-workplan-field]');
        if (field) {
            const row=state.workplanImport?.preview?.rows[Number(field.dataset.workplanRow)];
            if (!row) return;
            const name=field.dataset.workplanField;
            const nextValue=['likelihood','impact','budget','weight'].includes(name)&&field.value!==''?Number(field.value):field.value;
            const programmeFields=['programme_number','strategic_pillar','programme','goal','kpi','target','baseline','budget'];
            const affected=programmeFields.includes(name)
                ? state.workplanImport.preview.rows.filter(item=>item.programme_key===row.programme_key)
                : [row];
            affected.forEach(item=>{item.edited[name]=nextValue;item.confirmed=false;});
            renderWorkplanCorrectionWorkspace();
            return;
        }
        const confirmation=event.target.closest('[data-workplan-confirm]');
        if (confirmation) {
            const row=state.workplanImport?.preview?.rows[Number(confirmation.dataset.workplanConfirm)];
            if (!row) return;
            row.confirmed=confirmation.checked && !workplanCorrectionErrors(row,state.workplanImport.preview.rows).length;
            renderWorkplanCorrectionWorkspace();
        }
    });
    $('confirmAllWorkplanCorrections').onclick=()=>{
        const rows=state.workplanImport?.preview?.rows||[];
        if (!rows.length||rows.some(row=>workplanCorrectionErrors(row,rows).length)) return toast('Correct the remaining issues before confirming all actions.','error');
        rows.forEach(row=>{row.confirmed=true;});
        renderWorkplanCorrectionWorkspace();
    };
    $('admitCorrectedWorkplan').onclick=admitCorrectedWorkplan;
    const closeWorkplanCorrection=()=>{
        $('workplanCorrectionDialog').close();
        state.workplanImport=null;
    };
    $('closeWorkplanCorrection').onclick=closeWorkplanCorrection;
    $('cancelWorkplanCorrection').onclick=closeWorkplanCorrection;
    $('submitPlan').addEventListener('click', () => {
        if (!state.selected?.permissions?.canSubmit) return toast('This work plan is not available for submission.', 'error');
        const workplan = state.selected.workplan;
        $('submitDialogDescription').textContent = `${workplan.file_name} · ${workplan.division} · ${workplan.plan_year}`;
        $('submitProgrammeCount').textContent = workplan.programme_count;
        $('submitActionCount').textContent = workplan.action_count;
        $('submitEscalatedCount').textContent = workplan.high_critical_count;
        $('submitConfirmDialog').showModal();
    });
    $('confirmWorkplanSubmit').addEventListener('click', async () => {
        if (!state.selected?.permissions?.canSubmit) return;
        try {
            $('confirmWorkplanSubmit').disabled = true;
            $('confirmWorkplanSubmit').textContent = 'Submitting…';
            const result = await app.apiRequest(`/workplans/${state.selected.workplan.id}/submit`, { method:'POST' });
            $('submitConfirmDialog').close();
            toast(result.message);
            await loadPlans();
            await loadDetail(state.selected.workplan.id);
        } catch (error) { toast(error.message, 'error'); }
        finally { $('confirmWorkplanSubmit').disabled = false; $('confirmWorkplanSubmit').textContent = 'Confirm and Submit'; }
    });
    $('cancelWorkplanSubmit').onclick = () => $('submitConfirmDialog').close();
    $('openBatchApproval').onclick = () => {
        const permissions=state.selected?.permissions || {};
        const chairmanDecision=Boolean(permissions.canChairmanBatchApprove);
        if (!permissions.canBatchApprove && !chairmanDecision) return;
        const workplan = state.selected.workplan;
        $('championApprovalDescription').textContent = `${workplan.file_name} · ${workplan.division} · ${workplan.plan_year}`;
        if (chairmanDecision) {
            $('batchFocalReviewSummary').textContent = 'The final review contains the system-generated and Risk Champion assessments only.';
        } else {
            const focalReviewed = state.selected.assessments.filter(item => item.focal_at || item.focal_review_history?.length);
            const focalVersions = focalReviewed.reduce((sum,item) => sum + Math.max((item.focal_review_history || []).length,1),0);
            $('batchFocalReviewSummary').textContent = focalReviewed.length
                ? `Focal review record: ${focalReviewed.length} risk${focalReviewed.length === 1 ? '' : 's'}, ${focalVersions} saved version${focalVersions === 1 ? '' : 's'}.`
                : 'No Focal Person assessment changes were recorded for this batch.';
        }
        const count=chairmanDecision ? permissions.chairmanPendingCount : permissions.championEscalationCount;
        $('championBatchCount').textContent = count;
        $('championBatchEscalated').textContent = count;
        $('championBatchComments').value = '';
        $('chairmanBatchRecommendations').value = '';
        $('chairmanRecommendationsLabel').hidden = !chairmanDecision;
        $('batchApprovalEyebrow').textContent = chairmanDecision ? 'Risk Committee Chairman final decision' : 'Risk Champion batch escalation';
        $('batchApprovalTitle').textContent = chairmanDecision ? 'Approve this complete risk batch?' : 'Approve and send all risks?';
        $('batchCommentLabel').childNodes[0].nodeValue = chairmanDecision ? 'Chairman review comments' : 'Champion review comments';
        $('batchApprovalWarning').textContent = chairmanDecision ? 'This is the final decision for every risk in the work-plan batch. The decision and recommendations will be visible to the Champion and Focal Person.' : 'Every work-plan risk will be approved together and sent to the Chairman as one batch.';
        $('confirmChampionBatch').textContent = chairmanDecision ? 'Confirm Final Batch Approval' : 'Approve & Send to Chairman';
        $('championApprovalDialog').showModal();
        $('championBatchComments').focus();
    };
    $('cancelChampionBatch').onclick = () => $('championApprovalDialog').close();
    $('confirmChampionBatch').onclick = async () => {
        const permissions=state.selected?.permissions || {};
        const chairmanDecision=Boolean(permissions.canChairmanBatchApprove);
        if (!permissions.canBatchApprove && !chairmanDecision) return;
        const comments = $('championBatchComments').value.trim();
        if (chairmanDecision && !comments) return toast('Record the Chairman’s reason for the final assessment decision.', 'error');
        try {
            $('confirmChampionBatch').disabled = true;
            $('confirmChampionBatch').textContent = 'Approving batch…';
            const endpoint=chairmanDecision ? 'chairman-approve' : 'champion-approve';
            const result = await app.apiRequest(`/workplans/${state.selected.workplan.id}/${endpoint}`,{method:'POST',body:JSON.stringify({review_comments:comments,recommendations:$('chairmanBatchRecommendations').value.trim()})});
            $('championApprovalDialog').close();
            toast(result.message);
            await loadPlans();
            await loadDetail(state.selected.workplan.id);
        } catch (error) { toast(error.message, 'error'); }
        finally { $('confirmChampionBatch').disabled = false; }
    };
    $('assessmentEditForm').addEventListener('submit', async event => {
        event.preventDefault();
        if (!state.selected) return;
        const assessmentId = $('editAssessmentId').value;
        const challengeDecision = $('challengeDecision').value;
        try {
            $('saveAssessmentEdit').disabled = true;
            $('saveAssessmentEdit').textContent = 'Reassessing…';
            const result = await app.apiRequest(`/workplans/${state.selected.workplan.id}/assessments/${assessmentId}`, {
                method:'PATCH',
                body:JSON.stringify({
                    programme:$('editProgramme').value.trim(),
                    action_point:$('editActionPoint').value.trim(),
                    treatment_recommendation:$('editTreatment').value.trim(),
                    risk_category:$('editRiskCategory').value,
                    likelihood:$('editLikelihood').value,
                    impact:$('editImpact').value,
                    reason:$('editAssessmentReason').value.trim(),
                    challenge_decision:challengeDecision
                })
            });
            $('assessmentDialog').close();
            toast(result.message);
            await loadDetail(state.selected.workplan.id);
        } catch (error) { toast(error.message, 'error'); }
        finally { $('saveAssessmentEdit').disabled = false; $('saveAssessmentEdit').textContent = 'Save Assessment Changes'; }
    });
    $('closeAssessmentDialog').onclick = () => $('assessmentDialog').close();
    $('cancelAssessmentEdit').onclick = () => $('assessmentDialog').close();
    $('editLikelihood').onchange = updateReviewerCalculation;
    $('editImpact').onchange = updateReviewerCalculation;
    $('assessmentRules').onclick = () => $('rulesDialog').showModal();
    $('closeRulesDialog').onclick = () => $('rulesDialog').close();
    $('cancelFocalApproval').onclick = () => { state.pendingFocalApproval = null; $('approveFocalDialog').close(); };
    $('confirmFocalApproval').onclick = confirmFocalProposal;
    $('approveFocalDialog').addEventListener('cancel', () => { state.pendingFocalApproval = null; });
    ['archiveSearch','archiveYear','archiveStatus'].forEach(id => $(id).addEventListener(id === 'archiveSearch' ? 'input' : 'change', renderPlans));
    $('tableLeft').onclick = () => $('assessmentTableWrap').scrollBy({ left:-520, behavior:'smooth' });
    $('tableRight').onclick = () => $('assessmentTableWrap').scrollBy({ left:520, behavior:'smooth' });
    $('refresh').onclick = () => loadPlans();
    $('planYear').value = new Date().getFullYear();
    loadPlans();
})();

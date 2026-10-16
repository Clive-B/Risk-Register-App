(() => {
    const app = window.NCAGRC;
    const user = app.getUser();
    if (!user || user.role !== app.roles.ADMIN || window.NCAGRC_ACCESS_DENIED) return;

    const CATEGORIES = ['Strategic','Financial','Operational','Reputational','Human Capital','Regulatory Compliance','Supervision'];
    const TREATMENTS = ['Terminate','Treat','Transfer','Tolerate'];
    const CONTROL_EFFECTIVENESS = ['Effective','Partially Effective','Ineffective','Not Assessed'];
    const CONTROL_TYPES = ['Preventive','Detective','Corrective','Mixed','Not Assessed'];
    const DESIGN_ADEQUACY = ['Adequate','Partially Adequate','Inadequate','Not Assessed'];
    const LABELS = {
        risk_id:'Unique Risk ID',programme_project:'Program',risk_title:'Risk Name',
        risk_description:'Risk Description',risk_source:'Risk Source',risk_cause:'Risk Cause',
        risk_category:'Risk Category',date_identified:'Date Identified',risk_owner:'Risk Owner',
        likelihood:'Likelihood',impact:'Impact',current_likelihood:'Current Likelihood',
        current_impact:'Current Impact',residual_likelihood:'Post-Mitigation Likelihood',
        residual_impact:'Post-Mitigation Impact',risk_treatment:'Risk Response',
        existing_controls:'Existing Controls',control_type:'Control Type',control_owner:'Control Owner',
        control_design_adequacy:'Control Design Adequacy',control_evidence:'Control Evidence / Reference',
        control_last_tested_date:'Control Last Tested Date',control_exceptions:'Control Exceptions or Gaps',
        control_next_review_date:'Next Control Review Date',control_effectiveness:'Control Effectiveness',
        control_assessment_basis:'Control Assessment Basis',initial_mitigation_plan:'Mitigation Plan / Actions',
        responsible_officer:'Responsible Officer',target_completion_date:'Target Completion Date'
    };
    const LONG_FIELDS = ['risk_description','risk_source','risk_cause','existing_controls','control_evidence','control_exceptions','control_assessment_basis','initial_mitigation_plan'];
    const RATING_FIELDS = ['likelihood','impact','current_likelihood','current_impact','residual_likelihood','residual_impact'];
    const DATE_FIELDS = ['date_identified','target_completion_date','control_last_tested_date','control_next_review_date'];
    const state = {options:null,items:[],history:[],historyError:'',busy:false};
    const el = id => document.getElementById(id);
    const esc = value => String(value ?? '').replace(/[&<>"']/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[character]));
    const selectOptions = (values,current,placeholder='') => `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ''}${values.map(value => `<option value="${esc(value)}"${String(value) === String(current) ? ' selected' : ''}>${esc(value)}</option>`).join('')}`;

    function notify(message,isError=false) {
        const box = document.createElement('div');
        box.className = `toast ${isError ? 'error' : 'success'}`;
        box.textContent = message;
        (el('toastContainer') || document.body).append(box);
        setTimeout(() => box.remove(),5000);
    }

    const fileData = file => new Promise((resolve,reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Unable to read the workbook.'));
        reader.readAsDataURL(file);
    });

    function validDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
    }

    function serverErrorStillApplies(error,row,rows) {
        const value = row.edited || {};
        const message = String(error || '');
        const editedId = String(value.risk_id || '').trim().toLowerCase();
        const proposedId = String(row.initial_proposed?.risk_id || '').trim().toLowerCase();
        const duplicateId = editedId && rows.filter(item => String(item.edited?.risk_id || '').trim().toLowerCase() === editedId).length > 1;
        const has = field => Boolean(String(value[field] ?? '').trim());
        const ratingsValid = RATING_FIELDS.every(field => Number.isInteger(Number(value[field])) && Number(value[field]) >= 1 && Number(value[field]) <= 5);

        if (/already exists/i.test(message)) return !editedId || editedId === proposedId;
        if (/(duplicated within the workbook|unique in this upload)/i.test(message)) return duplicateId;
        if (/risk id is required/i.test(message)) return !has('risk_id');
        if (/risk (?:title|name) is required/i.test(message)) return !has('risk_title');
        if (/risk description is required/i.test(message)) return !has('risk_description');
        if (/(program|programme).+required/i.test(message)) return !has('programme_project');
        if (/risk source is required/i.test(message)) return !has('risk_source');
        if (/risk cause is required/i.test(message)) return !has('risk_cause');
        if (/risk owner is required/i.test(message)) return !has('risk_owner');
        if (/existing controls.+required/i.test(message)) return !has('existing_controls');
        if (/mitigation plan.+required/i.test(message)) return !has('initial_mitigation_plan');
        if (/responsible officer.+required/i.test(message)) return !has('responsible_officer');
        if (/target completion date.+required/i.test(message)) return !has('target_completion_date');
        if (/risk category/i.test(message)) return !CATEGORIES.includes(value.risk_category);
        if (/risk (?:response|treatment)/i.test(message)) return !TREATMENTS.includes(value.risk_treatment);
        if (/control effectiveness/i.test(message)) return !CONTROL_EFFECTIVENESS.includes(value.control_effectiveness);
        if (/control type/i.test(message)) return !CONTROL_TYPES.includes(value.control_type);
        if (/control design adequacy/i.test(message)) return !DESIGN_ADEQUACY.includes(value.control_design_adequacy);
        if (/date identified/i.test(message)) return !validDate(value.date_identified);
        if (/target completion date/i.test(message)) return !validDate(value.target_completion_date);
        if (/control last tested date/i.test(message)) return Boolean(value.control_last_tested_date) && !validDate(value.control_last_tested_date);
        if (/control next review date/i.test(message)) return Boolean(value.control_next_review_date) && !validDate(value.control_next_review_date);
        if (/(likelihood|impact|risk score|residual score)/i.test(message)) return !ratingsValid;
        return true;
    }

    function correctionErrors(row,rows) {
        const value = row.edited || {};
        const errors = [];
        const editedId = String(value.risk_id || '').trim().toLowerCase();
        (row.errors || []).forEach(error => {
            if (serverErrorStillApplies(error,row,rows)) errors.push(error);
        });
        const required = ['risk_id','programme_project','risk_title','risk_description','risk_category','date_identified','risk_owner','risk_treatment','existing_controls','initial_mitigation_plan','responsible_officer','target_completion_date'];
        required.forEach(field => {
            if (!String(value[field] ?? '').trim()) errors.push(`${LABELS[field]} is required.`);
        });
        if (String(value.risk_id || '').length > 30) errors.push('Risk ID cannot exceed 30 characters.');
        if (editedId && rows.filter(item => String(item.edited?.risk_id || '').trim().toLowerCase() === editedId).length > 1) errors.push('Risk ID must be unique in this upload.');
        if (!CATEGORIES.includes(value.risk_category)) errors.push('Select an ERM-approved risk category.');
        if (!TREATMENTS.includes(value.risk_treatment)) errors.push('Select an ERM-approved risk response.');
        if (!CONTROL_EFFECTIVENESS.includes(value.control_effectiveness)) errors.push('Select a governed control-effectiveness value.');
        if (!CONTROL_TYPES.includes(value.control_type)) errors.push('Select a governed control type.');
        if (!DESIGN_ADEQUACY.includes(value.control_design_adequacy)) errors.push('Select a governed control design adequacy.');
        if (!RATING_FIELDS.every(field => Number.isInteger(Number(value[field])) && Number(value[field]) >= 1 && Number(value[field]) <= 5)) {
            errors.push('All Pre-, Current- and Post-Mitigation Likelihood and Impact values must be between 1 and 5.');
        }
        if (!validDate(value.date_identified)) errors.push('Enter a valid Date Identified.');
        if (!validDate(value.target_completion_date)) errors.push('Enter a valid Target Completion Date.');
        if (value.control_last_tested_date && !validDate(value.control_last_tested_date)) errors.push('Enter a valid Control Last Tested Date.');
        if (value.control_next_review_date && !validDate(value.control_next_review_date)) errors.push('Enter a valid Next Control Review Date.');
        return [...new Set(errors)];
    }

    function initialiseRows(preview) {
        preview.rows.forEach(row => {
            if (!row.initial_proposed) {
                row.initial_proposed = {
                    control_type:'Not Assessed',control_owner:'',control_design_adequacy:'Not Assessed',
                    control_evidence:'',control_last_tested_date:'',control_exceptions:'',
                    control_next_review_date:'',control_effectiveness:'Not Assessed',
                    control_assessment_basis:'Control effectiveness has not yet been assessed against verified design and operating evidence.',
                    ...(row.proposed_correction?.values || {})
                };
            }
            if (!row.edited) row.edited = {...row.initial_proposed};
            if (row.confirmed !== true) row.confirmed = false;
            row.client_errors = correctionErrors(row,preview.rows);
            if (row.client_errors.length) row.confirmed = false;
        });
    }

    function addItem() {
        state.items.push({key:crypto.randomUUID(),division:'',focal_user_id:'',file:null,file_data:null,preview:null,busy:false});
        render();
    }

    function availableDivisions(item) {
        const selected = new Set(state.items.filter(candidate => candidate !== item).map(candidate => candidate.division).filter(Boolean));
        return state.options.divisions.filter(division => !selected.has(division));
    }

    function formatDate(value) {
        if (!value) return '—';
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
    }

    function normalizedFileName(value) {
        return String(value || '').trim().toLowerCase();
    }

    function duplicateMatches(division,fileName) {
        const normalized = normalizedFileName(fileName);
        return state.history.filter(batch => batch.division === division && normalizedFileName(batch.file_name) === normalized);
    }

    function renderHistory() {
        const rows = el('uploadHistoryRows');
        const count = el('historyCount');
        if (!rows || !count) return;
        if (state.historyError) {
            count.textContent = 'Unavailable';
            rows.innerHTML = `<tr><td colspan="8" class="empty">${esc(state.historyError)}</td></tr>`;
            return;
        }
        count.textContent = `${state.history.length} successful upload${state.history.length === 1 ? '' : 's'}`;
        rows.innerHTML = state.history.map(batch => `<tr>
            <td><strong>${esc(batch.division)}</strong></td>
            <td>${esc(batch.focal_name || 'Unassigned')}<br><small>${esc(batch.focal_email || '')}</small></td>
            <td>${esc(batch.file_name)}<br><small>${esc(batch.template_type)}</small></td>
            <td>${Number(batch.risk_count || batch.imported_rows || 0)}</td>
            <td>${esc(batch.uploaded_by_name || 'System Administrator')}</td>
            <td>${formatDate(batch.created_at)}</td>
            <td><span class="status ${['Awaiting Focal Review','Returned'].includes(batch.status) ? 'warn' : 'ready'}">${esc(batch.status)}</span></td>
            <td><a class="monitor-link" href="risks.html?import_batch_id=${encodeURIComponent(batch.id)}">View risks</a></td>
        </tr>`).join('') || '<tr><td colspan="8" class="empty">No successful Administrator Template 3 uploads have been recorded yet.</td></tr>';
    }

    function rowReady(row) {
        return row.confirmed === true && row.client_errors?.length === 0;
    }

    function itemReady(item) {
        if (item.preview) initialiseRows(item.preview);
        return Boolean(item.division && item.focal_user_id && item.file_data && item.preview?.rows?.length && item.preview.rows.every(rowReady));
    }

    function updateReadiness() {
        const ready = state.items.filter(itemReady).length;
        const total = state.items.length;
        const risks = state.items.reduce((count,item) => count + (item.preview?.rows?.length || 0),0);
        el('groupReadiness').textContent = total && ready === total ? `${ready} division register${ready === 1 ? ' is' : 's are'} ready.` : `${ready} of ${total} division registers ready.`;
        el('groupDetail').textContent = `${risks} staged risk${risks === 1 ? '' : 's'} · every correction must be valid and confirmed.`;
        el('submitAllBtn').disabled = state.busy || !total || ready !== total;
    }

    function correctionInput(row,itemIndex,rowIndex,field) {
        const value = row.edited?.[field] ?? '';
        const original = row.original?.[field];
        const systemSuggested = (original === null || original === undefined || String(original).trim() === '') && value !== null && String(value).trim() !== '';
        const originalText = original === null || original === undefined || String(original).trim() === '' ? 'Blank in workbook' : `Original: ${esc(original)}`;
        const attributes = `data-edit="${itemIndex}:${rowIndex}:${field}"`;
        let control = '';
        if (field === 'risk_category') control = `<select ${attributes}>${selectOptions(CATEGORIES,value,'Choose an ERM category')}</select>`;
        else if (field === 'risk_treatment') control = `<select ${attributes}>${selectOptions(TREATMENTS,value,'Choose an ERM response')}</select>`;
        else if (field === 'control_effectiveness') control = `<select ${attributes}>${selectOptions(CONTROL_EFFECTIVENESS,value)}</select>`;
        else if (field === 'control_type') control = `<select ${attributes}>${selectOptions(CONTROL_TYPES,value)}</select>`;
        else if (field === 'control_design_adequacy') control = `<select ${attributes}>${selectOptions(DESIGN_ADEQUACY,value)}</select>`;
        else if (RATING_FIELDS.includes(field)) control = `<select ${attributes}>${selectOptions([1,2,3,4,5],value)}</select>`;
        else if (LONG_FIELDS.includes(field)) control = `<textarea rows="${field === 'risk_description' ? 4 : 3}" ${attributes}>${esc(value)}</textarea>`;
        else control = `<input type="${DATE_FIELDS.includes(field) ? 'date' : 'text'}" value="${esc(value)}" ${attributes}>`;
        return `<label class="correction-field ${LONG_FIELDS.includes(field) ? 'wide' : ''}"><span>${esc(LABELS[field])}${systemSuggested ? '<em class="system-suggested">System suggested</em>' : ''}</span>${control}<small title="${esc(originalText)}">${originalText}</small></label>`;
    }

    function renderPreview(item,itemIndex) {
        if (item.busy) return '<p class="preview-meta">Validating workbook and preparing governed corrections…</p>';
        if (!item.preview) return `<p class="preview-meta">${item.file ? esc(item.file.name) : 'Choose an approved workbook to open its correction workspace.'}</p>`;
        initialiseRows(item.preview);
        const rows = item.preview.rows;
        const validRows = rows.filter(row => row.client_errors.length === 0);
        const confirmedRows = validRows.filter(row => row.confirmed);
        const remaining = validRows.length - confirmedRows.length;
        const education = item.preview.education || {};
        const duplicates = duplicateMatches(item.division,item.file?.name);
        const duplicateWarning = duplicates.length ? `<div class="duplicate-warning"><strong>Possible repeat upload</strong>${esc(item.file.name)} was previously uploaded for ${esc(item.division)} ${duplicates.length} time${duplicates.length === 1 ? '' : 's'}. Most recent: ${formatDate(duplicates[0].created_at)} (${esc(duplicates[0].status)}). You may continue if this is an authorized correction or replacement.</div>` : '';
        return `${duplicateWarning}<div class="correction-preview">
            <div class="correction-summary"><p class="preview-meta"><strong>${esc(item.preview.template_type)}</strong> · ${rows.length} risks · Sheet ${esc(item.preview.sheet_name)}</p><div><span>Total <strong>${rows.length}</strong></span><span class="valid">Valid <strong>${validRows.length}</strong></span><span class="invalid">Failed <strong>${rows.length - validRows.length}</strong></span></div></div>
            <section class="correction-education"><div><span>Guided correction workspace</span><h4>${esc(education.title || 'How guided correction works')}</h4><ol>${(education.steps || []).map(step => `<li>${esc(step)}</li>`).join('')}</ol></div><button type="button" data-confirm-all="${itemIndex}"${validRows.length === 0 || remaining === 0 ? ' disabled' : ''}>${remaining > 0 ? `Confirm ${remaining} Valid Correction${remaining === 1 ? '' : 's'}` : validRows.length < rows.length ? `Resolve ${rows.length - validRows.length} Issue${rows.length - validRows.length === 1 ? '' : 's'}` : 'All Corrections Confirmed'}</button></section>
            <div class="correction-workspace">${rows.map((row,rowIndex) => {
                const valid = row.client_errors.length === 0;
                const corrections = row.proposed_correction?.corrections || [];
                const pre = Number(row.edited.likelihood) * Number(row.edited.impact);
                const current = Number(row.edited.current_likelihood) * Number(row.edited.current_impact);
                const post = Number(row.edited.residual_likelihood) * Number(row.edited.residual_impact);
                return `<article class="correction-card ${valid ? 'ready' : 'needs-attention'}" data-row-index="${rowIndex}"><header><div><span class="correction-row-label">Excel row ${row.excel_row}${row.proposed_correction?.parent_risk_id ? ` · Parent ${esc(row.proposed_correction.parent_risk_id)}` : ''}</span><h4>${esc(row.edited.risk_id)} · ${esc(row.edited.risk_title)}</h4></div><span class="preview-status ${valid ? 'valid' : 'invalid'}">${valid ? (row.confirmed ? 'Confirmed' : 'Ready to confirm') : `${row.client_errors.length} issue${row.client_errors.length === 1 ? '' : 's'}`}</span></header>
                    <details${!valid || rowIndex === 0 ? ' open' : ''}><summary>Review the proposed correction and explanation <strong>Pre ${pre || '—'} · Current ${current || '—'} · Post ${post || '—'}</strong></summary><div class="correction-reasons"><h5>Why the system changed this row</h5>${corrections.length ? `<ul>${corrections.map(correction => `<li><strong>${esc(LABELS[correction.field] || correction.field)}:</strong> ${esc(correction.explanation || correction.reason)} <em class="confidence confidence-${String(correction.confidence_level || 'high').toLowerCase()}">${esc(correction.confidence_level || 'High')} confidence</em><small>Detection: ${esc(correction.detection_rule || correction.reason)} · Validation: ${esc(correction.validation_rule || correction.rule)} · Audit: ${esc(correction.audit_record || 'Original, proposed and confirmed values are retained.')}</small></li>`).join('')}</ul>` : '<p>No automatic value changes were required. Review the complete record before confirming it.</p>'}</div>
                    ${row.client_errors.length ? `<div class="correction-errors">${row.client_errors.map(error => `<span>${esc(error)}</span>`).join('')}</div>` : ''}<div class="correction-grid">${Object.keys(LABELS).map(field => correctionInput(row,itemIndex,rowIndex,field)).join('')}</div><label class="correction-confirm"><input type="checkbox" data-confirm="${itemIndex}:${rowIndex}"${row.confirmed ? ' checked' : ''}${valid ? '' : ' disabled'}><span>I have reviewed this proposed risk and confirm it is ready to send to the assigned Focal Person.</span></label></details></article>`;
            }).join('')}</div>
        </div>`;
    }

    function captureViewState() {
        const active = document.activeElement;
        return {
            pageX:window.scrollX,pageY:window.scrollY,
            focusEdit:active?.dataset?.edit || '',focusConfirm:active?.dataset?.confirm || '',
            selectionStart:typeof active?.selectionStart === 'number' ? active.selectionStart : null,
            selectionEnd:typeof active?.selectionEnd === 'number' ? active.selectionEnd : null,
            uploads:state.items.map((item,index) => {
                const upload = el('uploadRows').querySelector(`[data-upload-index="${index}"]`);
                const workspace = upload?.querySelector('.correction-workspace');
                return {key:item.key,scrollTop:workspace?.scrollTop || 0,openRows:[...(workspace?.querySelectorAll('.correction-card details[open]') || [])].map(details => details.closest('.correction-card')?.dataset.rowIndex)};
            })
        };
    }

    function restoreViewState(view) {
        if (!view) return;
        const restore = () => {
            view.uploads.forEach(saved => {
                const index = state.items.findIndex(item => item.key === saved.key);
                const upload = index < 0 ? null : el('uploadRows').querySelector(`[data-upload-index="${index}"]`);
                const workspace = upload?.querySelector('.correction-workspace');
                if (!workspace) return;
                workspace.querySelectorAll('.correction-card details').forEach(details => {
                    details.open = saved.openRows.includes(details.closest('.correction-card')?.dataset.rowIndex);
                });
                workspace.scrollTop = saved.scrollTop;
            });
            const controls = [...el('uploadRows').querySelectorAll('[data-edit],[data-confirm]')];
            const focusTarget = controls.find(control => (view.focusEdit && control.dataset.edit === view.focusEdit) || (view.focusConfirm && control.dataset.confirm === view.focusConfirm));
            if (focusTarget) {
                focusTarget.focus({preventScroll:true});
                if (view.selectionStart !== null && typeof focusTarget.setSelectionRange === 'function') focusTarget.setSelectionRange(view.selectionStart,view.selectionEnd);
            }
            window.scrollTo(view.pageX,view.pageY);
        };
        restore();
        window.requestAnimationFrame(restore);
    }

    function render({preserveView=false}={}) {
        const view = preserveView ? captureViewState() : null;
        el('uploadRows').innerHTML = state.items.map((item,index) => {
            const focals = state.options.focals.filter(focal => focal.division === item.division);
            const focalOptions = `<option value="">Select Focal</option>${focals.map(focal => `<option value="${focal.id}"${String(focal.id) === String(item.focal_user_id) ? ' selected' : ''}>${esc(focal.full_name || focal.email)} · ${esc(focal.email)}</option>`).join('')}`;
            return `<article class="upload-row" data-upload-index="${index}"><div class="upload-row-head"><label class="field">Division<select data-division="${index}">${selectOptions(availableDivisions(item),item.division,'Select division')}</select></label><label class="field">Assigned Focal Person<select data-focal="${index}"${item.division ? '' : ' disabled'}>${focalOptions}</select></label><label class="field">Approved workbook<input data-file="${index}" type="file" accept=".xlsx,.xls"></label><button class="secondary" data-remove="${index}" type="button">Remove</button></div>${renderPreview(item,index)}</article>`;
        }).join('') || '<div class="empty">No division workbook added.</div>';
        updateReadiness();
        renderHistory();
        restoreViewState(view);
    }

    async function preview(index,file) {
        if (!file) return;
        const item = state.items[index];
        if (!item.division || !item.focal_user_id) { notify('Select the division and assigned Focal Person before uploading.',true); return; }
        if (!/\.(xlsx|xls)$/i.test(file.name) || !file.size || file.size > 8 * 1024 * 1024) { notify('Choose a non-empty .xlsx or .xls workbook smaller than 8 MB.',true); return; }
        item.file = file;
        const duplicates = duplicateMatches(item.division,file.name);
        if (duplicates.length) notify(`Possible repeat upload: ${file.name} was already uploaded for ${item.division}. Review the upload history before continuing.`,true);
        item.busy = true;
        render();
        try {
            item.file_data = await fileData(file);
            const data = await app.apiRequest('/risks/import/preview',{method:'POST',body:JSON.stringify({division:item.division,focal_user_id:Number(item.focal_user_id),file_name:file.name,file_data:item.file_data})});
            if (data.preview?.template_type !== 'Division Risk Register Tracker') throw new Error('This page accepts only the approved Template 3 Division Risk Register Tracker.');
            item.preview = data.preview;
            initialiseRows(item.preview);
        } catch (error) {
            item.file = null;
            item.file_data = null;
            item.preview = null;
            notify(error.message || 'Workbook validation failed.',true);
        } finally {
            item.busy = false;
            render({preserveView:true});
        }
    }

    function updateEditedField(target,{renderAfter=false}={}) {
        if (!target.dataset.edit) return false;
        const [itemIndex,rowIndex,field] = target.dataset.edit.split(':');
        const row = state.items[Number(itemIndex)]?.preview?.rows?.[Number(rowIndex)];
        if (!row) return false;
        row.edited[field] = RATING_FIELDS.includes(field) ? Number(target.value) : target.value;
        row.confirmed = false;
        if (renderAfter) render({preserveView:true});
        return true;
    }

    el('addDivisionBtn').addEventListener('click',addItem);
    el('uploadRows').addEventListener('input',event => updateEditedField(event.target));
    el('uploadRows').addEventListener('change',event => {
        if (event.target.dataset.division !== undefined) {
            const index = Number(event.target.dataset.division);
            Object.assign(state.items[index],{division:event.target.value,focal_user_id:'',file:null,file_data:null,preview:null});
            render({preserveView:true});
            return;
        }
        if (event.target.dataset.focal !== undefined) { state.items[Number(event.target.dataset.focal)].focal_user_id = event.target.value; updateReadiness(); return; }
        if (event.target.dataset.file !== undefined) { preview(Number(event.target.dataset.file),event.target.files?.[0]); return; }
        if (updateEditedField(event.target,{renderAfter:true})) return;
        if (event.target.dataset.confirm) {
            const [itemIndex,rowIndex] = event.target.dataset.confirm.split(':');
            const item = state.items[Number(itemIndex)];
            const row = item?.preview?.rows?.[Number(rowIndex)];
            if (!row) return;
            row.client_errors = correctionErrors(row,item.preview.rows);
            row.confirmed = event.target.checked && row.client_errors.length === 0;
            render({preserveView:true});
        }
    });
    el('uploadRows').addEventListener('click',event => {
        if (event.target.dataset.remove !== undefined) { state.items.splice(Number(event.target.dataset.remove),1); render(); return; }
        if (event.target.dataset.confirmAll !== undefined) {
            const item = state.items[Number(event.target.dataset.confirmAll)];
            initialiseRows(item.preview);
            const validRows = item.preview.rows.filter(row => row.client_errors.length === 0);
            validRows.forEach(row => { row.confirmed = true; });
            render({preserveView:true});
            const invalidCount = item.preview.rows.length - validRows.length;
            notify(invalidCount ? `${validRows.length} valid corrections confirmed. Resolve ${invalidCount} remaining issue${invalidCount === 1 ? '' : 's'}.` : `${validRows.length} corrections confirmed.`,invalidCount > 0);
        }
    });
    el('submitAllBtn').addEventListener('click',async () => {
        if (state.busy || !state.items.length || !state.items.every(itemReady)) return;
        state.busy = true;
        updateReadiness();
        try {
            const payload = {items:state.items.map(item => ({division:item.division,focal_user_id:Number(item.focal_user_id),file_name:item.file.name,file_data:item.file_data,corrected_rows:item.preview.rows.map(row => ({excel_row:row.excel_row,confirmed:row.confirmed,values:row.edited}))}))};
            const data = await app.apiRequest('/risks/admin-import-groups',{method:'POST',body:JSON.stringify(payload)});
            notify(data.message);
            state.items = [];
            render();
            setTimeout(() => { window.location.href = 'admin-focal-submissions.html'; },800);
        } catch (error) {
            notify(error.message || 'Unable to stage the division registers.',true);
        } finally {
            state.busy = false;
            updateReadiness();
        }
    });

    Promise.allSettled([
        app.apiRequest('/risks/admin-import-options'),
        app.apiRequest('/risks/admin-focal-submissions')
    ]).then(([optionsResult,historyResult]) => {
        if (historyResult.status === 'fulfilled') {
            state.history = (historyResult.value.batches || []).filter(batch => batch.upload_group_id && batch.template_type === 'Division Risk Register Tracker');
        } else {
            state.historyError = historyResult.reason?.message || 'Unable to load successful upload history.';
        }
        renderHistory();
        if (optionsResult.status === 'fulfilled') {
            state.options = optionsResult.value;
            addItem();
        } else {
            el('uploadRows').innerHTML = `<div class="empty">${esc(optionsResult.reason?.message || 'Unable to load upload options.')}</div>`;
        }
    });
})();

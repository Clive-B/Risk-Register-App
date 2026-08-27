(() => {
    const app = window.NCAGRC;
    const user = app.getUser();
    if (!user || user.role !== app.roles.FOCAL || window.NCAGRC_ACCESS_DENIED) return;

    const CATEGORIES = ["Strategic","Financial","Operational","Reputational","Human Capital","Regulatory Compliance","Supervision"];
    const TREATMENTS = ["Terminate","Treat","Transfer","Tolerate"];
    const CONTROL_EFFECTIVENESS = ["Effective","Partially Effective","Ineffective","Not Assessed"];
    const CONTROL_TYPES = ["Preventive","Detective","Corrective","Mixed","Not Assessed"];
    const DESIGN_ADEQUACY = ["Adequate","Partially Adequate","Inadequate","Not Assessed"];
    const LABELS = {
        risk_id:"Unique Risk ID",programme_project:"Program",risk_title:"Risk Name",
        risk_description:"Risk Description",risk_source:"Risk Source",risk_cause:"Risk Cause",
        risk_category:"Risk Category",date_identified:"Date Identified",risk_owner:"Risk Owner",
        likelihood:"Likelihood",impact:"Impact",current_likelihood:"Current Likelihood",
        current_impact:"Current Impact",residual_likelihood:"Post-Mitigation Likelihood",
        residual_impact:"Post-Mitigation Impact",risk_treatment:"Risk Response",
        existing_controls:"Existing Controls",control_type:"Control Type",control_owner:"Control Owner",
        control_design_adequacy:"Control Design Adequacy",control_evidence:"Control Evidence / Reference",
        control_last_tested_date:"Control Last Tested Date",control_exceptions:"Control Exceptions or Gaps",
        control_next_review_date:"Next Control Review Date",control_effectiveness:"Control Effectiveness",
        control_assessment_basis:"Control Assessment Basis",initial_mitigation_plan:"Mitigation Plan / Actions",
        responsible_officer:"Responsible Officer",target_completion_date:"Target Completion Date"
    };
    const LONG_FIELDS = ["risk_description","risk_source","risk_cause","existing_controls","control_evidence","control_exceptions","control_assessment_basis","initial_mitigation_plan"];
    const RATING_FIELDS = ["likelihood","impact","current_likelihood","current_impact","residual_likelihood","residual_impact"];
    const DATE_FIELDS = ["date_identified","target_completion_date","control_last_tested_date","control_next_review_date"];
    const state = {file:null,fileData:null,preview:null,processing:false,engine:""};
    const byId = id => document.getElementById(id);
    const elements = {
        input:byId("riskWorkbookInput"),choose:byId("chooseWorkbookBtn"),reset:byId("resetImportBtn"),
        fileName:byId("importFileName"),fileHelp:byId("importFileHelp"),engineLabel:byId("selectedEngineLabel"),
        progress:byId("importProgress"),progressLabel:byId("importProgressLabel"),
        progressValue:byId("importProgressValue"),progressBar:byId("importProgressBar"),
        preview:byId("importPreview"),sheetMeta:byId("importSheetMeta"),total:byId("previewTotal"),
        valid:byId("previewValid"),failed:byId("previewFailed"),education:byId("correctionEducation"),
        educationTitle:byId("correctionEducationTitle"),educationSteps:byId("correctionEducationSteps"),
        confirmAll:byId("confirmAllCorrections"),workspace:byId("correctionWorkspace"),
        tableWrap:byId("previewTableWrap"),head:byId("importPreviewHead"),body:byId("importPreviewBody"),
        validation:byId("importValidationErrors"),errorList:byId("importErrorList"),
        result:byId("importResult"),admit:byId("confirmImportBtn"),admissionWorkspace:byId("admissionWorkspace")
    };

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
        }[character]));
    }

    function showToast(message,type="success") {
        const toast = document.createElement("div");
        toast.className = `toast ${type}`;
        toast.textContent = message;
        byId("toastContainer").appendChild(toast);
        window.setTimeout(() => toast.remove(),5000);
    }

    function setProgress(visible,label="Reading workbook...",percent=0) {
        elements.progress.hidden = !visible;
        elements.progressLabel.textContent = label;
        elements.progressValue.textContent = `${percent}%`;
        elements.progressBar.style.width = `${percent}%`;
    }

    function resetWorkspace({preserveEngine=false}={}) {
        state.file = null;
        state.fileData = null;
        state.preview = null;
        state.processing = false;
        if (!preserveEngine) state.engine = "";
        elements.input.value = "";
        elements.fileName.textContent = "No workbook selected";
        elements.fileHelp.textContent = "Accepted formats: .xlsx and .xls. Maximum file size: 8 MB.";
        elements.engineLabel.textContent = state.engine === "legal"
            ? "Template 2 correction engine selected"
            : state.engine === "division"
                ? "Template 3 correction engine selected"
            : state.engine === "standard"
                ? "Template 1 correction engine selected"
                : "Choose a template above to begin";
        document.querySelectorAll("[data-template-card]").forEach(card => card.classList.toggle("is-selected",card.dataset.templateCard === state.engine));
        setProgress(false);
        elements.preview.hidden = true;
        elements.education.hidden = true;
        elements.workspace.hidden = true;
        elements.tableWrap.hidden = false;
        elements.validation.hidden = true;
        elements.result.hidden = true;
        elements.result.innerHTML = "";
        elements.admit.disabled = true;
        elements.admit.textContent = "Confirm Corrections and Admit Risks";
    }

    function readWorkbook(file) {
        return new Promise((resolve,reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("The selected workbook could not be read."));
            reader.readAsDataURL(file);
        });
    }

    function fileError(file) {
        if (!file || !/\.(xlsx|xls)$/i.test(file.name)) return "Only .xlsx and .xls files are allowed.";
        if (file.size > 8 * 1024 * 1024) return "The workbook must be smaller than 8 MB.";
        if (!file.size) return "The selected workbook is empty.";
        return "";
    }

    function validDate(value) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === value;
    }

    function correctionErrors(row,rows) {
        const value = row.edited || {};
        const errors = [];
        const proposedId = String(row.initial_proposed?.risk_id || "").trim().toLowerCase();
        const editedId = String(value.risk_id || "").trim().toLowerCase();
        (row.errors || []).forEach(error => {
            if (/already exists/i.test(error) && editedId && editedId !== proposedId) return;
            if (/(select an ERM-approved risk response|select a valid risk response)/i.test(error)
                && TREATMENTS.includes(value.risk_treatment)) return;
            errors.push(error);
        });
        const required = ["risk_id","risk_title","risk_description","risk_category","date_identified","risk_owner","risk_treatment","existing_controls","initial_mitigation_plan","responsible_officer","target_completion_date"];
        if (row.require_program) required.push("programme_project");
        if (row.require_legal_context) required.push("risk_source","risk_cause");
        required.forEach(field => {
            if (!String(value[field] ?? "").trim()) errors.push(`${LABELS[field]} is required.`);
        });
        if (String(value.risk_id || "").length > 30) errors.push("Risk ID cannot exceed 30 characters.");
        if (rows.filter(item => String(item.edited?.risk_id || "").trim().toLowerCase() === editedId).length > 1) errors.push("Risk ID must be unique in this upload.");
        if (!CATEGORIES.includes(value.risk_category)) errors.push("Select an ERM-approved risk category.");
        if (!TREATMENTS.includes(value.risk_treatment)) errors.push("Select an ERM-approved risk response.");
        if (!CONTROL_EFFECTIVENESS.includes(value.control_effectiveness)) errors.push("Select a governed control-effectiveness value.");
        if (!CONTROL_TYPES.includes(value.control_type)) errors.push("Select a governed control type.");
        if (!DESIGN_ADEQUACY.includes(value.control_design_adequacy)) errors.push("Select a governed control design adequacy.");
        if (!RATING_FIELDS.every(field => Number.isInteger(Number(value[field])) && Number(value[field]) >= 1 && Number(value[field]) <= 5)) {
            errors.push("All Pre-, Current- and Post-Mitigation Likelihood and Impact values must be between 1 and 5.");
        }
        if (!validDate(value.date_identified)) errors.push("Enter a valid Date Identified.");
        if (!validDate(value.target_completion_date)) errors.push("Enter a valid Target Completion Date.");
        if (value.control_last_tested_date && !validDate(value.control_last_tested_date)) errors.push("Enter a valid Control Last Tested Date.");
        if (value.control_next_review_date && !validDate(value.control_next_review_date)) errors.push("Enter a valid Next Control Review Date.");
        return [...new Set(errors)];
    }

    function options(values,value,placeholder="") {
        return `${placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : ""}${values.map(option =>
            `<option value="${escapeHtml(option)}"${String(option) === String(value) ? " selected" : ""}>${escapeHtml(option)}</option>`
        ).join("")}`;
    }

    function correctionInput(row,index,field) {
        const value = row.edited?.[field] ?? "";
        const original = row.original?.[field];
        const originalText = original === null || original === undefined || String(original).trim() === "" ? "Blank in workbook" : `Original: ${escapeHtml(original)}`;
        const attributes = `data-correction-row="${index}" data-correction-field="${field}"`;
        let control = "";
        if (field === "risk_category") control = `<select ${attributes}>${options(CATEGORIES,value,"Choose an ERM category")}</select>`;
        else if (field === "risk_treatment") control = `<select ${attributes}>${options(TREATMENTS,value,"Choose an ERM response")}</select>`;
        else if (field === "control_effectiveness") control = `<select ${attributes}>${options(CONTROL_EFFECTIVENESS,value)}</select>`;
        else if (field === "control_type") control = `<select ${attributes}>${options(CONTROL_TYPES,value)}</select>`;
        else if (field === "control_design_adequacy") control = `<select ${attributes}>${options(DESIGN_ADEQUACY,value)}</select>`;
        else if (RATING_FIELDS.includes(field)) control = `<select ${attributes}>${options([1,2,3,4,5],value)}</select>`;
        else if (LONG_FIELDS.includes(field)) control = `<textarea rows="${field === "risk_description" ? 4 : 3}" ${attributes}>${escapeHtml(value)}</textarea>`;
        else control = `<input type="${DATE_FIELDS.includes(field) ? "date" : "text"}" value="${escapeHtml(value)}" ${attributes}>`;
        return `<label class="correction-field ${LONG_FIELDS.includes(field) ? "wide" : ""}"><span>${escapeHtml(LABELS[field])}</span>${control}<small>${originalText}</small></label>`;
    }

    function initialiseRows(preview) {
        preview.rows.forEach(row => {
            row.require_program = ["Risk Register Tracking Template","Legal Legacy Risk Register","Division Risk Register Tracker"].includes(preview.template_type);
            row.require_legal_context = preview.template_type === "Legal Legacy Risk Register";
            if (!row.initial_proposed) {
                row.initial_proposed = {
                    control_type:"Not Assessed",control_owner:"",control_design_adequacy:"Not Assessed",
                    control_evidence:"",control_last_tested_date:"",control_exceptions:"",
                    control_next_review_date:"",control_effectiveness:"Not Assessed",
                    control_assessment_basis:"Control effectiveness has not yet been assessed against verified design and operating evidence.",
                    ...(row.proposed_correction?.values || {})
                };
            }
            if (!row.edited) row.edited = {...row.initial_proposed};
            if (row.confirmed !== true) row.confirmed = false;
            row.client_errors = correctionErrors(row,preview.rows);
            if (row.client_errors.length) row.confirmed = false;
        });
    }

    function renderCorrectionWorkspace(preview) {
        initialiseRows(preview);
        const rows = preview.rows;
        const validRows = rows.filter(row => row.client_errors.length === 0);
        const confirmedRows = validRows.filter(row => row.confirmed);
        elements.total.textContent = rows.length;
        elements.valid.textContent = validRows.length;
        elements.failed.textContent = rows.length - validRows.length;
        elements.education.hidden = false;
        elements.workspace.hidden = false;
        elements.tableWrap.hidden = true;
        elements.validation.hidden = true;
        elements.educationTitle.textContent = preview.education?.title || "How guided correction works";
        elements.educationSteps.innerHTML = (preview.education?.steps || []).map(step => `<li>${escapeHtml(step)}</li>`).join("");
        const unconfirmedValidCount = validRows.length - confirmedRows.length;
        elements.confirmAll.disabled = validRows.length === 0 || unconfirmedValidCount === 0;
        if (unconfirmedValidCount > 0) {
            elements.confirmAll.textContent = `Confirm ${unconfirmedValidCount} Valid Correction${unconfirmedValidCount === 1 ? "" : "s"}`;
        } else if (validRows.length < rows.length) {
            elements.confirmAll.textContent = `${validRows.length} Valid Corrections Confirmed · Resolve ${rows.length - validRows.length} Issue${rows.length - validRows.length === 1 ? "" : "s"}`;
        } else {
            elements.confirmAll.textContent = "All Corrections Confirmed";
        }
        elements.workspace.innerHTML = rows.map((row,index) => {
            const valid = row.client_errors.length === 0;
            const corrections = row.proposed_correction?.corrections || [];
            const pre = Number(row.edited.likelihood) * Number(row.edited.impact);
            const current = Number(row.edited.current_likelihood) * Number(row.edited.current_impact);
            const post = Number(row.edited.residual_likelihood) * Number(row.edited.residual_impact);
            return `<article class="correction-card ${valid ? "ready" : "needs-attention"}">
                <header><div><span class="correction-row-label">Excel row ${row.excel_row}${row.proposed_correction?.parent_risk_id ? ` · Parent ${escapeHtml(row.proposed_correction.parent_risk_id)}` : ""}</span><h4>${escapeHtml(row.edited.risk_id)} · ${escapeHtml(row.edited.risk_title)}</h4></div>
                <span class="preview-status ${valid ? "valid" : "invalid"}">${valid ? (row.confirmed ? "Confirmed" : "Ready to confirm") : `${row.client_errors.length} issue${row.client_errors.length === 1 ? "" : "s"}`}</span></header>
                <details${!valid || index === 0 ? " open" : ""}><summary>Review the proposed correction and explanation <strong>Pre ${pre || "—"} · Current ${current || "—"} · Post ${post || "—"}</strong></summary>
                <div class="correction-reasons"><h5>Why the system changed this row</h5><ul>${corrections.map(item =>
                    `<li><strong>${escapeHtml(LABELS[item.field] || item.field)}:</strong> ${escapeHtml(item.explanation || item.reason)} <em class="confidence confidence-${String(item.confidence_level || "high").toLowerCase()}">${escapeHtml(item.confidence_level || "High")} confidence</em><small>Detection: ${escapeHtml(item.detection_rule || item.reason)} · Validation: ${escapeHtml(item.validation_rule || item.rule)} · Audit: ${escapeHtml(item.audit_record || "Original, proposed and confirmed values are retained.")}</small></li>`
                ).join("")}</ul></div>
                ${row.client_errors.length ? `<div class="correction-errors">${row.client_errors.map(error => `<span>${escapeHtml(error)}</span>`).join("")}</div>` : ""}
                <div class="correction-grid">${Object.keys(LABELS).map(field => correctionInput(row,index,field)).join("")}</div>
                <label class="correction-confirm"><input type="checkbox" data-correction-confirm="${index}"${row.confirmed ? " checked" : ""}${valid ? "" : " disabled"}><span>I have reviewed this proposed risk and confirm it is ready for upload.</span></label>
                </details></article>`;
        }).join("");
        const allReady = rows.length > 0 && validRows.length === rows.length && confirmedRows.length === rows.length;
        elements.admit.disabled = !allReady;
        if (allReady) {
            elements.admit.textContent = `Confirm Corrections and Admit ${rows.length} Risks`;
        } else if (validRows.length < rows.length) {
            const issueCount = rows.length - validRows.length;
            elements.admit.textContent = `Resolve ${issueCount} Failed Correction${issueCount === 1 ? "" : "s"} Before Admission`;
        } else {
            const remaining = rows.length - confirmedRows.length;
            elements.admit.textContent = `Confirm ${remaining} Remaining Correction${remaining === 1 ? "" : "s"}`;
        }
    }

    function renderPreview(preview) {
        const summary = preview.summary;
        const ignored = preview.ignored_headers?.length ? ` · Excluded: ${preview.ignored_headers.join(", ")}` : "";
        elements.sheetMeta.textContent = `${preview.file_name} · ${preview.template_type || "Risk Register"} · Sheet: ${preview.sheet_name} · Header row: ${preview.header_row}${ignored}`;
        elements.total.textContent = summary.total_rows;
        elements.valid.textContent = summary.valid_rows;
        elements.failed.textContent = summary.failed_rows;
        if (preview.correction_mode === "guided") renderCorrectionWorkspace(preview);
        else {
            elements.education.hidden = true;
            elements.workspace.hidden = true;
            elements.tableWrap.hidden = false;
            elements.head.innerHTML = `<tr><th>Excel Row</th><th>Validation</th>${preview.headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr>`;
            elements.body.innerHTML = preview.rows.map(row => `<tr class="${row.valid ? "preview-valid-row" : "preview-invalid-row"}"><td>${row.excel_row}</td><td><span class="preview-status ${row.valid ? "valid" : "invalid"}">${row.valid ? "Valid" : `${row.errors.length} errors`}</span></td>${preview.headers.map(header => `<td>${escapeHtml(row.values[header])}</td>`).join("")}</tr>`).join("");
            elements.errorList.innerHTML = summary.validation_errors.map(error => `<li><strong>Excel row ${error.excel_row}:</strong> ${escapeHtml(error.message)}</li>`).join("");
            elements.validation.hidden = summary.validation_errors.length === 0;
            elements.admit.disabled = summary.valid_rows === 0;
            elements.admit.textContent = `Admit ${summary.valid_rows} Valid Risk${summary.valid_rows === 1 ? "" : "s"}`;
        }
        elements.preview.hidden = false;
    }

    async function previewWorkbook(file) {
        const validationError = fileError(file);
        if (validationError) {
            showToast(validationError,"error");
            elements.input.value = "";
            return;
        }
        state.processing = true;
        elements.fileName.textContent = file.name;
        elements.fileHelp.textContent = `${Math.ceil(file.size / 1024)} KB · Validating structure, values and populated rows`;
        elements.preview.hidden = true;
        elements.result.hidden = true;
        elements.admit.disabled = true;
        setProgress(true,"Reading workbook...",20);
        try {
            state.file = file;
            state.fileData = await readWorkbook(file);
            setProgress(true,"Applying the governed correction rules...",65);
            const data = await app.apiRequest("/risks/import/preview",{method:"POST",body:JSON.stringify({file_name:file.name,file_data:state.fileData})});
            state.preview = data.preview;
            const detectedEngine = data.preview.template_type === "Legal Legacy Risk Register" ? "Template 2"
                : data.preview.template_type === "Division Risk Register Tracker" ? "Template 3" : "Template 1";
            elements.engineLabel.textContent = `${detectedEngine} correction engine · Detected ${data.preview.template_type || "risk register"}`;
            setProgress(true,"Correction workspace ready",100);
            renderPreview(data.preview);
            window.setTimeout(() => setProgress(false),350);
        } catch (error) {
            state.file = null;
            state.fileData = null;
            setProgress(false);
            elements.fileHelp.textContent = error.message || "The workbook could not be validated.";
            showToast(elements.fileHelp.textContent,"error");
        } finally {
            state.processing = false;
        }
    }

    async function admitWorkbook() {
        if (!state.file || !state.fileData || !state.preview || state.processing) return;
        state.processing = true;
        elements.admit.disabled = true;
        elements.choose.disabled = true;
        setProgress(true,"Admitting confirmed risks...",35);
        try {
            const response = await app.authorizedFetch("/risks/import",{
                method:"POST",
                body:JSON.stringify({
                    file_name:state.file.name,
                    file_data:state.fileData,
                    corrected_rows:state.preview.correction_mode === "guided"
                        ? state.preview.rows.map(row => ({excel_row:row.excel_row,confirmed:row.confirmed === true,values:row.edited}))
                        : undefined
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!payload.summary) throw new Error(payload.message || "Unable to admit the workbook.");
            const summary = payload.summary;
            setProgress(true,"Admission complete",100);
            elements.preview.hidden = true;
            elements.result.innerHTML = `<h3>Risk admission complete</h3><div class="result-summary"><span>Total rows <strong>${summary.total_rows}</strong></span><span>Admitted risks <strong>${summary.imported_rows}</strong></span><span>Failed rows <strong>${summary.failed_rows}</strong></span></div>
                ${summary.validation_errors?.length ? `<ul>${summary.validation_errors.map(error => `<li><strong>Excel row ${error.excel_row}:</strong> ${escapeHtml(error.message)}</li>`).join("")}</ul>` : ""}
                ${summary.imported_rows ? `<a class="consolidated-link" href="risks.html?import_batch_id=${encodeURIComponent(summary.import_batch_id || "")}">View admitted risks in the Consolidated Risk Register</a>` : ""}`;
            elements.result.hidden = false;
            elements.admit.textContent = "Admission Complete";
            showToast(payload.message || `${summary.imported_rows} risks admitted.`,summary.imported_rows ? "success" : "error");
        } catch (error) {
            setProgress(false);
            elements.admit.disabled = false;
            showToast(error.message || "Unable to admit the workbook.","error");
        } finally {
            state.processing = false;
            elements.choose.disabled = false;
        }
    }

    document.querySelectorAll("[data-upload-engine]").forEach(button => button.addEventListener("click",() => {
        resetWorkspace();
        state.engine = button.dataset.uploadEngine;
        resetWorkspace({preserveEngine:true});
        elements.input.click();
    }));
    elements.choose.addEventListener("click",() => {
        if (!state.engine) {
            showToast("Select Template 1, Template 2 or Template 3 above before choosing a workbook.","error");
            return;
        }
        elements.input.click();
    });
    elements.reset.addEventListener("click",() => resetWorkspace());
    elements.input.addEventListener("change",event => {
        const file = event.target.files?.[0];
        if (file) previewWorkbook(file);
    });
    elements.workspace.addEventListener("change",event => {
        if (!state.preview || state.preview.correction_mode !== "guided") return;
        const field = event.target.closest("[data-correction-field]");
        if (field) {
            const row = state.preview.rows[Number(field.dataset.correctionRow)];
            if (!row) return;
            row.edited[field.dataset.correctionField] = RATING_FIELDS.includes(field.dataset.correctionField) ? Number(field.value) : field.value;
            row.confirmed = false;
            renderCorrectionWorkspace(state.preview);
            return;
        }
        const confirmation = event.target.closest("[data-correction-confirm]");
        if (confirmation) {
            const row = state.preview.rows[Number(confirmation.dataset.correctionConfirm)];
            if (!row) return;
            row.confirmed = confirmation.checked && correctionErrors(row,state.preview.rows).length === 0;
            renderCorrectionWorkspace(state.preview);
        }
    });
    elements.confirmAll.addEventListener("click",() => {
        if (!state.preview || state.preview.correction_mode !== "guided") return;
        initialiseRows(state.preview);
        const validRows = state.preview.rows.filter(row => row.client_errors.length === 0);
        if (!validRows.length) {
            showToast("Correct at least one row before confirming corrections.","error");
            return;
        }
        validRows.forEach(row => { row.confirmed = true; });
        renderCorrectionWorkspace(state.preview);
        const invalidCount = state.preview.rows.length - validRows.length;
        showToast(
            invalidCount
                ? `${validRows.length} valid corrections confirmed. Resolve the remaining ${invalidCount} failed correction${invalidCount === 1 ? "" : "s"} before admission.`
                : `${validRows.length} corrections confirmed.`,
            invalidCount ? "warning" : "success"
        );
    });
    elements.admit.addEventListener("click",admitWorkbook);
    resetWorkspace();
})();

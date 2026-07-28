(() => {
    const rulesHtml = `
        <p><strong>Authority:</strong> NCA Enterprise Risk Management Policy and Framework, reviewed 5 May 2026. Policy owner: Risk Management Committee; managed by RIPS. System rules version: ERM-2026.05.</p>
        <h3>Risk identification and categories</h3>
        <p>Risks should describe an uncertain event, its cause and its potential consequence. The official categories are Strategic, Financial, Operational, Reputational, Human Capital, Regulatory Compliance and Supervision.</p>
        <h3>Likelihood scale</h3>
        <ol>
            <li><strong>Rare</strong> — Very Low</li>
            <li><strong>Unlikely</strong> — Low</li>
            <li><strong>Possible</strong> — Medium</li>
            <li><strong>Likely</strong> — High</li>
            <li><strong>Almost Certain</strong> — Very High</li>
        </ol>
        <h3>Consequence scale</h3>
        <p>Consequence is assessed across health and safety, financial effect, business interruption, reputation or image, and achievement of corporate objectives. The scale is 1 Insignificant (Very Low), 2 Minor (Low), 3 Moderate (Medium), 4 Major (High), and 5 Catastrophic (Very High).</p>
        <h3>Calculation and rating</h3>
        <p>Risk score = likelihood × consequence. <strong>Low:</strong> 1–10. <strong>Medium:</strong> 11–16. <strong>High:</strong> 17–25. On the 5×5 matrix, the attainable High cells are 20, 20 and 25.</p>
        <h3>Risk appetite</h3>
        <p>Strategic: Open / High; Financial: Cautious / Moderate; Operational: Cautious / Moderate; Reputational: None; Human Capital: Seek / Significant; Regulatory Compliance: None; Supervision: Open / High. Appetite guides escalation and treatment; it does not change the arithmetic score.</p>
        <h3>Risk treatment</h3>
        <p><strong>Terminate</strong> avoids the activity; <strong>Treat</strong> reduces likelihood or consequence; <strong>Transfer</strong> shares the exposure; <strong>Tolerate</strong> retains it with ownership and monitoring.</p>
        <h3>System-generated assessment</h3>
        <p>The system evaluates the documented programme, action, risk event and supporting context against policy-based likelihood, consequence and category evidence. It records the matched evidence, confidence and rule version. Similar Chairman-approved cases are advisory only and never overwrite the immutable policy baseline. Focal Person, Champion and Chairman judgments remain separately attributable governance decisions.</p>`;

    document.querySelectorAll("[data-erm-rules-dialog]").forEach(dialog => {
        const content = dialog.querySelector(".rules-content") || dialog;
        const header = content.querySelector(".rules-dialog-head, .dialog-head");
        content.innerHTML = `${header ? header.outerHTML : ""}<div data-erm-assessment-rules>${rulesHtml}</div>`;
    });
})();

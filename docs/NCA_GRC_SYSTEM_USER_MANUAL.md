# NCA GRC System User Manual

Version 2026.10.09 · National Communications Authority

## Purpose and authority

NCA GRC records division risks, assessments, treatments, approvals, compliance evidence and executive reporting. The platform preserves the source of every material figure and the identity of the officer responsible for each action. System and assistant outputs support work; authorised NCA officers retain decision authority.

## Accounts and personnel changes

Each governed role has a permanent organizational role account, such as `legal.focal@nca.org.gh` or `legal.champion@nca.org.gh`. The role account is separate from the current employee assigned to it.

From **User Management → Map NCA Accounts**, the System Administrator selects a role, records the new employee's full name, official NCA email, optional Staff ID and position, effective date, and assignment or replacement reason. On confirmation:

- the former holder becomes inactive and their sessions are revoked;
- historical actions remain attributed to the former holder;
- unfinished assigned Action Centre items move to the new holder;
- a new named user identity receives the role and division scope;
- onboarding email delivery is queued with a temporary password;
- the new holder must change that password at first login; and
- an effective-dated assignment history and audit event are retained.

Do not edit a former employee's user record to make it represent another person.

### Administrator delegation

An existing System Administrator can use **User Management → Create Administrator** to create another administrator account. Administrator access has authority-wide privileges, so confirm the person's identity, official NCA email and business need before creating the account. The new administrator receives the same secure onboarding flow as other new users and must change the temporary password at first login.

### Clearing and replacing a role holder

Use **Clear Holder** on the organizational account mapping screen when a permanent role account must become unassigned. This removes the current employee's active access and revokes their sessions without deleting the permanent role account or rewriting historic actions. Use **Assign Holder** or the replacement workflow when the successor is known.

### Deferred and grouped onboarding

Administrators may fill several permanent role accounts before sending credentials. Choose the deferred onboarding option while assigning each holder, then use **Send Group Onboarding** to queue the selected unsent accounts together. Review the recipient list before confirming. Each person receives their own temporary password; passwords are never combined into one message.

## Secure onboarding and passwords

The onboarding email includes the login link, a temporary password, a PDF copy of this manual and a link to the current in-system manual. The recipient must change the temporary password immediately after first sign-in.

The password screen displays the active server policy. Unless the security configuration is changed by an authorized administrator, a new password must contain at least 12 characters, including an uppercase letter, a lowercase letter, a number and a special character. The **Show** control reveals only the field selected by the user; use it only where the screen cannot be observed by another person.

After each successful sign-in, the platform reminds the user that the current guide is available from **System Manual** in the navigation menu. The attached PDF is a convenient onboarding copy; the in-system manual is the current reference after later releases.

## Email delivery and Communication Centre

System email is sent through the configured service mailbox. The current service identity is the Risk Management System Gmail account, with its app password stored encrypted in system settings and never displayed again after saving. Administrators use the **Communication Centre** to review queued, sent and failed deliveries and to retry a failed message after correcting the cause.

Onboarding and password messages are restricted to official `@nca.org.gh` recipients. A successful queue status means the system accepted the message for delivery; use the delivery status and recipient mailbox checks to confirm completion. Because Gmail is an external provider, approved NCA security, retention and data-handling requirements remain applicable.

## Risk intake and assessment workflow

A Risk Focal Person keeps direct access to **Risk Register** and **Work Plan Upload**. For risk-register admissions, download and use only the **NCA Official Division Risk Register Tracker (Template 3)**; Templates 1 and 2 are retired and cannot be admitted. The Administrator may also use **Division Risk Uploads** when Focal Persons have supplied the official Template 3 workbook for centralized loading.

For an Administrator-assisted upload, the workbook likelihood, impact and score belong to the assigned Focal Person. They are displayed as **Focal — Pending Confirmation**, not as System figures. The platform's rule-based assessment remains separately identified as **System**.

The assigned Focal Person opens **Administrator-Staged Risks**, reviews or edits every row, explains material differences and uses the single **Submit All to Risk Champion** action. The complete register is then locked at the Focal stage and sent to the division Risk Champion. Champion and Chairman decisions remain separate, attributable governance stages.

## Risk scoring

Risk score equals likelihood multiplied by impact on the approved 5×5 matrix:

- Low: 1–10
- Medium: 11–16
- High: 17–25

Never present a Focal, Champion or Chairman figure as a System figure. Never treat an assistant recommendation as an approval.

## Assistant

The NCA GRC Assistant is a read-only conversational workspace. It supports General, System Help, My Work, Planning and Evidence / Sources modes. General and System Help exclude private work context by default. Personalised modes require the user to select **Use my authorised work**; identity, role and scope are still resolved on the server for every request and cannot be widened by the browser or by prompt text.

When asked what is visible on the current page, the assistant can describe a bounded snapshot of rendered headings, notices, summary cards, tables, form fields and available controls. It can also explain a specifically named visible button or link, including its verified purpose, effect, prerequisites and whether it is currently disabled. Where the page does not expose a verified purpose, the assistant reports that gap instead of inventing an effect. This is structured page context rather than a screenshot. It is processed locally, remains limited to the signed-in user's role-authorised view, and excludes passwords, hidden inputs, file inputs, assistant-interface content, elements marked sensitive and non-visible content. Page and control awareness are read-only and do not grant permission to operate a control or change a record.

The sign-in briefing is deterministic and provider-independent. It reconciles authorised Action Centre records with role-specific Dashboard tasks, separates explicitly dated overdue items, pending work and work awaiting someone else, shows no more than five initial items, and links to the relevant authorised screen. An item without an explicit past due date is not labelled overdue.

Responses identify delivery mode, provenance, supporting sources and the facts-as-of time where live records contribute. Assistant analysis identifies supporting risk IDs and stages where available. Recommendations are advisory, based on current recorded data, and must be verified against source records by an authorised officer. The assistant has no tools or routes that approve, submit, assign, delete or otherwise mutate official records.

Typed chat remains available when connected AI or voice is unavailable. Conversation memory is limited to the current browser tab, bounded in size, isolated by signed-in identity and cleared through **Clear conversation**. Audit records store request metadata and source references, not raw questions, full answers or chain-of-thought.

Microphone conversation is disabled in production unless NCA approves the recognition and synthesis processing paths. Spoken sign-in briefing is configured separately. When approved and enabled, the assistant attempts to speak the greeting and authorised work summary once per authenticated session; if browser autoplay blocks it, **Hear welcome** provides a user-initiated fallback. Where continuous voice and automatic start are both configured, listening begins after the spoken introduction and remains selected until the user chooses **Stop**, turns off the active listening control, closes the assistant, logs out or navigates away. Recoverable recognition interruptions retry automatically. During thinking or speaking, the voice control becomes **Interrupt** so the user can cancel the current response and clarify; starting to type also stops speech playback. A blocked permission or missing microphone pauses listening and displays a recovery instruction without silently clearing the user's conversation-mode selection. Browser speech services may have separate processing and residency implications that must be approved before either speech feature is enabled.

Connected AI remains disabled until NCA configures an approved provider and model. Governed work context is blocked from external processing unless NCA separately approves the purpose, processing region, retention, contractual basis and cross-border handling. A `store: false` provider request reduces application-state persistence but does not by itself prove zero retention, African processing, or complete data-residency compliance.

## Key pages by role

- System Administrator: User Management, Create Administrator, Account Mapping, grouped onboarding, Communication Centre, Division Risk Uploads, Division Focal Submissions, consolidated oversight, settings and audit logs.
- Risk Focal Person: direct workbook upload, Administrator-Staged Risks, work plans, assigned approvals and treatments.
- Risk Champion: division approvals, assessments, treatment oversight and reports.
- Risk Committee Chairman: enterprise analytics, Board Dashboard, high-risk reviews and final governed decisions.

### Multiple risk entry

Risk Focal Persons and Risk Champions can prepare several manual risks from **Create Risk**. Complete one risk, select **Add Risk to Batch**, and review the queued risks before selecting **Submit Batch**. Every risk is validated separately and retains its own identifier, workflow, attachments and audit history. Removing a queued item does not affect risks already submitted.

### Treatment oversight

Risk Champions and the Risk Committee Chairman can filter Treatment Plans to show overdue items and order the list by due date, progress or recorded completion time. A treatment receives a completion timestamp when it first reaches **Completed**; reopening it clears that timestamp so the displayed completion order reflects the current governed state.

### Chairman quarterly dashboard

The Board Dashboard lets the Chairman choose a year and Quarter 1–4, or a full year. All headline figures and lists are recalculated for the selected period. The **Risks by Category** table groups the governed register by approved risk category and shows total, High, Medium, Low and closed counts. Use **Print / Save Dashboard** to produce a print-ready quarterly copy.

## Secure operating guidance

Use only official `@nca.org.gh` employee addresses. Review onboarding delivery status. Regenerating a temporary password revokes existing sessions. Grant administrator access only for a confirmed operational need. Use least privilege, record reasons for adjustments and personnel replacement, verify evidence before approvals, and preserve the audit trail.

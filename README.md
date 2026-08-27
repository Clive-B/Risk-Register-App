# NCA Enterprise GRC Platform

The National Communications Authority Enterprise Governance, Risk and
Compliance (GRC) Platform provides a governed workflow for identifying,
assessing, reviewing, approving, treating, monitoring and reporting enterprise
risks.

This repository contains the maintained frontend, backend, database migrations,
approved workbook templates, deployment documentation and automated tests.
It is intended for authorised NCA internal use.

## Current implementation status

The application is functionally ready for controlled deployment preparation.
Before production deployment, NCA IT must supply and approve the production
server, PostgreSQL, HTTPS, corporate mail, backup, monitoring and security
configuration described in:

- [DEPLOYMENT.md](DEPLOYMENT.md)
- [NCA_IT_MAIL_DEPLOYMENT.md](NCA_IT_MAIL_DEPLOYMENT.md)
- `NCA_GRC_IT_Deployment_Information_Request_CORRECTED.docx`
- `NCA_GRC_IT_Deployment_and_Post_Deployment_Runbook.docx`

Production secrets and infrastructure credentials are deliberately excluded
from this repository.

## Application structure

- `frontend/` - static HTML, CSS, JavaScript and approved NCA brand assets.
- `backend/` - Express API, PostgreSQL migrations, workflow services, security,
  email processing and automated tests.
- `scripts/` - governed template generation, deployment, backup and restore
  utilities.
- `frontend/templates/` - downloadable work-plan, risk-register and bulk-user
  workbook templates.

## Roles and governed workflow

### Risk Focal Person

- Uploads a work plan or supported risk-register workbook.
- Reviews and confirms system-proposed workbook corrections.
- Uses the dedicated **Risk Register** admissions page for both approved
  risk-register templates; admitted risks then move to the Consolidated Risk
  Register.
- Completes or changes assessment values before submission.
- Selects an approved ERM response: Terminate, Treat, Transfer or Tolerate.
- Reviews and updates proposed treatment actions, owners and dates.
- Monitors treatment progress and supplies evidence.

### Risk Champion

- Sees risks belonging to the assigned division.
- Reviews and edits risks from the Consolidated Risk Register.
- Submits individual or bulk Champion reviews.
- Reviews and approves treatment plans individually or in bulk.
- Reassesses existing-control reasons and control effectiveness during
  treatment monitoring.
- Produces governed divisional risk and treatment reports.

### Risk Committee Chairman

- Sees risks and treatments across all divisions.
- Filters information by division and other governed attributes.
- Edits and approves individual risks and treatments.
- Performs final Committee approvals per division or across the complete
  enterprise scope.
- Produces governed Committee reports covering every risk in the critical
  25/20/20 heat-map positions.

### System Administrator

- Creates and manages individual users.
- Creates multiple users through an on-screen form or governed Excel upload.
- Reviews audit logs, system settings, communications and platform health.
- Staff ID and phone number are optional and remain blank when omitted.

## Authoritative ERM assessment

The system assessment is aligned with
`Rev_ERM Policy and Framework_05_05_26.docx`, which is treated as the
authoritative assessment source.

- Likelihood and impact are each rated from 1 to 5.
- Risk score is calculated as likelihood multiplied by impact.
- Low: 1-10.
- Medium: 11-16.
- High: 17-25.
- System, Focal Person, Champion and Committee decisions are retained
  separately for governance and audit.
- The Chairman view withholds the Focal assessment and presents the governed
  System and Champion values.
- Challenges and approvals do not require a comment unless a workflow rule
  explicitly requires supporting evidence.

## Workbook correction engine

The reusable rule-driven correction engine supports work plans, standard
risk-register workbooks, the tracking template and the Legal legacy register.

Every detected issue can provide:

- Detection rule.
- Proposed correction.
- Explanation.
- Confidence level.
- Editable value.
- Validation rule.
- Audit record.

The engine:

- Detects supported sheets and flexible header positions.
- Preserves original workbook values.
- Separates multiple risk events into independently monitored risks.
- Consolidates continuation rows into the correct parent risk.
- Proposes unique governed risk IDs.
- Proposes missing pre-mitigation, current and post-mitigation likelihood and
  impact values.
- Recalculates scores from confirmed likelihood and impact values.
- Converts `Accept` to the approved ERM response `Tolerate`.
- Requires the user to choose an approved response when the source value is
  blank or unrecognised.
- Proposes treatment strategy, actions, owner and dates while retaining any
  uploaded treatment plan.
- Prevents admission until all required corrections are valid and confirmed.

## Downloadable governed templates

The Focal Person can download the templates from the relevant upload interface:

- `NCA_Official_Work_Plan_Upload_Template.xlsx`
- `NCA_Official_Risk_Register_Upload_Template.xlsx`
- `NCA_Official_Risk_Register_Template_2.xlsx`

The templates contain, where applicable:

- ERM-approved dropdown values.
- Protected score formulas.
- Conditional risk-score colouring.
- Assessment guidance and instructions.
- Existing-control and control-effectiveness fields.
- Treatment and monitoring fields.

The bulk-user interface also provides:

- `NCA_Bulk_User_Account_Upload_Template.xlsx`

## Risk and treatment governance

- All risk identification edits are performed from the Consolidated Risk
  Register and reflected in the source views.
- Work-plan, risk-register upload and individually created risks follow the
  same consolidated governance path.
- Treatment plans are generated for every admitted risk.
- Uploaded treatment plans are retained, with system improvements shown
  separately.
- Treatment plans are monitored from the Treatment Plans page.
- Read-only View is available independently of Edit.
- Completion is permitted only when treatment progress, status and required
  evidence satisfy the governed completion rules.
- Champion approval and final Committee approval are separately retained.

## Existing controls and control effectiveness

The platform records and monitors:

- Existing controls and the reasons supporting them.
- Control owner and control type.
- Design adequacy.
- Control evidence and last-tested date.
- Exceptions or control gaps.
- Next review date.
- Assessment basis and confidence.
- Effectiveness rating: Effective, Partially Effective, Ineffective or Not
  Assessed.

An Effective rating requires adequate design, dated evidence and no unresolved
exceptions. Control reassessment does not silently overwrite governed risk
scores.

## Dashboards, heat maps and reporting

- Focal, Champion, Chairman and Administrator dashboards are role-aware.
- Enterprise and divisional heat maps use the authoritative 5x5 matrix.
- Heat-map cells show programme count, likelihood/impact position and score.
- The Chairman dashboard provides a compact oversight heat map while the
  Enterprise Heat Map page provides detailed drill-down.
- Executive Analytics supports governed organisational and risk filters.
- The Board Dashboard reports live enterprise risk, treatment and approval
  information.
- Governed AI reports are evidence-linked and do not invent unrecorded claims.
- Reports support versioning, commentary, Word/PDF output and governed scope.
- Champion reports cover divisional risks, treatments and treatment progress.
- Chairman reports cover all risks occupying the 25/20/20 critical positions,
  their treatments and progress.

## Compliance assurance

The Compliance Assurance Register records applicable obligations, evidence and
independent verification.

Compliance assurance rate:

`Verified Compliant obligations / all assessed applicable obligations`

Not Assessed obligations are reported separately, and Not Applicable
obligations are excluded from the denominator.

## Action Centre, notifications and audit

- The Action Centre consolidates pending, due and overdue governed work.
- Treatment actions cannot be completed until their source treatment is
  complete and evidence requirements are satisfied.
- Recent Activities is limited to relevant, compact audit events.
- Passive notification telemetry is excluded from user-facing activity.
- Notification popups provide explicit close controls.
- Audit logs remain technically separate from end-user notifications.
- Audit logs can be searched, filtered and exported.

## User experience improvements

- Browser-native alerts were replaced with NCA-styled dialogs.
- Comments for ordinary approvals are optional.
- Dialogs include accessible close controls and protected action buttons.
- Sidebar active states, fonts, spacing and scroll position are consistent.
- Cross-page transitions suppress unstyled flashes and distorted snapshots.
- Report, compliance, audit and system-settings navigation use the shared
  governed sidebar shell.

## Security controls

- Passwords are hashed and are never stored in source control.
- Established user passwords are not overwritten by repeat seed operations.
- First-login password changes are retained correctly.
- Session revocation and token-version checks are enforced.
- Password history, expiry and account lockout are configurable.
- SMTP credentials are encrypted when stored by the application.
- Mail delivery is restricted to the approved NCA domain.
- Mail headers are protected against CRLF injection.
- `.env`, database credentials, JWT secrets, encryption keys and SMTP
  credentials are excluded from Git.

Never commit a populated `.env`, database backup, private key, certificate
private key, generated temporary password or production credential.

## Local development

Requirements:

- Node.js 20 or later.
- PostgreSQL.
- A static web server for the frontend.

Setup:

1. Copy `backend/.env.example` to `backend/.env`.
2. Enter local-only database and security values in `backend/.env`.
3. From `backend/`, run `npm ci`.
4. Run `npm run migrate`.
5. Run `npm start`.
6. Serve `frontend/` on port 5500.

The API defaults to `http://127.0.0.1:3000`. When the frontend runs locally, it
uses the local API. In production it uses the same origin under `/api`, unless
`window.NCAGRC_API_URL` or the `nca-api-url` meta value overrides it.

## Database

The database is versioned through migrations in `backend/migrations/`.
The current source includes migrations `000` through `047`, covering identity,
workflow, risk governance, work-plan assessment, treatment approvals, governed
reports, notification separation, compliance assurance, control assurance and
Legal legacy risk-register support.

Do not copy the test database into production. The database will be cleared of
test risks, work plans, approvals and other test records only when expressly
authorised before handover to NCA IT.

## Testing

Run:

```powershell
cd backend
npm test
```

Current regression status: **100 automated tests passing**.

The test suite covers:

- ERM score bands and assessments.
- Workbook correction engines.
- Work-plan and risk-register admission.
- Assessment visibility.
- Champion and Committee approvals.
- Treatment proposals and completion policy.
- Control assurance.
- Compliance assurance.
- Dashboards, filters and initial heat-map rendering.
- Governed reports.
- Notifications and audit separation.
- User onboarding and password safety.
- Mail and deployment readiness.
- Navigation and dialog behaviour.

## Change record - July 2026

The maintained source replaces the earlier archive-only repository state.
Major completed changes include:

1. Implemented authoritative ERM assessment and three-level score bands.
2. Centralised all risk editing in the Consolidated Risk Register.
3. Added work-plan, tracking-register and Legal-register correction engines.
4. Added governed downloadable workbooks with dropdowns, formulas and score
   colouring.
5. Added automatic treatment proposals for every admitted risk.
6. Added individual, divisional bulk and enterprise bulk approval workflows.
7. Added treatment monitoring, read-only views and completion validation.
8. Added existing-control assurance and editable effectiveness reassessment.
9. Added governed Champion and Chairman AI risk reports.
10. Added Compliance Assurance and its evidence-based rate.
11. Added bulk user creation with an editable workbook correction workflow.
12. Added functioning Audit Logs and System Settings administration pages.
13. Added NCA corporate mail readiness and deployment instructions.
14. Reworked notifications, Action Centre and compact recent activity.
15. Standardised NCA dialogs, navigation, active states and page transitions.
16. Added database migrations through version `047`.
17. Expanded regression coverage to 100 passing tests.
18. Added `NCA Official Risk Register Template 2` for the Legal register
    structure while retaining governed ERM fields.
19. Separated risk-register admission from the Consolidated Risk Register:
    both governed template correction engines now reside on a dedicated
    Focal Person **Risk Register** page, while the consolidated page remains
    the central editing, review and approval workspace.

## Repository hygiene

The old ZIP files remain in Git history for traceability, but the maintained
source directories are authoritative. Temporary Office lock files, local
environment files, dependencies, logs and generated runtime files are ignored.

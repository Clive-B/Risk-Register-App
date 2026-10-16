# NCA Enterprise GRC Platform Handover

Last updated: 28 August 2026

Repository: `Clive-B/Risk-Register-App`

Branch: `main`

## Executive status

The repository contains a working NCA Enterprise Governance, Risk and Compliance platform with a static browser frontend, an Express API, PostgreSQL migrations, governed workbook templates, deployment tooling and automated regression tests.

The application is suitable for controlled deployment preparation and user acceptance testing. It is not ready for production cutover until NCA ICT supplies and validates the production infrastructure, HTTPS, PostgreSQL, corporate mail, backup, monitoring and security settings described in `DEPLOYMENT.md` and `NCA_IT_MAIL_DEPLOYMENT.md`.

Production secrets, credentials and infrastructure-specific values are intentionally not stored in Git.

## Repository snapshot

- `frontend/` contains the static HTML, CSS, JavaScript, role-aware navigation, browser-based GRC assistant, NCA brand assets, downloadable templates and IIS `web.config`.
- `backend/` contains the Express API, PostgreSQL access, authentication and authorisation, governed workflows, notifications, reporting, email services and tests.
- `backend/migrations/` contains migrations `000` through `049`.
- `scripts/` contains template generation, local server, Windows service installation, readiness, backup and restore utilities.
- Root-level Excel and Word files contain source registers, governed upload templates, deployment material and policy/reference documents.
- `README.md` is the functional overview and local-development guide.
- `DEPLOYMENT.md` is the primary production deployment guide.

The previously published source baseline is commit `49655b2` (`Add project handover documentation`). This update publishes the dedicated Risk Register admissions workspace, browser-based GRC assistant, administrator provisioning material and supporting security utilities described below.

## Implemented capability

The current platform includes:

- Role-aware access for Risk Focal Persons, Risk Champions, the Risk Committee Chairman and System Administrators.
- Manual risk creation plus governed work-plan and risk-register workbook admission.
- Rule-driven correction engines that preserve original workbook values and record detection, proposal, confidence, validation and audit information.
- Authoritative 5x5 ERM assessment with Low `1-10`, Medium `11-16` and High `17-25` bands.
- Separate System, Focal, Champion and Committee decisions with governed visibility rules.
- A consolidated risk register for editing, review and approval.
- Generated and uploaded treatment plans, treatment monitoring, evidence rules, Champion approval and final Committee approval.
- Existing-control and control-effectiveness assurance without silently changing governed risk scores.
- Action Centre, notifications, audit logs, dashboards, heat maps, executive analytics and Board reporting.
- Compliance assurance and governed AI-assisted reports based on recorded evidence.
- Individual and bulk user onboarding with password, session, lockout and mail-safety controls.
- IIS reverse-proxy configuration and Windows deployment, readiness, backup and restore scripts.
- A browser-based GRC assistant with typed help, system tours, role-aware task briefings, page navigation, sign-out confirmation, browser speech synthesis and supported-browser speech recognition.

## Updates included in this handover

### Dedicated Risk Register admissions page

Workbook admission is now separated from the Consolidated Risk Register:

- `frontend/pages/risk-register.html`, `frontend/js/risk-register.js` and `frontend/css/risk-register.css` provide a Focal-only admissions workspace for all three approved register templates.
- Navigation and cache-version references are updated across the shared shell and role pages.
- The upload action is removed from the Consolidated Risk Register page.
- New `backend/tests/riskRegisterAdmissionsPage.test.js` covers the page, endpoints and Focal-only navigation.
- `README.md` describes the new workflow and consistently reports 105 passing tests.

### Administrator multi-division risk admission

- Template 3 is the sole official risk-register workbook, a clean upload edition of the approved `Adminstration Risk Register Updated_.xlsx` structure, downloadable as `NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx`. Templates 1 and 2 are retired from download and new admissions.
- The Administrator-only **Division Risk Uploads** page selects several divisions and their active Focal Persons, attaches one workbook per division, exposes row-level correction and uses one atomic **Send All to Focal Review** submission.
- Administrator staging creates draft risks in the Consolidated Risk Register with `Awaiting Focal Review`; it does not impersonate or pre-populate the accountable Focal decision.
- The assigned Focal Person reviews and edits staged risks, records likelihood and impact for every risk, and submits the complete division register to the Risk Champion.
- The Administrator-only **Division Focal Submissions** page provides read-only cross-division status and links back to each batch in the Consolidated Risk Register.
- Migrations `048` and `049` add upload groups, accountable-Focal provenance, Focal submission timestamps and the Template 3 entry source.

### GRC assistant and voice guidance

- New `frontend/js/assistant.js` and `frontend/css/assistant.css` add an authenticated floating assistant across pages loaded through the shared application shell.
- The assistant can explain core workflows, open governed pages, present dashboard task and notification counts, run a spoken system tour and confirm sign-out.
- Voice input uses the browser Speech Recognition API where supported, with `en-GH` selected; spoken output uses browser speech synthesis.
- Sign-in guidance no longer starts or waits on the microphone automatically. The assistant explicitly tells the user to press **Talk**, and listening begins only from that user action.
- The assistant close control and the collapsed launcher/Push-to-Talk row use component-scoped sizing and alignment across Executive Analytics, Board Dashboard and Compliance Assurance.
- `Clone Voice.docx` records options and security/consent considerations for a future custom voice provider. No cloned-voice model, provider API, external voice service, API key or backend integration is included in the application.

### Division role accounts

- The local test environment contains an active Risk Focal Person for each of the 15 governed divisions, enabling the Administrator assignment list used by multi-division staging.
- Division Focal and Champion account passwords are operational database state and are intentionally not recorded in this repository or handover document.

### Administrator provisioning documentation

The following reproducible provisioning material is included:

- `NCA_GRC_Administrator_User_Account_Provisioning_Requirements.docx`
- `scripts/generate-user-account-provisioning-requirements.ps1`

The document records the current individual and bulk account rules, production dependencies, SMTP requirements, security controls and acceptance checklist. The generator uses the corrected deployment information request as its document template.

### Security utility foundations

Three backend utility modules have been added for follow-on integration:

- `backend/utils/attachmentSecurity.js` validates attachment names, allowed file types, MIME consistency, magic bytes, base64 data and size limits.
- `backend/utils/workbookSecurity.js` checks workbook ZIP structure, entry counts, expanded sizes, compression ratios and unsupported encryption/ZIP64 features.
- `backend/utils/outputSecurity.js` provides HTML escaping, CSV serialization and spreadsheet-formula neutralisation.

These helpers are present in source but are not yet imported by the existing upload, attachment or export routes. They must be integrated and covered by focused tests before they can be treated as active security controls.

## Verification performed

Verification on 28 August 2026:

```text
npm.cmd test
Tests: 105
Passed: 105
Failed: 0
```

Additional checks completed successfully:

- JavaScript syntax checks for the admissions pages, assistant, security utilities and related tests.
- Live PostgreSQL migrations `048` and `049` and a disposable full workflow smoke test covering Admin staging, assigned-Focal visibility and submission, and Admin monitoring.
- DOCX package/XML validation for the voice guidance and administrator provisioning documents.
- `git diff --check` for tracked working-tree edits.

Not verified during this documentation update:

- Browser-based end-to-end role workflows.
- Production IIS/HTTPS reverse proxying.
- Corporate SMTP authentication and message delivery.
- Production backup and non-production restore.
- Vulnerability scanning and formal NCA user acceptance testing.

These checks require the appropriate environment, infrastructure and authorised test data.

## Local development

Requirements are Node.js 20 or later, PostgreSQL and a static frontend server.

1. Copy `backend/.env.example` to `backend/.env` and populate local-only values.
2. In `backend/`, run `npm ci`.
3. Run `npm run migrate`.
4. Run `npm start`; the API defaults to `http://127.0.0.1:3000`.
5. Serve `frontend/` on port `5500` (the repository includes `scripts/serve-frontend.js`).
6. Run `npm test` from `backend/` before committing changes.

On Windows systems where PowerShell blocks `npm.ps1`, use `npm.cmd`, for example `npm.cmd test`.

## Production deployment dependencies

NCA ICT must provide or approve:

- Internal DNS name and IIS TLS certificate.
- Supported Windows Server with IIS, URL Rewrite and ARR proxy enabled.
- Node.js 20 or later and an approved Windows service mechanism such as NSSM.
- Production PostgreSQL database, least-privilege account and CA certificate for remote TLS.
- NCA SMTP relay/server details, approved sender and service account or relay authorisation.
- Dedicated application service account.
- Protected backup destination, retention policy and off-server replication.
- Monitoring, vulnerability scan, ownership and support/escalation contacts.

Before go-live, execute the deployment guide in order, require `npm run readiness` to report verified SMTP, complete the production health check, verify a backup and restore into a non-production database, remove authorised test data, and obtain Focal/Champion/Chairman acceptance.

## Important safeguards

- Never commit a populated `.env`, database dump, private key, certificate private key, JWT secret, encryption key, SMTP credential, generated temporary password or production credential.
- Never place a cloned-voice provider API key or protected voice model identifier in frontend JavaScript or Git; require documented voice-owner consent and NCA approval before any custom voice integration.
- Do not copy the test database into production.
- Treat `Rev_ERM Policy and Framework_05_05_26.docx` as the authoritative assessment source unless formally superseded by NCA.
- Keep audit records technically separate from user-facing notifications.
- Do not mark treatments or related actions complete unless progress, status and required evidence meet the governed completion rules.

## Recommended next actions

1. Review the dedicated Risk Register admissions pages in a browser, including the sole official Template 3 workbook, Administrator multi-division staging, Focal correction/submission and Consolidated Risk Register visibility.
2. Complete browser accessibility and supported-browser testing for the GRC assistant, including microphone permissions, the one-minute listening limit, navigation and sign-out confirmation.
3. Decide whether browser speech is sufficient or a consented, NCA-approved custom voice service is required; implement any provider only through a protected backend integration.
4. Integrate the new attachment, workbook and output security utilities into the applicable backend routes and add unit and route-level regression tests.
5. Review and formally approve the administrator provisioning requirements and the controlled method for creating the first production System Administrator.
6. Obtain the outstanding NCA ICT deployment inputs and run the readiness checks in a representative staging environment.
7. Complete role-based UAT, security scanning, SMTP acceptance, backup/restore validation and formal production approval.

## Handover acceptance checklist

- [ ] Repository access and branch protection confirmed.
- [ ] Local in-progress changes reviewed and preserved.
- [ ] Development environment starts successfully.
- [ ] Database migrations complete on a clean non-production database.
- [ ] All automated tests pass.
- [ ] The official Template 3 workbook admission paths pass Focal Person and Administrator UAT, and retired templates are rejected.
- [ ] GRC assistant keyboard, screen-reader, microphone, voice, navigation and sign-out paths pass supported-browser UAT.
- [ ] Attachment, workbook and output security helpers are integrated and regression-tested.
- [ ] Champion and Chairman review/approval paths pass UAT.
- [ ] Treatment, evidence, compliance, reporting and audit paths pass UAT.
- [ ] IIS, HTTPS, PostgreSQL TLS and SMTP are verified in staging.
- [ ] Backup and non-production restore are verified.
- [ ] Security scan findings are resolved or formally accepted.
- [ ] Application, database, service-account and support owners are recorded.
- [ ] Production cutover is formally authorised by NCA.

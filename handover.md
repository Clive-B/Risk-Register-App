# NCA Enterprise GRC Platform Handover

Last updated: 27 August 2026

Repository: `Clive-B/Risk-Register-App`

Branch: `main`

## Executive status

The repository contains a working NCA Enterprise Governance, Risk and Compliance platform with a static browser frontend, an Express API, PostgreSQL migrations, governed workbook templates, deployment tooling and automated regression tests.

The application is suitable for controlled deployment preparation and user acceptance testing. It is not ready for production cutover until NCA ICT supplies and validates the production infrastructure, HTTPS, PostgreSQL, corporate mail, backup, monitoring and security settings described in `DEPLOYMENT.md` and `NCA_IT_MAIL_DEPLOYMENT.md`.

Production secrets, credentials and infrastructure-specific values are intentionally not stored in Git.

## Repository snapshot

- `frontend/` contains the static HTML, CSS, JavaScript, NCA brand assets, downloadable templates and IIS `web.config`.
- `backend/` contains the Express API, PostgreSQL access, authentication and authorisation, governed workflows, notifications, reporting, email services and tests.
- `backend/migrations/` contains migrations `000` through `047`.
- `scripts/` contains template generation, local server, Windows service installation, readiness, backup and restore utilities.
- Root-level Excel and Word files contain source registers, governed upload templates, deployment material and policy/reference documents.
- `README.md` is the functional overview and local-development guide.
- `DEPLOYMENT.md` is the primary production deployment guide.

The maintained source baseline is commit `85a1373` (`Build governed NCA enterprise GRC platform`). Before this handover update, local `main` was one commit ahead of `origin/main`; pushing this handover also publishes that committed platform baseline.

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

## Current local work in progress

The working tree contained pre-existing edits when this handover was prepared. They have deliberately not been staged or included in the handover commit.

### Dedicated Risk Register admissions page

An in-progress change separates workbook admission from the Consolidated Risk Register:

- New `frontend/pages/risk-register.html`, `frontend/js/risk-register.js` and `frontend/css/risk-register.css` provide a Focal-only admissions workspace for both approved register templates.
- Navigation and cache-version references are updated across the shared shell and role pages.
- The upload action is removed from the Consolidated Risk Register page.
- New `backend/tests/riskRegisterAdmissionsPage.test.js` covers the page, endpoints and Focal-only navigation.
- `README.md` is partly updated to describe the change and report 100 tests.

This work passes the current automated suite, but remains uncommitted and is therefore not backed up on GitHub by the handover push.

### Administrator provisioning documentation

The following locally generated, untracked artifacts also remain outside the handover commit:

- `NCA_GRC_Administrator_User_Account_Provisioning_Requirements.docx`
- `NCA_GRC_Administrator_User_Account_Provisioning_Requirements_CORRECTED.docx`
- `scripts/generate-user-account-provisioning-requirements.ps1`

Review the corrected document and generator, decide which document is authoritative, and avoid committing duplicate or superseded output.

## Verification performed

Verification on 27 August 2026:

```text
npm.cmd test
Tests: 100
Passed: 100
Failed: 0
```

Additional checks completed successfully:

- JavaScript syntax checks for the new admissions script and modified shared scripts.
- `git diff --check` for tracked working-tree edits.

Not verified during this documentation update:

- Live PostgreSQL migrations or integration flows.
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
- Do not copy the test database into production.
- Do not reset or discard the current working tree without first reviewing and preserving the in-progress admissions and provisioning work listed above.
- Treat `Rev_ERM Policy and Framework_05_05_26.docx` as the authoritative assessment source unless formally superseded by NCA.
- Keep audit records technically separate from user-facing notifications.
- Do not mark treatments or related actions complete unless progress, status and required evidence meet the governed completion rules.

## Recommended next actions

1. Review the dedicated Risk Register admissions page in a browser as a Focal Person, including both workbook templates and admission into the Consolidated Risk Register.
2. Resolve the `README.md` test-count inconsistency: its Testing section still says 97 while the change record says 100.
3. Commit the complete admissions-page work as one reviewed change after browser validation.
4. Review and consolidate the administrator provisioning documents, then commit only the approved artifact and its reproducible generator if required.
5. Obtain the outstanding NCA ICT deployment inputs and run the readiness checks in a representative staging environment.
6. Complete role-based UAT, security scanning, SMTP acceptance, backup/restore validation and formal production approval.

## Handover acceptance checklist

- [ ] Repository access and branch protection confirmed.
- [ ] Local in-progress changes reviewed and preserved.
- [ ] Development environment starts successfully.
- [ ] Database migrations complete on a clean non-production database.
- [ ] All automated tests pass.
- [ ] Both approved workbook admission paths pass Focal Person UAT.
- [ ] Champion and Chairman review/approval paths pass UAT.
- [ ] Treatment, evidence, compliance, reporting and audit paths pass UAT.
- [ ] IIS, HTTPS, PostgreSQL TLS and SMTP are verified in staging.
- [ ] Backup and non-production restore are verified.
- [ ] Security scan findings are resolved or formally accepted.
- [ ] Application, database, service-account and support owners are recorded.
- [ ] Production cutover is formally authorised by NCA.

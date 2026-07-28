from __future__ import annotations

from datetime import date
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from xml.sax.saxutils import escape


PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT = PROJECT_ROOT / "NCA_GRC_IT_Deployment_and_Post_Deployment_Runbook.docx"


def run(text: str = "", *, bold: bool = False, italic: bool = False, color: str | None = None,
        size: int | None = None, font: str = "Aptos") -> str:
    props = [f'<w:rFonts w:ascii="{font}" w:hAnsi="{font}"/>']
    if bold:
        props.append("<w:b/>")
    if italic:
        props.append("<w:i/>")
    if color:
        props.append(f'<w:color w:val="{color}"/>')
    if size:
        props.append(f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>')
    return f'<w:r><w:rPr>{"".join(props)}</w:rPr><w:t xml:space="preserve">{escape(text)}</w:t></w:r>'


def paragraph(text: str = "", *, style: str | None = None, bold: bool = False,
              italic: bool = False, color: str | None = None, size: int | None = None,
              align: str | None = None, before: int | None = None, after: int = 100,
              keep_next: bool = False, page_break_before: bool = False) -> str:
    p_props = []
    if style:
        p_props.append(f'<w:pStyle w:val="{style}"/>')
    if align:
        p_props.append(f'<w:jc w:val="{align}"/>')
    spacing = [f'w:after="{after}"']
    if before is not None:
        spacing.append(f'w:before="{before}"')
    p_props.append(f'<w:spacing {" ".join(spacing)}/>')
    if keep_next:
        p_props.append("<w:keepNext/>")
    if page_break_before:
        p_props.append("<w:pageBreakBefore/>")
    return (
        f'<w:p><w:pPr>{"".join(p_props)}</w:pPr>'
        f'{run(text, bold=bold, italic=italic, color=color, size=size)}</w:p>'
    )


def mixed_paragraph(parts: list[tuple[str, dict]], *, style: str | None = None,
                    after: int = 100, left: int | None = None) -> str:
    props = [f'<w:spacing w:after="{after}"/>']
    if style:
        props.append(f'<w:pStyle w:val="{style}"/>')
    if left is not None:
        props.append(f'<w:ind w:left="{left}"/>')
    return f'<w:p><w:pPr>{"".join(props)}</w:pPr>{"".join(run(t, **opts) for t, opts in parts)}</w:p>'


def checklist(text: str, *, level: int = 0) -> str:
    indent = 360 + level * 360
    return mixed_paragraph(
        [("☐  ", {"bold": True, "color": "1F4E78", "font": "Segoe UI Symbol"}), (text, {})],
        style="Checklist", after=70, left=indent
    )


def bullet(text: str, *, level: int = 0) -> str:
    indent = 360 + level * 360
    return mixed_paragraph(
        [("•  ", {"bold": True, "color": "1F4E78"}), (text, {})],
        after=60, left=indent
    )


def page_break() -> str:
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def cell(text: str, *, bold: bool = False, shade: str | None = None,
         width: int = 2500, color: str | None = None) -> str:
    shade_xml = f'<w:shd w:fill="{shade}"/>' if shade else ""
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{shade_xml}'
        '<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
        '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar></w:tcPr>'
        f'{paragraph(text, bold=bold, color=color, after=0)}</w:tc>'
    )


def table(rows: list[list[str]], *, widths: list[int] | None = None,
          header: bool = True) -> str:
    widths = widths or [9000 // len(rows[0])] * len(rows[0])
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    output = [
        '<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/>'
        '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="A6A6A6"/>'
        '<w:left w:val="single" w:sz="4" w:color="A6A6A6"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="A6A6A6"/>'
        '<w:right w:val="single" w:sz="4" w:color="A6A6A6"/>'
        '<w:insideH w:val="single" w:sz="4" w:color="D9E2F3"/>'
        '<w:insideV w:val="single" w:sz="4" w:color="D9E2F3"/></w:tblBorders>'
        '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="80" w:type="dxa"/>'
        '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>'
        f'</w:tblPr><w:tblGrid>{grid}</w:tblGrid>'
    ]
    for row_index, row in enumerate(rows):
        is_header = header and row_index == 0
        row_cells = "".join(
            cell(value, bold=is_header, shade="1F4E78" if is_header else ("F3F6FA" if row_index % 2 == 0 else None),
                 width=widths[index], color="FFFFFF" if is_header else None)
            for index, value in enumerate(row)
        )
        output.append(f'<w:tr>{row_cells}</w:tr>')
    output.append("</w:tbl>")
    return "".join(output)


def heading(text: str, level: int = 1) -> str:
    return paragraph(text, style=f"Heading{level}", keep_next=True)


def note(label: str, text: str) -> str:
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>'
        '<w:tblBorders><w:left w:val="single" w:sz="24" w:color="ED7D31"/></w:tblBorders></w:tblPr>'
        '<w:tblGrid><w:gridCol w:w="9000"/></w:tblGrid><w:tr><w:tc>'
        '<w:tcPr><w:shd w:fill="FFF2CC"/><w:tcMar><w:top w:w="120" w:type="dxa"/>'
        '<w:left w:w="160" w:type="dxa"/><w:bottom w:w="120" w:type="dxa"/>'
        '<w:right w:w="160" w:type="dxa"/></w:tcMar></w:tcPr>'
        f'{mixed_paragraph([(label + ": ", {"bold": True}), (text, {})], after=0)}</w:tc></w:tr></w:tbl>'
    )


body: list[str] = []

# Cover
body.extend([
    paragraph("NATIONAL COMMUNICATIONS AUTHORITY", bold=True, color="1F4E78", size=28,
              align="center", before=900, after=120),
    paragraph("Enterprise Governance, Risk and Compliance Platform", bold=True, size=34,
              align="center", after=300),
    paragraph("IT Division Deployment and Post-Deployment Runbook", bold=True, color="1F4E78",
              size=40, align="center", before=500, after=500),
    paragraph("Operational checklist, verification guide and handover record", italic=True,
              size=24, align="center", after=900),
    table([
        ["Document field", "Value"],
        ["Document owner", "NCA GRC Project / Application Owner"],
        ["Executing team", "NCA IT Division"],
        ["Version", "1.0"],
        ["Prepared date", date.today().strftime("%d %B %Y")],
        ["Classification", "Internal"],
        ["Target platform", "Windows Server, IIS, Node.js API and PostgreSQL"],
    ], widths=[2800, 6200]),
    paragraph("Approval", style="Heading2", before=500),
    table([
        ["Role", "Name", "Signature", "Date"],
        ["Application Owner", "", "", ""],
        ["IT Deployment Lead", "", "", ""],
        ["Information Security", "", "", ""],
        ["Business/UAT Representative", "", "", ""],
    ], widths=[2600, 2500, 2200, 1700]),
    page_break(),
])

# Purpose and outcomes
body.extend([
    heading("1. Purpose and scope"),
    paragraph(
        "This runbook tells the NCA IT Division what to do during deployment and after deployment "
        "of the NCA Enterprise GRC Platform. It is intended to be used as an execution checklist, "
        "evidence record and formal handover document."
    ),
    paragraph(
        "The target design is an intranet application in which IIS serves the static frontend over "
        "HTTPS and reverse-proxies /api requests to a Node.js service bound to 127.0.0.1:3000. "
        "PostgreSQL stores application data. The API port must not be published to users or the internet."
    ),
    heading("1.1 Expected deployment outcome", 2),
    bullet("Users access one approved HTTPS address, for example https://grc.nca.org.gh."),
    bullet("The frontend, API, database and NCA email relay operate as one supported service."),
    bullet("Application secrets and database credentials are protected and unavailable to ordinary users."),
    bullet("Only authenticated and authorised users can access protected application functions."),
    bullet("Backups, monitoring, support ownership and recovery arrangements are operational."),
    heading("1.2 Scope boundary", 2),
    paragraph(
        "This document begins at the approved deployment window. Infrastructure inputs such as the "
        "server, DNS name, TLS certificate, database, service accounts, SMTP details and backup destination "
        "should already have been provided or approved. If any mandatory input is unavailable, IT must record "
        "the item as a blocker and must not declare the service production-ready."
    ),
    note("Security rule", "Do not place passwords, JWT secrets, encryption keys or SMTP credentials in this document, email, screenshots or deployment evidence."),
    heading("1.3 Roles and responsibilities", 2),
    table([
        ["Role", "Primary responsibilities"],
        ["IT Deployment Lead", "Coordinates the change window, executes this runbook, records evidence and controls rollback."],
        ["Windows/IIS Administrator", "Configures IIS, ARR, URL Rewrite, HTTPS binding, service identity, ACLs and Windows service."],
        ["Database Administrator", "Creates/validates the production database and account, runs or supervises migrations, backup and restore tests."],
        ["Messaging Administrator", "Provides and verifies the NCA SMTP relay, sender address and service credentials."],
        ["Information Security", "Reviews exposure, TLS, account privileges, vulnerability results and exceptions."],
        ["Application Owner", "Provides the approved release and production configuration inputs; accepts technical handover."],
        ["Business/UAT Representatives", "Validate critical business workflows and approve operational use."],
    ], widths=[2500, 6500]),
    page_break(),
])

# During deployment
body.extend([
    heading("2. Activities during deployment"),
    paragraph(
        "Execute the following activities in order. The IT Deployment Lead should tick each item, record "
        "the result, and retain the evidence identified in Section 4."
    ),
    heading("2.1 Open and control the deployment window", 2),
    checklist("Confirm the approved change ticket, deployment date, authorised release version, implementers and business contact."),
    checklist("Confirm that a rollback decision-maker is available throughout the deployment window."),
    checklist("Record the pre-deployment state of the server, IIS site, Windows services and database."),
    checklist("If replacing an existing system, take a verified pre-change database backup and preserve the previous application package and configuration securely."),
    checklist("Restrict deployment access to authorised IT personnel."),
    paragraph("Completion evidence: change-ticket reference, attendee list, timestamp and pre-change backup identifier.", italic=True),

    heading("2.2 Validate server prerequisites", 2),
    checklist("Confirm the Windows Server is supported, patched and joined to the approved NCA management and monitoring environment."),
    checklist("Confirm IIS is installed with URL Rewrite and Application Request Routing (ARR), and that ARR proxying is enabled."),
    checklist("Confirm an approved Node.js LTS release (version 20 or newer) is installed and available to the service account."),
    checklist("Confirm PostgreSQL 16 client tools are installed for migrations, backup and restore operations."),
    checklist("Confirm NSSM, or another NCA-approved service wrapper, is available for operating the Node.js API as a Windows service."),
    checklist("Confirm host firewall rules expose only the approved HTTPS service; do not expose TCP port 3000 externally."),
    checklist("Confirm sufficient disk space exists for the application, logs, temporary uploads and database backups."),
    paragraph("Completion evidence: prerequisite/version output and firewall or network-rule reference.", italic=True),

    heading("2.3 Deploy the approved application package", 2),
    checklist("Verify the release package source and checksum/version against the release approved by the Application Owner."),
    checklist("Copy the maintained source to a protected application directory on the production server."),
    checklist("Exclude test archives, local development databases, temporary files and development logs from the production package."),
    checklist("From the backend directory, install locked production dependencies with: npm ci --omit=dev"),
    checklist("Confirm npm completes without installation errors and retain the installation log."),
    checklist("Do not alter application source code directly on the production server."),
    paragraph("Completion evidence: release version/checksum, destination path and successful dependency-install log.", italic=True),

    heading("2.4 Create and protect the production configuration", 2),
    checklist("Copy backend/.env.production.example to backend/.env on the server."),
    checklist("Set NODE_ENV=production and API_HOST=127.0.0.1."),
    checklist("Enter the approved database host, port, database name and dedicated least-privilege database account."),
    checklist("Enable DB_SSL=true when PostgreSQL is hosted remotely and install the approved database CA certificate where required."),
    checklist("Generate and configure two different high-entropy values for JWT_SECRET and COMMUNICATION_ENCRYPTION_KEY; each must contain at least 32 characters."),
    checklist("Set FRONTEND_URL and CORS_ORIGINS to the exact approved HTTPS address. Do not use wildcards."),
    checklist("Enter the approved NCA SMTP host, port, service account and @nca.org.gh sender address."),
    checklist("Keep TLS certificate validation enabled. A self-signed exception requires written approval from NCA ICT/Information Security."),
    checklist("Leave DEFAULT_TEMP_PASSWORD and TEST_USER_PASSWORD blank."),
    checklist("Set DISABLE_COMMUNICATION_WORKER=false so queued notifications are processed."),
    checklist("Restrict backend/.env ACLs to Administrators and the dedicated API service account only."),
    checklist("Confirm the environment file is excluded from source control, ordinary file shares and backup reports containing readable secrets."),
    paragraph("Completion evidence: redacted configuration checklist and ACL screenshot/output. Never capture secret values.", italic=True),

    heading("2.5 Prepare and migrate the production database", 2),
    checklist("Confirm the target is the intended production database before running any command."),
    checklist("Confirm the application database account has only the privileges required by the application and migration process."),
    checklist("If upgrading an existing deployment, take and verify a current database backup immediately before migration."),
    checklist("From backend, run: npm run migrate"),
    checklist("Review the migration output and confirm all migration files complete successfully."),
    checklist("Do not manually mark a failed migration as successful. Stop, investigate and invoke rollback if data integrity is uncertain."),
    checklist("Confirm the database is not reachable from unauthorised networks or user workstations."),
    paragraph("Completion evidence: database name, backup identifier, migration log and applied-migration count.", italic=True),

    heading("2.6 Install and configure the API Windows service", 2),
    checklist("Run the supplied installation script with the approved NSSM path: .\\scripts\\install-production-service.ps1 -NssmPath '<approved NSSM path>'"),
    checklist("Open Windows Services and assign the approved dedicated NCA service account to NcaGrcApi."),
    checklist("Grant that account read access to the application and backend/.env, and write access only to the approved log/working directories."),
    checklist("Apply the service-account password securely and confirm the account has Log on as a service rights."),
    checklist("Confirm the service is set to start automatically and restart after an unexpected exit."),
    checklist("Start NcaGrcApi and confirm it remains in the Running state."),
    checklist("Confirm the API listens only on 127.0.0.1:3000."),
    checklist("Review api.out.log and api.err.log for startup, database, migration, encryption or email-worker errors."),
    paragraph("Completion evidence: service configuration, running status, listening address and clean startup-log excerpt.", italic=True),

    heading("2.7 Configure IIS, reverse proxy and HTTPS", 2),
    checklist("Create the IIS site with its physical path set to the deployed frontend directory."),
    checklist("Use the included frontend/web.config; confirm it rewrites /api requests to http://127.0.0.1:3000/api."),
    checklist("Enable ARR proxying and confirm URL Rewrite is active."),
    checklist("Bind the site to the approved internal DNS name using HTTPS and the approved TLS certificate."),
    checklist("Remove or disable unintended HTTP bindings, default sites and alternate host-header access, according to NCA policy."),
    checklist("Confirm the certificate chain is trusted, the hostname matches, and the certificate is not near expiry."),
    checklist("Confirm security headers are returned, including HSTS, Content-Security-Policy, X-Content-Type-Options, Referrer-Policy and Permissions-Policy."),
    checklist("Confirm hidden files and backend files cannot be downloaded through IIS."),
    checklist("Confirm request-size limits support approved work-plan/tracker uploads without exceeding the configured 12 MB limit."),
    paragraph("Completion evidence: IIS site/binding summary, certificate details, proxy test and security-header output.", italic=True),

    heading("2.8 Configure DNS and network access", 2),
    checklist("Create or activate the approved internal DNS record and verify it resolves to the intended server from an authorised user network."),
    checklist("Confirm HTTPS is reachable from intended NCA networks and blocked from networks that are outside the approved scope."),
    checklist("Confirm ports 3000 and 5432 are not exposed to general users or the internet."),
    checklist("If load balancers or additional proxies are used, validate TRUST_PROXY_HOPS and preserve the real client address securely."),
    paragraph("Completion evidence: DNS resolution, connectivity result and approved firewall/change references.", italic=True),

    heading("2.9 Verify email integration", 2),
    checklist("Confirm the SMTP service account and approved sender address are active."),
    checklist("Confirm the server can reach the approved SMTP host and port."),
    checklist("Run the full readiness check without suppressing email verification: npm run readiness"),
    checklist("Verify that the result reports ready: true, environment: production, all migrations applied and smtp: verified."),
    checklist("Send a controlled test notification to an authorised @nca.org.gh test recipient and confirm delivery."),
    checklist("Confirm recipients outside @nca.org.gh are rejected and no personal mailbox credentials are used."),
    paragraph("Completion evidence: readiness output with secrets redacted and controlled mail-delivery confirmation.", italic=True),

    heading("2.10 Execute technical go-live checks", 2),
    checklist("Run: .\\scripts\\production-health-check.ps1 -ApplicationUrl 'https://<approved-hostname>'"),
    checklist("Confirm the frontend returns HTTP 200."),
    checklist("Confirm /api/health reports success and healthy status."),
    checklist("Confirm an unauthenticated request to /api/risks returns HTTP 401."),
    checklist("Sign in with an authorised controlled account and confirm the expected role and scope are applied."),
    checklist("Confirm no credentials, stack traces, database errors or internal paths are displayed to the browser."),
    checklist("Review Windows Event Logs, IIS logs, API logs and database logs for deployment-time errors."),
    note("Go-live gate", "Do not declare deployment successful unless the production readiness check and technical health check both pass."),
    page_break(),
])

# Post deployment
body.extend([
    heading("3. Activities after deployment"),
    paragraph(
        "These activities begin immediately after technical deployment and continue through the agreed "
        "stabilisation period. The service should remain under enhanced monitoring until the Application "
        "Owner and IT Deployment Lead formally accept it."
    ),
    heading("3.1 Immediate business smoke testing", 2),
    checklist("Coordinate controlled smoke testing with the Application Owner and nominated UAT representatives."),
    checklist("Validate login, logout, password change/reset and account-lockout behaviour."),
    checklist("Create and review a manual risk through the intended approval path."),
    checklist("Upload an approved sample work plan and validate assessment/review behaviour."),
    checklist("Upload an approved tracker sample and validate treatment/action updates."),
    checklist("Validate Focal Person, Champion, Chairman and executive access according to approved roles."),
    checklist("Confirm treatment plans, evidence, alerts, audit history, dashboards and reports display correctly."),
    checklist("Confirm test notifications are delivered and recorded."),
    checklist("Record defects, severity, owner and disposition. Critical defects must block go-live."),
    paragraph("Completion evidence: signed smoke/UAT results and defect register.", italic=True),

    heading("3.2 Security verification", 2),
    checklist("Run the NCA-approved vulnerability scan against the deployed application and server."),
    checklist("Review application dependencies and record the disposition of every material finding."),
    checklist("Confirm TLS configuration meets NCA policy and no insecure protocols or ciphers are enabled."),
    checklist("Confirm least-privilege access for the API service, database account, deployment administrators and backup operators."),
    checklist("Confirm production secrets are not present in logs, browser responses, source repositories or deployment evidence."),
    checklist("Confirm audit events are created for authentication, administrative and risk-governance actions."),
    checklist("Document risk acceptance or exceptions with owner, justification, compensating control and expiry date."),
    paragraph("Completion evidence: security scan report, remediation record and approved exceptions.", italic=True),

    heading("3.3 Backup and recovery verification", 2),
    checklist("Configure the supplied backup script as a protected scheduled task under the approved backup account."),
    checklist("Use the approved protected destination and retention period."),
    checklist("Run the first production backup and confirm both the PostgreSQL custom-format backup and SHA-256 checksum are produced."),
    checklist("Confirm backup files are inaccessible to ordinary users and replicated off the application server where required."),
    checklist("Restore the backup into a separate non-production database. Never test restoration over the live database."),
    checklist("Validate the restored database and record the achieved recovery time and any issues."),
    checklist("Configure alerts for failed or missing scheduled backups."),
    paragraph("Completion evidence: backup ID/checksum, scheduled-task result and signed non-production restore-test report.", italic=True),

    heading("3.4 Monitoring and operational support", 2),
    checklist("Add the HTTPS application URL and /api/health endpoint to approved monitoring."),
    checklist("Monitor NcaGrcApi service state, API error log, IIS errors, database availability, disk space and certificate expiry."),
    checklist("Monitor email queue depth and investigate thresholds or repeated delivery failures."),
    checklist("Configure actionable alerts with the correct IT support group and escalation path."),
    checklist("Confirm application and infrastructure logs have approved retention, access controls and time synchronisation."),
    checklist("Observe the service under enhanced monitoring for the agreed stabilisation period."),
    checklist("Record baseline response times and investigate material degradation."),
    paragraph("Completion evidence: monitoring objects, test alerts, recipient list and stabilisation report.", italic=True),

    heading("3.5 Production data hygiene", 2),
    checklist("Remove deployment/UAT test accounts that are not approved production users."),
    checklist("Remove test risks, work plans, tracker records, notifications and other test data after business confirmation."),
    checklist("Confirm no shared default password is configured."),
    checklist("Confirm temporary credentials are individually generated and delivered using the approved secure process."),
    checklist("Reconcile the initial production user list, roles, divisions and approval responsibilities with the authorised list."),
    paragraph("Completion evidence: approved user reconciliation and test-data removal confirmation.", italic=True),

    heading("3.6 Documentation, handover and closure", 2),
    checklist("Record the final application path, URL, service name, database name, log locations and backup task."),
    checklist("Record the application owner, database owner, service-account owner, messaging owner and support escalation contacts."),
    checklist("Store operational documents and credentials in approved repositories; do not include credentials in the runbook."),
    checklist("Provide IT support with restart, health-check, log-review, backup and escalation procedures."),
    checklist("Record certificate, service-account and secret-rotation renewal dates."),
    checklist("Obtain technical acceptance from IT, security acceptance, UAT acceptance and Application Owner approval."),
    checklist("Close the change only after evidence is attached and outstanding non-blocking actions have owners and due dates."),
    paragraph("Completion evidence: completed Section 5 handover record and signed Section 6 acceptance.", italic=True),
    page_break(),
])

# Evidence and acceptance
body.extend([
    heading("4. Required deployment evidence"),
    table([
        ["Evidence item", "Minimum record", "Owner", "Status/reference"],
        ["Approved release", "Version or checksum and source", "Application Owner / IT", ""],
        ["Change control", "Approved ticket and deployment window", "IT Deployment Lead", ""],
        ["Server prerequisites", "Version and configuration outputs", "Windows Administrator", ""],
        ["Configuration security", "Redacted checklist and .env ACLs", "Windows Administrator / Security", ""],
        ["Database migration", "Backup ID and successful migration output", "Database Administrator", ""],
        ["API service", "Service identity, running state and startup log", "Windows Administrator", ""],
        ["IIS and TLS", "Bindings, certificate and proxy result", "IIS Administrator", ""],
        ["Readiness check", "Production, migrations complete, SMTP verified", "IT Deployment Lead", ""],
        ["Health check", "Frontend 200, API healthy, protected route 401", "IT Deployment Lead", ""],
        ["Business smoke test", "Signed workflow results and defects", "Business/UAT Lead", ""],
        ["Security review", "Scan, remediation and exceptions", "Information Security", ""],
        ["Backup restore", "Backup checksum and restore-test report", "Database/Backup Administrator", ""],
        ["Monitoring", "Monitors, alert test and escalation list", "IT Operations", ""],
        ["Handover", "Owners, locations, renewals and support procedure", "IT Operations / App Owner", ""],
    ], widths=[1900, 3800, 1900, 1400]),

    heading("5. Operational handover record"),
    table([
        ["Item", "Production value/reference (no passwords)"],
        ["Application URL", ""],
        ["Application server", ""],
        ["Application installation path", ""],
        ["Windows service name", "NcaGrcApi"],
        ["Service-account owner/reference", ""],
        ["IIS site and application pool", ""],
        ["TLS certificate identifier and expiry", ""],
        ["Production database/server", ""],
        ["Database-account owner/reference", ""],
        ["SMTP relay and sender address", ""],
        ["API log location", ".local\\production-logs"],
        ["IIS log location", ""],
        ["Backup task and destination reference", ""],
        ["Backup retention", ""],
        ["Monitoring dashboard/reference", ""],
        ["Primary support group", ""],
        ["Escalation contacts", ""],
        ["Stabilisation period end date", ""],
    ], widths=[3600, 5400]),

    heading("6. Go-live acceptance"),
    paragraph("All mandatory statements below must be confirmed before production acceptance."),
    checklist("The approved release is installed and the production configuration is protected."),
    checklist("The database migration completed successfully and a recoverable backup exists."),
    checklist("The API service, IIS reverse proxy, HTTPS, DNS and SMTP integration are operational."),
    checklist("The production readiness check reports ready: true, environment: production and smtp: verified."),
    checklist("The health check confirms frontend HTTP 200, healthy API/database and HTTP 401 for unauthenticated protected access."),
    checklist("Critical business workflows have passed controlled smoke/UAT testing."),
    checklist("No unresolved Critical or High security issue remains unless formally accepted by authorised management."),
    checklist("A production backup has been restored successfully into a separate non-production database."),
    checklist("Monitoring, alerting, support ownership and escalation are active."),
    checklist("Test accounts and data have been removed or explicitly approved."),
    table([
        ["Decision", "Select one", "Comments/reference"],
        ["Accepted for production use", "☐", ""],
        ["Conditionally accepted", "☐", ""],
        ["Rejected / rollback required", "☐", ""],
    ], widths=[3200, 1500, 4300]),
    paragraph("Final acceptance signatures", style="Heading2", before=300),
    table([
        ["Role", "Name", "Signature", "Date"],
        ["IT Deployment Lead", "", "", ""],
        ["Information Security", "", "", ""],
        ["Business/UAT Representative", "", "", ""],
        ["Application Owner", "", "", ""],
    ], widths=[2600, 2500, 2200, 1700]),
    page_break(),
])

# Rollback
body.extend([
    heading("7. Rollback and escalation"),
    heading("7.1 Rollback triggers", 2),
    bullet("Database migration failure or uncertainty about data integrity."),
    bullet("API service cannot start reliably or cannot connect to the production database."),
    bullet("HTTPS, authentication or authorisation controls fail."),
    bullet("Critical business workflow fails and no approved workaround exists."),
    bullet("A Critical/High security exposure is introduced."),
    bullet("Material data corruption, loss or unintended disclosure occurs."),
    bullet("The approved change window expires before validation is complete."),
    heading("7.2 Rollback procedure", 2),
    checklist("Stop user access through IIS and notify the change owner and Application Owner."),
    checklist("Stop NcaGrcApi to prevent further writes."),
    checklist("Preserve relevant logs and evidence; do not delete the failed deployment state before investigation."),
    checklist("Restore the previous approved application package and configuration using the controlled copy."),
    checklist("Where database rollback is required, the Database Administrator must use the approved restore process and exact target confirmation. Never improvise destructive database commands."),
    checklist("Start the previous service/site and run its health checks."),
    checklist("Notify stakeholders of the result, record the incident/problem reference and update the change ticket."),
    note("Rollback authority", "A database restoration or destructive corrective action must be authorised and executed by the responsible IT/Database Administrator under NCA change-control procedures."),

    heading("8. Command reference"),
    paragraph("Run commands from the maintained project directory using an authorised administrative session only where required."),
    table([
        ["Purpose", "Command"],
        ["Install production dependencies", "From backend: npm ci --omit=dev"],
        ["Run automated tests", "From backend: npm test"],
        ["Apply database migrations", "From backend: npm run migrate"],
        ["Run full production readiness", "From backend: npm run readiness"],
        ["Install API service", ".\\scripts\\install-production-service.ps1 -NssmPath '<approved NSSM path>'"],
        ["Run production health check", ".\\scripts\\production-health-check.ps1 -ApplicationUrl 'https://<approved-hostname>'"],
        ["Create a database backup", ".\\scripts\\backup-production-database.ps1 -BackupDirectory '<approved path>' -RetentionDays <approved days>"],
        ["Restore to a non-production test DB", "Use .\\scripts\\restore-production-database.ps1 with the backup file, separate target database and exact confirmation value."],
    ], widths=[3000, 6000]),
    note("Important", "Do not use --skip-email for final production readiness. Do not paste secret values into command logs or tickets."),

    heading("9. Outstanding actions and exceptions"),
    table([
        ["ID", "Action/exception", "Risk/impact", "Owner", "Due date", "Status"],
        ["1", "", "", "", "", ""],
        ["2", "", "", "", "", ""],
        ["3", "", "", "", "", ""],
        ["4", "", "", "", "", ""],
        ["5", "", "", "", "", ""],
    ], widths=[500, 2600, 1900, 1500, 1200, 1300]),
])


styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="100" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="180"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:color w:val="1F4E78"/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>
    <w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="260" w:after="120"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:b/><w:color w:val="2F5597"/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Checklist">
    <w:name w:val="Checklist"/><w:basedOn w:val="Normal"/>
    <w:pPr><w:spacing w:after="70"/></w:pPr>
  </w:style>
</w:styles>
"""

header = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>
    <w:r><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr>
      <w:t>NCA GRC — IT Deployment Runbook | Internal</w:t></w:r>
  </w:p>
</w:hdr>
"""

footer = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="80" w:after="0"/></w:pPr>
    <w:r><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr><w:t>Page </w:t></w:r>
    <w:fldSimple w:instr="PAGE"><w:r><w:rPr><w:color w:val="7F7F7F"/><w:sz w:val="18"/></w:rPr><w:t>1</w:t></w:r></w:fldSimple>
  </w:p>
</w:ftr>
"""

document = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    {''.join(body)}
    <w:sectPr>
      <w:headerReference w:type="default" r:id="rId2"/>
      <w:footerReference w:type="default" r:id="rId3"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="600" w:footer="600" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>
"""

content_types = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
"""

package_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"""

document_rels = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>
"""

core = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>NCA GRC IT Deployment and Post-Deployment Runbook</dc:title>
  <dc:subject>Production deployment, validation, handover and acceptance checklist</dc:subject>
  <dc:creator>OpenAI Codex for NCA GRC Project</dc:creator>
  <cp:keywords>NCA; GRC; deployment; IT; runbook; PostgreSQL; IIS; Node.js</cp:keywords>
  <dcterms:created xsi:type="dcterms:W3CDTF">{date.today().isoformat()}T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">{date.today().isoformat()}T00:00:00Z</dcterms:modified>
</cp:coreProperties>
"""

app = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office Word</Application>
  <AppVersion>16.0000</AppVersion>
</Properties>
"""

with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as package:
    package.writestr("[Content_Types].xml", content_types)
    package.writestr("_rels/.rels", package_rels)
    package.writestr("word/document.xml", document)
    package.writestr("word/styles.xml", styles)
    package.writestr("word/header1.xml", header)
    package.writestr("word/footer1.xml", footer)
    package.writestr("word/_rels/document.xml.rels", document_rels)
    package.writestr("docProps/core.xml", core)
    package.writestr("docProps/app.xml", app)

print(OUTPUT)

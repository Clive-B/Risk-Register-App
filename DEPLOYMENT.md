# NCA GRC intranet deployment

This package is prepared for an IIS-fronted Windows intranet deployment. IIS serves the static frontend over HTTPS and proxies `/api` to the Node.js API bound only to `127.0.0.1:3000`.

## Information required from NCA ICT

- Internal DNS name, for example `grc.nca.org.gh`
- IIS TLS certificate for that name
- PostgreSQL server, production database and dedicated least-privilege account
- PostgreSQL CA certificate when the database is remote
- NCA corporate mail hostname, port, STARTTLS/TLS mode and either a dedicated service account or approved application-server relay
- Approved sender address such as `no-reply@nca.org.gh`
- Dedicated Windows service account for the API
- Protected backup destination and retention requirement

Do not guess the SMTP hostname or reuse a personal mailbox password. All application user accounts and queued recipients are restricted to `@nca.org.gh`.

## Server prerequisites

- Supported Windows Server with current security updates
- IIS, URL Rewrite and Application Request Routing (ARR) with proxying enabled
- Node.js 20 LTS or newer
- PostgreSQL 16 client tools
- NSSM approved by NCA ICT for running Node.js as a Windows service

## Installation

1. Copy the maintained source to a protected application directory.
2. Run `npm ci --omit=dev` in `backend`.
3. Copy `backend/.env.production.example` to `backend/.env`.
4. Populate `.env` with NCA-issued values. Restrict the file ACL to administrators and the API service account.
5. Run `npm test`.
6. Run `npm run migrate` against the new production database.
7. Run `npm run readiness`; this checks production settings, the database, migrations and performs a real connection/authentication check against the NCA mail server. Do not proceed if the result is anything other than `"smtp": "verified"`.
8. Install the API service:

   ```powershell
   .\scripts\install-production-service.ps1 -NssmPath 'C:\Tools\nssm\nssm.exe'
   ```

9. Assign the approved NCA service account in Windows Services and start `NcaGrcApi`.
10. Create an IIS site whose physical path is the repository's `frontend` directory.
11. Bind only HTTPS to the NCA DNS name. Do not publish port 3000.
12. Enable ARR proxying. The included `frontend/web.config` proxies `/api` to the local API.
13. Run:

   ```powershell
   .\scripts\production-health-check.ps1 -ApplicationUrl 'https://grc.nca.org.gh'
   ```

## NCA email configuration

Use the values supplied by NCA ICT:

- `SMTP_HOST`: internal NCA SMTP relay or mail server
- `SMTP_PORT`: normally 587 for STARTTLS or the value supplied by ICT
- `SMTP_USER`: dedicated NCA GRC service account; leave blank only for an IT-approved IP/server relay
- `SMTP_PASSWORD`: protected service-account secret; it must be supplied whenever `SMTP_USER` is supplied
- `SMTP_FROM`: `NCA GRC <no-reply@nca.org.gh>` or the approved NCA address
- `SMTP_SECURE=false` for STARTTLS; set `true` only when ICT specifies implicit TLS

TLS certificate validation remains enabled. `SMTP_ALLOW_SELF_SIGNED=true` requires a documented NCA ICT exception.

The maintained application supports authenticated SMTP using a dedicated account and unauthenticated SMTP through an NCA-approved relay. It does not currently implement Microsoft OAuth 2.0 or Graph mail sending. If NCA IT requires OAuth/Graph rather than SMTP, that is a pre-deployment development dependency.

After the service starts, sign in as System Administrator and open **Administration · Communication Centre → SMTP Settings**. The status must initially be **Not Tested**. Use an approved `@nca.org.gh` test recipient and select **Verify and Send Test**. A passing result means the server accepted the message; IT must still confirm that it arrived in Outlook and was not quarantined.

Complete the mail acceptance steps in [NCA_IT_MAIL_DEPLOYMENT.md](NCA_IT_MAIL_DEPLOYMENT.md) before go-live.

## Backup and recovery

Create a scheduled task under a protected backup account. Supply database credentials as protected task environment variables and run:

```powershell
.\scripts\backup-production-database.ps1 -BackupDirectory 'E:\NcaGrcBackups' -RetentionDays 30
```

The script creates a PostgreSQL custom-format backup and a SHA-256 checksum. NCA ICT should also replicate the backup off the application server.

Test restoration into a non-production database before go-live:

```powershell
.\scripts\restore-production-database.ps1 `
  -BackupFile 'E:\NcaGrcBackups\nca_grc-YYYYMMDD-HHMMSS.dump' `
  -TargetDatabase 'nca_grc_restore_test' `
  -Confirmation 'RESTORE nca_grc_restore_test'
```

Never test restoration over the live database.

## Go-live controls

- Complete Focal Person, Champion and Chairman UAT for manual risks, work-plan uploads and tracker uploads.
- Confirm treatment plans, evidence, alerts, audit history and reports.
- Remove test accounts and test data from the production database.
- Run the NCA vulnerability scan and record the mitigation for any dependency finding.
- Verify a backup and non-production restore.
- Record the application owner, database owner, service-account owner and support escalation contacts.

[CmdletBinding()]
param(
    [string]$TemplatePath,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $TemplatePath) { $TemplatePath = Join-Path $root 'NCA_GRC_IT_Deployment_Information_Request_CORRECTED.docx' }
if (-not $OutputPath) { $OutputPath = Join-Path $root 'NCA_GRC_Administrator_User_Account_Provisioning_Requirements.docx' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Xml([string]$Value) {
    return [System.Security.SecurityElement]::Escape($Value)
}

function Paragraph([string]$Text, [string]$Style = 'Normal') {
    $safe = Escape-Xml $Text
    return "<w:p><w:pPr><w:pStyle w:val=`"$Style`"/></w:pPr><w:r><w:t xml:space=`"preserve`">$safe</w:t></w:r></w:p>"
}

function Bullet([string]$Text) {
    return Paragraph ("- " + $Text) 'Normal'
}

function PageBreak {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function Table([array]$Rows, [array]$Widths = @(2200, 4300, 2900)) {
    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append('<w:tbl><w:tblPr><w:tblStyle w:val="NcaTable"/><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>')
    foreach ($width in $Widths) { [void]$builder.Append("<w:gridCol w:w=`"$width`"/>") }
    [void]$builder.Append('</w:tblGrid>')
    for ($rowIndex = 0; $rowIndex -lt $Rows.Count; $rowIndex++) {
        [void]$builder.Append('<w:tr>')
        $row = $Rows[$rowIndex]
        for ($columnIndex = 0; $columnIndex -lt $Widths.Count; $columnIndex++) {
            $value = if ($columnIndex -lt $row.Count) { [string]$row[$columnIndex] } else { '' }
            $safe = Escape-Xml $value
            $shade = if ($rowIndex -eq 0) { '<w:shd w:fill="003A70"/>' } else { '' }
            $header = if ($rowIndex -eq 0) { '<w:color w:val="FFFFFF"/><w:b/>' } else { '' }
            [void]$builder.Append("<w:tc><w:tcPr><w:tcW w:w=`"$($Widths[$columnIndex])`" w:type=`"dxa`"/>$shade</w:tcPr><w:p><w:r><w:rPr>$header</w:rPr><w:t xml:space=`"preserve`">$safe</w:t></w:r></w:p></w:tc>")
        }
        [void]$builder.Append('</w:tr>')
    }
    [void]$builder.Append('</w:tbl>')
    return $builder.ToString()
}

$body = [System.Text.StringBuilder]::new()
[void]$body.Append((Paragraph 'NCA Enterprise GRC Platform' 'Title'))
[void]$body.Append((Paragraph 'Administrator User Account Provisioning Requirements' 'Subtitle'))
[void]$body.Append((Paragraph 'Prepared for: NCA Information Technology Division' 'Normal'))
[void]$body.Append((Paragraph ("Date issued: {0}" -f (Get-Date -Format 'dd MMMM yyyy')) 'Normal'))

[void]$body.Append((Paragraph 'Executive conclusion' 'Heading1'))
[void]$body.Append((Paragraph 'The application already supports governed creation of individual and bulk user accounts by authenticated System Administrators. Production use depends on a working PostgreSQL database, a verified NCA SMTP service, an approved production System Administrator, HTTPS hosting, protected secrets and agreed operational controls.' 'Normal'))
[void]$body.Append((Paragraph 'Current verification status' 'Heading2'))
[void]$body.Append((Paragraph 'The source review and automated test suite completed successfully with 100 tests passed and no failures. Live readiness is not yet proven in the present local environment because PostgreSQL at 127.0.0.1:55432 refused the connection. SMTP and end-to-end first-login activation therefore remain production acceptance items.' 'Callout'))

[void]$body.Append((Paragraph '1. How the administrator creates accounts' 'Heading1'))
@(
    'The administrator signs in with an active account whose role is exactly System Administrator.',
    'For one account, the administrator opens User Management, selects Add User, completes the required fields and saves the account.',
    'For multiple accounts, the administrator selects Enter Multiple Users, enters rows manually or uploads the approved Excel workbook.',
    'The application validates and normalises the proposed records. Every bulk row must be valid and explicitly confirmed before any account is created.',
    'The application generates a unique temporary password, stores only its bcrypt hash, marks the account Pending Activation and queues a welcome email.',
    'At first login, the user is restricted to changing the temporary password. Successful password change activates the account and revokes the temporary session.',
    'The administrator can subsequently edit, deactivate, lock, unlock, reset, resend the welcome email, generate a new temporary password and inspect audit history.'
) | ForEach-Object { [void]$body.Append((Bullet $_)) }

[void]$body.Append((Paragraph '2. Information required for every new user' 'Heading1'))
[void]$body.Append((Table @(
    @('Field', 'Requirement', 'Validation or decision'),
    @('Full name', 'Required', "Employee's approved full name."),
    @('Official email', 'Required', 'Unique address ending in @nca.org.gh.'),
    @('Role', 'Required', 'Must be one of the four approved application roles.'),
    @('Division', 'Conditional', 'Required for Risk Champion and Risk Focal Person; blank for global roles.'),
    @('Staff ID', 'Optional', 'If supplied, unique and no more than 50 characters. Blank values remain blank.'),
    @('Position/job title', 'Optional', 'Business-approved designation.'),
    @('Phone number', 'Optional', 'If supplied, exactly 10 digits with an approved Ghana mobile prefix.'),
    @('Account status', 'Optional', 'Defaults to Active. Bulk creation accepts Active or Inactive.')
)))

[void]$body.Append((Paragraph 'Approved role and access scope' 'Heading2'))
[void]$body.Append((Table @(
    @('Role', 'Scope', 'Division assignment'),
    @('System Administrator', 'Global administrative access', 'All Divisions; division remains blank.'),
    @('Risk Committee Chairman', 'Global governance access', 'All Divisions; division remains blank.'),
    @('Risk Champion', 'Divisional governance access', 'Approved division is mandatory.'),
    @('Risk Focal Person', 'Divisional risk-entry access', 'Approved division is mandatory.')
)))

[void]$body.Append((Paragraph 'Approved divisions' 'Heading2'))
[void]$body.Append((Paragraph 'RIPS; Legal; Regulatory Administration; Consumer Affairs; Corporate Affairs; Finance; Engineering; Information Technology; Procurement and Protocol; Internal Audit; Human Resource; ROD; Administration; Cybersecurity; International Affairs.' 'Normal'))
[void]$body.Append((Paragraph 'Approved phone prefixes' 'Heading2'))
[void]$body.Append((Paragraph '020, 024, 025, 026, 027, 050, 053, 054, 055, 056, 057 and 059.' 'Normal'))

[void]$body.Append((Paragraph '3. Bulk-account requirements' 'Heading1'))
[void]$body.Append((Table @(
    @('Item', 'Application rule', 'IT/business action'),
    @('Approved format', '.xlsx or .xls workbook.', 'Distribute only the governed NCA bulk-user template.'),
    @('Maximum file size', '8 MB.', 'Ensure reverse proxy and security controls permit the configured 12 MB JSON request limit.'),
    @('Maximum batch size', '500 users.', 'Split larger onboarding exercises into governed batches.'),
    @('Required workbook headers', 'Full Name and Official Email Address must be detectable.', 'Keep the approved template headers unchanged.'),
    @('Duplicate controls', 'Duplicate emails and supplied Staff IDs are rejected within the batch and against existing accounts.', 'Clean and approve source data before upload.'),
    @('Confirmation', 'Every row must be valid and explicitly confirmed.', 'Assign an accountable System Administrator to review proposed corrections.'),
    @('Audit record', 'Original, proposed and confirmed values are retained in the audit trail.', 'Define audit retention and review responsibilities.')
)))

[void]$body.Append((PageBreak))
[void]$body.Append((Paragraph '4. IT infrastructure and configuration requirements' 'Heading1'))
[void]$body.Append((Table @(
    @('Area', 'IT must provide', 'Acceptance evidence'),
    @('Initial administrator', 'Approved owner of the first production System Administrator account and an emergency recovery arrangement.', 'Named owner, approved official email and controlled provisioning record.'),
    @('Windows hosting', 'Patched supported Windows Server, IIS, URL Rewrite, ARR, approved service runner and dedicated Windows service account.', 'Service starts automatically and runs under the approved account.'),
    @('DNS and HTTPS', 'Internal DNS name, valid TLS certificate and HTTPS-only IIS binding.', 'Users reach the approved URL without certificate warnings.'),
    @('API exposure', 'Reverse proxy /api to the Node.js API on 127.0.0.1:3000. Do not publish port 3000.', 'External scan confirms only approved HTTPS exposure.'),
    @('Node.js', 'Node.js 20 LTS or a newer approved supported release.', 'Version and support approval recorded.'),
    @('PostgreSQL', 'Production database, dedicated least-privilege account, network route and PostgreSQL client tools.', 'Connection succeeds and all migrations through 047 are applied.'),
    @('Database TLS', 'TLS and trusted PostgreSQL CA certificate when the database is remote.', 'Encrypted connection verified without disabling certificate validation.'),
    @('Secrets', 'Protected DB password, JWT secret and separate communication-encryption key of at least 32 random characters.', 'Secret-entry method and restricted file ACL evidenced.'),
    @('Application URL/CORS', 'HTTPS FRONTEND_URL and explicit matching HTTPS CORS_ORIGINS.', 'Readiness validation passes.'),
    @('Backups', 'Protected backup location, retention policy, scheduled job and off-server replication.', 'Successful backup plus non-production restore evidence.'),
    @('Monitoring', 'Monitoring for service, IIS, database, storage and failed/exhausted email queue.', 'Named alert recipients and tested escalation route.')
)))

[void]$body.Append((Paragraph '5. NCA corporate email requirements' 'Heading1'))
[void]$body.Append((Paragraph 'Working email is a functional onboarding dependency because the temporary password is not displayed to the administrator or returned by the account-creation API. If delivery fails, the account remains created, but the user cannot obtain the initial credential until the administrator successfully resends or generates another temporary password.' 'Callout'))
[void]$body.Append((Table @(
    @('Mail requirement', 'IT response required', 'Acceptance condition'),
    @('Connection method', 'Select approved NCA relay or dedicated authenticated SMTP account.', 'Selected method documented; personal mailbox credentials are prohibited.'),
    @('Host and port', 'Provide SMTP hostname and port.', 'Application server reaches the host and port through the firewall.'),
    @('Encryption', 'Specify STARTTLS or implicit TLS.', 'TLS 1.2 or later verifies with a trusted certificate.'),
    @('Authentication', 'For authenticated SMTP, supply both service username and password securely. For relay, approve and allowlist the application-server IP.', 'SMTP transport verification succeeds.'),
    @('Sender', 'Approve an @nca.org.gh sender address and display name.', 'Application rejects non-NCA sender configuration.'),
    @('Recipient policy', 'Permit delivery to official @nca.org.gh recipients.', 'Test messages arrive in Outlook and are not quarantined.'),
    @('Communication worker', 'Keep DISABLE_COMMUNICATION_WORKER=false and approve queue interval/batch settings.', 'Queued welcome emails progress to Sent.'),
    @('Encrypted settings', 'Back up and protect COMMUNICATION_ENCRYPTION_KEY.', 'Key recovery is documented; unauthorised access is prevented.'),
    @('Unsupported method', 'Confirm SMTP is permitted.', 'Microsoft Graph/OAuth is not implemented and requires separate development if mandated.')
)))

[void]$body.Append((Paragraph '6. Security and operational controls' 'Heading1'))
@(
    'Do not configure or distribute a shared default temporary password. The application generates a unique password per account.',
    'Restrict User Management, SMTP Settings and account administration to authorised System Administrators.',
    'Approve password length, history, expiry, lockout threshold, lockout duration and session durations.',
    'Establish joiner, mover and leaver procedures, including role approval, division reassignment and prompt deactivation.',
    'Define identity verification for administrator-assisted password resets.',
    'Schedule administrator and privileged-access reviews.',
    'Define audit-log retention, review ownership and any SIEM forwarding requirement.',
    'Record application, database, service-account, mail and security escalation owners.'
) | ForEach-Object { [void]$body.Append((Bullet $_)) }

[void]$body.Append((Paragraph '7. Identified implementation gap requiring closure' 'Heading1'))
[void]$body.Append((Paragraph 'The deployment documentation assumes a System Administrator can already sign in, but the reviewed repository does not contain a governed production bootstrap command. Existing seed scripts create test users and must not be run in production. Before go-live, NCA IT and the application owner must approve and execute a controlled one-time method for creating the first production System Administrator, record the action in the deployment evidence, and require an immediate password change.' 'Callout'))

[void]$body.Append((Paragraph '8. Production acceptance checklist' 'Heading1'))
@(
    '[ ] The approved first production System Administrator has been provisioned through a controlled method.',
    '[ ] The System Administrator can open User Management; non-administrators receive access denied.',
    '[ ] A valid individual test account can be created with a unique NCA email.',
    '[ ] Invalid domain, duplicate email, invalid role, missing division and invalid phone tests are rejected.',
    '[ ] The approved Excel template can be previewed, corrected, confirmed and created.',
    "[ ] The welcome message reaches the test user's Outlook inbox with the production HTTPS link.",
    '[ ] The temporary password permits login but blocks all activity except password change.',
    '[ ] Password change activates the account and invalidates the temporary session.',
    '[ ] Resend, temporary-password generation, lock, unlock, deactivate and audit-history functions are tested.',
    '[ ] npm run readiness reports every migration applied and smtp: verified.',
    '[ ] A protected backup and non-production restoration have been completed.',
    '[ ] Operational owners, support contacts and approval evidence are recorded.'
) | ForEach-Object { [void]$body.Append((Paragraph $_ 'Normal')) }

[void]$body.Append((Paragraph 'IT completion and approval' 'Heading1'))
[void]$body.Append((Table @(
    @('No.', 'Approval field', 'IT response'),
    @('1', 'Completed by: name and position', ''),
    @('2', 'Production System Administrator owner', ''),
    @('3', 'Database administrator', ''),
    @('4', 'Mail/Exchange administrator', ''),
    @('5', 'Cybersecurity reviewer', ''),
    @('6', 'Technical acceptance date', ''),
    @('7', 'Change/deployment reference', ''),
    @('8', 'Final approval/comments', '')
)))

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    $body
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="540" w:footer="540"/>
      <w:footerReference w:type="default" r:id="rId2"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$footerXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="667085"/><w:sz w:val="17"/></w:rPr><w:t>NCA Enterprise GRC Platform - Administrator User Account Provisioning Requirements</w:t></w:r></w:p></w:ftr>
'@

$resolvedTemplate = [System.IO.Path]::GetFullPath($TemplatePath)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path -LiteralPath $resolvedTemplate)) { throw "Reference document not found: $resolvedTemplate" }
if ($resolvedTemplate -eq $resolvedOutput) { throw 'Output must not overwrite the reference document.' }
if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
}

$sourceFile = [System.IO.FileStream]::new(
    $resolvedTemplate,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::ReadWrite
)
$source = [System.IO.Compression.ZipArchive]::new($sourceFile, [System.IO.Compression.ZipArchiveMode]::Read, $false)
$target = [System.IO.Compression.ZipFile]::Open($resolvedOutput, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($sourceEntry in $source.Entries) {
        $targetEntry = $target.CreateEntry($sourceEntry.FullName, [System.IO.Compression.CompressionLevel]::Optimal)
        $targetStream = $targetEntry.Open()
        try {
            if ($sourceEntry.FullName -eq 'word/document.xml') {
                $writer = [System.IO.StreamWriter]::new($targetStream, [System.Text.UTF8Encoding]::new($false))
                try { $writer.Write($documentXml) } finally { $writer.Dispose() }
            } elseif ($sourceEntry.FullName -eq 'word/footer1.xml') {
                $writer = [System.IO.StreamWriter]::new($targetStream, [System.Text.UTF8Encoding]::new($false))
                try { $writer.Write($footerXml) } finally { $writer.Dispose() }
            } else {
                $sourceStream = $sourceEntry.Open()
                try { $sourceStream.CopyTo($targetStream) } finally { $sourceStream.Dispose() }
            }
        } finally { $targetStream.Dispose() }
    }
} finally {
    $source.Dispose()
    $sourceFile.Dispose()
    $target.Dispose()
}

Write-Output $resolvedOutput

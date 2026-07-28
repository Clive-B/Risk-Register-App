[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
if (-not $OutputPath) {
    $OutputPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'NCA_GRC_IT_Deployment_Information_Request.docx'
}
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Escape-Xml([string]$Value) {
    return [System.Security.SecurityElement]::Escape($Value)
}

function Paragraph([string]$Text, [string]$Style = 'Normal') {
    $safe = Escape-Xml $Text
    return "<w:p><w:pPr><w:pStyle w:val=`"$Style`"/></w:pPr><w:r><w:t xml:space=`"preserve`">$safe</w:t></w:r></w:p>"
}

function PageBreak {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
}

function Table([array]$Rows) {
    $builder = [System.Text.StringBuilder]::new()
    [void]$builder.Append('<w:tbl><w:tblPr><w:tblStyle w:val="NcaTable"/><w:tblW w:w="0" w:type="auto"/><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid><w:gridCol w:w="750"/><w:gridCol w:w="5550"/><w:gridCol w:w="2900"/></w:tblGrid>')
    foreach ($row in $Rows) {
        [void]$builder.Append('<w:tr>')
        for ($index = 0; $index -lt 3; $index++) {
            $value = if ($index -lt $row.Count) { [string]$row[$index] } else { '' }
            $safe = Escape-Xml $value
            $cellShade = if ($row[0] -eq 'No.') { '<w:shd w:fill="003A70"/>' } else { '' }
            $textColour = if ($row[0] -eq 'No.') { '<w:color w:val="FFFFFF"/><w:b/>' } else { '' }
            [void]$builder.Append("<w:tc><w:tcPr><w:tcW w:w=`"0`" w:type=`"auto`"/>$cellShade</w:tcPr><w:p><w:r><w:rPr>$textColour</w:rPr><w:t xml:space=`"preserve`">$safe</w:t></w:r></w:p></w:tc>")
        }
        [void]$builder.Append('</w:tr>')
    }
    [void]$builder.Append('</w:tbl>')
    return $builder.ToString()
}

function InformationTable([array]$Questions) {
    $rows = [System.Collections.Generic.List[object]]::new()
    $rows.Add(@('No.', 'Information required from NCA IT', 'IT response'))
    $number = 1
    foreach ($question in $Questions) {
        $rows.Add(@([string]$number, $question, ''))
        $number++
    }
    return Table $rows
}

$sections = @(
    @{
        Title = '1. IT ownership and deployment coordination'
        Questions = @(
            'Name, position, email and telephone number of the IT deployment lead.',
            'Name and contact of the application/server administrator.',
            'Name and contact of the PostgreSQL/database administrator.',
            'Name and contact of the corporate mail/Exchange administrator.',
            'Name and contact of the cybersecurity or information-assurance approver.',
            'Required change-ticket or deployment reference number.',
            'Proposed deployment date, maintenance window and rollback window.'
        )
    },
    @{
        Title = '2. Production server'
        Questions = @(
            'Approved Windows Server version and patch level.',
            'Production server hostname and fixed IP address.',
            'Allocated CPU, RAM and application-storage capacity.',
            'Directory in which the application must be installed.',
            'Dedicated Windows service-account name. Do not provide its password by email.',
            'Whether the server can reach the PostgreSQL server and NCA mail server.',
            'Whether outbound internet access is prohibited, proxied or permitted.',
            'Required antivirus/EDR exclusions or scanning arrangements for the application and backup directories.',
            'Approved location and retention period for application logs.'
        )
    },
    @{
        Title = '3. Application URL, IIS, DNS and HTTPS'
        Questions = @(
            'Approved application DNS name, for example grc.nca.org.gh.',
            'Final HTTPS URL users will enter.',
            'Whether the system is intranet-only, VPN-accessible or externally published.',
            'IIS version and confirmation that URL Rewrite and Application Request Routing are available.',
            'Source of the HTTPS certificate: internal NCA CA or public CA.',
            'Certificate subject/SAN and expiry date. Do not email the private key.',
            'Approved method for securely installing the certificate and private key on the server.',
            'Required inbound firewall rules and permitted user network segments.',
            'Any load balancer, web application firewall or reverse proxy in front of IIS.',
            'Required HTTP security headers or organisational web-server baseline.'
        )
    },
    @{
        Title = '4. PostgreSQL production database'
        Questions = @(
            'PostgreSQL server hostname or IP address.',
            'PostgreSQL port.',
            'PostgreSQL major version.',
            'Approved production database name.',
            'Dedicated least-privilege application database username. Do not provide its password by email.',
            'Whether TLS is required for the database connection.',
            'How the PostgreSQL CA certificate will be supplied securely, if required.',
            'Whether NCA IT will create the empty database and account before deployment.',
            'Database backup platform, frequency and protected backup destination.',
            'Database retention period, recovery-point objective and recovery-time objective.',
            'Non-production database available for migration and restore testing.'
        )
    },
    @{
        Title = '5. NCA corporate Outlook/Exchange mail'
        Questions = @(
            'Confirm the corporate email-address format, expected to be name@nca.org.gh.',
            'Select the approved connection method: NCA SMTP relay, dedicated authenticated SMTP account, or Microsoft Graph/OAuth 2.0.',
            'SMTP/relay hostname supplied by NCA IT.',
            'SMTP port supplied by NCA IT.',
            'Required encryption: STARTTLS or implicit TLS.',
            'For relay: production application-server IP to be allowlisted.',
            'For authenticated SMTP: dedicated GRC service-account username. Do not provide its password by email.',
            'Confirm whether SMTP AUTH is enabled for the dedicated account, if applicable.',
            'Approved sender display name.',
            'Approved sender address ending in @nca.org.gh.',
            'Approved NCA mailbox to receive deployment test messages.',
            'Permitted sender/recipient restrictions and mail-volume or throttling limits.',
            'Any anti-spam, quarantine, transport-rule, SPF, DKIM or DMARC action required.',
            'Whether temporary passwords may be sent in welcome emails, or whether IT requires a one-time activation-link approach.',
            'Secure method by which the SMTP password or relay secret will be entered on the production server.',
            'If Graph/OAuth is mandatory: tenant ID, application-registration process, approved permissions and secret/certificate-handling process. Do not email client secrets or private keys.'
        )
    },
    @{
        Title = '6. Identity, accounts and security controls'
        Questions = @(
            'Confirm whether the current application-managed login is approved for initial go-live.',
            'Whether Active Directory, Entra ID/SSO or multi-factor authentication is mandatory. This requires separate integration if mandated.',
            'Required minimum password length, password history and expiry period.',
            'Required failed-login lockout threshold and lockout duration.',
            'Required user-session and access-token duration.',
            'Approved production System Administrator account owner.',
            'Vulnerability-scanning platform and responsible team.',
            'Required penetration test, code review or security accreditation before go-live.',
            'Whether audit logs must be forwarded to a SIEM and, if so, the required method.',
            'Required audit-log retention period.',
            'Required secrets-management platform, if environment-file storage is not approved.',
            'Required data-classification label and handling restrictions for risk information.'
        )
    },
    @{
        Title = '7. Backup, recovery and continuity'
        Questions = @(
            'Protected production backup directory or enterprise backup target.',
            'Database backup frequency and retention period.',
            'Whether application configuration and encrypted secrets are included in backup scope.',
            'Off-server or off-site replication requirement.',
            'Recovery-point objective (RPO).',
            'Recovery-time objective (RTO).',
            'Disaster-recovery server or alternate-site arrangements.',
            'Schedule and owner for the required non-production restore test.',
            'Person authorised to approve a production restore.'
        )
    },
    @{
        Title = '8. Monitoring, operations and support'
        Questions = @(
            'Approved monitoring platform for server, IIS, Node.js API, PostgreSQL and mail queue.',
            'Alert recipients for API failure, database failure, exhausted email retries and storage thresholds.',
            'Application-log collection and rotation requirements.',
            'Normal support hours and after-hours escalation route.',
            'First-line, second-line and third-line support owners.',
            'Planned patching and maintenance schedule.',
            'Procedure for renewing HTTPS and mail/database CA certificates.',
            'Procedure for rotating database, SMTP, JWT and communication-encryption secrets.',
            'Required service availability target or SLA.'
        )
    },
    @{
        Title = '9. Testing, data cleanup and go-live approval'
        Questions = @(
            'Names of IT and business UAT representatives.',
            'Approved UAT period and sign-off date.',
            'Whether a separate UAT environment will be provided.',
            'Approval to remove all agreed test users, work plans, risk-register uploads, approvals and treatment test data before handover.',
            'Data, accounts or configuration that must be preserved during cleanup.',
            'Required vulnerability-scan and remediation evidence.',
            'Required backup-and-restore evidence.',
            'Required Outlook mail acceptance evidence.',
            'Final technical go-live approver.',
            'Final business go-live approver.',
            'Rollback decision owner and rollback trigger.'
        )
    }
)

$body = [System.Text.StringBuilder]::new()
[void]$body.Append((Paragraph 'NCA Enterprise GRC Platform' 'Title'))
[void]$body.Append((Paragraph 'IT Deployment Information Request' 'Subtitle'))
[void]$body.Append((Paragraph 'Prepared for: NCA Information Technology Division' 'Normal'))
[void]$body.Append((Paragraph ("Date issued: {0}" -f (Get-Date -Format 'dd MMMM yyyy')) 'Normal'))
[void]$body.Append((Paragraph 'Purpose' 'Heading1'))
[void]$body.Append((Paragraph 'Please complete this document so the Enterprise GRC application can be prepared as a production-ready deployment package. The application team will configure all non-secret settings and leave protected infrastructure credentials, private keys and certificates under NCA IT control.' 'Normal'))
[void]$body.Append((Paragraph 'Important security instruction' 'Heading2'))
[void]$body.Append((Paragraph 'Do not enter passwords, client secrets, private keys, certificate private-key files or recovery codes in this document or ordinary email. For each sensitive item, state the approved secure method by which NCA IT will insert it on the production server.' 'Callout'))
[void]$body.Append((Paragraph 'How to respond' 'Heading2'))
[void]$body.Append((Paragraph 'Enter the response in the third column. If an item does not apply, write "Not applicable" and give a short reason. If a decision is pending, identify the decision owner and expected date.' 'Normal'))

foreach ($section in $sections) {
    [void]$body.Append((Paragraph $section.Title 'Heading1'))
    [void]$body.Append((InformationTable $section.Questions))
    [void]$body.Append((Paragraph '' 'Normal'))
}

[void]$body.Append((PageBreak))
[void]$body.Append((Paragraph 'Return checklist' 'Heading1'))
$checklist = @(
    '[ ] All applicable questions have been answered.',
    '[ ] The production URL, server and database details are confirmed.',
    '[ ] The NCA mail method and approved sender are confirmed.',
    '[ ] The secure secret-entry method is confirmed.',
    '[ ] HTTPS certificate responsibility is confirmed.',
    '[ ] Backup, restore, monitoring and support owners are confirmed.',
    '[ ] UAT, security review and go-live approvers are identified.',
    '[ ] No password, secret or private key is included in this document.'
)
foreach ($item in $checklist) { [void]$body.Append((Paragraph $item 'Normal')) }
[void]$body.Append((Paragraph 'IT completion and approval' 'Heading1'))
[void]$body.Append((Table @(
    @('No.', 'Approval field', 'IT response'),
    @('1', 'Completed by: name and position', ''),
    @('2', 'Division/unit', ''),
    @('3', 'Completion date', ''),
    @('4', 'Technical reviewer', ''),
    @('5', 'Security reviewer', ''),
    @('6', 'Change/deployment reference', ''),
    @('7', 'Additional comments', '')
)))

$documentXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    $body
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1080" w:right="900" w:bottom="1080" w:left="900" w:header="540" w:footer="540"/>
      <w:footerReference w:type="default" r:id="rId2" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
    </w:sectPr>
  </w:body>
</w:document>
"@

$stylesXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:spacing w:before="720" w:after="120"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="003A70"/><w:sz w:val="40"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:spacing w:after="480"/><w:jc w:val="center"/></w:pPr><w:rPr><w:b/><w:color w:val="0072BC"/><w:sz w:val="28"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="300" w:after="120"/></w:pPr><w:rPr><w:b/><w:color w:val="003A70"/><w:sz w:val="27"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="075DA5"/><w:sz w:val="23"/></w:rPr></w:style>
  <w:style w:type="paragraph" w:styleId="Callout"><w:name w:val="Callout"/><w:pPr><w:shd w:fill="FFF4CC"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="FFC72C"/></w:pBdr><w:spacing w:before="100" w:after="160"/></w:pPr><w:rPr><w:color w:val="5F4B18"/></w:rPr></w:style>
  <w:style w:type="table" w:styleId="NcaTable"><w:name w:val="NCA Table"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="B8C7D9"/><w:left w:val="single" w:sz="4" w:color="B8C7D9"/><w:bottom w:val="single" w:sz="4" w:color="B8C7D9"/><w:right w:val="single" w:sz="4" w:color="B8C7D9"/><w:insideH w:val="single" w:sz="4" w:color="D9E2EF"/><w:insideV w:val="single" w:sz="4" w:color="D9E2EF"/></w:tblBorders><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>
'@

$footerXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:color w:val="667085"/><w:sz w:val="17"/></w:rPr><w:t>NCA Enterprise GRC Platform - IT Deployment Information Request</w:t></w:r></w:p></w:ftr>
'@

$contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@

$rootRelationships = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@

$documentRelationships = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>
'@

$timestamp = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
$coreXml = @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>NCA GRC IT Deployment Information Request</dc:title>
  <dc:subject>Production deployment information questionnaire</dc:subject>
  <dc:creator>NCA Enterprise GRC Platform</dc:creator>
  <cp:lastModifiedBy>NCA Enterprise GRC Platform</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">$timestamp</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">$timestamp</dcterms:modified>
</cp:coreProperties>
"@

$appXml = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>NCA Enterprise GRC Platform</Application></Properties>
'@

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Parent $resolvedOutput
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}
if (Test-Path -LiteralPath $resolvedOutput) {
    Remove-Item -LiteralPath $resolvedOutput -Force
}

$archive = [System.IO.Compression.ZipFile]::Open($resolvedOutput, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $parts = [ordered]@{
        '[Content_Types].xml' = $contentTypes
        '_rels/.rels' = $rootRelationships
        'word/document.xml' = $documentXml
        'word/styles.xml' = $stylesXml
        'word/footer1.xml' = $footerXml
        'word/_rels/document.xml.rels' = $documentRelationships
        'docProps/core.xml' = $coreXml
        'docProps/app.xml' = $appXml
    }
    foreach ($part in $parts.GetEnumerator()) {
        $entry = $archive.CreateEntry($part.Key, [System.IO.Compression.CompressionLevel]::Optimal)
        $stream = $entry.Open()
        $writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))
        try { $writer.Write($part.Value) } finally { $writer.Dispose() }
    }
} finally {
    $archive.Dispose()
}

Write-Output $resolvedOutput

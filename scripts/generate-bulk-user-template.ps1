$ErrorActionPreference = 'Stop'

$outputPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'NCA_Bulk_User_Account_Upload_Template.xlsx'
$frontendTemplateDirectory = Join-Path (Split-Path $PSScriptRoot -Parent) 'frontend\templates'
$frontendTemplatePath = Join-Path $frontendTemplateDirectory 'NCA_Bulk_User_Account_Upload_Template.xlsx'
$updatedOutputPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'NCA_Bulk_User_Account_Upload_Template_Updated.xlsx'
$excel = $null
$workbook = $null

if (-not (Test-Path -LiteralPath $frontendTemplateDirectory)) {
    New-Item -ItemType Directory -Path $frontendTemplateDirectory | Out-Null
}

try {
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $workbook = $excel.Workbooks.Add()

    $users = $workbook.Worksheets.Item(1)
    $users.Name = 'Users'
    $instructions = $workbook.Worksheets.Add()
    $instructions.Name = 'Instructions'
    $approved = $workbook.Worksheets.Add()
    $approved.Name = 'Approved Values'

    $headers = @(
        'Full Name',
        'Official Email Address',
        'Role',
        'Division',
        'Position (Optional)',
        'Staff ID (Optional)',
        'Phone Number (Optional)',
        'Status (Optional)'
    )
    for ($column = 1; $column -le $headers.Count; $column++) {
        $users.Cells.Item(1, $column).Value2 = $headers[$column - 1]
    }

    $headerRange = $users.Range('A1:H1')
    $headerRange.Interior.Color = 7346688
    $headerRange.Font.Color = 16777215
    $headerRange.Font.Bold = $true
    $headerRange.RowHeight = 28
    $headerRange.HorizontalAlignment = -4108
    $users.Application.ActiveWindow.SplitRow = 1
    $users.Application.ActiveWindow.FreezePanes = $true
    [void]$users.Range('A1:H501').AutoFilter()

    $users.Columns.Item('A').ColumnWidth = 28
    $users.Columns.Item('B').ColumnWidth = 34
    $users.Columns.Item('C').ColumnWidth = 28
    $users.Columns.Item('D').ColumnWidth = 30
    $users.Columns.Item('E').ColumnWidth = 28
    $users.Columns.Item('F').ColumnWidth = 22
    $users.Columns.Item('G').ColumnWidth = 24
    $users.Columns.Item('H').ColumnWidth = 18
    $users.Range('A2:H501').RowHeight = 22
    $users.Range('A2:H501').Borders.Color = 14277081
    $users.Range('F2:G501').NumberFormat = '@'

    $instructionRows = @(
        @('NCA Bulk User Account Upload Template', ''),
        @('Purpose', 'Create several NCA GRC accounts in one governed upload.'),
        @('How to use', 'Enter one proposed user per row on the Users sheet. Do not rename the column headings.'),
        @('Required', 'Full Name, Official Email Address and Role. Division is required for Risk Champions and Risk Focal Persons.'),
        @('Official email', 'Only @nca.org.gh email addresses are accepted.'),
        @('Staff ID', 'Optional. If left blank, it remains blank; the system will not generate one.'),
        @('Phone number', 'Optional. When supplied, enter 10 digits using an approved network prefix.'),
        @('Position', 'Optional.'),
        @('Status', 'Optional. Leave blank to use Active.'),
        @('Global roles', 'System Administrator and Risk Committee Chairman receive All Divisions access; Division may be blank.'),
        @('Divisional roles', 'Risk Champion and Risk Focal Person must have an approved Division.'),
        @('Correction review', 'The system preserves original values and shows detection, proposal, explanation, confidence, validation and audit information before creating accounts.'),
        @('Duplicate accounts', 'Duplicate emails in the workbook or existing accounts will be identified before admission.'),
        @('Onboarding', 'Each admitted user receives an individual temporary password and must change it during first login.'),
        @('Example only', 'Ama Mensah | ama.mensah@nca.org.gh | Risk Focal Person | Finance | Risk Officer | [blank] | [blank] | Active')
    )
    for ($row = 1; $row -le $instructionRows.Count; $row++) {
        $instructions.Cells.Item($row, 1).Value2 = $instructionRows[$row - 1][0]
        $instructions.Cells.Item($row, 2).Value2 = $instructionRows[$row - 1][1]
    }
    $instructions.Range('A1:B1').Merge()
    $instructions.Range('A1').Font.Bold = $true
    $instructions.Range('A1').Font.Size = 18
    $instructions.Range('A1').Font.Color = 7346688
    $instructions.Columns.Item('A').ColumnWidth = 24
    $instructions.Columns.Item('B').ColumnWidth = 100
    $instructions.Range('A1:B20').WrapText = $true
    $instructions.Range('A2:A20').Font.Bold = $true
    $instructions.Range('A1:B20').VerticalAlignment = -4160

    $roles = @('System Administrator', 'Risk Committee Chairman', 'Risk Champion', 'Risk Focal Person')
    $divisions = @(
        'RIPS',
        'Legal',
        'Regulatory Administration',
        'Consumer Affairs',
        'Corporate Affairs',
        'Finance',
        'Engineering',
        'Information Technology',
        'Procurement and Protocol',
        'Internal Audit',
        'Human Resource',
        'ROD',
        'Administration',
        'Cybersecurity',
        'International Affairs'
    )
    $statuses = @('Active', 'Inactive')

    $approved.Cells.Item(1, 1).Value2 = 'Approved Roles'
    $approved.Cells.Item(1, 2).Value2 = 'Approved Divisions'
    $approved.Cells.Item(1, 3).Value2 = 'Approved Statuses'
    for ($index = 0; $index -lt $roles.Count; $index++) { $approved.Cells.Item($index + 2, 1).Value2 = $roles[$index] }
    for ($index = 0; $index -lt $divisions.Count; $index++) { $approved.Cells.Item($index + 2, 2).Value2 = $divisions[$index] }
    for ($index = 0; $index -lt $statuses.Count; $index++) { $approved.Cells.Item($index + 2, 3).Value2 = $statuses[$index] }
    $approved.Range('A1:C1').Interior.Color = 7346688
    $approved.Range('A1:C1').Font.Color = 16777215
    $approved.Range('A1:C1').Font.Bold = $true
    $approved.Columns.Item('A:C').AutoFit() | Out-Null

    $workbook.Names.Add('ApprovedRoles', "='Approved Values'!`$A`$2:`$A`$5") | Out-Null
    $workbook.Names.Add('ApprovedDivisions', "='Approved Values'!`$B`$2:`$B`$16") | Out-Null
    $workbook.Names.Add('ApprovedStatuses', "='Approved Values'!`$C`$2:`$C`$3") | Out-Null

    $users.Range('C2:C501').Validation.Delete()
    $users.Range('C2:C501').Validation.Add(3, 1, 1, '=ApprovedRoles')
    $users.Range('C2:C501').Validation.IgnoreBlank = $false
    $users.Range('C2:C501').Validation.InCellDropdown = $true
    $users.Range('C2:C501').Validation.InputTitle = 'Approved role'
    $users.Range('C2:C501').Validation.InputMessage = 'Choose an approved NCA GRC role.'

    $users.Range('D2:D501').Validation.Delete()
    $users.Range('D2:D501').Validation.Add(3, 1, 1, '=ApprovedDivisions')
    $users.Range('D2:D501').Validation.IgnoreBlank = $true
    $users.Range('D2:D501').Validation.InCellDropdown = $true
    $users.Range('D2:D501').Validation.InputTitle = 'Approved division'
    $users.Range('D2:D501').Validation.InputMessage = 'Required for Risk Champion and Risk Focal Person roles.'

    $users.Range('H2:H501').Validation.Delete()
    $users.Range('H2:H501').Validation.Add(3, 1, 1, '=ApprovedStatuses')
    $users.Range('H2:H501').Validation.IgnoreBlank = $true
    $users.Range('H2:H501').Validation.InCellDropdown = $true
    $users.Range('H2:H501').Validation.InputTitle = 'Account status'
    $users.Range('H2:H501').Validation.InputMessage = 'Optional. Blank defaults to Active.'

    $users.Range('A2:D501').Interior.Color = 16777215
    $users.Range('E2:H501').Interior.Color = 15921906
    $users.Range('B2:B501').Validation.Delete()
    $users.Range('B2:B501').Validation.Add(7, 1, 1, '=AND(ISNUMBER(SEARCH("@nca.org.gh",B2)),RIGHT(LOWER(B2),11)="@nca.org.gh")')
    $users.Range('B2:B501').Validation.IgnoreBlank = $false
    $users.Range('B2:B501').Validation.ErrorTitle = 'Official email required'
    $users.Range('B2:B501').Validation.ErrorMessage = 'Enter an official @nca.org.gh email address.'

    $users.Activate()
    $workbook.SaveAs($frontendTemplatePath, 51)
}
finally {
    if ($workbook) { $workbook.Close($false) }
    if ($excel) { $excel.Quit() }
    if ($users) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($users) }
    if ($instructions) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($instructions) }
    if ($approved) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($approved) }
    if ($workbook) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($workbook) }
    if ($excel) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

try {
    Copy-Item -LiteralPath $frontendTemplatePath -Destination $outputPath -Force -ErrorAction Stop
    Write-Output $outputPath
}
catch {
    Copy-Item -LiteralPath $frontendTemplatePath -Destination $updatedOutputPath -Force
    Write-Output $updatedOutputPath
}
Write-Output $frontendTemplatePath

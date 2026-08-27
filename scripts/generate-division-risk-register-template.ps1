param(
    [string]$Source = 'C:\Users\codro\Downloads\Adminstration Risk Register Updated_.xlsx'
)

$ErrorActionPreference = 'Stop'

$workspace = Split-Path $PSScriptRoot -Parent
$templateName = 'NCA_Official_Division_Risk_Register_Tracker_Upload_Template.xlsx'
$destination = Join-Path $workspace "frontend\templates\$templateName"
$rootCopy = Join-Path $workspace $templateName
$excel = $null
$book = $null
$sheet = $null
$instructions = $null

try {
    if (-not (Test-Path -LiteralPath $Source)) { throw "Approved source workbook not found: $Source" }
    $excel = New-Object -ComObject Excel.Application
    $excel.Visible = $false
    $excel.DisplayAlerts = $false
    $book = $excel.Workbooks.Open($Source,$null,$true)
    $sheet = $book.Worksheets.Item('Risk Register')

    $sheet.Range('A13:W1000').ClearContents()
    $sheet.Range('N13:N512').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
    $sheet.Range('A13:W512').RowHeight = 22
    $sheet.Range('A13:W512').WrapText = $true

    try { $instructions = $book.Worksheets.Item('Instructions') } catch {
        $instructions = $book.Worksheets.Add()
        $instructions.Name = 'Instructions'
    }
    $instructions.Cells.Clear()
    $rows = @(
        @('NCA Official Division Risk Register Tracker — Upload Template','Approved upload edition 2026.08'),
        @('Purpose','For Division Risk Focal Persons and Administrator-staged division uploads.'),
        @('Required workflow','Complete one division workbook. The Focal Person reviews and submits every risk before Champion review.'),
        @('One risk per row','Enter one independently monitored risk on each row from row 13.'),
        @('Risk ID','Use a unique enterprise Risk ID. Do not reuse an ID already admitted to the system.'),
        @('Scores','Enter Likelihood and Impact from 1 to 5. Inherent Rating is calculated automatically.'),
        @('Risk response','Use an approved ERM response: Terminate, Treat, Transfer or Tolerate. Legacy wording is corrected transparently during upload.'),
        @('Required review','The correction workspace preserves the original workbook values and requires confirmation before staging or admission.'),
        @('Do not alter structure','Do not rename, reorder, merge, add or remove columns on the Risk Register sheet.'),
        @('Privacy and accountability','Do not include personal data that is unnecessary for risk governance. All upload and review actions are audited.')
    )
    for ($row = 1; $row -le $rows.Count; $row++) {
        $instructions.Cells.Item($row,1).Value2 = $rows[$row-1][0]
        $instructions.Cells.Item($row,2).Value2 = $rows[$row-1][1]
    }
    $instructions.Range('A1:B1').Interior.Color = 7346688
    $instructions.Range('A1:B1').Font.Color = 16777215
    $instructions.Range('A1:B1').Font.Bold = $true
    $instructions.Range('A2:A20').Font.Bold = $true
    $instructions.Range('A1:B20').WrapText = $true
    $instructions.Columns.Item('A').ColumnWidth = 27
    $instructions.Columns.Item('B').ColumnWidth = 105
    $sheet.Activate()
    $book.SaveAs($destination,51)
    Copy-Item -LiteralPath $destination -Destination $rootCopy -Force
}
finally {
    if ($book) { $book.Close($false) }
    if ($excel) { $excel.Quit() }
    foreach ($item in @($sheet,$instructions,$book,$excel)) {
        if ($null -ne $item) { [void][Runtime.InteropServices.Marshal]::ReleaseComObject($item) }
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

Write-Output "Created $destination"
Write-Output "Created $rootCopy"

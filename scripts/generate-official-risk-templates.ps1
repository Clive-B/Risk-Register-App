$ErrorActionPreference = 'Stop'

$workspace = Split-Path $PSScriptRoot -Parent
$templateDirectory = Join-Path $workspace 'frontend\templates'
$workPlanName = 'NCA_Official_Work_Plan_Upload_Template.xlsx'

if (-not (Test-Path -LiteralPath $templateDirectory)) {
    New-Item -ItemType Directory -Path $templateDirectory | Out-Null
}

function Release-ComObject {
    param($ComObject)
    if ($null -ne $ComObject) {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($ComObject)
    }
}

function Style-Header {
    param($Sheet, [string]$Address)
    $range = $Sheet.Range($Address)
    $range.Interior.Color = 7346688
    $range.Font.Color = 16777215
    $range.Font.Bold = $true
    $range.WrapText = $true
    $range.HorizontalAlignment = -4108
    $range.VerticalAlignment = -4108
    $range.RowHeight = 34
    Release-ComObject $range
}

function Add-ListValidation {
    param($Range, [string]$Formula, [string]$Title, [string]$Message)
    $Range.Validation.Delete()
    $Range.Validation.Add(3, 1, 1, $Formula)
    $Range.Validation.IgnoreBlank = $true
    $Range.Validation.InCellDropdown = $true
    $Range.Validation.ShowInput = $true
    $Range.Validation.ShowError = $true
    $Range.Validation.InputTitle = $Title
    $Range.Validation.InputMessage = $Message
    $Range.Validation.ErrorTitle = 'Choose an approved value'
    $Range.Validation.ErrorMessage = $Message
}

function Add-ScoreConditionalFormatting {
    param($Sheet, [string]$Column)
    $range = $Sheet.Range("${Column}2:${Column}501")
    $range.FormatConditions.Delete()
    $lowFormula = "=AND(${Column}2<>`"`",${Column}2<=10)"
    $mediumFormula = "=AND(${Column}2<>`"`",${Column}2>=11,${Column}2<=16)"
    $highFormula = "=AND(${Column}2<>`"`",${Column}2>=17)"

    $low = $range.FormatConditions.Add(2, 0, $lowFormula)
    $low.Interior.Color = 13561798
    $low.Font.Color = 24832
    $medium = $range.FormatConditions.Add(2, 0, $mediumFormula)
    $medium.Interior.Color = 10284031
    $medium.Font.Color = 26012
    $high = $range.FormatConditions.Add(2, 0, $highFormula)
    $high.Interior.Color = 13551615
    $high.Font.Color = 393372

    Release-ComObject $low
    Release-ComObject $medium
    Release-ComObject $high
    Release-ComObject $range
}

function Build-WorkPlanTemplate {
    param([string]$Path)
    $excel = $null
    $book = $null
    $sheet = $null
    $instructions = $null
    $lookups = $null
    try {
        $excel = New-Object -ComObject Excel.Application
        $excel.Visible = $false
        $excel.DisplayAlerts = $false
        $book = $excel.Workbooks.Add()
        $sheet = $book.Worksheets.Item(1)
        $sheet.Name = 'Work Plan'
        $instructions = $book.Worksheets.Add()
        $instructions.Name = 'Instructions'
        $lookups = $book.Worksheets.Add()
        $lookups.Name = 'Approved Values'

        $headers = @(
            'Programme Number','Strategic Pillar','Programme','Goal','KPI','Target',
            'Baseline','Key Action Point','Budget (GHC)','Weight (100%)','Start Month','End Month'
        )
        for ($column = 1; $column -le $headers.Count; $column++) {
            $sheet.Cells.Item(1, $column).Value2 = $headers[$column - 1]
        }
        Style-Header $sheet 'A1:L1'
        [void]$sheet.Range('A1:L501').AutoFilter()
        $sheet.Application.ActiveWindow.SplitRow = 1
        $sheet.Application.ActiveWindow.FreezePanes = $true
        $sheet.Range('A2:L501').RowHeight = 22
        $sheet.Range('A2:L501').Borders.Color = 14277081
        $sheet.Range('A2:H501').Interior.Color = 16777215
        $sheet.Range('I2:L501').Interior.Color = 15921906
        $sheet.Range('I2:J501').NumberFormat = '0.00'
        foreach ($pair in @(
            @('A',19),@('B',25),@('C',34),@('D',34),@('E',24),@('F',18),
            @('G',20),@('H',48),@('I',18),@('J',18),@('K',18),@('L',18)
        )) {
            $sheet.Columns.Item($pair[0]).ColumnWidth = $pair[1]
        }

        $months = @(
            'January','February','March','April','May','June',
            'July','August','September','October','November','December','Quarterly'
        )
        $lookups.Cells.Item(1, 1).Value2 = 'Approved Schedule Values'
        for ($index = 0; $index -lt $months.Count; $index++) {
            $lookups.Cells.Item($index + 2, 1).Value2 = $months[$index]
        }
        Style-Header $lookups 'A1:A1'
        $lookups.Columns.Item('A').ColumnWidth = 30
        [void]$book.Names.Add('ScheduleValues', "='Approved Values'!`$A`$2:`$A`$14")

        $startRange = $sheet.Range('K2:K501')
        Add-ListValidation $startRange '=ScheduleValues' 'Start month' 'Choose January to December or Quarterly.'
        Release-ComObject $startRange
        $endRange = $sheet.Range('L2:L501')
        Add-ListValidation $endRange '=ScheduleValues' 'End month' 'Choose January to December or Quarterly.'
        Release-ComObject $endRange

        $budgetRange = $sheet.Range('I2:I501')
        $budgetRange.Validation.Delete()
        $budgetRange.Validation.Add(2, 1, 7, '0')
        $budgetRange.Validation.IgnoreBlank = $true
        $budgetRange.Validation.ErrorTitle = 'Invalid budget'
        $budgetRange.Validation.ErrorMessage = 'Budget must be blank, zero or a positive number.'
        Release-ComObject $budgetRange

        $weightRange = $sheet.Range('J2:J501')
        $weightRange.Validation.Delete()
        $weightRange.Validation.Add(2, 1, 1, '0', '100')
        $weightRange.Validation.IgnoreBlank = $true
        $weightRange.Validation.ErrorTitle = 'Invalid weight'
        $weightRange.Validation.ErrorMessage = 'Weight must be blank or a number from 0 to 100.'
        Release-ComObject $weightRange

        $instructionRows = @(
            @('NCA Official Work-Plan Upload Template', 'Version 2026.07'),
            @('Purpose', 'Create a governed work-plan upload from which the system generates one risk and treatment proposal for every action point.'),
            @('Required columns', 'Programme Number, Strategic Pillar, Programme, Goal, KPI, Target, Baseline and Key Action Point.'),
            @('One action per row', 'Enter one Key Action Point per row. Repeat the same Programme Number and programme details for every action belonging to that programme.'),
            @('Programme grouping', 'Rows with the same Programme Number are grouped as one programme and each action is monitored separately.'),
            @('Start and End', 'Use the approved dropdown values. Do not type abbreviations or alternative month spellings.'),
            @('Budget', 'Optional. Enter zero or a positive numeric value without currency text.'),
            @('Weight', 'Optional. Enter a number from 0 to 100.'),
            @('Strategic Pillar', 'Enter the official pillar wording. It remains free text until an enterprise-approved pillar list is supplied.'),
            @('Generated assessment', 'The system generates risk title, statement, category, likelihood, impact, response and treatment. The Focal Person reviews these before admission.'),
            @('Do not merge cells', 'Do not merge data-entry cells, rename columns or add unsupported columns.'),
            @('Correction engine', 'Unexpected values remain subject to the governed correction workspace and explicit Focal Person confirmation.')
        )
        for ($row = 1; $row -le $instructionRows.Count; $row++) {
            $instructions.Cells.Item($row, 1).Value2 = $instructionRows[$row - 1][0]
            $instructions.Cells.Item($row, 2).Value2 = $instructionRows[$row - 1][1]
        }
        $instructions.Range('A1:B1').Interior.Color = 7346688
        $instructions.Range('A1:B1').Font.Color = 16777215
        $instructions.Range('A1:B1').Font.Bold = $true
        $instructions.Range('A2:A20').Font.Bold = $true
        $instructions.Range('A1:B20').WrapText = $true
        $instructions.Range('A1:B20').VerticalAlignment = -4160
        $instructions.Columns.Item('A').ColumnWidth = 27
        $instructions.Columns.Item('B').ColumnWidth = 105
        $instructions.Activate()
        $book.SaveAs($Path, 51)
    }
    finally {
        if ($book) { $book.Close($false) }
        if ($excel) { $excel.Quit() }
        Release-ComObject $sheet
        Release-ComObject $instructions
        Release-ComObject $lookups
        Release-ComObject $book
        Release-ComObject $excel
        [GC]::Collect()
        [GC]::WaitForPendingFinalizers()
    }
}

$workPlanFrontend = Join-Path $templateDirectory $workPlanName
Build-WorkPlanTemplate $workPlanFrontend

try {
    Copy-Item -LiteralPath $workPlanFrontend -Destination (Join-Path $workspace $workPlanName) -Force -ErrorAction Stop
    Write-Output (Join-Path $workspace $workPlanName)
}
catch {
    $updated = (Join-Path $workspace $workPlanName).Replace('.xlsx', '_Updated.xlsx')
    Copy-Item -LiteralPath $workPlanFrontend -Destination $updated -Force
    Write-Output $updated
}
Write-Output $workPlanFrontend

$ErrorActionPreference = 'Stop'

$workspace = Split-Path $PSScriptRoot -Parent
$templateDirectory = Join-Path $workspace 'frontend\templates'
$workPlanName = 'NCA_Official_Work_Plan_Upload_Template.xlsx'
$riskRegisterName = 'NCA_Official_Risk_Register_Upload_Template.xlsx'
$legalRiskRegisterName = 'NCA_Official_Risk_Register_Template_2.xlsx'

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

function Build-RiskRegisterTemplate {
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
        $sheet.Name = 'Risk Register'
        $instructions = $book.Worksheets.Add()
        $instructions.Name = 'Instructions'
        $lookups = $book.Worksheets.Add()
        $lookups.Name = 'Approved Values'

        $headers = @(
            'Risk ID','Program','Risk Name','Risk Description','Risk Category','Date Captured',
            'Risk Owner','Existing Controls','Control Effectiveness',
            'Pre-Mitigation Impact','Pre-Mitigation Likelihood','Pre-Mitigation Score',
            'Current Impact','Current Likelihood','Current Score',
            'Post-Mitigation Impact','Post-Mitigation Likelihood','Post-Mitigation Score',
            'Risk Response','Mitigation Plan / Actions','Responsible Officer','Treatment Status',
            'Next Review Date','Target Completion Date','Historical Progress',
            'Control Type','Control Owner','Control Design Adequacy','Control Evidence',
            'Control Last Tested Date','Control Exceptions','Control Next Review Date','Control Assessment Basis'
        )
        for ($column = 1; $column -le $headers.Count; $column++) {
            $sheet.Cells.Item(1, $column).Value2 = $headers[$column - 1]
        }
        Style-Header $sheet 'A1:AG1'
        [void]$sheet.Range('A1:AG501').AutoFilter()
        $sheet.Application.ActiveWindow.SplitRow = 1
        $sheet.Application.ActiveWindow.FreezePanes = $true
        $sheet.Range('A2:AG501').RowHeight = 24
        $sheet.Range('A2:AG501').Borders.Color = 14277081
        $sheet.Range('A2:AG501').Interior.Color = 16777215
        $sheet.Range('E2:E501').Interior.Color = 15921906
        $sheet.Range('I2:I501').Interior.Color = 15921906
        $sheet.Range('J2:K501').Interior.Color = 15921906
        $sheet.Range('M2:N501').Interior.Color = 15921906
        $sheet.Range('P2:Q501').Interior.Color = 15921906
        $sheet.Range('S2:S501').Interior.Color = 15921906
        $sheet.Range('V2:V501').Interior.Color = 15921906
        $sheet.Range('Z2:Z501').Interior.Color = 15921906
        $sheet.Range('AB2:AB501').Interior.Color = 15921906
        $sheet.Range('L2:L501').Interior.Color = 15790320
        $sheet.Range('O2:O501').Interior.Color = 15790320
        $sheet.Range('R2:R501').Interior.Color = 15790320

        foreach ($pair in @(
            @('A',18),@('B',34),@('C',30),@('D',50),@('E',25),@('F',18),@('G',25),
            @('H',40),@('I',24),@('J',18),@('K',20),@('L',18),@('M',16),@('N',18),
            @('O',16),@('P',20),@('Q',22),@('R',20),@('S',20),@('T',50),@('U',25),
            @('V',20),@('W',18),@('X',20),@('Y',42),@('Z',20),@('AA',25),
            @('AB',24),@('AC',42),@('AD',20),@('AE',42),@('AF',22),@('AG',48)
        )) {
            $sheet.Columns.Item($pair[0]).ColumnWidth = $pair[1]
        }
        $sheet.Range('A2:AG501').WrapText = $true
        $sheet.Range('F2:F501').NumberFormat = 'dd/mm/yyyy'
        $sheet.Range('W2:X501').NumberFormat = 'dd/mm/yyyy'
        $sheet.Range('AD2:AD501').NumberFormat = 'dd/mm/yyyy'
        $sheet.Range('AF2:AF501').NumberFormat = 'dd/mm/yyyy'

        $categories = @('Strategic','Financial','Operational','Reputational','Human Capital','Regulatory Compliance','Supervision')
        $responses = @('Terminate','Treat','Transfer','Tolerate')
        $effectiveness = @('Effective','Partially Effective','Ineffective','Not Assessed')
        $controlTypes = @('Preventive','Detective','Corrective','Mixed','Not Assessed')
        $designAdequacy = @('Adequate','Partially Adequate','Inadequate','Not Assessed')
        $statuses = @('Not Started','In Progress','Completed','Deferred')
        $impactDefinitions = @('Insignificant (Very Low)','Minor (Low)','Moderate (Medium)','Major (High)','Catastrophic (Very High)')
        $likelihoodDefinitions = @('Rare (Very Low)','Unlikely (Low)','Possible (Medium)','Likely (High)','Almost Certain (Very High)')

        @('Risk Categories','Risk Responses','Control Effectiveness','Treatment Status','Impact','Impact Meaning','Likelihood','Likelihood Meaning','Control Type','Control Design Adequacy') |
            ForEach-Object -Begin { $column = 1 } -Process {
                $lookups.Cells.Item(1, $column).Value2 = $_
                $column += 1
            }
        for ($index = 0; $index -lt $categories.Count; $index++) { $lookups.Cells.Item($index + 2, 1).Value2 = $categories[$index] }
        for ($index = 0; $index -lt $responses.Count; $index++) { $lookups.Cells.Item($index + 2, 2).Value2 = $responses[$index] }
        for ($index = 0; $index -lt $effectiveness.Count; $index++) { $lookups.Cells.Item($index + 2, 3).Value2 = $effectiveness[$index] }
        for ($index = 0; $index -lt $statuses.Count; $index++) { $lookups.Cells.Item($index + 2, 4).Value2 = $statuses[$index] }
        for ($index = 0; $index -lt $controlTypes.Count; $index++) { $lookups.Cells.Item($index + 2, 9).Value2 = $controlTypes[$index] }
        for ($index = 0; $index -lt $designAdequacy.Count; $index++) { $lookups.Cells.Item($index + 2, 10).Value2 = $designAdequacy[$index] }
        for ($index = 0; $index -lt 5; $index++) {
            $lookups.Cells.Item($index + 2, 5).Value2 = [string]($index + 1)
            $lookups.Cells.Item($index + 2, 6).Value2 = $impactDefinitions[$index]
            $lookups.Cells.Item($index + 2, 7).Value2 = [string]($index + 1)
            $lookups.Cells.Item($index + 2, 8).Value2 = $likelihoodDefinitions[$index]
        }
        $lookups.Cells.Item(10, 1).Value2 = 'ERM Score Colour'
        $lookups.Cells.Item(10, 2).Value2 = 'Score Range'
        $lookups.Range('A11:B13').NumberFormat = '@'
        $lookups.Cells.Item(11, 1).Value2 = 'Low'
        $lookups.Cells.Item(11, 2).Value2 = '1 - 10'
        $lookups.Cells.Item(12, 1).Value2 = 'Medium'
        $lookups.Cells.Item(12, 2).Value2 = '11 - 16'
        $lookups.Cells.Item(13, 1).Value2 = 'High'
        $lookups.Cells.Item(13, 2).Value2 = '17 - 25'
        $lookups.Range('A10:B10').Interior.Color = 7346688
        $lookups.Range('A10:B10').Font.Color = 16777215
        $lookups.Range('A10:B10').Font.Bold = $true
        $lookups.Range('A11:B11').Interior.Color = 13561798
        $lookups.Range('A12:B12').Interior.Color = 10284031
        $lookups.Range('A13:B13').Interior.Color = 13551615
        Style-Header $lookups 'A1:J1'
        $lookups.Columns.Item('A:J').AutoFit() | Out-Null
        [void]$book.Names.Add('RiskCategories', "='Approved Values'!`$A`$2:`$A`$8")
        [void]$book.Names.Add('RiskResponses', "='Approved Values'!`$B`$2:`$B`$5")
        [void]$book.Names.Add('ControlEffectiveness', "='Approved Values'!`$C`$2:`$C`$5")
        [void]$book.Names.Add('ControlTypes', "='Approved Values'!`$I`$2:`$I`$6")
        [void]$book.Names.Add('ControlDesignAdequacy', "='Approved Values'!`$J`$2:`$J`$5")
        [void]$book.Names.Add('TreatmentStatuses', "='Approved Values'!`$D`$2:`$D`$5")
        [void]$book.Names.Add('ImpactRatings', "='Approved Values'!`$E`$2:`$E`$6")
        [void]$book.Names.Add('LikelihoodRatings', "='Approved Values'!`$G`$2:`$G`$6")

        foreach ($spec in @(
            @('E2:E501','=RiskCategories','Risk category','Choose an ERM-approved risk category.'),
            @('I2:I501','=ControlEffectiveness','Control effectiveness','Choose Effective, Partially Effective, Ineffective or Not Assessed. Effective requires evidence and a dated test.'),
            @('J2:J501','=ImpactRatings','Pre-Mitigation impact','Choose an integer from 1 to 5. See Approved Values for definitions.'),
            @('K2:K501','=LikelihoodRatings','Pre-Mitigation likelihood','Choose an integer from 1 to 5. See Approved Values for definitions.'),
            @('M2:M501','=ImpactRatings','Current impact','Choose an integer from 1 to 5.'),
            @('N2:N501','=LikelihoodRatings','Current likelihood','Choose an integer from 1 to 5.'),
            @('P2:P501','=ImpactRatings','Post-Mitigation impact','Choose an integer from 1 to 5.'),
            @('Q2:Q501','=LikelihoodRatings','Post-Mitigation likelihood','Choose an integer from 1 to 5.'),
            @('S2:S501','=RiskResponses','Risk response','Choose Terminate, Treat, Transfer or Tolerate.'),
            @('V2:V501','=TreatmentStatuses','Treatment status','Choose an approved treatment status.'),
            @('Z2:Z501','=ControlTypes','Control type','Choose the principal control type.'),
            @('AB2:AB501','=ControlDesignAdequacy','Control design adequacy','Assess whether the control is designed adequately.')
        )) {
            $range = $sheet.Range($spec[0])
            Add-ListValidation $range $spec[1] $spec[2] $spec[3]
            Release-ComObject $range
        }

        foreach ($address in @('F2:F501','W2:W501','X2:X501','AD2:AD501','AF2:AF501')) {
            $range = $sheet.Range($address)
            $range.Validation.Delete()
            $range.Validation.Add(4, 1, 1, '=DATE(2020,1,1)', '=DATE(2100,12,31)')
            $range.Validation.IgnoreBlank = $true
            $range.Validation.ErrorTitle = 'Invalid date'
            $range.Validation.ErrorMessage = 'Enter a valid date between 2020 and 2100.'
            Release-ComObject $range
        }

        $sheet.Range('L2:L501').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
        $sheet.Range('O2:O501').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
        $sheet.Range('R2:R501').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
        $sheet.Range('L2:L501').NumberFormat = '0'
        $sheet.Range('O2:O501').NumberFormat = '0'
        $sheet.Range('R2:R501').NumberFormat = '0'
        Add-ScoreConditionalFormatting $sheet 'L'
        Add-ScoreConditionalFormatting $sheet 'O'
        Add-ScoreConditionalFormatting $sheet 'R'
        $sheet.Range('A2:AG501').Locked = $false
        $sheet.Range('L2:L501').Locked = $true
        $sheet.Range('O2:O501').Locked = $true
        $sheet.Range('R2:R501').Locked = $true
        $sheet.Protect('NCA-GRC')

        $instructionRows = @(
            @('NCA Official Risk-Register Upload Template', 'Version 2026.07 · aligned with the authoritative ERM Policy and Framework.'),
            @('Purpose', 'Create separately monitored risks with governed assessment, treatment and audit information.'),
            @('One risk per row', 'Do not merge cells. Every populated row becomes one separately monitored risk.'),
            @('Risk ID', 'Optional. Leave blank for the system to assign a unique division risk reference.'),
            @('Required details', 'Program, Risk Name, Risk Description, Date Captured, Risk Owner, Mitigation Plan / Actions and Target Completion Date.'),
            @('Approved dropdowns', 'Use the dropdowns for Risk Category, assessment values, Control Effectiveness, Risk Response and Treatment Status.'),
            @('Assessment values', 'Impact and Likelihood store the numeric values 1 to 5. Definitions are shown on the Approved Values sheet.'),
            @('Calculated scores', 'The three blue Score columns calculate Impact × Likelihood and are protected from direct editing.'),
            @('Conditional score colours', 'Low scores 1–10 are green, Medium scores 11–16 are amber, and High scores 17–25 are red.'),
            @('Risk responses', 'Only Terminate, Treat, Transfer and Tolerate are approved. Avoid, Reduce, Fallback, Share and Accept are not used.'),
            @('Existing controls', 'Describe controls already operating, not proposed future actions.'),
            @('Control assurance', 'Effective requires adequate design, a named owner, supporting evidence and a dated test with no unresolved exceptions. Scores remain independent and are never changed by the control rating.'),
            @('Responsible officer', 'Identify the accountable officer who will manage the treatment actions.'),
            @('Dates', 'Use valid Excel dates. Do not enter narrative text in date fields.'),
            @('Correction engine', 'The system retains original values, proposes transparent corrections and requires Focal Person confirmation before upload.'),
            @('Do not alter structure', 'Do not rename columns or add unsupported columns. Use up to 500 data rows.')
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
        $instructions.Columns.Item('A').ColumnWidth = 28
        $instructions.Columns.Item('B').ColumnWidth = 110
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

function Build-LegalRiskRegisterTemplate {
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
        $sheet.Name = 'Legal Risk Register'
        $instructions = $book.Worksheets.Add()
        $instructions.Name = 'Instructions'
        $lookups = $book.Worksheets.Add()
        $lookups.Name = 'Approved Values'

        $headers = @(
            'No.','Objective/Process','Risk Category','Risk Description','Risk Source','Risk Event',
            'Risk Cause','Existing Control','Risk Owner','Risk Action Owner/Lead Officer','Date Identified',
            'Risk Impact','Risk Likelihood','Inherent Risk Rating',
            'Current Impact','Current Likelihood','Current Score',
            'Post-Mitigation Impact','Post-Mitigation Likelihood','Post-Mitigation Score',
            'Risk Response','Mitigation Plan / Actions','Target Completion Date','Treatment Status',
            'Control Effectiveness','Control Type','Control Owner','Control Design Adequacy',
            'Control Evidence','Control Last Tested Date','Control Exceptions',
            'Control Next Review Date','Control Assessment Basis'
        )
        for ($column = 1; $column -le $headers.Count; $column++) {
            $sheet.Cells.Item(1, $column).Value2 = $headers[$column - 1]
        }
        Style-Header $sheet 'A1:AG1'
        [void]$sheet.Range('A1:AG501').AutoFilter()
        $sheet.Application.ActiveWindow.SplitRow = 1
        $sheet.Application.ActiveWindow.FreezePanes = $true
        $sheet.Range('A2:AG501').RowHeight = 25
        $sheet.Range('A2:AG501').Borders.Color = 14277081
        $sheet.Range('A2:AG501').Interior.Color = 16777215
        foreach ($address in @('C2:C501','L2:M501','O2:P501','R2:S501','U2:U501','X2:Z501','AB2:AB501')) {
            $sheet.Range($address).Interior.Color = 15921906
        }
        foreach ($address in @('N2:N501','Q2:Q501','T2:T501')) {
            $sheet.Range($address).Interior.Color = 15790320
        }
        foreach ($pair in @(
            @('A',19),@('B',44),@('C',24),@('D',52),@('E',42),@('F',42),@('G',42),
            @('H',42),@('I',24),@('J',28),@('K',18),@('L',16),@('M',18),@('N',18),
            @('O',16),@('P',18),@('Q',16),@('R',20),@('S',22),@('T',20),@('U',20),
            @('V',52),@('W',20),@('X',20),@('Y',24),@('Z',20),@('AA',24),@('AB',24),
            @('AC',42),@('AD',20),@('AE',42),@('AF',22),@('AG',48)
        )) {
            $sheet.Columns.Item($pair[0]).ColumnWidth = $pair[1]
        }
        $sheet.Range('A2:AG501').WrapText = $true
        foreach ($address in @('K2:K501','W2:W501','AD2:AD501','AF2:AF501')) {
            $sheet.Range($address).NumberFormat = 'dd/mm/yyyy'
        }

        $categories = @('Strategic','Financial','Operational','Reputational','Human Capital','Regulatory Compliance','Supervision')
        $responses = @('Terminate','Treat','Transfer','Tolerate')
        $effectiveness = @('Effective','Partially Effective','Ineffective','Not Assessed')
        $controlTypes = @('Preventive','Detective','Corrective','Mixed','Not Assessed')
        $designAdequacy = @('Adequate','Partially Adequate','Inadequate','Not Assessed')
        $statuses = @('Not Started','In Progress','Completed','Deferred')
        $impactDefinitions = @('Insignificant (Very Low)','Minor (Low)','Moderate (Medium)','Major (High)','Catastrophic (Very High)')
        $likelihoodDefinitions = @('Rare (Very Low)','Unlikely (Low)','Possible (Medium)','Likely (High)','Almost Certain (Very High)')
        @('Risk Categories','Risk Responses','Control Effectiveness','Treatment Status','Impact','Impact Meaning','Likelihood','Likelihood Meaning','Control Type','Control Design Adequacy') |
            ForEach-Object -Begin { $column = 1 } -Process {
                $lookups.Cells.Item(1, $column).Value2 = $_
                $column += 1
            }
        for ($index = 0; $index -lt $categories.Count; $index++) { $lookups.Cells.Item($index + 2, 1).Value2 = $categories[$index] }
        for ($index = 0; $index -lt $responses.Count; $index++) { $lookups.Cells.Item($index + 2, 2).Value2 = $responses[$index] }
        for ($index = 0; $index -lt $effectiveness.Count; $index++) { $lookups.Cells.Item($index + 2, 3).Value2 = $effectiveness[$index] }
        for ($index = 0; $index -lt $statuses.Count; $index++) { $lookups.Cells.Item($index + 2, 4).Value2 = $statuses[$index] }
        for ($index = 0; $index -lt $controlTypes.Count; $index++) { $lookups.Cells.Item($index + 2, 9).Value2 = $controlTypes[$index] }
        for ($index = 0; $index -lt $designAdequacy.Count; $index++) { $lookups.Cells.Item($index + 2, 10).Value2 = $designAdequacy[$index] }
        for ($index = 0; $index -lt 5; $index++) {
            $lookups.Cells.Item($index + 2, 5).Value2 = [string]($index + 1)
            $lookups.Cells.Item($index + 2, 6).Value2 = $impactDefinitions[$index]
            $lookups.Cells.Item($index + 2, 7).Value2 = [string]($index + 1)
            $lookups.Cells.Item($index + 2, 8).Value2 = $likelihoodDefinitions[$index]
        }
        $lookups.Cells.Item(10, 1).Value2 = 'ERM Score Colour'
        $lookups.Cells.Item(10, 2).Value2 = 'Score Range'
        $lookups.Cells.Item(11, 1).Value2 = 'Low'
        $lookups.Cells.Item(11, 2).Value2 = '1 - 10'
        $lookups.Cells.Item(12, 1).Value2 = 'Medium'
        $lookups.Cells.Item(12, 2).Value2 = '11 - 16'
        $lookups.Cells.Item(13, 1).Value2 = 'High'
        $lookups.Cells.Item(13, 2).Value2 = '17 - 25'
        $lookups.Range('A10:B10').Interior.Color = 7346688
        $lookups.Range('A10:B10').Font.Color = 16777215
        $lookups.Range('A10:B10').Font.Bold = $true
        $lookups.Range('A11:B11').Interior.Color = 13561798
        $lookups.Range('A12:B12').Interior.Color = 10284031
        $lookups.Range('A13:B13').Interior.Color = 13551615
        Style-Header $lookups 'A1:J1'
        $lookups.Columns.Item('A:J').AutoFit() | Out-Null

        [void]$book.Names.Add('LegalRiskCategories', "='Approved Values'!`$A`$2:`$A`$8")
        [void]$book.Names.Add('LegalRiskResponses', "='Approved Values'!`$B`$2:`$B`$5")
        [void]$book.Names.Add('LegalControlEffectiveness', "='Approved Values'!`$C`$2:`$C`$5")
        [void]$book.Names.Add('LegalTreatmentStatuses', "='Approved Values'!`$D`$2:`$D`$5")
        [void]$book.Names.Add('LegalImpactRatings', "='Approved Values'!`$E`$2:`$E`$6")
        [void]$book.Names.Add('LegalLikelihoodRatings', "='Approved Values'!`$G`$2:`$G`$6")
        [void]$book.Names.Add('LegalControlTypes', "='Approved Values'!`$I`$2:`$I`$6")
        [void]$book.Names.Add('LegalControlDesign', "='Approved Values'!`$J`$2:`$J`$5")

        foreach ($spec in @(
            @('C2:C501','=LegalRiskCategories','Risk category','Choose an ERM-approved category.'),
            @('L2:L501','=LegalImpactRatings','Risk impact','Choose an integer from 1 to 5.'),
            @('M2:M501','=LegalLikelihoodRatings','Risk likelihood','Choose an integer from 1 to 5.'),
            @('O2:O501','=LegalImpactRatings','Current impact','Choose an integer from 1 to 5.'),
            @('P2:P501','=LegalLikelihoodRatings','Current likelihood','Choose an integer from 1 to 5.'),
            @('R2:R501','=LegalImpactRatings','Post-Mitigation impact','Choose an integer from 1 to 5.'),
            @('S2:S501','=LegalLikelihoodRatings','Post-Mitigation likelihood','Choose an integer from 1 to 5.'),
            @('U2:U501','=LegalRiskResponses','Risk response','Choose Terminate, Treat, Transfer or Tolerate.'),
            @('X2:X501','=LegalTreatmentStatuses','Treatment status','Choose an approved treatment status.'),
            @('Y2:Y501','=LegalControlEffectiveness','Control effectiveness','Choose a governed effectiveness conclusion.'),
            @('Z2:Z501','=LegalControlTypes','Control type','Choose the principal control type.'),
            @('AB2:AB501','=LegalControlDesign','Design adequacy','Choose a governed design conclusion.')
        )) {
            $range = $sheet.Range($spec[0])
            Add-ListValidation $range $spec[1] $spec[2] $spec[3]
            Release-ComObject $range
        }
        foreach ($address in @('K2:K501','W2:W501','AD2:AD501','AF2:AF501')) {
            $range = $sheet.Range($address)
            $range.Validation.Delete()
            $range.Validation.Add(4, 1, 1, '=DATE(2020,1,1)', '=DATE(2100,12,31)')
            $range.Validation.IgnoreBlank = $true
            $range.Validation.ErrorTitle = 'Invalid date'
            $range.Validation.ErrorMessage = 'Enter a valid date between 2020 and 2100.'
            Release-ComObject $range
        }

        $sheet.Range('N2:N501').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
        $sheet.Range('Q2:Q501').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
        $sheet.Range('T2:T501').FormulaR1C1 = '=IF(OR(RC[-2]="",RC[-1]=""),"",RC[-2]*RC[-1])'
        Add-ScoreConditionalFormatting $sheet 'N'
        Add-ScoreConditionalFormatting $sheet 'Q'
        Add-ScoreConditionalFormatting $sheet 'T'
        $sheet.Range('A2:AG501').Locked = $false
        $sheet.Range('N2:N501').Locked = $true
        $sheet.Range('Q2:Q501').Locked = $true
        $sheet.Range('T2:T501').Locked = $true
        $sheet.Protect('NCA-GRC')

        $instructionRows = @(
            @('NCA Official Risk Register Template 2', 'Version 2026.07 - governed workbook aligned with the authoritative ERM Policy and Framework.'),
            @('Purpose', 'Record one separately monitored Legal risk per row while retaining Objective/Process, Risk Source, Risk Event and Risk Cause.'),
            @('One risk per row', 'Do not merge data cells. Repeat all relevant values on every risk row.'),
            @('No. / Risk ID', 'Optional. Leave blank for the system to propose a unique LEGAL-RSK reference, or enter an approved unique Risk ID.'),
            @('Risk Event', 'Use a concise risk event as the Risk Name. Use Risk Description for the possible consequence or fuller risk statement.'),
            @('Risk Source and Cause', 'Record the origin or trigger under Risk Source and the underlying driver under Risk Cause.'),
            @('Approved dropdowns', 'Use the supplied ERM lists for categories, assessment ratings, response, treatment status and control assurance.'),
            @('Calculated scores', 'The blue Inherent, Current and Post-Mitigation score columns calculate Impact x Likelihood and are protected.'),
            @('Score colours', 'Low 1-10 is green, Medium 11-16 is amber and High 17-25 is red.'),
            @('Existing controls', 'Record controls already operating. Proposed future action belongs under Mitigation Plan / Actions.'),
            @('Control effectiveness', 'Effective requires adequate design, dated operating evidence and no unresolved exceptions.'),
            @('Dates', 'Use valid Excel dates. Target Completion Date is required for admitted treatment plans.'),
            @('Correction engine', 'Original values are retained. Missing or invalid values receive explainable, editable proposals for Focal Person confirmation.'),
            @('Legacy workbooks', 'The platform also accepts the July 2026 legacy Legal workbook and safely consolidates its merged continuation rows.'),
            @('Do not alter structure', 'Do not rename headers or add unsupported columns. Use up to 500 data rows.')
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
        $instructions.Columns.Item('A').ColumnWidth = 30
        $instructions.Columns.Item('B').ColumnWidth = 112
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
$riskRegisterFrontend = Join-Path $templateDirectory $riskRegisterName
$legalRiskRegisterFrontend = Join-Path $templateDirectory $legalRiskRegisterName
Build-WorkPlanTemplate $workPlanFrontend
Build-RiskRegisterTemplate $riskRegisterFrontend
Build-LegalRiskRegisterTemplate $legalRiskRegisterFrontend

foreach ($item in @(
    @($workPlanFrontend, (Join-Path $workspace $workPlanName)),
    @($riskRegisterFrontend, (Join-Path $workspace $riskRegisterName)),
    @($legalRiskRegisterFrontend, (Join-Path $workspace $legalRiskRegisterName))
)) {
    try {
        Copy-Item -LiteralPath $item[0] -Destination $item[1] -Force -ErrorAction Stop
        Write-Output $item[1]
    }
    catch {
        $updated = $item[1].Replace('.xlsx', '_Updated.xlsx')
        Copy-Item -LiteralPath $item[0] -Destination $updated -Force
        Write-Output $updated
    }
}
Write-Output $workPlanFrontend
Write-Output $riskRegisterFrontend
Write-Output $legalRiskRegisterFrontend

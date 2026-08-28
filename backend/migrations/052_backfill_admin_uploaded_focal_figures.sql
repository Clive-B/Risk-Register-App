UPDATE risk_assessment_governance governance
SET focal_likelihood = risk.likelihood,
    focal_impact = risk.impact,
    focal_score = risk.likelihood * risk.impact,
    focal_reason = COALESCE(NULLIF(governance.focal_reason,''),'Assessment supplied by the assigned Focal Person in the Administrator-uploaded workbook and awaiting confirmation.'),
    focal_by = risk.accountable_focal_id,
    focal_at = NULL,
    focal_assessment_status = 'Pending Confirmation',
    focal_source = 'Focal-supplied Admin upload',
    focal_source_file = batch.file_name,
    updated_at = NOW()
FROM risks risk
JOIN risk_register_import_batches batch ON batch.id=risk.import_batch_id
WHERE governance.risk_id=risk.id
  AND risk.accountable_focal_id IS NOT NULL
  AND governance.review_stage='Awaiting Focal Review'
  AND risk.likelihood BETWEEN 1 AND 5
  AND risk.impact BETWEEN 1 AND 5;

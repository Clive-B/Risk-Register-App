CREATE TABLE IF NOT EXISTS risk_assessment_governance (
    id BIGSERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL UNIQUE REFERENCES risks(id) ON DELETE CASCADE,
    review_stage VARCHAR(40) NOT NULL DEFAULT 'Awaiting Focal Review',
    system_likelihood INTEGER NOT NULL CHECK (system_likelihood BETWEEN 1 AND 5),
    system_impact INTEGER NOT NULL CHECK (system_impact BETWEEN 1 AND 5),
    system_score INTEGER NOT NULL CHECK (system_score BETWEEN 1 AND 25),
    system_level VARCHAR(20) NOT NULL CHECK (system_level IN ('Low','Medium','High')),
    system_response VARCHAR(30) NOT NULL,
    system_explanation TEXT NOT NULL,
    matched_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
    rules_version VARCHAR(30) NOT NULL DEFAULT '2026.4',
    focal_likelihood INTEGER CHECK (focal_likelihood BETWEEN 1 AND 5),
    focal_impact INTEGER CHECK (focal_impact BETWEEN 1 AND 5),
    focal_score INTEGER CHECK (focal_score BETWEEN 1 AND 25),
    focal_reason TEXT,
    focal_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    focal_at TIMESTAMPTZ,
    champion_likelihood INTEGER CHECK (champion_likelihood BETWEEN 1 AND 5),
    champion_impact INTEGER CHECK (champion_impact BETWEEN 1 AND 5),
    champion_score INTEGER CHECK (champion_score BETWEEN 1 AND 25),
    champion_decision VARCHAR(20),
    champion_reason TEXT,
    champion_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    champion_at TIMESTAMPTZ,
    chairman_likelihood INTEGER CHECK (chairman_likelihood BETWEEN 1 AND 5),
    chairman_impact INTEGER CHECK (chairman_impact BETWEEN 1 AND 5),
    chairman_score INTEGER CHECK (chairman_score BETWEEN 1 AND 25),
    chairman_decision VARCHAR(20),
    chairman_reason TEXT,
    chairman_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    chairman_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT risk_assessment_review_stage_check CHECK (
        review_stage IN ('Awaiting Focal Review','Awaiting Champion Review','Awaiting Chairman Review','Finalised','Returned')
    ),
    CONSTRAINT risk_assessment_champion_decision_check CHECK (
        champion_decision IS NULL OR champion_decision IN ('System','Focal','Adjusted')
    ),
    CONSTRAINT risk_assessment_chairman_decision_check CHECK (
        chairman_decision IS NULL OR chairman_decision IN ('System','Focal','Champion','Adjusted')
    )
);

WITH source_data AS (
    SELECT
        r.*,
        creator.role AS creator_role,
        wa.system_likelihood AS wa_system_likelihood,
        wa.system_impact AS wa_system_impact,
        wa.system_score AS wa_system_score,
        wa.system_level AS wa_system_level,
        wa.system_response AS wa_system_response,
        wa.assessment_explanation AS wa_explanation,
        wa.matched_keywords AS wa_keywords,
        wa.rules_version AS wa_rules_version,
        wa.focal_likelihood AS wa_focal_likelihood,
        wa.focal_impact AS wa_focal_impact,
        wa.focal_score AS wa_focal_score,
        wa.focal_reason AS wa_focal_reason,
        wa.focal_by AS wa_focal_by,
        wa.focal_at AS wa_focal_at,
        wa.champion_likelihood AS wa_champion_likelihood,
        wa.champion_impact AS wa_champion_impact,
        wa.champion_score AS wa_champion_score,
        wa.champion_reason AS wa_champion_reason,
        wa.champion_by AS wa_champion_by,
        wa.champion_at AS wa_champion_at,
        wa.chairman_likelihood AS wa_chairman_likelihood,
        wa.chairman_impact AS wa_chairman_impact,
        wa.chairman_score AS wa_chairman_score,
        wa.chairman_reason AS wa_chairman_reason,
        wa.chairman_by AS wa_chairman_by,
        wa.chairman_at AS wa_chairman_at,
        LOWER(CONCAT_WS(' ',r.risk_title,r.risk_description,r.programme_project,r.business_unit,r.existing_controls)) AS evidence_text
    FROM risks r
    LEFT JOIN users creator ON creator.id=r.created_by
    LEFT JOIN LATERAL (
        SELECT assessment.*
        FROM workplan_risk_assessments assessment
        WHERE assessment.generated_risk_id=r.id OR assessment.action_id=r.source_workplan_action_id
        ORDER BY (assessment.generated_risk_id=r.id) DESC, assessment.id DESC
        LIMIT 1
    ) wa ON TRUE
), assessed AS (
    SELECT source_data.*,
        COALESCE(wa_system_likelihood,
            CASE
                WHEN evidence_text ~ 'cyber|security|privacy|breach|malware|phishing' THEN 4
                WHEN evidence_text ~ 'portal|backend|interface|server|cloud|software|database|system' THEN 4
                WHEN evidence_text ~ 'training|orientation|workshop|sensitization' THEN 2
                ELSE 3
            END
        ) AS calculated_system_likelihood,
        COALESCE(wa_system_impact,
            CASE
                WHEN evidence_text ~ 'cyber|security|privacy|breach|malware|phishing' THEN 5
                WHEN evidence_text ~ 'portal|backend|interface|server|cloud|software|database|system' THEN 4
                WHEN evidence_text ~ 'legal|litigation|contract|financial|budget|regulat|policy|reputation|health|safety' THEN 4
                ELSE 3
            END
        ) AS calculated_system_impact
    FROM source_data
), scored AS (
    SELECT assessed.*,
        calculated_system_likelihood * calculated_system_impact AS calculated_system_score
    FROM assessed
)
INSERT INTO risk_assessment_governance (
    risk_id,review_stage,
    system_likelihood,system_impact,system_score,system_level,system_response,system_explanation,matched_keywords,rules_version,
    focal_likelihood,focal_impact,focal_score,focal_reason,focal_by,focal_at,
    champion_likelihood,champion_impact,champion_score,champion_decision,champion_reason,champion_by,champion_at,
    chairman_likelihood,chairman_impact,chairman_score,chairman_decision,chairman_reason,chairman_by,chairman_at
)
SELECT
    id,
    CASE
        WHEN wa_chairman_score IS NOT NULL OR committee_reviewed_at IS NOT NULL THEN 'Finalised'
        WHEN wa_champion_score IS NOT NULL OR entry_source='Manual - Risk Champion' THEN 'Awaiting Chairman Review'
        WHEN entry_source='Risk Register Tracking Template' OR wa_focal_score IS NOT NULL OR workflow_status IN ('Submitted','Under Review') THEN 'Awaiting Champion Review'
        ELSE 'Awaiting Focal Review'
    END,
    calculated_system_likelihood,
    calculated_system_impact,
    calculated_system_score,
    CASE WHEN calculated_system_score>=20 THEN 'High' WHEN calculated_system_score>=10 THEN 'Medium' ELSE 'Low' END,
    COALESCE(wa_system_response,CASE WHEN calculated_system_score=25 THEN 'Avoid' WHEN calculated_system_score>=6 THEN 'Reduce' ELSE 'Accept' END),
    COALESCE(wa_explanation,'System-generated assessment reconstructed from the risk description and governed keyword rules.'),
    COALESCE(wa_keywords,'[]'::jsonb),
    COALESCE(wa_rules_version,'2026.4-backfill'),
    COALESCE(wa_focal_likelihood,CASE WHEN entry_source IN ('Risk Register Tracking Template','Manual - Risk Focal Person') THEN likelihood END),
    COALESCE(wa_focal_impact,CASE WHEN entry_source IN ('Risk Register Tracking Template','Manual - Risk Focal Person') THEN impact END),
    COALESCE(wa_focal_score,CASE WHEN entry_source IN ('Risk Register Tracking Template','Manual - Risk Focal Person') THEN inherent_risk_score END),
    COALESCE(wa_focal_reason,CASE WHEN entry_source='Risk Register Tracking Template' THEN 'Assessment imported from the Risk Register Tracking Template.' WHEN entry_source='Manual - Risk Focal Person' THEN 'Assessment submitted during manual risk creation.' END),
    COALESCE(wa_focal_by,CASE WHEN entry_source IN ('Risk Register Tracking Template','Manual - Risk Focal Person') THEN created_by END),
    COALESCE(wa_focal_at,CASE WHEN entry_source IN ('Risk Register Tracking Template','Manual - Risk Focal Person') THEN created_at END),
    COALESCE(wa_champion_likelihood,CASE WHEN entry_source='Manual - Risk Champion' THEN likelihood END),
    COALESCE(wa_champion_impact,CASE WHEN entry_source='Manual - Risk Champion' THEN impact END),
    COALESCE(wa_champion_score,CASE WHEN entry_source='Manual - Risk Champion' THEN inherent_risk_score END),
    CASE WHEN wa_champion_score IS NOT NULL THEN CASE WHEN wa_champion_score=wa_system_score THEN 'System' WHEN wa_champion_score=wa_focal_score THEN 'Focal' ELSE 'Adjusted' END WHEN entry_source='Manual - Risk Champion' THEN 'Adjusted' END,
    COALESCE(wa_champion_reason,CASE WHEN entry_source='Manual - Risk Champion' THEN 'Assessment entered directly by the Risk Champion.' END),
    COALESCE(wa_champion_by,CASE WHEN entry_source='Manual - Risk Champion' THEN created_by END),
    COALESCE(wa_champion_at,CASE WHEN entry_source='Manual - Risk Champion' THEN created_at END),
    wa_chairman_likelihood,wa_chairman_impact,wa_chairman_score,
    CASE WHEN wa_chairman_score IS NOT NULL THEN CASE WHEN wa_chairman_score=wa_system_score THEN 'System' WHEN wa_chairman_score=wa_focal_score THEN 'Focal' WHEN wa_chairman_score=wa_champion_score THEN 'Champion' ELSE 'Adjusted' END END,
    wa_chairman_reason,wa_chairman_by,wa_chairman_at
FROM scored
ON CONFLICT (risk_id) DO NOTHING;

UPDATE risks
SET workflow_status='Submitted',
    status='Submitted',
    admission_status='Pending Champion Approval',
    submitted_at=COALESCE(submitted_at,NOW()),
    updated_at=NOW()
WHERE entry_source='Risk Register Tracking Template'
  AND workflow_status='Draft';

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_admission_status_check;
ALTER TABLE risks ADD CONSTRAINT risks_admission_status_check CHECK (
    admission_status IN ('Draft','Pending Champion Approval','Pending Chairman Approval','Admitted','Returned','Rejected')
);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_governance_stage
    ON risk_assessment_governance(review_stage,risk_id);

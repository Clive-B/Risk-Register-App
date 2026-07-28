WITH recovered AS (
SELECT assessment.id,evidence.keywords
FROM workplan_risk_assessments assessment
JOIN workplan_actions action ON assessment.action_id=action.id
JOIN workplan_programmes programme ON programme.id=action.programme_id
CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(DISTINCT found.term), '[]'::jsonb) AS keywords
    FROM (
        SELECT match[1] AS term
        FROM regexp_matches(
            lower(concat_ws(' ',programme.programme,programme.goal,programme.kpi,action.action_point)),
            CASE assessment.risk_category
                WHEN 'Health & Safety' THEN '(health|safety|injury|hazard|emergency|occupational)'
                WHEN 'Reputational' THEN '(reputation|public confidence|media|stakeholder trust|public perception)'
                WHEN 'Legal' THEN '(legal|litigation|contract|statute|court|counsel)'
                WHEN 'Cybersecurity' THEN '(cyber|security|privacy|breach|unauthori[sz]ed|malware|phishing|access control)'
                WHEN 'ICT' THEN '(portal|backend|interface|system testing|server|cloud|iot|open ran|digital infrastructure|data collection|software|database)'
                WHEN 'Financial' THEN '(financial|budget|fund|cost|service provider|profitability|liquidity|solvency)'
                WHEN 'Compliance' THEN '(regulat[a-z]*|policy|competition|g5|benchmark|authority|management)'
                WHEN 'Strategic' THEN '(report[a-z]*|bulletin|research|analysis|advis[a-z]*|publication)'
                WHEN 'Operational' THEN '(training|orientation|workshop|session|engage staff|sensitization)'
                ELSE '(?!)'
            END,
            'g'
        ) AS match
    ) found
) evidence
WHERE assessment.chairman_at IS NULL
  AND assessment.matched_keywords='[]'::jsonb
)
UPDATE workplan_risk_assessments assessment
SET matched_keywords = recovered.keywords,
    assessment_explanation = assessment.assessment_explanation ||
        CASE WHEN jsonb_array_length(recovered.keywords) > 0
             THEN ' Keyword evidence recovered from the archived workbook text: ' ||
                  array_to_string(ARRAY(SELECT jsonb_array_elements_text(recovered.keywords)), ', ') || '.'
             ELSE ' No specialist keyword evidence was found in the archived workbook text.'
        END,
    rules_version = 'legacy-2026.1-backfill'
FROM recovered
WHERE assessment.id=recovered.id;

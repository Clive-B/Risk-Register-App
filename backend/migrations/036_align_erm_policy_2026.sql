-- Align persisted classifications and treatment terminology with the
-- NCA Enterprise Risk Management Policy and Framework reviewed 05/05/2026.

ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_treatment_check;
ALTER TABLE treatment_plans DROP CONSTRAINT IF EXISTS treatment_strategy_check;

UPDATE risks
SET risk_category = CASE risk_category
    WHEN 'Compliance' THEN 'Regulatory Compliance'
    WHEN 'Legal' THEN 'Regulatory Compliance'
    WHEN 'ICT' THEN 'Operational'
    WHEN 'Technology' THEN 'Operational'
    WHEN 'Cybersecurity' THEN 'Operational'
    WHEN 'Procurement' THEN 'Operational'
    WHEN 'Health & Safety' THEN 'Human Capital'
    WHEN 'Human Resource' THEN 'Human Capital'
    ELSE risk_category
END;

UPDATE workplan_risk_assessments
SET risk_category = CASE risk_category
    WHEN 'Compliance' THEN 'Regulatory Compliance'
    WHEN 'Legal' THEN 'Regulatory Compliance'
    WHEN 'ICT' THEN 'Operational'
    WHEN 'Technology' THEN 'Operational'
    WHEN 'Cybersecurity' THEN 'Operational'
    WHEN 'Procurement' THEN 'Operational'
    WHEN 'Health & Safety' THEN 'Human Capital'
    WHEN 'Human Resource' THEN 'Human Capital'
    ELSE risk_category
END,
focal_category = CASE focal_category
    WHEN 'Compliance' THEN 'Regulatory Compliance'
    WHEN 'Legal' THEN 'Regulatory Compliance'
    WHEN 'ICT' THEN 'Operational'
    WHEN 'Technology' THEN 'Operational'
    WHEN 'Cybersecurity' THEN 'Operational'
    WHEN 'Procurement' THEN 'Operational'
    WHEN 'Health & Safety' THEN 'Human Capital'
    WHEN 'Human Resource' THEN 'Human Capital'
    ELSE focal_category
END;

UPDATE risks
SET risk_level = CASE
    WHEN inherent_risk_score >= 17 THEN 'High'
    WHEN inherent_risk_score >= 11 THEN 'Medium'
    ELSE 'Low'
END;

UPDATE workplan_risk_assessments
SET risk_level = CASE WHEN risk_score >= 17 THEN 'High' WHEN risk_score >= 11 THEN 'Medium' ELSE 'Low' END,
    system_level = CASE WHEN system_score IS NULL THEN NULL WHEN system_score >= 17 THEN 'High' WHEN system_score >= 11 THEN 'Medium' ELSE 'Low' END,
    champion_level = CASE WHEN champion_score IS NULL THEN NULL WHEN champion_score >= 17 THEN 'High' WHEN champion_score >= 11 THEN 'Medium' ELSE 'Low' END,
    chairman_level = CASE WHEN chairman_score IS NULL THEN NULL WHEN chairman_score >= 17 THEN 'High' WHEN chairman_score >= 11 THEN 'Medium' ELSE 'Low' END;

UPDATE risk_assessment_governance
SET system_level = CASE WHEN system_score >= 17 THEN 'High' WHEN system_score >= 11 THEN 'Medium' ELSE 'Low' END;

UPDATE risks
SET risk_treatment = CASE risk_treatment
    WHEN 'Avoid' THEN 'Terminate'
    WHEN 'Reduce' THEN 'Treat'
    WHEN 'Share' THEN 'Transfer'
    WHEN 'Accept' THEN 'Tolerate'
    WHEN 'Fallback' THEN 'Treat'
    ELSE risk_treatment
END;

UPDATE workplan_risk_assessments
SET risk_response = CASE risk_response
        WHEN 'Avoid' THEN 'Terminate' WHEN 'Reduce' THEN 'Treat' WHEN 'Share' THEN 'Transfer'
        WHEN 'Accept' THEN 'Tolerate' WHEN 'Fallback' THEN 'Treat' ELSE risk_response END,
    system_response = CASE system_response
        WHEN 'Avoid' THEN 'Terminate' WHEN 'Reduce' THEN 'Treat' WHEN 'Share' THEN 'Transfer'
        WHEN 'Accept' THEN 'Tolerate' WHEN 'Fallback' THEN 'Treat' ELSE system_response END,
    champion_response = CASE champion_response
        WHEN 'Avoid' THEN 'Terminate' WHEN 'Reduce' THEN 'Treat' WHEN 'Share' THEN 'Transfer'
        WHEN 'Accept' THEN 'Tolerate' WHEN 'Fallback' THEN 'Treat' ELSE champion_response END,
    chairman_response = CASE chairman_response
        WHEN 'Avoid' THEN 'Terminate' WHEN 'Reduce' THEN 'Treat' WHEN 'Share' THEN 'Transfer'
        WHEN 'Accept' THEN 'Tolerate' WHEN 'Fallback' THEN 'Treat' ELSE chairman_response END;

UPDATE risk_assessment_governance
SET system_response = CASE system_response
    WHEN 'Avoid' THEN 'Terminate'
    WHEN 'Reduce' THEN 'Treat'
    WHEN 'Share' THEN 'Transfer'
    WHEN 'Accept' THEN 'Tolerate'
    WHEN 'Fallback' THEN 'Treat'
    ELSE system_response
END;

UPDATE treatment_plans
SET treatment_strategy = CASE treatment_strategy
    WHEN 'Avoid' THEN 'Terminate'
    WHEN 'Reduce' THEN 'Treat'
    WHEN 'Share' THEN 'Transfer'
    WHEN 'Accept' THEN 'Tolerate'
    WHEN 'Fallback' THEN 'Treat'
    ELSE treatment_strategy
END;

ALTER TABLE risks ADD CONSTRAINT risks_treatment_check CHECK (
    risk_treatment IS NULL OR risk_treatment IN ('Terminate','Treat','Transfer','Tolerate')
);

ALTER TABLE treatment_plans ADD CONSTRAINT treatment_strategy_check CHECK (
    treatment_strategy IN ('Terminate','Treat','Transfer','Tolerate')
);

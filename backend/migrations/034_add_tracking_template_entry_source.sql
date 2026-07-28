ALTER TABLE risks DROP CONSTRAINT IF EXISTS risks_entry_source_check;

ALTER TABLE risks
    ADD CONSTRAINT risks_entry_source_check
    CHECK (
        entry_source IN (
            'Manual - Risk Focal Person',
            'Manual - Risk Champion',
            'Work Plan',
            'Imported Workbook',
            'Risk Register Tracking Template'
        )
    );

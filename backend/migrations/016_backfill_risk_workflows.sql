INSERT INTO workflow_instances(workflow_definition_id,subject_type,subject_id,item_title,requester_id,division,priority,status,current_stage_order,submitted_at,due_at,metadata)
SELECT d.id,'Risk',r.id::text,r.risk_id||' - '||r.risk_title,r.created_by,COALESCE(NULLIF(r.division,''),r.directorate),COALESCE(r.risk_level,'Normal'),'Pending',1,COALESCE(r.submitted_at,r.created_at),COALESCE(r.submitted_at,r.created_at)+(d.default_sla_hours||' hours')::interval,jsonb_build_object('risk_id',r.risk_id,'backfilled',true)
FROM risks r JOIN workflow_definitions d ON d.workflow_key='risk_approval'
WHERE r.workflow_status='Submitted' AND r.created_by IS NOT NULL
AND NOT EXISTS(SELECT 1 FROM workflow_instances wi WHERE wi.subject_type='Risk' AND wi.subject_id=r.id::text AND wi.status IN('Pending','Under Review','Escalated'));

INSERT INTO workflow_stage_instances(workflow_instance_id,definition_stage_id,stage_order,name,approver_user_id,approver_role,status,due_at,started_at)
SELECT wi.id,s.id,s.stage_order,s.name,
 CASE WHEN s.stage_order=1 THEN (SELECT u.id FROM users u WHERE u.status='Active' AND u.role=s.approver_role AND u.id<>wi.requester_id ORDER BY CASE WHEN COALESCE(NULLIF(u.division,''),u.directorate)=wi.division THEN 0 ELSE 1 END,u.full_name LIMIT 1) ELSE s.approver_user_id END,
 s.approver_role,CASE WHEN s.stage_order=1 THEN 'Under Review' ELSE 'Pending' END,
 CASE WHEN s.stage_order=1 THEN wi.due_at ELSE NULL END,CASE WHEN s.stage_order=1 THEN wi.submitted_at ELSE NULL END
FROM workflow_instances wi JOIN workflow_definition_stages s ON s.workflow_definition_id=wi.workflow_definition_id
WHERE wi.subject_type='Risk' AND NOT EXISTS(SELECT 1 FROM workflow_stage_instances si WHERE si.workflow_instance_id=wi.id AND si.stage_order=s.stage_order);

INSERT INTO workflow_actions(workflow_instance_id,action,to_status,comments,performed_by,created_at)
SELECT wi.id,'Submitted','Pending','Existing submitted risk migrated into the enterprise workflow engine.',wi.requester_id,wi.submitted_at
FROM workflow_instances wi WHERE wi.subject_type='Risk' AND wi.metadata->>'backfilled'='true'
AND NOT EXISTS(SELECT 1 FROM workflow_actions a WHERE a.workflow_instance_id=wi.id);

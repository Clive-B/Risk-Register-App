const XLSX = require('xlsx');
const { isValidNcaEmail, isValidNcaPhone } = require('./contactValidation');
const {
    CORRECTION_RULES_VERSION,
    ruleRecord
} = require('./workbookCorrectionEngine');

const BULK_USER_RULES_VERSION = `${CORRECTION_RULES_VERSION}-USERS-1`;
const MAX_USERS = 500;
const ROLES = [
    'System Administrator',
    'Risk Committee Chairman',
    'Risk Champion',
    'Risk Focal Person'
];
const GLOBAL_ROLES = ['System Administrator','Risk Committee Chairman'];
const DIVISIONS = [
    'RIPS','Legal','Regulatory Administration','Consumer Affairs','Corporate Affairs',
    'Finance','Engineering','Information Technology','Procurement and Protocol',
    'Internal Audit','Human Resource','ROD','Administration','Cybersecurity','International Affairs'
];
const STATUSES = ['Active','Inactive'];
const FIELDS = ['staff_id','full_name','email','role','division','position','phone','status'];
const ALIASES = {
    staff_id:['staff id optional','staff id','staff number','employee id','employee number'],
    full_name:['full name','name','employee name','staff name'],
    email:['official email address','official email','email address','email','nca email'],
    role:['role','system role','user role','access role'],
    division:['division','directorate','department'],
    position:['position optional','position','job title','designation'],
    phone:['phone number optional','phone number','phone','mobile number','contact number'],
    status:['status optional','status','account status']
};

function text(value) {
    return String(value ?? '').trim();
}

function normalizeHeader(value) {
    return text(value).replace(/[^a-zA-Z0-9]+/g,' ').trim().toLowerCase().replace(/\s+/g,' ');
}

const HEADER_LOOKUP = Object.entries(ALIASES).reduce((map,[field,aliases]) => {
    aliases.forEach(alias => map.set(normalizeHeader(alias),field));
    return map;
},new Map());

function canonical(value,approved) {
    const input=text(value).toLowerCase();
    return approved.find(item=>item.toLowerCase()===input) || null;
}

function derivedName(email) {
    const local=text(email).split('@')[0];
    if (!local) return '';
    return local.split(/[._-]+/).filter(Boolean).map(part=>part.charAt(0).toUpperCase()+part.slice(1).toLowerCase()).join(' ');
}

function correction(input) {
    return {...ruleRecord(input),rules_version:BULK_USER_RULES_VERSION};
}

function proposeUser(raw,sourceRow) {
    const corrections=[];
    const original=Object.fromEntries(FIELDS.map(field=>[field,raw[field] ?? null]));
    const normalizedEmail=text(raw.email).toLowerCase().replace(/\s+/g,'');
    if (normalizedEmail !== text(raw.email)) {
        corrections.push(correction({
            ruleId:'USER-EMAIL-NORMALIZE',mistakeType:'Email formatting',
            field:'email',original:raw.email,proposed:normalizedEmail,
            detection:'The email contains uppercase letters or spaces.',
            explanation:'Email addresses are normalised to lowercase without spaces.',
            confidence:'High',validation:'Enter a unique official @nca.org.gh email address.'
        }));
    }
    const fullName=text(raw.full_name) || derivedName(normalizedEmail);
    if (!text(raw.full_name) && fullName) {
        corrections.push(correction({
            ruleId:'USER-NAME-FROM-EMAIL',mistakeType:'Missing required value',
            field:'full_name',original:null,proposed:fullName,
            detection:'Full Name is blank and the email local part contains readable name components.',
            explanation:'A reviewable name was proposed from the official email address.',
            confidence:'Medium',validation:'Confirm the person’s correct full name.'
        }));
    }
    const role=canonical(raw.role,ROLES);
    if (!role) {
        corrections.push(correction({
            ruleId:'USER-ROLE-SELECTION',mistakeType:text(raw.role)?'Unrecognised role':'Missing role',
            field:'role',original:raw.role,proposed:null,
            detection:'Role is blank or does not match the approved NCA GRC role list.',
            explanation:'The system will not guess access privileges. The administrator must choose an approved role.',
            confidence:'Low',validation:`Choose ${ROLES.join(', ')}.`
        }));
    } else if (role !== text(raw.role)) {
        corrections.push(correction({
            ruleId:'USER-ROLE-CANONICAL',mistakeType:'Role formatting',
            field:'role',original:raw.role,proposed:role,
            detection:'The role matches an approved role with different spelling case or spacing.',
            explanation:'The approved role name was applied.',
            confidence:'High',validation:'Choose an approved role.'
        }));
    }
    let division=canonical(raw.division,DIVISIONS);
    if (role && GLOBAL_ROLES.includes(role)) {
        division=null;
        if (text(raw.division)) {
            corrections.push(correction({
                ruleId:'USER-GLOBAL-SCOPE',mistakeType:'Role and division conflict',
                field:'division',original:raw.division,proposed:null,
                detection:'A global role was supplied with a division.',
                explanation:'Global roles receive All Divisions access, so the division is cleared.',
                confidence:'High',validation:'Division must be blank for global roles.'
            }));
        }
    } else if (!division) {
        corrections.push(correction({
            ruleId:'USER-DIVISION-SELECTION',mistakeType:text(raw.division)?'Unrecognised division':'Missing division',
            field:'division',original:raw.division,proposed:null,
            detection:'Division is blank or does not match the approved division list.',
            explanation:'The administrator must choose an approved division for a divisional role.',
            confidence:'Low',validation:'Choose an approved NCA division.'
        }));
    } else if (division !== text(raw.division)) {
        corrections.push(correction({
            ruleId:'USER-DIVISION-CANONICAL',mistakeType:'Division formatting',
            field:'division',original:raw.division,proposed:division,
            detection:'The division matches an approved value with different spelling case or spacing.',
            explanation:'The approved division name was applied.',
            confidence:'High',validation:'Choose an approved division.'
        }));
    }
    const rawPhone=text(raw.phone);
    const digits=rawPhone.replace(/\D/g,'');
    const phone=rawPhone ? digits : null;
    if (!rawPhone) {
        corrections.push(correction({
            ruleId:'USER-PHONE-OPTIONAL',mistakeType:'Optional blank value',
            field:'phone',original:null,proposed:null,
            detection:'Phone Number is blank.',
            explanation:'Phone Number is optional and will remain blank.',
            confidence:'High',validation:'Blank is allowed; a supplied number must be a valid 10-digit Ghana mobile number.'
        }));
    } else if (digits !== rawPhone) {
        corrections.push(correction({
            ruleId:'USER-PHONE-NORMALIZE',mistakeType:'Phone formatting',
            field:'phone',original:raw.phone,proposed:digits,
            detection:'The phone number contains spaces or punctuation.',
            explanation:'Non-numeric formatting characters were removed.',
            confidence:'High',validation:'A supplied phone number must be 10 digits with an approved prefix.'
        }));
    }
    const staffId=text(raw.staff_id) || null;
    if (!staffId) {
        corrections.push(correction({
            ruleId:'USER-STAFF-ID-OPTIONAL',mistakeType:'Optional blank value',
            field:'staff_id',original:null,proposed:null,
            detection:'Staff ID is blank.',
            explanation:'Staff ID is optional and will remain blank. The system will not generate one.',
            confidence:'High',validation:'Blank is allowed; a supplied Staff ID must be unique and no longer than 50 characters.'
        }));
    }
    const status=canonical(raw.status,STATUSES) || (text(raw.status)?null:'Active');
    if (!text(raw.status)) {
        corrections.push(correction({
            ruleId:'USER-STATUS-DEFAULT',mistakeType:'Missing optional value',
            field:'status',original:null,proposed:'Active',
            detection:'Status is blank.',
            explanation:'New accounts default to Active while remaining pending first-login activation.',
            confidence:'High',validation:'Choose Active or Inactive.'
        }));
    } else if (!status) {
        corrections.push(correction({
            ruleId:'USER-STATUS-SELECTION',mistakeType:'Unrecognised status',
            field:'status',original:raw.status,proposed:null,
            detection:'Status does not match the approved list.',
            explanation:'The administrator must choose Active or Inactive.',
            confidence:'Low',validation:'Choose Active or Inactive.'
        }));
    }
    return {
        row_key:String(raw.row_key || sourceRow),
        source_row:sourceRow,
        original,
        values:{
            staff_id:staffId,full_name:fullName,email:normalizedEmail,role,
            division,position:text(raw.position) || null,phone,status
        },
        corrections,
        rules_version:BULK_USER_RULES_VERSION
    };
}

function validateUser(values) {
    const errors=[];
    if (!text(values.full_name)) errors.push('Full Name is required.');
    if (!text(values.email)) errors.push('Official Email Address is required.');
    else if (!isValidNcaEmail(values.email)) errors.push('Only official NCA email addresses (@nca.org.gh) are permitted.');
    if (!ROLES.includes(values.role)) errors.push('Select an approved role.');
    if (GLOBAL_ROLES.includes(values.role)) {
        if (text(values.division)) errors.push('Division must be blank for global roles.');
    } else if (!DIVISIONS.includes(values.division)) errors.push('Select an approved division.');
    if (values.phone && !isValidNcaPhone(values.phone)) errors.push('A supplied phone number must be exactly 10 digits with an approved network prefix.');
    if (values.staff_id && text(values.staff_id).length > 50) errors.push('Staff ID cannot exceed 50 characters.');
    if (!STATUSES.includes(values.status)) errors.push('Select Active or Inactive.');
    return errors;
}

function addDuplicateErrors(rows) {
    const emailCounts=new Map();
    const staffCounts=new Map();
    rows.forEach(row=>{
        const email=text(row.values.email).toLowerCase();
        if (email) emailCounts.set(email,(emailCounts.get(email)||0)+1);
        const staff=text(row.values.staff_id).toLowerCase();
        if (staff) staffCounts.set(staff,(staffCounts.get(staff)||0)+1);
    });
    rows.forEach(row=>{
        row.errors=validateUser(row.values);
        if (emailCounts.get(text(row.values.email).toLowerCase())>1) row.errors.push('Email is duplicated within this batch.');
        if (row.values.staff_id && staffCounts.get(text(row.values.staff_id).toLowerCase())>1) row.errors.push('Staff ID is duplicated within this batch.');
        row.errors=[...new Set(row.errors)];
        row.valid=row.errors.length===0;
    });
    return rows;
}

function buildManualUserPreview(inputRows) {
    if (!Array.isArray(inputRows) || !inputRows.length) throw Object.assign(new Error('Add at least one proposed user.'),{statusCode:400});
    if (inputRows.length>MAX_USERS) throw Object.assign(new Error(`A maximum of ${MAX_USERS} users may be created at once.`),{statusCode:400});
    return addDuplicateErrors(inputRows.map((row,index)=>proposeUser({...row,row_key:row.row_key||`manual-${index+1}`},index+1)));
}

function parseUserWorkbook(buffer) {
    let workbook;
    try { workbook=XLSX.read(buffer,{type:'buffer',cellDates:true}); }
    catch (_) { throw Object.assign(new Error('The Excel workbook is corrupt, encrypted or cannot be read.'),{statusCode:400}); }
    let detected=null;
    workbook.SheetNames.forEach(sheetName=>{
        const sheet=workbook.Sheets[sheetName];
        const start=sheet['!ref']?XLSX.utils.decode_range(sheet['!ref']).s.r:0;
        const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:false,blankrows:true});
        matrix.forEach((row,index)=>{
            const mapped=row.map(cell=>HEADER_LOOKUP.get(normalizeHeader(cell))||null);
            const fields=new Set(mapped.filter(Boolean));
            const score=fields.size+(fields.has('email')?20:0)+(fields.has('full_name')?10:0);
            if (fields.has('email')&&fields.has('full_name')&&(!detected||score>detected.score)) {
                detected={sheetName,start,matrix,headerIndex:index,mapped,score};
            }
        });
    });
    if (!detected) throw Object.assign(new Error('A supported user header row containing Full Name and Official Email Address could not be detected.'),{statusCode:400});
    const columns={};
    detected.mapped.forEach((field,index)=>{if(field&&columns[field]===undefined)columns[field]=index;});
    const rows=[];
    detected.matrix.slice(detected.headerIndex+1).forEach((source,offset)=>{
        if (!Object.values(columns).some(index=>text(source[index]))) return;
        const raw={};
        FIELDS.forEach(field=>{raw[field]=columns[field]===undefined?null:source[columns[field]];});
        const sourceRow=detected.start+detected.headerIndex+offset+2;
        rows.push(proposeUser({...raw,row_key:`excel-${sourceRow}`},sourceRow));
    });
    if (!rows.length) throw Object.assign(new Error('No proposed users were found below the workbook header.'),{statusCode:400});
    if (rows.length>MAX_USERS) throw Object.assign(new Error(`A maximum of ${MAX_USERS} users may be created at once.`),{statusCode:400});
    return {
        sheet_name:detected.sheetName,
        header_row:detected.start+detected.headerIndex+1,
        rows:addDuplicateErrors(rows),
        rules_version:BULK_USER_RULES_VERSION
    };
}

function applyConfirmedUsers(previewRows,confirmedRows) {
    if (!Array.isArray(confirmedRows)||confirmedRows.length!==previewRows.length) {
        throw Object.assign(new Error('Review and confirm every proposed user before creating accounts.'),{statusCode:400});
    }
    const submitted=new Map(confirmedRows.map(row=>[String(row.row_key),row]));
    return previewRows.map(proposal=>{
        const confirmed=submitted.get(proposal.row_key);
        if (!confirmed||confirmed.confirmed!==true||!confirmed.values) {
            throw Object.assign(new Error(`Confirm proposed user row ${proposal.source_row}.`),{statusCode:400});
        }
        const values=Object.fromEntries(FIELDS.map(field=>[field,confirmed.values[field]??null]));
        const errors=validateUser(values);
        if(errors.length)throw Object.assign(new Error(`User row ${proposal.source_row}: ${errors[0]}`),{statusCode:422});
        return {
            values,
            audit:{
                rules_version:BULK_USER_RULES_VERSION,
                original:proposal.original,
                system_proposal:proposal.values,
                confirmed_values:values,
                explanations:proposal.corrections,
                confirmed:true
            }
        };
    });
}

module.exports={
    BULK_USER_RULES_VERSION,DIVISIONS,FIELDS,GLOBAL_ROLES,MAX_USERS,ROLES,STATUSES,
    applyConfirmedUsers,buildManualUserPreview,parseUserWorkbook,validateUser
};

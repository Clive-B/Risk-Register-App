const path = require('node:path');

const ALLOWED_ATTACHMENTS = new Map([
    ['.pdf', { mime:'application/pdf', magic:buffer => buffer.subarray(0, 5).toString() === '%PDF-' }],
    ['.doc', { mime:'application/msword', magic:isCompoundFile }],
    ['.docx', { mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic:isZipFile }],
    ['.xls', { mime:'application/vnd.ms-excel', magic:isCompoundFile }],
    ['.xlsx', { mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic:isZipFile }],
    ['.png', { mime:'image/png', magic:buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) }],
    ['.jpg', { mime:'image/jpeg', magic:buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
    ['.jpeg', { mime:'image/jpeg', magic:buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
    ['.gif', { mime:'image/gif', magic:buffer => ['GIF87a','GIF89a'].includes(buffer.subarray(0, 6).toString()) }],
    ['.webp', { mime:'image/webp', magic:buffer => buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' }]
]);

function isZipFile(buffer) {
    return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03,0x05,0x07].includes(buffer[2]);
}

function isCompoundFile(buffer) {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]));
}

function decodeBase64(data) {
    const input = String(data || '').trim();
    const match = input.match(/^data:([^;,]+);base64,([A-Za-z0-9+/\s]+={0,2})$/i);
    const declaredMime = match?.[1]?.toLowerCase() || null;
    const encoded = (match ? match[2] : input).replace(/\s/g, '');
    if (!encoded || encoded.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
        throw Object.assign(new Error('The attachment data is not valid base64.'), { statusCode:400 });
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (!buffer.length) throw Object.assign(new Error('The attachment is empty.'), { statusCode:400 });
    return { buffer, declaredMime };
}

function validateAttachment({ name, type, data, maxBytes = 5 * 1024 * 1024 }) {
    const fileName = String(name || '').trim();
    if (!fileName || fileName.length > 255 || path.basename(fileName) !== fileName || /[\0\r\n]/.test(fileName)) {
        throw Object.assign(new Error('The attachment file name is invalid.'), { statusCode:400 });
    }
    const extension = path.extname(fileName).toLowerCase();
    const profile = ALLOWED_ATTACHMENTS.get(extension);
    if (!profile) throw Object.assign(new Error('Only PDF, Word, Excel, and image attachments are allowed.'), { statusCode:400 });
    const { buffer, declaredMime } = decodeBase64(data);
    if (buffer.length > maxBytes) throw Object.assign(new Error(`Attachment must not exceed ${Math.floor(maxBytes / 1024 / 1024)} MB.`), { statusCode:400 });
    const suppliedMime = String(type || declaredMime || '').trim().toLowerCase();
    if (suppliedMime && suppliedMime !== profile.mime) {
        throw Object.assign(new Error('The attachment type does not match its file extension.'), { statusCode:400 });
    }
    if (!profile.magic(buffer)) {
        throw Object.assign(new Error('The attachment contents do not match its file type.'), { statusCode:400 });
    }
    return { fileName, fileType:profile.mime, buffer };
}

module.exports = { ALLOWED_ATTACHMENTS, decodeBase64, validateAttachment };

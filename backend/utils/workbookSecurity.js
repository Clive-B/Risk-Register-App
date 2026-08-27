const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL_ENTRY = 0x02014b50;

function workbookError(message) {
    return Object.assign(new Error(message), { statusCode:400 });
}

function assertSafeWorkbook(buffer, options = {}) {
    const maxEntries = options.maxEntries || 2048;
    const maxExpandedBytes = options.maxExpandedBytes || 50 * 1024 * 1024;
    const maxEntryBytes = options.maxEntryBytes || 25 * 1024 * 1024;
    const maxCompressionRatio = options.maxCompressionRatio || 100;
    const isZip = buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (!isZip) return;

    const searchStart = Math.max(0, buffer.length - 65557);
    let eocd = -1;
    for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
        if (buffer.readUInt32LE(offset) === ZIP_EOCD) { eocd = offset; break; }
    }
    if (eocd < 0) throw workbookError('The Excel workbook ZIP directory is invalid.');
    const entryCount = buffer.readUInt16LE(eocd + 10);
    const centralSize = buffer.readUInt32LE(eocd + 12);
    const centralOffset = buffer.readUInt32LE(eocd + 16);
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
        throw workbookError('ZIP64 Excel workbooks are not accepted.');
    }
    if (!entryCount || entryCount > maxEntries || centralOffset + centralSize > eocd) {
        throw workbookError('The Excel workbook contains an unsafe number of ZIP entries.');
    }

    let offset = centralOffset;
    let expandedBytes = 0;
    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== ZIP_CENTRAL_ENTRY) {
            throw workbookError('The Excel workbook ZIP directory is corrupt.');
        }
        const flags = buffer.readUInt16LE(offset + 8);
        const compression = buffer.readUInt16LE(offset + 10);
        const compressed = buffer.readUInt32LE(offset + 20);
        const expanded = buffer.readUInt32LE(offset + 24);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        if ((flags & 1) !== 0 || ![0,8].includes(compression) || compressed === 0xffffffff || expanded === 0xffffffff) {
            throw workbookError('Encrypted, ZIP64, or unsupported workbook entries are not accepted.');
        }
        expandedBytes += expanded;
        if (expanded > maxEntryBytes || expandedBytes > maxExpandedBytes || (compressed === 0 ? expanded > 0 : expanded / compressed > maxCompressionRatio)) {
            throw workbookError('The Excel workbook expands beyond safe processing limits.');
        }
        offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset !== centralOffset + centralSize) throw workbookError('The Excel workbook ZIP directory length is invalid.');
}

module.exports = { assertSafeWorkbook };

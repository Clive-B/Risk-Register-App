function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function neutralizeSpreadsheetFormula(value) {
    const text = String(value ?? '');
    return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value) {
    const serialized = typeof value === 'object' && value !== null ? JSON.stringify(value) : value;
    return `"${neutralizeSpreadsheetFormula(serialized).replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
    const selected = columns || Object.keys(rows[0] || {});
    return [selected.join(','), ...rows.map(row => selected.map(column => csvCell(row[column])).join(','))].join('\n');
}

module.exports = { csvCell, escapeHtml, neutralizeSpreadsheetFormula, toCsv };

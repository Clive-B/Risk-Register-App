function divisionRiskCode(value) {
    const letters = String(value || 'NCA')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase();

    return letters.slice(0, 4) || 'NCA';
}

module.exports = { divisionRiskCode };

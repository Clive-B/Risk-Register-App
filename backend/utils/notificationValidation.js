function validatePagination(query = {}) {
    const page = Number(query.page || 1);
    const limit = Number(query.limit || 25);

    const errors = [];
    if (!Number.isInteger(page) || page < 1) errors.push('Page must be a positive integer.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) errors.push('Limit must be between 1 and 100.');

    return { page, limit, errors };
}

function validateCreatePayload(body = {}) {
    const errors = [];
    const title = String(body.title || '').trim();
    const message = String(body.message || '').trim();
    const userId = body.userId;

    if (!title) errors.push('Title is required.');
    if (!message) errors.push('Message is required.');
    if (userId !== undefined && userId !== null && userId !== '' && !Number.isInteger(Number(userId))) {
        errors.push('userId must be an integer.');
    }

    return errors;
}

module.exports = {
    validatePagination,
    validateCreatePayload
};

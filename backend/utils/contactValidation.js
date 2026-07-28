const NCA_EMAIL_PATTERN = /^[a-z0-9]+(?:[._%+-][a-z0-9]+)*@nca\.org\.gh$/i;
const NCA_PHONE_PATTERN = /^(?:020|024|025|026|027|050|053|054|055|056|057|059)\d{7}$/;

function isValidNcaEmail(value) {
    return NCA_EMAIL_PATTERN.test(String(value || '').trim());
}

function isValidNcaPhone(value) {
    return NCA_PHONE_PATTERN.test(String(value || '').trim());
}

module.exports = {
    NCA_EMAIL_PATTERN,
    NCA_PHONE_PATTERN,
    isValidNcaEmail,
    isValidNcaPhone
};

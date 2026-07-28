function isChampionReviewComplete(risk) {
    return risk.review_stage === 'Awaiting Champion Review'
        && Boolean(risk.champion_decision)
        && Number(risk.champion_score) >= 1
        && Number(risk.champion_score) <= 25;
}

function canApproveImportBatch(batch, user) {
    const authorizedRole = ['Risk Champion','System Administrator'].includes(user.role);
    const authorizedDivision = user.role === 'System Administrator'
        || (user.division || user.directorate) === batch.division;
    return authorizedRole
        && authorizedDivision
        && batch.status === 'Champion Review'
        && Number(batch.risk_count) > 0
        && Number(batch.champion_reviewed_count) === Number(batch.risk_count);
}

module.exports = { isChampionReviewComplete, canApproveImportBatch };

require('dotenv').config();

const { providerConfiguration, runtimeInstruction } = require('../services/assistantPolicy');

async function main() {
    const config = providerConfiguration();
    if (config.provider !== 'llamacpp' || !config.configured) {
        throw new Error('The on-premises llama.cpp provider is not configured.');
    }

    const controller = new AbortController();
    // Deployment starts with an unloaded model. Keep that one-time readiness
    // allowance separate from the much shorter interactive query budget.
    const readinessTimeoutMs = Math.min(
        Math.max(Number(process.env.AI_READINESS_TIMEOUT_MS) || 60000, config.timeoutMs),
        120000
    );
    const timeout = setTimeout(() => controller.abort(), readinessTimeoutMs);
    try {
        const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: runtimeInstruction({ assistantName: 'NCA GRC Assistant', applicationName: 'NCA Enterprise GRC Platform', scope: 'general' }) },
                    { role: 'user', content: 'Reply with the single word READY.' }
                ],
                stream: false,
                max_tokens: 16,
                temperature: 0,
                chat_template_kwargs: { enable_thinking: false }
            }),
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}.`);
        const payload = await response.json();
        const content = String(payload?.choices?.[0]?.message?.content || '').trim();
        if (!content) throw new Error('Local model returned an empty response.');
        console.log(JSON.stringify({ ready: true, provider: 'llamacpp', model: payload.model || config.model, responseReceived: true }));
    } finally {
        clearTimeout(timeout);
    }
}

main().catch(error => {
    console.error(`LOCAL AI READINESS CHECK FAILED\n${error.message}`);
    process.exitCode = 1;
});

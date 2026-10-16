require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { assertRuntimeConfiguration, splitOrigins } = require('./config/runtime');

assertRuntimeConfiguration();

const pool = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const riskRoutes = require('./routes/risks');
const treatmentRoutes = require('./routes/treatments');
const auditRoutes = require('./routes/auditRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const communicationRoutes = require('./routes/communicationRoutes');
const centerRoutes = require('./routes/centerRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const executiveAnalyticsRoutes = require('./routes/executiveAnalyticsRoutes');
const actionRoutes = require('./routes/actionRoutes');
const workplanRoutes = require('./routes/workplans');
const reportRoutes = require('./routes/reportRoutes');
const complianceRoutes = require('./routes/complianceRoutes');
const systemSettingsRoutes = require('./routes/systemSettingsRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const roleMiddleware = require('./middleware/roleMiddleware');


const allowedOrigins = splitOrigins(process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:5501,http://127.0.0.1:5501');
const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const allowedHeaders = ['Content-Type', 'Authorization'];

const app = express();
require('./services/communicationWorker').start();
require('./services/treatmentAlertService').start();
require('./services/workplanArchiveService').start();
require('./services/aiReportScheduleService').start();

app.disable('x-powered-by');
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));
app.use(helmet());
app.use((req, res, next) => {
    const origin = req.headers.origin;

    if (!origin) {
        next();
        return;
    }

    if (!allowedOrigins.includes(origin)) {
        res.status(403).json({ success: false, message: 'Origin not allowed' });
        return;
    }

    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', allowedMethods.join(','));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(','));
    res.setHeader('Access-Control-Allow-Credentials', 'false');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});
// Assistant requests contain only bounded text and UI metadata. Parse them with
// a narrow limit before the application-wide JSON parser used by bulk workflows.
app.use('/api/assistant', express.json({ limit: process.env.ASSISTANT_JSON_BODY_LIMIT || '64kb' }));
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '12mb' }));

app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ success: true, status: 'healthy' });
    } catch (error) {
        res.status(503).json({ success: false, status: 'unhealthy' });
    }
});

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const assistantLimiter = rateLimit({ windowMs: 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/risks', riskRoutes);
app.use('/api/treatments', treatmentRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', communicationRoutes);
app.use('/api', centerRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/executive-analytics', executiveAnalyticsRoutes);
app.use('/api/actions', actionRoutes);
app.use('/api/workplans', workplanRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/compliance-obligations', complianceRoutes);
app.use('/api/system-settings', systemSettingsRoutes);
app.use('/api/assistant', assistantLimiter, assistantRoutes);

app.get('/', (req, res) => {
    res.send('NCA Risk Register API is running');
});

if (process.env.NODE_ENV !== 'production') app.get('/api/test-db', authMiddleware, roleMiddleware('System Administrator'), async (req, res) => {
    try {
        const result = await pool.query(`
    SELECT
        id,
        staff_id,
        full_name,
        email,
        role,
        directorate,
        status,
        created_at,
        last_login
    FROM users
`);
        res.json({
            success: true,
            users: result.rows
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

if (process.env.NODE_ENV !== 'production') app.get('/api/protected', authMiddleware, (req, res) => {

    res.json({
        success: true,
        message: 'Welcome to the protected Risk Register Dashboard!',
        user: req.user
    });

});

if (process.env.NODE_ENV !== 'production') app.post('/test-post', (req, res) => {
    res.json({
        success: true,
        message: 'POST route works'
    });
});

app.use('/api', (req,res) => res.status(404).json({success:false,message:`API endpoint not found: ${req.method} ${req.originalUrl}`}));
app.use((error,req,res,next)=>{console.error(error);if(res.headersSent)return next(error);res.status(500).json({success:false,message:'An unexpected server error occurred.'});});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, process.env.API_HOST || '127.0.0.1', () => {
    console.log(`NCA GRC API listening on ${process.env.API_HOST || '127.0.0.1'}:${PORT}`);
});

async function shutdown(signal) {
    console.log(`${signal} received; stopping NCA GRC API.`);
    server.close(async () => {
        await pool.end().catch(() => {});
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));

const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const c = require('../controllers/notificationController');

router.use(auth);
router.get('/', c.list);
router.get('/unread-count', c.getUnreadCount);
router.post('/', c.create);
router.patch('/:id/read', c.read);
router.patch('/read-all', c.readAll);
router.put('/read', c.read);
router.put('/read-all', c.readAll);
router.delete('/:id', c.delete);

module.exports = router;

const express=require('express');
const auth=require('../middleware/authMiddleware');
const controller=require('../controllers/assistantController');
const router=express.Router();
router.get('/context',auth,controller.context);
router.post('/query',auth,controller.query);
module.exports=router;

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { getMessages, getMessageCount, createSystemMessage, deleteMessage } = require('../controllers/chatController');

router.get('/messages', protect, getMessages);
router.get('/messages/count', protect, getMessageCount);
router.post('/messages/system', protect, createSystemMessage);
router.delete('/messages/:id', protect, deleteMessage);

module.exports = router;


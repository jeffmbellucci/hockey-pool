const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect, requireAdmin } = require('../middleware/authMiddleware');

// Email settings routes (Admin only)
router.get('/settings', protect, requireAdmin, notificationController.getEmailSettings);
router.put('/settings', protect, requireAdmin, notificationController.updateEmailSettings);
router.post('/connection', protect, requireAdmin, notificationController.checkConnection);
router.post('/test-email', protect, requireAdmin, notificationController.sendTestEmail);

// User notification preferences
router.get('/preferences', protect, notificationController.getUserPreferences);
router.get('/preferences/:contestId', protect, notificationController.getUserPreferences);
router.put('/preferences/:contestId', protect, notificationController.updateUserPreferences);

// Notification history and management (Admin only)
router.get('/history/:contestId', protect, requireAdmin, notificationController.getNotificationHistory);
router.post('/process', protect, requireAdmin, notificationController.processNotifications);

module.exports = router;


const express = require('express');
const router = express.Router();
const {
    getCurrentUser,
    updateProfile
} = require('../controllers/userController');
const { authenticate } = require('../middleware/authMiddleware');

// Protected routes (require authentication)
router.get('/me', authenticate, getCurrentUser);
router.put('/profile', authenticate, updateProfile);

module.exports = router;

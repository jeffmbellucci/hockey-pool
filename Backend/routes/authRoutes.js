const express = require("express");
const router = express.Router();
const {
  register,
  login,
  refreshToken,
  logout
} = require("../controllers/authController");
const { authenticate, protect, requireAdmin } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", protect, requireAdmin, register);
router.post("/login", login);
router.post("/refresh-token", refreshToken);
// removed 2FA verification route

// Protected routes (require authentication)
router.post("/logout", authenticate, logout);

module.exports = router;

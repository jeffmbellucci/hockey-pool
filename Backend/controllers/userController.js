const User = require('../models/User');

/**
 * Get current user profile
 * @route GET /api/users/me
 * @access Private
 */
const getCurrentUser = async (req, res, next) => {
    try {
        // User ID is added by the auth middleware
        const userId = req.userId;

        // Find user by ID
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Return user info (excluding sensitive data)
        res.status(200).json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                lastName: user.last_name,
                email: user.email,
                role: user.role,
                active: user.active,
                created_at: user.created_at,
                updated_at: user.updated_at
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update user profile
 * @route PUT /api/users/profile
 * @access Private
 */
const updateProfile = async (req, res, next) => {
    try {
        const userId = req.userId;
        const { name, lastName, email, currentPassword, newPassword } = req.body;

        // Find current user
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Build update data object
        const updateData = {};

        // Update name if provided
        if (name && name.trim() !== '') {
            updateData.name = name.trim();
        }

        // Update last name if provided
        if (lastName && lastName.trim() !== '') {
            updateData.lastName = lastName.trim();
        }

        // Update email if provided and different
        if (email && email.trim() !== '' && email.toLowerCase() !== user.email) {
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Please provide a valid email address'
                });
            }

            // Check if email is already taken
            const existingUser = await User.findByEmail(email);
            if (existingUser && existingUser.id !== userId) {
                return res.status(409).json({
                    success: false,
                    message: 'Email is already taken'
                });
            }

            updateData.email = email.toLowerCase();
        }

        // Update password if both current and new password provided
        if (currentPassword && newPassword) {
            // Verify current password
            const isMatch = await User.comparePassword(currentPassword, user.password);
            if (!isMatch) {
                return res.status(401).json({
                    success: false,
                    message: 'Current password is incorrect'
                });
            }

            // Validate new password strength
            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be at least 8 characters long'
                });
            }

            // Hash new password
            const bcrypt = require('bcrypt');
            const salt = await bcrypt.genSalt(12);
            updateData.password = await bcrypt.hash(newPassword, salt);
        } else if (currentPassword || newPassword) {
            // If only one password field is provided
            return res.status(400).json({
                success: false,
                message: 'Both current and new password are required to change password'
            });
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        // Update user
        const updatedUser = await User.update(userId, updateData);

        if (!updatedUser) {
            return res.status(500).json({
                success: false,
                message: 'Failed to update profile'
            });
        }

        // Return updated user info
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                lastName: updatedUser.last_name || lastName,
                email: updatedUser.email,
                role: updatedUser.role,
                active: updatedUser.active,
                updated_at: updatedUser.updated_at
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getCurrentUser,
    updateProfile
};

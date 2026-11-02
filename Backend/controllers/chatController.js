const ChatMessage = require('../models/ChatMessage');

/**
 * Get recent chat messages with pagination
 */
const getMessages = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
    const before = req.query.before ? parseInt(req.query.before) : null;
    
    if (before !== null && isNaN(before)) {
      return res.status(400).json({ success: false, message: 'Invalid "before" parameter' });
    }
    
    let messages;
    
    if (before) {
      messages = await ChatMessage.getMessagesBefore(before, limit);
    } else {
      messages = await ChatMessage.getRecentMessages(limit);
    }
    
    const formattedMessages = messages.map(msg => ({
      id: msg.id,
      userId: msg.user_id,
      userName: msg.username,
      message: msg.message,
      timestamp: msg.created_at,
      type: msg.type
    }));

    res.json({
      success: true,
      messages: formattedMessages,
      count: formattedMessages.length
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages'
    });
  }
};

/**
 * Get total message count
 */
const getMessageCount = async (req, res) => {
  try {
    const count = await ChatMessage.getMessageCount();
    res.json({
      success: true,
      count
    });
  } catch (error) {
    console.error('Error fetching message count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch message count'
    });
  }
};

/**
 * Create a system message (admin only)
 */
const createSystemMessage = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send system messages'
      });
    }

    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Message content is required'
      });
    }

    const systemMessage = await ChatMessage.createSystemMessage(message);
    
    const io = req.app.get('io');
    if (io) {
      io.emit('chat:message', {
        id: systemMessage.id,
        userId: null,
        userName: 'System',
        message: systemMessage.message,
        timestamp: systemMessage.created_at,
        type: 'system'
      });
    }

    res.status(201).json({
      success: true,
      message: systemMessage
    });
  } catch (error) {
    console.error('Error creating system message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create system message'
    });
  }
};

/**
 * Delete a message (admin only)
 */
const deleteMessage = async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete messages'
      });
    }

    const messageId = parseInt(req.params.id);
    const deleted = await ChatMessage.deleteMessage(messageId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('chat:messageDeleted', { messageId });
    }

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message'
    });
  }
};

module.exports = { getMessages, getMessageCount, createSystemMessage, deleteMessage };

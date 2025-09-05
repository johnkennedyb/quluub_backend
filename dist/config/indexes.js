const mongoose = require('mongoose');

// Database indexes for optimal performance
const createIndexes = async () => {
  try {
    // Wait for MongoDB connection to be ready
    if (mongoose.connection.readyState !== 1) {
      console.log('⏳ Waiting for MongoDB connection...');
      await new Promise((resolve) => {
        mongoose.connection.once('connected', resolve);
      });
    }
    
    const db = mongoose.connection.db;
    
    if (!db) {
      console.log('❌ Database connection not available');
      return;
    }
    
    console.log('🔧 Creating database indexes for optimal performance...');
    
    // Chat collection indexes
    await db.collection('chats').createIndex({ senderId: 1, receiverId: 1 });
    await db.collection('chats').createIndex({ receiverId: 1, status: 1 });
    await db.collection('chats').createIndex({ created: -1 });
    await db.collection('chats').createIndex({ senderId: 1, created: -1 });
    await db.collection('chats').createIndex({ receiverId: 1, created: -1 });
    
    // Message collection indexes
    await db.collection('messages').createIndex({ conversationId: 1, createdAt: -1 });
    await db.collection('messages').createIndex({ messageType: 1 });
    await db.collection('messages').createIndex({ 'videoCallData.recipientId': 1, 'videoCallData.status': 1 });
    
    // Relationship collection indexes
    await db.collection('relationships').createIndex({ follower_user_id: 1, followed_user_id: 1 });
    await db.collection('relationships').createIndex({ follower_user_id: 1, status: 1 });
    await db.collection('relationships').createIndex({ followed_user_id: 1, status: 1 });
    
    // User collection indexes (skip unique indexes if they already exist)
    try {
      await db.collection('users').createIndex({ email: 1 }, { unique: true });
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
    
    try {
      await db.collection('users').createIndex({ username: 1 }, { unique: true });
    } catch (e) {
      if (!e.message.includes('already exists')) throw e;
    }
    
    await db.collection('users').createIndex({ plan: 1 });
    await db.collection('users').createIndex({ gender: 1 });
    
    // Conversation collection indexes
    await db.collection('conversations').createIndex({ participants: 1 });
    await db.collection('conversations').createIndex({ lastActivity: -1 });
    
    console.log('✅ Database indexes created successfully');
    
  } catch (error) {
    console.error('❌ Error creating database indexes:', error);
  }
};

module.exports = { createIndexes };

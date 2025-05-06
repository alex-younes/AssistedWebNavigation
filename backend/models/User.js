const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  password: {
    type: String,
    required: true
  },
  userId: {
    type: String,
    required: true,
    unique: true // This will be the ID used across services, distinct from MongoDB's _id
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// We can add pre-save hooks for password hashing here later if we choose,
// or handle hashing in the service layer.

const User = mongoose.model('User', userSchema);

module.exports = User; 
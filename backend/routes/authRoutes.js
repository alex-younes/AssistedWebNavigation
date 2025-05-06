const express = require('express');
const router = express.Router();
const ServiceManager = require('../services/ServiceManager');
const debug = require('../utils/debug'); // Assuming you have a debug utility

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body;
  debug('[API/Auth] Registering user:', username); // Log username only for privacy

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    // The actual registration logic (hashing password, saving user) will be in ServiceManager
    const result = await ServiceManager.registerUser(username, password);
    if (result.success) {
      // On successful registration, you might want to log the user in automatically
      // or send back a success message and let the client handle login.
      // For now, sending back userId and username for the extension to store.
      debug('[API/Auth] Registration successful for:', username, 'userId:', result.userId);
      res.status(201).json({ 
        success: true, 
        message: 'User registered successfully.', 
        userId: result.userId,
        username: result.username // Send username back for consistency
      });
    } else {
      debug('[API/Auth] Registration failed for:', username, 'Error:', result.message);
      res.status(400).json({ success: false, message: result.message });
    }
  } catch (error) {
    debug('[API/Auth] Server error during registration for:', username, 'Error:', error);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  debug('[API/Auth] Logging in user:', username);

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  try {
    // Login logic will be in ServiceManager
    const result = await ServiceManager.loginUser(username, password);
    if (result.success) {
      debug('[API/Auth] Login successful for:', username, 'userId:', result.userId);
      res.status(200).json({ 
        success: true, 
        message: 'Login successful.', 
        userId: result.userId, 
        username: result.username // Send username back for the extension
      });
    } else {
      debug('[API/Auth] Login failed for:', username, 'Error:', result.message);
      res.status(401).json({ success: false, message: result.message }); // 401 for unauthorized
    }
  } catch (error) {
    debug('[API/Auth] Server error during login for:', username, 'Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

module.exports = router; 
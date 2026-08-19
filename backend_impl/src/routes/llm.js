const express = require('express');
const router = express.Router();
const llmController = require('../controllers/llmController');

// LLM Agent提问
router.post('/agent', llmController.agentQuery);

module.exports = router;

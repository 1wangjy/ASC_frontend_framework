const express = require('express');
const router = express.Router();
const model4Controller = require('../controllers/model4Controller');

router.post('/reconstruct', model4Controller.reconstruct);
router.get('/generate-animation', model4Controller.generateAnimation);
router.get('/generate-static', model4Controller.generateStatic);

module.exports = router;

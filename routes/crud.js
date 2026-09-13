const express = require('express');
const router = express.Router();

router.use('/users', require('./users'));
router.use('/jobs', require('./jobs'));
router.use('/applications', require('./applications'));
router.use('/transactions', require('./transactions'));
router.use('/messages', require('./messages'));
router.use('/notifications', require('./notifications'));

module.exports = router;

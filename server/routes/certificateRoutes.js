const express = require('express');
const router = express.Router();
const { issueCertificate, getIssuedCertificates } = require('../controllers/certificateController');

router.post('/issue', issueCertificate);

router.get('/issued', getIssuedCertificates);

module.exports = router;
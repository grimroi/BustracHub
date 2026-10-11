const express = require('express');
const { issueCertificate, getIssuedCertificates, verifyCertificate } = require('../controllers/certificateController');

/**
 * Certificate routes.
 *
 * The router is a factory so the parent module can inject the current
 * authentication and authorization middleware. This avoids circular
 * dependencies: index.js owns the session store and the middleware
 * closures that close over it.
 *
 * Route authorization:
 *   POST /issue          — admin/staff only. Creates issued_certificate docs.
 *   GET  /issued         — admin/staff only. Returns all issued certificates.
 *   GET  /verify/:id     — public. Privacy-preserving QR verification.
 *
 * @param {Function} authenticate  Express middleware validating the session token
 * @param {Function} requireRole    Higher-order middleware factory restricting roles
 */
module.exports = (authenticate, requireRole) => {
  const router = express.Router();

  router.post('/issue', authenticate, requireRole('admin', 'staff'), issueCertificate);
  router.get('/issued', authenticate, requireRole('admin', 'staff'), getIssuedCertificates);
  router.get('/verify/:id', verifyCertificate);

  return router;
};
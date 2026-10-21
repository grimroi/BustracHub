const express = require('express');
const {
  issueCertificate,
  getIssuedCertificates,
  verifyCertificate,
  mintVerificationToken,
  revokeCertificate,
  verifyByToken
} = require('../controllers/certificateController');

/**
 * Certificate routes.
 *
 * The router is a factory so the parent module can inject the current
 * authentication and authorization middleware. This avoids circular
 * dependencies: index.js owns the session store and the middleware
 * closures that close over it.
 *
 * Route authorization:
 *   POST /issue                — admin/staff only. Creates issued_certificate docs.
 *   GET  /issued               — admin/staff only. Returns all issued certificates.
 *   POST /verification-token   — admin/staff only. Mints the secure QR token.
 *   POST /revoke               — admin/staff only. Revokes a certificate.
 *   GET  /verify/:id           — public. Privacy-preserving QR verification.
 *   GET  /verify-token/:token  — public. Secure token verification (rate limited).
 *
 * @param {Function} authenticate  Express middleware validating the session token
 * @param {Function} requireRole    Higher-order middleware factory restricting roles
 */
module.exports = (authenticate, requireRole) => {
  const router = express.Router();

  router.post('/issue', authenticate, requireRole('admin', 'staff'), issueCertificate);
  router.get('/issued', authenticate, requireRole('admin', 'staff'), getIssuedCertificates);
  router.post('/verification-token', authenticate, requireRole('admin', 'staff'), mintVerificationToken);
  router.post('/revoke', authenticate, requireRole('admin', 'staff'), revokeCertificate);
  router.get('/verify/:id', verifyCertificate);
  router.get('/verify-token/:token', verifyByToken);

  return router;
};
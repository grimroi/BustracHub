// server/routes/blotterRoutes.js
const express = require('express');
const { sendBlotterNotification } = require('../services/emailService');

/**
 * Blotter routes.
 *
 * The router is a factory so the parent module can inject the current
 * authentication and authorization middleware. This avoids circular
 * dependencies: index.js owns the session store and the middleware
 * closures that close over it.
 *
 * Sending official summons is an administrative action and is restricted
 * to admin and staff roles.
 *
 * @param {Function} authenticate  Express middleware validating the session token
 * @param {Function} requireRole    Higher-order middleware factory restricting roles
 */
module.exports = (authenticate, requireRole) => {
  const router = express.Router();

  /**
   * POST /api/blotter/send-summons
   */
  router.post('/send-summons', authenticate, requireRole('admin', 'staff'), async (req, res) => {
    try {
      const { caseNumber, respondentName, respondentEmail, appearanceDate } = req.body;

      if (!respondentEmail) {
        return res.status(400).json({
          success: false,
          message: 'Kailangan ng respondentEmail para makapagpadala ng email notification.'
        });
      }

      const emailResult = await sendBlotterNotification(
        respondentEmail,
        respondentName || 'Respondent',
        caseNumber || 'N/A',
        appearanceDate || 'TBA'
      );

      return res.status(200).json({
        success: true,
        message: 'Summons notice email sent successfully!',
        messageId: emailResult?.messageId
      });

    } catch (error) {
      console.error(' [API ERROR] Failed to send summons email:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to send summons email.',
        error: error.message
      });
    }
  });

  return router;
};
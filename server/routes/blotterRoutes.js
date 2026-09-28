// server/routes/blotterRoutes.js
const express = require('express');
const router = express.Router();
const { sendBlotterNotification } = require('../services/emailService');

/**
 * POST /api/blotter/send-summons
 */
router.post('/send-summons', async (req, res) => {
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

module.exports = router;
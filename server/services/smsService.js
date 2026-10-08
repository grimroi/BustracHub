   // server/services/smsService.js
   const axios = require('axios');
   
   // Gamitin ang process.env para sa Backend (Node.js)
   const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY || 'DEMO_MODE';
   const SEMAPHORE_SENDER_NAME = process.env.SEMAPHORE_SENDER_NAME || 'BustracHub';

   async function sendResidentSMS(phoneNumber, residentName, messageBody) {
     if (!phoneNumber) return false;

     const formattedNumber = phoneNumber.startsWith('09') ? '63' + phoneNumber.substring(1) : phoneNumber;
     const fullMessage = `[BARANGAY BUSTRAC] Dear ${residentName}, ${messageBody}`;

     // DEMO MODE CHECK
     const isDemoKey = !SEMAPHORE_API_KEY || SEMAPHORE_API_KEY === 'DEMO_MODE' || SEMAPHORE_API_KEY.includes('your_api_key');
     
     if (isDemoKey) {
       console.log('═══════════════════════════════════════════════════════');
       console.log('📱 [DEMO MODE] SMS Gateway Simulation Output');
       console.log(`📱 To: +${formattedNumber} (${residentName})`);
       console.log(`💬 Message: "${fullMessage}"`);
       console.log('✅ Status: SIMULATED SUCCESS');
       console.log('═══════════════════════════════════════════════════════');
       return true;
     }

     // REAL API CALL
     try {
       const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
         apikey: SEMAPHORE_API_KEY,
         number: formattedNumber,
         message: fullMessage,
         sendername: SEMAPHORE_SENDER_NAME
       });
       return response.data && response.data.status === 'Success';
     } catch (error) {
       console.error('❌ Failed to send Semaphore SMS:', error.message);
       return false;
     }
   }

   module.exports = { sendResidentSMS };
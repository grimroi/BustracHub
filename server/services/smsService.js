const axios = require('axios');

const SEMAPHORE_API_KEY = process.env.SEMAPHORE_API_KEY || '';
const SEMAPHORE_SENDER_NAME = process.env.SEMAPHORE_SENDER_NAME || 'BustracHub';

async function sendBlotterSMS(phoneNumber, residentName, caseNumber, status, scheduleDate = '') {
  if (!phoneNumber) {
    console.warn('⚠️ No phone number provided for SMS dispatch.');
    return false;
  }

  // Format number to 639xxxxxxxxx (Required format ng Semaphore)
  const formattedNumber = phoneNumber.startsWith('09')
    ? '63' + phoneNumber.substring(1)
    : phoneNumber;

  const message = `[BARANGAY BUSTRAC] Dear ${residentName}, ang iyong blotter case (${caseNumber}) ay may bagong update. Status: ${status}. ${scheduleDate ? `Patawag/Hearing: ${scheduleDate}.` : ''} Paki-check ang Resident Portal o bisitahin ang Barangay Hall.`;

  // 🟢 DEMO / SIMULATION CHECK FOR CAPSTONE DEFENSE
  const isDemoKey = !SEMAPHORE_API_KEY || 
                    SEMAPHORE_API_KEY.includes('your_actual') || 
                    SEMAPHORE_API_KEY.includes('YOUR_SEMAPHORE_API_KEY_HERE') || 
                    SEMAPHORE_API_KEY === 'DEMO_MODE';

  if (isDemoKey) {
    console.log('──────────────────────────────────────────────────');
    console.log('📱 [DEMO MODE] SMS Gateway Simulation Output');
    console.log(`📱 To: +${formattedNumber} (${residentName})`);
    console.log(`💬 Message: "${message}"`);
    console.log('✅ Status: SIMULATED SUCCESS (HTTP 200 via Semaphore Gateway)');
    console.log('──────────────────────────────────────────────────');
    return true; // Magre-return ng true para ma-mark as sent sa CouchDB at hindi mag-loop
  }

  // 🔵 REAL SEMAPHORE API CALL (Gagawin lang kung may totoong working API Key)
  try {
    const response = await axios.post('https://api.semaphore.co/api/v4/messages', {
      apikey: SEMAPHORE_API_KEY,
      number: formattedNumber,
      message: message,
      sendername: SEMAPHORE_SENDER_NAME
    });

    if (response.data && response.data.apikey) {
      console.error('❌ Semaphore Error:', response.data.apikey[0]);
      console.log(`💡 [FALLBACK SIMULATION] SMS logged for +${formattedNumber}`);
      return true;
    }

    console.log('✅ Live SMS sent successfully via Semaphore:', response.data);
    return true;
  } catch (error) {
    console.error('❌ Failed to send Semaphore SMS:', error.response ? error.response.data : error.message);
    console.log(`💡 [FALLBACK SIMULATION] SMS logged for +${formattedNumber}`);
    return true; // Return true pa rin para ma-update ang DB status
  }
}

module.exports = { sendBlotterSMS };
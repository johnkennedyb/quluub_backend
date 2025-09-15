const { sendTestEmail } = require('./utils/emailService');

// Test the new email configuration
async function testNewEmailConfig() {
    console.log('🧪 Testing new email configuration...');
    console.log('Email: mail@match.quluub.com');
    console.log('API Key: adfdb8d27860fc0cb06b4962fcd75ee1ffc73e1ba6a6320f2db7f0fd1775e900');
    console.log('Domain ID: 332b702b3c617f58cededf87');
    
    try {
        // Test email - replace with your actual email for testing
        const testEmail = 'your-test-email@example.com';
        
        console.log(`\n📧 Sending test email to: ${testEmail}`);
        await sendTestEmail(testEmail);
        console.log('✅ Test email sent successfully!');
        
    } catch (error) {
        console.error('❌ Test email failed:', error.message);
        console.error('Error details:', error);
    }
}

// Run the test
testNewEmailConfig();

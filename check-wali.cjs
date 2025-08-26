const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config({ path: './env (1)' });

const testWaliDetails = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    
    const users = await User.find({ gender: 'female' }).limit(10);
    console.log(`\n=== CHECKING ${users.length} USERS FOR WALI DETAILS ===\n`);
    
    let usersWithWali = 0;
    let usersWithValidWaliEmail = 0;
    
    for (const user of users) {
      console.log(`User: ${user.fname} ${user.lname} (${user.email})`);
      console.log(`Wali details: '${user.waliDetails}'`);
      
      if (user.waliDetails && user.waliDetails.trim() !== '') {
        usersWithWali++;
        try {
          const waliData = JSON.parse(user.waliDetails);
          console.log(`  Parsed wali data:`, waliData);
          
          if (waliData.email) {
            usersWithValidWaliEmail++;
            console.log(`  ✅ Valid wali email: ${waliData.email}`);
          } else {
            console.log(`  ❌ No email in wali data`);
          }
        } catch (e) {
          console.log(`  ❌ Invalid JSON: ${e.message}`);
        }
      } else {
        console.log(`  No wali details`);
      }
      console.log('');
    }
    
    console.log(`=== SUMMARY ===`);
    console.log(`Total users checked: ${users.length}`);
    console.log(`Users with wali details: ${usersWithWali}`);
    console.log(`Users with valid wali emails: ${usersWithValidWaliEmail}`);
    
    if (usersWithValidWaliEmail === 0) {
      console.log(`\n ISSUE FOUND: No users have valid wali email addresses!`);
      console.log(`\nThis means wali notifications cannot be sent because:`);
      console.log(`1. Users haven't filled in their wali details`);
      console.log(`2. Wali details are not in proper JSON format`);
      console.log(`3. Wali details don't contain email field`);
    } else {
      console.log(`\n✅ Wali email functionality should work for ${usersWithValidWaliEmail} users`);
    }
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Test failed:', error);
  }
};

testWaliDetails();

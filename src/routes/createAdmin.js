const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect('YOUR_MONGO_URI').then(async () => {

  const existing = await User.findOne({ email: "admin@gmail.com" });

  if (existing) {
    console.log("Admin already exists");
    return process.exit();
  }

  const user = new User({
    name: "Admin",
    email: "admin@gmail.com",
    password: "admin123", // plain because your login uses ===
    role: "admin"
  });

  await user.save();

  console.log("✅ Admin created");
  process.exit();
});
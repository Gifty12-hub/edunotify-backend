require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const School = require("./models/School");
const User = require("./models/User");
const Parent = require("./models/Parent");
const Student = require("./models/Student");

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected, seeding data...");

    // Clear any old test data so re-running this script doesn't duplicate records
    await School.deleteMany({});
    await User.deleteMany({});
    await Parent.deleteMany({});
    await Student.deleteMany({});

    const school = await School.create({
      name: "Kasoa Demo School",
      region: "Central Region",
      town: "Kasoa",
      contactEmail: "admin@kasoademo.edu.gh",
      contactPhone: "0244000000",
      plan: "free",
    });

    const teacher = await User.create({
      school: school._id,
      fullName: "Ama Mensah",
      email: "ama@kasoademo.edu.gh",
      passwordHash: await bcrypt.hash(process.env.SEED_PASSWORD || "ChangeMe123!", 12),
      role: "teacher",
    });

    const parent = await Parent.create({
      fullName: "Kwame Owusu",
      // Replace this with the phone number you registered in the
      // Africa's Talking sandbox simulator
      phone: "+233200000000",
      email: "kwame@example.com",
      preferredLanguage: "en",
      preferredChannel: "sms",
    });

    const student = await Student.create({
      school: school._id,
      fullName: "Kofi Owusu",
      className: "Basic 4",
      parent: parent._id,
    });

    console.log("Seed complete. Use these IDs for testing in Postman:\n");
    console.log("Login email: ama@kasoademo.edu.gh");
    console.log("Login password: " + (process.env.SEED_PASSWORD || "ChangeMe123!"));
    console.log("studentId:", student._id.toString());
    console.log("sentBy (teacher/user id):", teacher._id.toString());

    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();
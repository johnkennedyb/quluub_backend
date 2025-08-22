
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const userSchema = new mongoose.Schema(
  {
    username: { 
      type: String, 
      required: true, 
      unique: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true 
    },
    password: { 
      type: String, 
      required: true 
    },
    fname: { 
      type: String, 
      required: true 
    },
    lname: { 
      type: String, 
      required: true 
    },
    parentEmail: {
      type: String,
      required: true
    },
    plan: {
      type: String,
      enum: ["freemium", "premium"],
      default: "freemium"
    },
    premiumExpirationDate: {
      type: Date,
      default: null
    },
    gender: { 
      type: String, 
      enum: ["male", "female", "other"], 
      required: true 
    },
    dob: { 
      type: Date 
    },
    startedPracticing: {
      type: Date
    },
    hidden: {
      type: Boolean,
      default: false
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    validationToken: { 
      type: String, 
      default: "" 
    },
    validationTokenExpiration: {
      type: Date,
      default: null
    },
    resetPasswordToken: { 
      type: String, 
      default: "" 
    },
    resetPasswordTokenExpiration: { 
      type: Date, 
      default: null 
    },
    status: { 
      type: String, 
      enum: ["active", "inactive",  "pending", "suspended", "banned", "NEW"], 
      default: "pending" // Changed default to pending until email is verified
    },
    type: {
      type: String,
      enum: ["USER", "ADMIN" , "NEW"],
      default: "USER"
    },
    referralCode: {
      type: String,
      unique: true,
      sparse: true
    },
    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    referralStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected'],
      default: 'Pending'
    },
    referralStats: {
      totalReferrals: { type: Number, default: 0 },

      completedReferrals: { type: Number, default: 0 }
    },
    videoCallCredits: {
      type: Number,
      default: 0
    },
    waliDetails: { 
      type: String, // JSON string e.g. '{"email":"wali@example.com"}'
      default: ""
    },
    // Basic Profile Info
    kunya: { type: String },
    
    // Location and Demographics
    nationality: { type: String },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    region: { type: String },
    
    // Physical Appearance
    height: { type: String },
    weight: { type: String },
    build: { type: String },
    appearance: { type: String },
    skinColor: { type: String },
    facialAttractiveness: { type: String },
    hijab: { type: String, enum: ['Yes', 'No'], default: 'No' },
    beard: { type: String, enum: ['Yes', 'No'], default: 'No' },
    
    // Family and Marital
    maritalStatus: { type: String },
    noOfChildren: { type: String },
    
    // Ethnicity (array field)
    ethnicity: {
      type: [String],
      validate: [val => val.length <= 2, 'Ethnicity cannot have more than 2 entries.']
    },
    
    // Islamic Practice and Deen
    patternOfSalaah: { type: String },
    revert: { type: String },
    sect: { type: String },
    scholarsSpeakers: { type: String },
    dressingCovering: { type: String },
    islamicPractice: { type: String },
    
    // Medical and Health
    genotype: { type: String },
    
    // Profile Content
    summary: { type: String },
    workEducation: { type: String },
    
    // Lifestyle and Personality (JSON strings for arrays)
    traits: { type: String }, // JSON string e.g. '["kind", "patient"]'
    interests: { type: String }, // JSON string e.g. '["reading", "travel"]'
    
    // Matching Preferences
    openToMatches: { type: String },
    dealbreakers: { type: String },
    icebreakers: { type: String },
    lastSeen: { type: Date },
    profileViews: { type: Number, default: 0 },
    favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    deviceTokens: [{ type: String }],
  },
  {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON:   { virtuals: true }
  }
);

// Create a virtual 'id' field that returns _id as string
userSchema.virtual('id').get(function() {
  return this._id.toString();
});

userSchema.virtual('fullName').get(function() {
  return `${this.fname} ${this.lname}`;
});

// Method to check if password matches
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Generate and hash password reset token
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire
  this.resetPasswordTokenExpiration = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

module.exports = mongoose.model("User", userSchema);

const mongoose = require("mongoose");

const userActivityLogSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },  // Change this to String if using UUID
    receiverId: { type: String, required: true },  // Change this to String if using UUID
    action: {
      type: String,
      enum: ["VIEWED", "FOLLOWED", "REJECTED", "WITHDREW", "PROFILE_VIEW", "CONNECTION_WITHDRAWN"],
      required: true,
    },
    created: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserActivityLog", userActivityLogSchema);

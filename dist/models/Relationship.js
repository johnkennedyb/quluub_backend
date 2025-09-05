
const mongoose = require("mongoose");

const relationshipSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true }, // UUID
    follower_user_id: { type: String, ref: 'User', required: true }, // UUID as String
    followed_user_id: { type: String, ref: 'User', required: true }, // UUID as String
    status: { type: String, enum: ["pending", "rejected", "matched"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Relationship", relationshipSchema);

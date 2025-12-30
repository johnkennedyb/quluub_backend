
const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["UNREAD", "READ"], default: "UNREAD" },
  },
  { timestamps: { createdAt: "created", updatedAt: "updated" } }
);

module.exports = mongoose.model("Chat", chatSchema);


const mongoose = require("mongoose");

const waliChatSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  wardid: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  wardcontactid: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

module.exports = mongoose.model("WaliChat", waliChatSchema);

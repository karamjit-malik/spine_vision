import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
);

/** Shape returned to clients — never leaks the hash. */
userSchema.methods.toPublic = function toPublic() {
  return { _id: this._id, name: this.name, email: this.email };
};

export const User = mongoose.model("User", userSchema);

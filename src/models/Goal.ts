import mongoose, { Schema, type InferSchemaType } from "mongoose";

const goalSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    year: { type: Number, default: () => new Date().getFullYear() },
  },
  { timestamps: true },
);

export type GoalDoc = InferSchemaType<typeof goalSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Goal =
  (mongoose.models.Goal as mongoose.Model<GoalDoc>) ??
  mongoose.model<GoalDoc>("Goal", goalSchema);

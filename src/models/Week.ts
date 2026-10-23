import mongoose, { Schema, type InferSchemaType } from "mongoose";

const weekSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    goalId: { type: Schema.Types.ObjectId, ref: "Goal", default: null },
  },
  { timestamps: true },
);
weekSchema.index({ goalId: 1 });
weekSchema.index({ startDate: 1 });

export type WeekDoc = InferSchemaType<typeof weekSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Week =
  (mongoose.models.Week as mongoose.Model<WeekDoc>) ??
  mongoose.model<WeekDoc>("Week", weekSchema);

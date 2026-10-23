import mongoose, { Schema, type InferSchemaType } from "mongoose";

export const TODO_STATUSES = ["todo", "doing", "done"] as const;

const todoSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    date: { type: String, default: null },
    status: { type: String, enum: TODO_STATUSES, default: "todo" },
    weekId: { type: Schema.Types.ObjectId, ref: "Week", default: null },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
todoSchema.index({ weekId: 1, status: 1 });
todoSchema.index({ date: 1 });

export type TodoDoc = InferSchemaType<typeof todoSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Todo =
  (mongoose.models.Todo as mongoose.Model<TodoDoc>) ??
  mongoose.model<TodoDoc>("Todo", todoSchema);

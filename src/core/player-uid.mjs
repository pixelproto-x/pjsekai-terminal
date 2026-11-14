import { AppError } from "./errors.mjs";

const UID_PATTERN = /^\\d{1,20}$/;

export function normalizePlayerUid(input) {
  const uid = String(input ?? "").trim();
  if (!uid) throw new AppError("UID_REQUIRED", "Please enter a player UID.");
  if (!UID_PATTERN.test(uid)) {
    throw new AppError("UID_INVALID", "Player UID must contain digits only.");
  }
  return uid;
}

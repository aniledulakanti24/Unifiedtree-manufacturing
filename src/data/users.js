import { USERS } from './seed';

// People who can sign in. The list lives in the store (the admin adds, removes and re-roles people on the
// Roles & Access page); this small registry lets the sign-in code, which sits above the store, read it.

let users = USERS;
const listeners = new Set();

export const getUsers = () => users;

export function setUsers(next) {
  if (!next || next === users) return;
  users = next;
  listeners.forEach((l) => l());
}

export function subscribeUsers(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

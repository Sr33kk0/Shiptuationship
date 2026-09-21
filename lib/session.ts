// A demo sign-in, not real authentication: the app has no user database and every action is attributed to one preset moderator.
// The cookie only decides whether a visitor sees the front page or the app, and lets proxy.ts keep logged-out visitors off the app pages and the data API.
export const SESSION_COOKIE = "shiptuationship-session";

export function logIn() {
  document.cookie = `${SESSION_COOKIE}=1; path=/; samesite=lax`; // no max-age: the session ends when the browser closes
  window.location.assign("/dashboard"); // a full load, so the server renders the app instead of the front page
}

export function logOut() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0`;
  window.location.assign("/");
}

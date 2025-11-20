// src/routing/config.js
// Global routing configuration + dev-mode logging

export const DEV_MODE = true;

/**
 * Dev-mode logger (silent in production).
 */
export function logDev(...args) {
  if (DEV_MODE) {
    console.log("[DEV]", ...args);
  }
}

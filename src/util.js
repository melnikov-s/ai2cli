import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import os from "os";
import readline from "readline";
import path from "path";
import fs from "fs/promises";
import log from "./log.js";

// Generate a random 8-character hash
export function generateRandomHash() {
  return crypto.randomBytes(4).toString("hex");
}

export const execAsync = promisify(exec);

export function clearScreen() {
  process.stdout.write("\x1Bc");
}

// Determine platform for clipboard operations
export const platform = os.platform();

/**
 * Copy text to clipboard in a cross-platform way
 * @param {string} text - Text to copy to clipboard
 * @returns {Promise<boolean>} - Success status
 */
export async function copyToClipboard(text) {
  // Trim the text
  text = text.trim();

  // For Unix-based systems (macOS and Linux)
  if (platform === "darwin" || platform !== "win32") {
    // Escape special characters for shell
    text = text
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"') // Escape double quotes
      .replace(/\$/g, "\\$") // Escape dollar signs
      .replace(/`/g, "\\`") // Escape backticks
      .replace(/\n/g, " ") // Replace newlines with spaces
      .replace(/\t/g, " "); // Replace tabs with spaces
  }

  try {
    if (platform === "darwin") {
      // macOS - use printf instead of echo to avoid newline
      await execAsync(`printf "%s" "${text}" | pbcopy`);
    } else if (platform === "win32") {
      // Windows approach - this is trickier because of CMD escaping rules
      // PowerShell might be more reliable here
      text = text
        .replace(/"/g, '\\"') // Escape double quotes for Windows
        .replace(/\n/g, " ") // Replace newlines with spaces
        .replace(/\t/g, " "); // Replace tabs with spaces

      // Use PowerShell for more reliable clipboard access
      await execAsync(
        `powershell -command "Set-Clipboard -Value '${text.replace(
          /'/g,
          "''"
        )}'"`
      );
    } else {
      // Linux and other platforms - requires xclip or xsel
      try {
        await execAsync(`printf "%s" "${text}" | xclip -selection clipboard`);
      } catch (error) {
        try {
          await execAsync(`printf "%s" "${text}" | xsel -b`);
        } catch (error) {
          console.error("Failed to copy: xclip or xsel is not installed");
          return false;
        }
      }
    }
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error.message);
    return false;
  }
}

// Helper function to capitalize first letter
export function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export function setupKeypressHandler(handler) {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("keypress", handler);
  process.stdin.resume();

  return () => {
    process.stdin.removeListener("keypress", handler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}

export function truncateText(text, maxLength) {
  if (!text) return "";
  text = text.replace(/\n/g, " ").trim();
  return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
}

export async function loadExistingScript(scriptName, config) {
  const baseDir = config.scriptsDir;
  const scriptDir = path.join(baseDir, scriptName);
  const scriptPath = path.join(scriptDir, "index.js");

  try {
    await fs.access(scriptPath);
  } catch (error) {
    log.error(`Script not found: ${scriptPath}`);
    log.info(
      `Please check that the script name is correct and exists in ${baseDir}`
    );
    return;
  }

  // Load the script content
  const scriptContent = await fs.readFile(scriptPath, "utf8");
  log.info(`\nLoaded script: ${scriptName}`);

  return scriptContent;
}

// Get available scripts that have an index.js file
export async function getAvailableScripts(config) {
  const baseDir = config.scriptsDir;
  const validScripts = [];

  try {
    // Ensure the scripts directory exists
    await fs.access(baseDir);

    // Get all directories in the scripts folder
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const scriptDirs = entries.filter((entry) => entry.isDirectory());

    // Check each directory for an index.js file and get modification time
    for (const dir of scriptDirs) {
      const indexPath = path.join(baseDir, dir.name, "index.js");
      try {
        await fs.access(indexPath);
        const stats = await fs.stat(indexPath);
        validScripts.push({
          name: dir.name,
          modifiedTime: stats.mtime
        });
      } catch (error) {
        // Skip directories without index.js
      }
    }

    // Sort by modification time (newest first)
    validScripts.sort((a, b) => b.modifiedTime - a.modifiedTime);
    // Return just the script names
    return validScripts.map(script => script.name);
  } catch (error) {
    log.error(`Error accessing scripts directory: ${error.message}`);
    log.info(`Please ensure the scripts directory exists at: ${baseDir}`);
    return [];
  }
}

export function waitKeyPressed() {
  return new Promise(resolve => {
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.once("data", (data) => {
          process.stdin.pause();
          process.stdin.setRawMode(wasRaw);
          resolve(data.toString());
      });
  });
}
#!/usr/bin/env node
import { Command } from "commander";
import log from "./log.js";
import { getSystemInfo } from "./systemInfo.js";
import { getConfig } from "./config.js";
import { runStateMachine, State } from "./machine.js";
import { loadExistingScript } from "./util.js";
import readline from "readline";

const program = new Command();

// Setup global keypress handler for ESC and Ctrl+C
function setupGlobalKeyHandler() {
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.on("keypress", (str, key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      log.nl();
      log.info("Exiting ai2cli...");
      process.exit(0);
    }
  });
  process.stdin.resume();
}

async function entry(options) {
  const { request, existingScript, defaultModel } = options;

  const config = await getConfig();

  // Override model if specified in command line
  if (options.model) {
    // Validate that the model exists or follows provider/model format
    const modelParts = options.model.split("/");

    // Check if the model follows provider/model format
    if (modelParts.length !== 2) {
      log.error(
        `Error: Model "${options.model}" does not follow the required format "provider/modelName".`
      );
      process.exit(1);
    }

    const [provider] = modelParts;

    // Validate provider exists
    if (!config.providers[provider] && provider !== "ollama") {
      log.error(`Error: Provider "${provider}" not found in config.`);

      process.exit(1);
    }

    config.defaultModel = options.model;
  }

  let initialState = State.USER_REQUEST;
  if (!request) {
    // No request argument provided, start with the NEW state
    initialState = State.NEW;
  }

  const systemInfo = await getSystemInfo();
  const hasConfig = Boolean(Object.keys(config).length);

  if (defaultModel) {
    config.defaultModel = defaultModel;
  }

  const hasMultipleModels = config?.models?.length > 1;
  const existingScriptContent = existingScript
    ? await loadExistingScript(existingScript, config)
    : null;

  const initialContext = {
    config,
    systemInfo,
    model: config.defaultModel,
    currentCommand: {
      existingScript: existingScriptContent,
      request,
      response: null,
      refusedClarification: false,
      type: existingScript ? "refinement" : "prompt", // 'prompt', 'clarification', 'refinement'
    },
    options,
    commandHistory: [],
    scriptMode: options.script ?? false,
    scriptName: null,
    hasMultipleModels,
  };

  if (options.script && request) {
    log.info(`\nGenerating JavaScript script for: "${request}"`);
  }

  // Determine the initial state based on command line options and arguments
  if (!hasConfig || options.setup) {
    initialState = State.SETUP;
  } else if (options.refineScripts) {
    initialState = State.SCRIPT_SELECTION;
  } else if (!request) {
    initialState = State.NEW;
  }

  await runStateMachine(initialContext, initialState);
}

// Main CLI function
async function main() {
  // Set up global key handler
  setupGlobalKeyHandler();

  // Set up the program
  program
    .name("ai2cli")
    .description("Convert natural language to CLI commands")
    .version("1.0.0")
    .argument("[request...]", "Natural language request for a command")
    .option("--model <model>", "Override the default model from config")
    .option(
      "--script",
      "Skip command generation and go directly to script mode"
    )
    .option(
      "--refine-scripts",
      "Select and refine an existing script from the scripts directory"
    )
    .option(
      "--setup",
      "Enter setup mode to configure or modify your ai2cli settings"
    )
    .action(async (args, options) => {
      return entry({ ...options, request: args?.join(" ") ?? "" });
    });

  program.parse();
}

main().catch((error) => {
  log.error("Error: " + error);
  process.exit(1);
});

import enquirer from "enquirer";
import fs from "fs/promises";
import path from "path";
import os from "os";

import log from "../log.js";
import { State } from "../machine.js";
import { clearScreen } from "../util.js";
import { providerModels, validProviders } from "../models.js";

const { Select, MultiSelect, Form, List } = enquirer;

// Handle first-time setup for users without a config file
export async function handleSetup(context) {
  clearScreen();

  const isExistingConfig = Boolean(Object.keys(context.config).length);
  const currentConfig = context.config || {};

  if (isExistingConfig) {
    log.header("ai2cli - Modify Configuration");
    log.info("Modify your existing ai2cli configuration.");
  } else {
    log.header("ai2cli - First Time Setup");
    log.info("Set up your ai2cli configuration.");
  }

  // Step 1: Let the user select which models they want to use
  log.nl();
  log.info("Step 1: Select the models you want to use");

  // Prepare choices for MultiSelect
  const choices = [];
  for (const provider of validProviders) {
    if (provider === "ollama") {
      choices.push({ name: "ollama", value: "ollama" });
    } else {
      providerModels[provider].forEach((model) => {
        choices.push({ name: `${provider}/${model}`, value: `${provider}/${model}` });
      });
    }
  }

  const flatProviderModels = Object.entries(providerModels).flatMap(
    ([provider, models]) => models.map((model) => `${provider}/${model}`)
  );
  const initialModels = currentConfig?.models?.filter(
    (model) => flatProviderModels.includes(model)
  ) ?? [];

  if (currentConfig?.models?.find((model) => model.startsWith("ollama/"))) {
    initialModels.push("ollama");
  }

  const createModelSelect = (initialModels = []) =>
    new MultiSelect({
      name: "models",
      message:
        "Select the models you want to use (use space to select, enter to confirm):",
      choices: choices,
      hint: "Space to select, enter to confirm",
      initial: initialModels,
    });

  const modelSelect = createModelSelect(initialModels);

  let selectedModels;
  try {
    selectedModels = await modelSelect.run();
  } catch (e) {
    // if the user has bad models in their config the MultiSelect will throw an error :/
    try {
      const modelSelect = createModelSelect();
      selectedModels = await modelSelect.run();
    } catch (e) {
      log.error("Error selecting models:", e);
      log.warning("Setup cancelled.");
      return { nextState: State.EXIT, context };
    }
  }

  // Create a set of unique providers from selected models
  const selectedProviders = new Set();
  const models = [];

  // Check if ollama was selected
  const ollamaSelected = selectedModels.includes("ollama");

  // If ollama was selected, immediately ask for its models (Step 1.1)
  let ollamaModels = [];
  if (ollamaSelected) {
    log.nl();
    log.info("Step 1.1: Configure Ollama models");

    // Get existing ollama models if available
    const existingOllamaModels = isExistingConfig
      ? currentConfig?.models
          .filter(
            (model) =>
              (typeof model === "string" && model.startsWith("ollama/")) ||
              (typeof model === "object" &&
                model.value &&
                model.value.startsWith("ollama/"))
          )
          .map((model) => {
            if (typeof model === "string") {
              return model.replace("ollama/", "");
            } else if (typeof model === "object" && model.value) {
              return model.value.replace("ollama/", "");
            }
            return "";
          })
          .filter(Boolean)
          .join(", ")
      : "";

    // Special handling for ollama - ask for model names
    const ollamaPrompt = new List({
      name: "ollamaModels",
      message: "Enter the ollama models you want to use (comma-separated):",
      initial: existingOllamaModels,
      hint: existingOllamaModels ? "" : "llama3, mistral, phi3",
    });

    const response = await ollamaPrompt.run();
    ollamaModels = response.map((m) => m.trim());

    // Add ollama models with provider prefix if needed
    ollamaModels.forEach((model) => {
      if (model) {
        const modelName = model.startsWith("ollama/")
          ? model
          : `ollama/${model}`;
        models.push(modelName);
      }
    });

    // Add ollama to selected providers
    selectedProviders.add("ollama");
  }

  // Process other selected models
  selectedModels.forEach((model) => {
    if (model !== "ollama") {
      const [provider] = model.split("/");
      selectedProviders.add(provider);
      models.push(model);
    }
  });

  // Step 2: Configure providers
  log.nl();
  log.info("Step 2: Configure providers");

  const config = {
    providers: {},
    models: [],
  };

  // For each selected provider, ask for API Key and optionally baseURL
  for (const provider of selectedProviders) {
    if (provider === "ollama") {
      log.info(`\nConfiguring ${provider}...`);

      // Get existing baseURL if available
      const existingBaseURL =
        isExistingConfig &&
        currentConfig?.providers.ollama &&
        currentConfig?.providers.ollama.baseURL
          ? currentConfig?.providers.ollama.baseURL
          : "http://localhost:11434/api";

      // For ollama, only ask for baseURL with localhost default
      const formPrompt = new Form({
        name: "ollamaConfig",
        message: `Enter configuration for ${provider}:`,
        choices: [
          {
            name: "baseURL",
            message: "Base URL",
            initial: existingBaseURL,
            required: true,
          },
        ],
      });

      const ollamaConfig = await formPrompt.run();

      // Add ollama config (no apiKey needed)
      config.providers.ollama = {
        baseURL: ollamaConfig.baseURL,
      };
    } else {
      log.info(`\nConfiguring ${provider}...`);

      // Create a form for API key and baseURL
      const formPrompt = new Form({
        name: "providerConfig",
        message: `Enter configuration for ${provider}:`,
        choices: [
          {
            name: "apiKey",
            message: "API Key",
            required: true,
            initial: currentConfig?.providers?.[provider]?.apiKey,
          },
          {
            name: "baseURL",
            message: "Base URL (optional)",
            initial: currentConfig?.providers?.[provider]?.baseURL,
          },
        ],
      });

      const providerConfig = await formPrompt.run();

      // Add provider config
      config.providers[provider] = {
        apiKey: providerConfig.apiKey,
      };

      if (providerConfig.baseURL) {
        config.providers[provider].baseURL = providerConfig.baseURL;
      }
    }
  }

  // If no models were selected, notify and exit
  if (models.length === 0) {
    log.error("No models were selected. Setup cancelled.");
    return { nextState: State.EXIT, context };
  }

  // Add models to config
  config.models = models.slice();
  // Preserve scripts directory if it exists in current config
  if (isExistingConfig && currentConfig.scriptsDir) {
    config.scriptsDir = currentConfig.scriptsDir;
  } else {
    config.scriptsDir = path.join(os.homedir(), ".ai2cli-scripts");
  }

  // Step 3: Choose default model if multiple models were selected
  if (models.length > 1) {
    log.nl();
    log.info("Step 3: Choose your default model");

    // Get existing default model if available
    const defaultIndex =
      isExistingConfig && currentConfig.defaultModel
        ? models.findIndex(
            (model) =>
              model === currentConfig.defaultModel ||
              (typeof currentConfig.defaultModel === "object" &&
                model === currentConfig.defaultModel.value)
          )
        : 0;

    const defaultModelPrompt = new Select({
      name: "defaultModel",
      message: "Select your default model:",
      choices: models,
      initial: defaultIndex >= 0 ? defaultIndex : 0,
      footer: "Press Escape or Ctrl+C to exit",
    });

    try {
      config.defaultModel = await defaultModelPrompt.run();
    } catch (error) {
      // User wants to quit
      log.warning("Setup cancelled. Exiting...");
      process.exit(0);
    }
  } else {
    // Only one model selected, use it as default
    config.defaultModel = models[0];
  }

  // Step 4: Save the configuration
  log.nl();
  log.info("Step 4: Saving configuration...");

  const configPath = path.join(os.homedir(), ".ai2cli");
  try {
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    log.success(`Configuration saved to ${configPath}`);
  } catch (error) {
    log.error(`Failed to save configuration: ${error.message}`);
    process.exit(1);
  }

  // Update context with new config
  context.config = config;
  context.model = config.defaultModel;
  context.hasMultipleModels = config.models.length > 1;

  // Determine next state based on whether a request was provided
  log.nl();
  log.success("Setup complete!");

  const userInput = context.request;
  if (userInput) {
    // If a request was provided, update the context and go to USER_REQUEST
    context.currentCommand = {
      request: userInput,
      response: null,
      scriptName: null,
      refusedClarification: false,
      type: "prompt",
    };

    log.info("Proceeding with your request...");
    return { nextState: State.USER_REQUEST, context };
  } else {
    // Otherwise, go to NEW state
    log.info("Starting ai2cli...");
    return { nextState: State.NEW, context };
  }
}

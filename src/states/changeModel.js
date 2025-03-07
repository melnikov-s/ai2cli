import chalk from "chalk";
import enquirer from "enquirer";

import log from "../log.js";
import { State } from "../machine.js";
import { clearScreen } from "../util.js";

const { Select } = enquirer;

// Handle change model state
export async function handleChangeModel(context) {
  const { config } = context;

  // Get available models list
  const allModels = config.models;

  clearScreen();

  // Group models by provider for better display
  const choices = [];
  const providers = {};

  // Group models by provider
  allModels.forEach((modelString) => {
    const [provider] = modelString.split("/");
    if (!providers[provider]) {
      providers[provider] = [];
    }
    providers[provider].push(modelString);
  });

  // Create choices array with separators
  Object.entries(providers).forEach(([provider, models]) => {
    choices.push({ role: "separator", name: `${provider.toUpperCase()}` });

    models.forEach((modelString) => {
      const isCurrentModel = modelString === context.model;

      choices.push({
        name: modelString,
        message: isCurrentModel
          ? chalk.green(`${modelString} (current)`)
          : modelString,
        disabled: false,
      });
    });
  });

  try {
    // Use Enquirer's Select prompt for model selection
    const selectPrompt = new Select({
      name: "model",
      message: "Select a model to re-run the command generation:",
      choices: choices,
    });

    const selectedModel = await selectPrompt.run();

    if (selectedModel === context.model) {
      return { nextState: State.USER_RESPONSE, context };
    }

    const newContext = { ...context };
    // Update the model in context
    newContext.model = selectedModel;

    // Add a model change flag to trigger regeneration
    newContext.modelChanged = true;
    newContext.currentCommand.executionResults = null;

    // For command and script mode, we'll regenerate content with new model
    log.warning(`\nSwitching to model: ${selectedModel}`);

    // Always return to USER_REQUEST state with updated context for proper handling
    return { nextState: State.USER_REQUEST, context: newContext };
  } catch (error) {
    // Handle Ctrl+C or other errors
    if (error.message !== "cancelled") {
      log.error(`Error: ${error.message}`);
    }
    return { nextState: State.EXIT, context };
  }
}

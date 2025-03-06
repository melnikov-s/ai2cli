import { generateObject } from "ai";
import chalk from "chalk";
import ora from "ora";
import enquirer from "enquirer";
import {
  getScriptPrompt,
  getCommandPrompt,
  commandSchema,
  scriptSchema,
  getClarificationPrompt,
  getRefinementPrompt,
} from "../prompt.js";

import { getModel } from "../models.js";
import { getApiKeyForModel, getBaseURLForModel } from "../config.js";
import { generateRandomHash } from "../util.js";
import { State } from "../machine.js";
import log from "../log.js";

function buildMessagesLLM(context) {
  const { currentCommand, scriptMode, commandHistory, systemInfo } = context;
  const messages = [];
  const getSystemPrompt = scriptMode ? getScriptPrompt : getCommandPrompt;

  const systemPrompt = getSystemPrompt({
    systemInfo,
  });

  const getPrompt = (command) => {
    return command.type === "clarification"
      ? getClarificationPrompt({ request: command.request })
      : command.type === "refinement"
      ? getRefinementPrompt({
          request: command.request,
          executionResults: command.executionResults,
        })
      : command.request;
  };

  messages.push({ role: "system", type: "text", content: systemPrompt });

  commandHistory.forEach((command) => {
    messages.push({
      role: "user",
      type: "text",
      content: getPrompt(command),
    });
    messages.push({
      role: "assistant",
      content: JSON.stringify(command.response),
    });
  });

  messages.push({
    role: "user",
    type: "text",
    content: getPrompt(currentCommand),
  });

  return messages;
}

// Handle user request state - initial command/script generation
export async function handleUserRequest(context) {
  const { config, currentCommand, scriptMode } = context;

  // Generate the command or script
  const spinner = ora({
    text: chalk.blue(`Thinking [${context.model}]...`),
    color: "cyan",
  }).start();

  try {
    let result;
    let newScriptName;

    const messages = buildMessagesLLM(context, config);

    // Get the model function
    const modelFn = getModel({
      model: context.model,
      apiKey: getApiKeyForModel(config, context.model),
      baseURL: getBaseURLForModel(config, context.model),
    });

    let response;
    const modelName = context.model.split("/")[1];

    if (scriptMode) {
      // Use generateObject with scriptSchema
      response = await generateObject({
        model: modelFn(modelName, { structuredOutputs: true }),
        schema: scriptSchema,
        messages,
        temperature: 0,
      });

      // Use the structured output directly
      result = response.object;

      // Generate a new script name for initial creation
      let scriptName = result.script_name || "generated-script";

      // Ensure the script name is in kebab-case format
      scriptName = scriptName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

      // Generate and append the random hash
      const randomHash = generateRandomHash();
      newScriptName = `${scriptName}-${randomHash}`;
    } else {
      // Use generateObject with commandSchema
      response = await generateObject({
        model: modelFn(modelName, { structuredOutputs: true }),
        schema: commandSchema,
        messages,
        temperature: 0,
      });

      // Use the structured output directly
      result = response.object;
    }

    spinner.stop();

    if (!result) {
      log.error(`Failed to generate a ${scriptMode ? "script" : "command"}.`);
      return { nextState: State.EXIT };
    }

    const newContext = {
      ...context,
      currentCommand: {
        ...context.currentCommand,
        response: result,
      },
      scriptName: context.scriptName || newScriptName,
    };

    // Check if command should be a script instead
    if (!scriptMode && result.should_be_script === true) {
      log.nl();
      log.warning(
        "This request might be better implemented as a script rather than a command."
      );

      const { Confirm } = enquirer;
      const confirmPrompt = new Confirm({
        name: "script_conversion",
        message: "Would you like to create a script instead?",
        initial: true,
      });

      try {
        const answer = await confirmPrompt.run();

        if (answer) {
          // User wants a script - switch to script mode
          log.info("\nSwitching to script mode...");
          return {
            nextState: State.USER_REQUEST,
            context: { ...context, scriptMode: true },
          };
        }
      } catch (error) {
        // If user cancels, just continue with command mode
        if (error.message !== "cancelled") {
          log.error(`Error: ${error.message}`);
        }
      }
    }

    if (
      !currentCommand.refusedClarification &&
      result.clarification_needed &&
      result.clarification_needed.trim() !== ""
    ) {
      return {
        nextState: State.REQUEST_CLARIFICATION,
        context: newContext,
      };
    } else {
      return { nextState: State.USER_RESPONSE, context: newContext };
    }
  } catch (error) {
    spinner.stop();
    log.error(
      `Error generating ${scriptMode ? "script" : "command"}: ${error.message}`
    );
    console.error(error);
    return { nextState: State.EXIT, context };
  }
}

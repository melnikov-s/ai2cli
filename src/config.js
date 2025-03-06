import fs from "fs/promises";
import path from "path";
import os from "os";
import { z } from "zod";
import log from "./log.js";
import { validProviders } from "./models.js";
// Parse configuration
export async function getConfig() {
  const configPath = path.join(os.homedir(), ".ai2cli");
  const configExists = await fs
    .access(configPath)
    .then(() => true)
    .catch(() => false);

  // Define schema with Zod
  const ProviderSchema = z.object({
    apiKey: z.string().optional(),
    baseURL: z.string().url().optional(),
  });

  const ConfigSchema = z.object({
    defaultModel: z.string(),
    models: z.array(z.string()),
    scriptsDir: z
      .string()
      .optional()
      .default(path.join(os.homedir(), ".ai2cli-scripts")),
    providers: z.record(z.enum(validProviders), ProviderSchema),
  });

  if (configExists) {
    try {
      const configContent = await fs.readFile(configPath, "utf-8");
      const parsedConfig = JSON.parse(configContent);

      // Validate against schema
      const result = ConfigSchema.safeParse(parsedConfig);

      if (!result.success) {
        log.error("Error: Invalid configuration format.");
        log.warning("Validation errors:");

        // Format and display validation errors
        for (const issue of result.error.issues) {
          log.error(`- ${issue.path.join(".")}: ${issue.message}`);
        }

        log.info(
          "Please update your configuration file with the correct format:"
        );
        log.text(`{
  "defaultModel": "openai/gpt-4o",
  "models": ["openai/gpt-4o", "anthropic/claude-3.7", "ollama/llama3.2"],
  "scriptsDir": "~/ai-scripts",
  "providers": {
    "openai": {
      "apiKey": "YOUR_OPENAI_API_KEY",
      "baseURL": "https://api.openai.com"
    },
    "anthropic": {
      "apiKey": "YOUR_ANTHROPIC_API_KEY",
      "baseURL": "https://api.anthropic.com"
    }
  }
}`);
        throw new Error("Invalid configuration");
      }

      return result.data;
    } catch (error) {
      if (error.message === "Invalid configuration") {
        throw error;
      }

      const config = getDefaultConfig();

      // Handle file not found/first run
      if (error.code === "ENOENT") {
        await createDefaultConfig(configPath);
        return config;
      }

      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        log.error("Error: Config file contains invalid JSON.");
      } else {
        log.error(`Error reading config: ${error.message}`);
      }

      return config;
    }
  }

  return {};
}

// Get the appropriate API key based on the model provider/name
export function getApiKeyForModel(config, modelString) {
  if (!config || !config.providers) {
    return null;
  }

  // Extract provider from the model string (format: provider/modelName)
  const [provider] = modelString.split("/");

  if (provider && config.providers[provider]) {
    return config.providers[provider].apiKey;
  }

  return null;
}

// Get the appropriate baseURL based on the model provider
export function getBaseURLForModel(config, modelString) {
  if (!config || !config.providers) {
    return null;
  }

  // Extract provider from the model string (format: provider/modelName)
  const [provider] = modelString.split("/");

  if (provider && config.providers[provider]) {
    return config.providers[provider].baseURL;
  }

  return null;
}

// Get default configuration
export function getDefaultConfig() {
  return {
    defaultModel: "openai/gpt-4",
    models: ["openai/gpt-4", "anthropic/claude-3-opus-20240229"],
    scriptsDir: path.join(os.homedir(), ".ai2cli-scripts"),
    providers: {
      openai: {
        apiKey: "",
        baseURL: "https://api.openai.com",
      },
      anthropic: {
        apiKey: "",
        baseURL: "https://api.anthropic.com",
      },
    },
  };
}

// Create default configuration file
export async function createDefaultConfig(configPath) {
  try {
    const defaultConfig = getDefaultConfig();
    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
    log.info("Created default configuration file at ~/.ai2cli");
    log.warning("Please update the configuration with your API keys");
  } catch (error) {
    log.error(`Error creating default config: ${error.message}`);
  }
}

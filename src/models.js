import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOllama } from "ollama-ai-provider";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createXai } from "@ai-sdk/xai";

export const providerModels = {
  google: [
    "gemini-2.0-flash-001",
    "gemini-1.5-pro",
    "gemini-1.5-pro-latest",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash-8b-latest",
  ],
  openai: [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    "o1",
    "o3-mini",
  ],
  anthropic: [
    "claude-3-7-sonnet-20250219",
    "claude-3-5-sonnet-20241022",
    "claude-3-5-sonnet-20240620",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ],
  deepseek: ["deepseek-chat"],
  groq: [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "mixtral-8x7b-32768",
  ],
  mistral: [
    "pixtral-large-latest",
    "mistral-large-latest",
    "mistral-small-latest",
    "ministral-3b-latest",
    "ministral-8b-latest",
    "pixtral-12b-2409",
  ],
  xai: ["grok-2-1212", "grok-2-vision-1212", "grok-beta"],
};

export const validProviders = [
  "ollama",
  "google",
  "openai",
  "anthropic",
  "deepseek",
  "groq",
  "mistral",
  "xai",
];

const verifyAPIKey = (apiKey, provider) => {
  // Skip verification for Ollama as it doesn't require an API key
  if (provider === "ollama") return;

  if (!apiKey) {
    console.error(
      `Error: API key for ${provider} not found. Please add providers.${provider}.apiKey in your ~/.ai2cli config`
    );
    process.exit(1);
  }
};

export const getModel = ({ model, apiKey, baseURL }) => {
  // Parse provider and model name from the format: provider/modelName
  const [provider, modelName] = model.split("/");

  if (!provider || !modelName) {
    console.error(
      `Invalid model format: ${model}. Expected format: "provider/modelName"`
    );
    process.exit(1);
  }

  // Use the actual model name for the API
  const actualModel = modelName;

  // Create the appropriate model client based on the provider
  switch (provider) {
  case "google":
    verifyAPIKey(apiKey, provider);
    return createGoogleGenerativeAI({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "openai":
    verifyAPIKey(apiKey, provider);
    return createOpenAI({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "anthropic":
    verifyAPIKey(apiKey, provider);
    return createAnthropic({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "deepseek":
    verifyAPIKey(apiKey, provider);
    return createDeepSeek({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "groq":
    verifyAPIKey(apiKey, provider);
    return createGroq({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "mistral":
    verifyAPIKey(apiKey, provider);
    return createMistral({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "xai":
    verifyAPIKey(apiKey, provider);
    return createXai({
      model: actualModel,
      apiKey,
      baseURL,
    });

  case "ollama":
    return createOllama({
      model: actualModel,
      baseURL: baseURL || "http://localhost:11434/api",
    });

  default:
    console.error(`Unsupported provider: ${provider}`);
    process.exit(1);
  }
};

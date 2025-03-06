# ai2cli

CLI utility to convert English text to shell commands using an LLM.

[![npm version](https://img.shields.io/npm/v/ai2cli.svg)](https://www.npmjs.com/package/ai2cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description

ai2cli is a command-line utility that converts natural language queries into shell commands using various LLM providers. It helps you generate complex commands without having to remember syntax or read through documentation.

## Features

- Convert English descriptions to shell commands
- Multiple AI provider support (OpenAI, Anthropic, Google, DeepSeek, Groq, Mistral, XAI, Ollama)
- Interactive command refinement
- Command clarification when information is missing
- Save and refine scripts
- Command execution with confirmation
- Command explanation and breakdown
- Safety checks for destructive commands

## Installation

```bash
# Install globally using npm
npm install -g ai2cli

# or using yarn
yarn global add ai2cli

# or using pnpm
pnpm add -g ai2cli
```

## Setup

On first run, ai2cli will create a configuration file at `~/.ai2cli`. You will need to add your API keys to this file.

You can also enter setup mode:

```bash
ai2cli --setup
```

## Basic Usage

```bash
# Basic command generation
ai2cli "find all JavaScript files modified in the last week"

# Generate a script instead of a command
ai2cli --script "backup all my markdown files, compress them, and upload to my S3 bucket"

# Use a specific model
ai2cli --model openai/gpt-4o "convert all png images in this directory to jpeg"

# Refine existing scripts
ai2cli --refine-scripts
```

## Configuration

Configuration is stored in `~/.ai2cli` and follows this format:

```json
{
  "defaultModel": "openai/gpt-4o",
  "models": ["openai/gpt-4o", "anthropic/claude-3.7", "ollama/llama3.2"],
  "scriptsDir": "~/.ai2cli-scripts",
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
}
```

## Supported LLM Providers

- OpenAI (GPT-4o, GPT-4, GPT-3.5 Turbo, etc.)
- Anthropic (Claude 3.7, Claude 3.5, Claude 3 Opus, etc.)
- Google (Gemini models)
- Deepseek
- Groq
- Mistral
- XAI (Grok)
- Ollama (local models)

## Command Line Options

- `[request...]` - Natural language request for a command
- `--model <model>` - Override the default model from config
- `--script` - Skip command generation and go directly to script mode
- `--debug` - Enable debug features
- `--refine-scripts` - Select and refine an existing script from the scripts directory
- `--setup` - Enter setup mode to configure or modify your ai2cli settings

## License

[MIT](LICENSE)

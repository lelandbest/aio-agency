export const PROVIDER_CONFIGS = [
  {
    id: 'openai',
    label: 'OpenAI',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo']
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    models: ['claude-3-5-sonnet', 'claude-3-opus', 'claude-3-haiku']
  },
  {
    id: 'ollama',
    label: 'Ollama',
    models: ['llama3', 'mistral', 'phi3', 'codellama', 'dolphin-llama3']
  },
  {
    id: 'groq',
    label: 'Groq',
    models: ['llama3-70b-8192', 'mixtral-8x7b-32768']
  }
];

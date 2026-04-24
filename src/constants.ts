export type ModelTier = 'powerful' | 'standard' | 'small';

export interface ModelOption {
  id: string;
  name: string;
  tier: ModelTier;
  provider: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
}

export const MODELS: ModelOption[] = [
  // Powerful Tier
  { 
    id: 'gpt-5.2', 
    name: 'GPT-5.2', 
    tier: 'powerful', 
    provider: 'OpenAI',
    description: 'The definitive AGI-proximal flagship with breakthrough autonomous reasoning.',
    strengths: ['Recursive self-correction', 'Advanced scientific synthesis', 'Multi-day context memory'],
    weaknesses: ['Extremely high latency for deep logic', 'Compute intensive']
  },
  { 
    id: 'gemini-3.1-pro', 
    name: 'Gemini 3.1 Pro', 
    tier: 'powerful', 
    provider: 'Google',
    description: 'Ultra-scale multimodal model featuring infinite context window technology.',
    strengths: ['10M+ context window', 'Native video-to-logic reasoning', 'Hyper-accurate retrieval'],
    weaknesses: ['Occasional over-reliance on search grounding']
  },
  { 
    id: 'claude-4.6-opus', 
    name: 'Claude 4.6 Opus', 
    tier: 'powerful', 
    provider: 'Anthropic',
    description: 'The pinnacle of ethical reasoning and poetic technical synthesis.',
    strengths: ['Superior emotional intelligence', 'Perfect instruction adherence', 'Nuanced safety filters'],
    weaknesses: ['Strict usage quotas']
  },
  { 
    id: 'claude-4.6-sonnet', 
    name: 'Claude 4.6 Sonnet', 
    tier: 'powerful', 
    provider: 'Anthropic',
    description: 'The industry standard for rapid production-grade coding and structural analysis.',
    strengths: ['Extremely balanced speed-to-intelligence', 'Refined coding logic', 'Zero-shot complexity'],
    weaknesses: ['May refuse highly speculative prompts']
  },
  { 
    id: 'llama-4-800b', 
    name: 'Llama 4 (800B)', 
    tier: 'powerful', 
    provider: 'Meta',
    description: 'The open-weights king, rivaling closed-source frontier models in every metric.',
    strengths: ['Fully customizable', 'Broad world knowledge', 'Massive scale efficiency'],
    weaknesses: ['Requires high-tier infrastructure for local hosting']
  },
  { 
    id: 'deepseek-r3', 
    name: 'DeepSeek-R3', 
    tier: 'powerful', 
    provider: 'DeepSeek',
    description: 'A dedicated reasoning beast optimized for mathematical and algorithmic breakthroughs.',
    strengths: ['Formal logic verification', 'Algorithmic efficiency', 'Low-cost frontier reasoning'],
    weaknesses: ['Prose can feel mechanical']
  },

  // Standard Tier
  { 
    id: 'gpt-5.2-turbo', 
    name: 'GPT-5.2 Turbo', 
    tier: 'standard', 
    provider: 'OpenAI',
    description: 'The "everything" model, providing frontier-level logic at sub-second speeds.',
    strengths: ['Near-instant inference', 'Reliable agentic behavior', 'Highly cost-efficient'],
    weaknesses: ['Lower depth for abstract philosophical reasoning']
  },
  { 
    id: 'gemini-3.1-flash', 
    name: 'Gemini 3.1 Flash', 
    tier: 'standard', 
    provider: 'Google',
    description: 'The definitive model for real-time video and audio stream processing.',
    strengths: ['Instant multimodal response', 'Massive throughput', 'Excellent tool use'],
    weaknesses: ['Reduced reasoning depth vs Pro']
  },
  { 
    id: 'claude-4.2-haiku', 
    name: 'Claude 4.2 Haiku', 
    tier: 'standard', 
    provider: 'Anthropic',
    description: 'Small, smart, and surgical. Best for classification and data cleaning.',
    strengths: ['Unbeatable speed', 'High predictability', 'Surgical accuracy'],
    weaknesses: ['Limited creative capacity']
  },
  { 
    id: 'mistral-large-3', 
    name: 'Mistral Large 3', 
    tier: 'standard', 
    provider: 'Mistral',
    description: 'Optimized for enterprise-scale multilingual data and complex reasoning.',
    strengths: ['128+ languages native support', 'Strong performance/cost ratio', 'Reliable'],
    weaknesses: ['Slightly behind in multi-modal video tasks']
  },

  // Small Tier
  { 
    id: 'llama-4-15b', 
    name: 'Llama 4 (15B)', 
    tier: 'small', 
    provider: 'Meta',
    description: 'The most powerful "edge" model ever built, running natively on mobile hardware.',
    strengths: ['Mobile native performance', 'Strong base logic', 'Zero latency'],
    weaknesses: ['Limited context memory']
  },
  { 
    id: 'phi-4-mini', 
    name: 'Phi-4 Mini', 
    tier: 'small', 
    provider: 'Microsoft',
    description: 'A reasoning specialist that punches 10x above its weight class.',
    strengths: ['Exceptional math/logic for its size', 'Energy efficient', 'Clean output'],
    weaknesses: ['Lacks creative breadth']
  }
];

export interface ExamplePrompt {
  id: string;
  title: string;
  goal: string;
  context?: string;
  icon: string;
  variableExamples?: Record<string, string>;
}

export const EXAMPLE_PROMPTS: ExamplePrompt[] = [
  {
    id: 'creative-writing',
    title: 'Creative Storytelling',
    goal: 'Write a short science fiction story about a robot discovering a plant on a desolate planet.',
    context: 'Atmospheric, lonely but hopeful tone. Maximum 1000 words.',
    icon: 'Sparkles'
  },
  {
    id: 'code-review',
    title: 'Code Review Agent',
    goal: 'Review a React component for performance issues and potential bugs.',
    context: 'The component uses heavy useEffect hooks and has nested map functions. Focus on optimization.',
    icon: 'Terminal'
  },
  {
    id: 'marketing-copy',
    title: 'Marketing Copywriter',
    goal: 'Create 5 high-converting ad headlines for a new eco-friendly water bottle.',
    context: 'Target audience: Eco-conscious millennials. Benefits: Reusable, stylish, keeps water cold for 24 hours.',
    icon: 'Zap'
  },
  {
    id: 'data-analysis',
    title: 'Data Insight Analyst',
    goal: 'Summarize key trends from a messy CSV dump of monthly sales data.',
    context: 'Data includes columns for Date, Product, Sale Amount, and Customer Region. Identify top performing regions.',
    icon: 'BarChart3'
  },
  {
    id: 'academic-tutor',
    title: 'Academic Tutor',
    goal: 'Explain the concept of quantum entanglement to a high school student.',
    context: 'Use analogies. Keep it simple but accurate. Avoid overly complex mathematics.',
    icon: 'Cpu'
  },
  {
    id: 'ux-researcher',
    title: 'UX Case Study',
    goal: 'Structure a UX case study for a mobile app project focused on {{industry}}.',
    context: 'Include sections for Problem Statement, User Research, Wireframes, and Usability Testing. Focus on the {{user_pain_point}}.',
    icon: 'Layout',
    variableExamples: {
      industry: 'FinTech (Digital Banking)',
      user_pain_point: 'difficulty in tracking micro-transactions across multiple accounts'
    }
  },
  {
    id: 'social-media-plan',
    title: 'Social Media Strategy',
    goal: 'Generate a 7-day content calendar for a {{brand_type}} brand on Instagram.',
    context: 'Include a mix of Reels, Stories, and Carousel posts. Tone should be {{brand_tone}}.',
    icon: 'Share2',
    variableExamples: {
      brand_type: 'Sustainable Fashion',
      brand_tone: 'Aspirational, minimalist, and eco-conscious'
    }
  },
  {
    id: 'technical-spec',
    title: 'Technical Spec Writer',
    goal: 'Draft a technical specification document for a new microservice that handles {{functionality}}.',
    context: 'Describe architecture, API endpoints, and database schema. {% if async %} Include details on message queuing with RabbitMQ. {% endif %}',
    icon: 'Activity',
    variableExamples: {
      functionality: 'User Authentication and JWT Token Management',
      async: 'true'
    }
  },
  {
    id: 'data-simulation',
    title: 'Synthetic Data Fabricator',
    goal: 'Generate 50 rows of synthetic JSON data for a {{domain}} application.',
    context: 'Fields should include id, name, email, and {{custom_field}}. Ensure data looks realistic but is completely fake.',
    icon: 'BarChart3',
    variableExamples: {
      domain: 'E-commerce (Furniture Store)',
      custom_field: 'loyalty_tier'
    }
  },
  {
    id: 'interview-coach',
    title: 'Interview Preparation',
    goal: 'Conduct a mock behavioral interview for a {{job_role}} position at a major tech company.',
    context: 'Focus on STAR method responses. Ask {{count}} challenging questions about leadership and conflict resolution.',
    icon: 'Send',
    variableExamples: {
      job_role: 'Senior Product Manager',
      count: '3'
    }
  }
];

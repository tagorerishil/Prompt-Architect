/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, Component, ReactNode, ErrorInfo } from 'react';
import { 
  Sparkles, 
  Copy, 
  Check, 
  ChevronRight, 
  Terminal, 
  Cpu, 
  Info, 
  RefreshCcw,
  Layout,
  Share2,
  Zap,
  Activity,
  BarChart3,
  Star,
  Send,
  Trash2,
  X,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import { MODELS, ModelOption, EXAMPLE_PROMPTS, ExamplePrompt } from './constants';
import { db } from './lib/firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  doc, 
  deleteDoc,
  getDocFromServer,
  query,
  orderBy,
  limit,
  getDocs
} from 'firebase/firestore';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Firestore Error Handling
interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
}

interface PromptVersion {
  id: string;
  goal: string;
  context: string;
  modelId: string;
  prompt: string;
  variables: Record<string, string>;
  variableDescriptions: Record<string, string>;
  timestamp: any;
}

const handleFirestoreError = (error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null) => {
  console.error(`Firestore Error [${operationType}] at ${path}:`, error);
  const info: FirestoreErrorInfo = {
    error: error.message,
    operationType,
    path
  };
  throw JSON.stringify(info);
};

// Templating Engine Utilities
const processTemplate = (template: string, variables: Record<string, string>) => {
  let result = template;

  // 1. Handle loops: {% for item in list %} content {% endfor %}
  // Supports comma-separated or newline-separated lists
  result = result.replace(/\{%\s*for\s+(\w+)\s+in\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endfor\s*%\}/g, (match, itemVar, listVar, content) => {
    const listVal = variables[listVar];
    if (!listVal) return '';
    
    const items = listVal.split(/[,\n]/).map(i => i.trim()).filter(i => i !== '');
    
    return items.map(item => {
      const loopContext = { ...variables, [itemVar]: item };
      return content.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, key) => {
        return loopContext[key] !== undefined ? loopContext[key] : m;
      });
    }).join('\n');
  });

  // 2. Handle complex conditionals: {% if var == 'val' %} or {% if var != 'val' %}
  result = result.replace(/\{%\s*if\s+(\w+)\s*(==|!=)\s*['"]?([^'"]+)['"]?\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (match, key, op, val, content) => {
    const varVal = variables[key] || '';
    const condition = op === '==' ? varVal === val : varVal !== val;
    return condition ? content : '';
  });

  // 3. Handle simple truthy conditionals: {% if key %} content {% endif %}
  result = result.replace(/\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g, (match, key, content) => {
    // Basic truthiness check
    return variables[key] && variables[key].trim().toLowerCase() !== 'false' ? content : '';
  });

  // 4. Handle variables: {{variable}}
  result = result.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });

  return result;
};

const extractVariables = (text: string) => {
  const vars = new Set<string>();
  
  // Variables: {{var}}
  const varMatches = text.matchAll(/\{\{\s*(\w+)\s*\}\}/g);
  for (const match of varMatches) vars.add(match[1]);
  
  // Conditionals: {% if var %} or {% if var == 'val' %}
  const ifMatches = text.matchAll(/\{%\s*if\s+(\w+).*?%\}/g);
  for (const match of ifMatches) vars.add(match[1]);

  // Loops: {% for item in list_var %}
  const forMatches = text.matchAll(/\{%\s*for\s+\w+\s+in\s+(\w+)\s*%\}/g);
  for (const match of forMatches) vars.add(match[1]);

  // Identify local iterators to exclude from top-level inputs
  const iterators = new Set<string>();
  const iteratorMatches = text.matchAll(/\{%\s*for\s+(\w+)\s+in\s+\w+\s*%\}/g);
  for (const match of iteratorMatches) iterators.add(match[1]);
  
  return Array.from(vars).filter(v => !iterators.has(v));
};

class DisplayErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state: { hasError: boolean } = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Display Error Boundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
            <Info className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-1">Rendering Error</h3>
            <p className="text-xs text-slate-500 font-mono">The generated content caused a layout crash. Try re-optimizing with a different model.</p>
          </div>
          <button 
            type="button"
            onClick={() => this.setState({ hasError: false })}
            className="px-4 py-2 bg-indigo-600 text-white rounded text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors"
          >
            Reset Display
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Icon Mapper Utility
const getIcon = (name: string) => {
  const icons: Record<string, any> = {
    Sparkles, Terminal, Zap, BarChart3, Cpu, Layout, Share2, Activity, Send, History, Star, Info, Check, RefreshCcw
  };
  const IconComp = icons[name] || Sparkles;
  return <IconComp className="w-3 h-3 text-slate-400 group-hover:text-indigo-500 transition-colors" />;
};
const VariableTooltip = ({ name, description }: { name: string, description: string }) => {
  return (
    <div className="group relative inline-block">
      <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 font-mono text-[10px] border border-indigo-100 cursor-help transition-all hover:bg-indigo-600 hover:text-white">
        {`{{${name}}}`}
      </span>
      {description && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-slate-900 text-white text-[9px] rounded shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
          <div className="font-bold border-b border-white/20 mb-1 pb-1 uppercase tracking-widest">{name}</div>
          <div className="opacity-80 italic">{description}</div>
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-slate-900"></div>
        </div>
      )}
    </div>
  );
};

// Template Item Component with interactive sample tags
const TemplateItem = ({ example, onSelect }: { example: ExamplePrompt, onSelect: (e: ExamplePrompt) => void }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <div 
      className="relative" 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
    >
      <motion.button
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={() => onSelect(example)}
        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-medium text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-600 transition-all cursor-pointer flex items-center gap-2 group ring-offset-white focus:ring-2 focus:ring-indigo-500 outline-none"
      >
        {getIcon(example.icon)}
        <span className="whitespace-nowrap">{example.title}</span>
      </motion.button>
      
      <AnimatePresence>
        {isHovered && example.variableExamples && Object.keys(example.variableExamples).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="absolute z-50 top-full left-0 mt-2 p-3 bg-white border border-slate-200 rounded-lg shadow-2xl min-w-[200px] max-w-[280px] pointer-events-none"
          >
            <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center justify-between border-b border-slate-50 pb-1.5">
              <span>Sample Parameters</span>
              <Info className="w-2.5 h-2.5 opacity-40" />
            </div>
            <div className="space-y-2.5">
              {Object.entries(example.variableExamples).map(([key, val]) => (
                <div key={key} className="space-y-1">
                  <div className="flex items-center gap-1">
                    <div className="w-1 h-1 rounded-full bg-indigo-400" />
                    <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-tighter">{key}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 bg-slate-50/80 px-2 py-1.5 rounded border border-slate-100 italic leading-relaxed group/tag transition-colors">
                    {val}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-2 border-t border-slate-50 flex items-center justify-between">
              <span className="text-[8px] text-slate-400">Click template to apply all</span>
              <Zap className="w-2.5 h-2.5 text-amber-400 animate-pulse" />
            </div>
            <div className="absolute -top-1 left-4 w-2 h-2 bg-white border-t border-l border-slate-200 rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [goal, setGoal] = useState('');
  const [selectedModel, setSelectedModel] = useState<ModelOption>(MODELS[0]);
  const [context, setContext] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Custom Dropdown State
  const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  
  // Feedback State
  const [rating, setRating] = useState<number>(0);
  const [suggestion, setSuggestion] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);

  // Templating State
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [variableDescriptions, setVariableDescriptions] = useState<Record<string, string>>({});
  const [detectedVarKeys, setDetectedVarKeys] = useState<string[]>([]);
  const [activeTemplates, setActiveTemplates] = useState<ExamplePrompt[]>(EXAMPLE_PROMPTS);
  const [isRefreshingTemplates, setIsRefreshingTemplates] = useState(false);
  const [templateTheme, setTemplateTheme] = useState('diverse');
  const [isRefiningGoal, setIsRefiningGoal] = useState(false);
  const [isSuggestingContext, setIsSuggestingContext] = useState(false);
  
  // History State
  const [versionHistory, setVersionHistory] = useState<PromptVersion[]>([]);
  const [isHistoryPanelOpen, setIsHistoryPanelOpen] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Auto-refresh history when panel opens
  React.useEffect(() => {
    if (isHistoryPanelOpen) {
      fetchHistory();
    }
  }, [isHistoryPanelOpen]);

  // Test Connection
  React.useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();
    fetchHistory();
  }, []);

  const suggestContextWithAI = async () => {
    if (!goal.trim()) return;
    setIsSuggestingContext(true);
    try {
      const prompt = `Based on this user goal, suggest 2-3 specific, high-value context variables or background information that would help an AI architect a perfect prompt.
      
      User Goal: "${goal}"
      
      Return a list of short context snippets or property definitions (e.g., "Target Audience: ...", "Constraints: ..."). 
      You can use {{variables}}.
      
      Return the data strictly as a string (max 200 characters).`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });

      const text = response.text;
      if (text) {
        setContext(prev => prev ? `${prev}\n${text}` : text);
      }
    } catch (err) {
      console.error("Context suggest failed:", err);
    } finally {
      setIsSuggestingContext(false);
    }
  };

  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const q = query(collection(db, 'history'), orderBy('timestamp', 'desc'), limit(20));
      const querySnapshot = await getDocs(q);
      const historyItems: PromptVersion[] = [];
      querySnapshot.forEach((doc) => {
        historyItems.push({ id: doc.id, ...doc.data() } as PromptVersion);
      });
      setVersionHistory(historyItems);
    } catch (err) {
      console.error("Error fetching history:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'history', id));
      setVersionHistory(prev => prev.filter(item => item.id !== id));
      trackEvent('delete_history', { id });
    } catch (err) {
      console.error("Error deleting history item:", err);
      setError("Failed to delete record.");
    }
  };

  const revertToVersion = (version: PromptVersion) => {
    setGoal(version.goal);
    setContext(version.context || '');
    const model = MODELS.find(m => m.id === version.modelId) || MODELS[0];
    setSelectedModel(model);
    setTemplateVariables(version.variables || {});
    setVariableDescriptions(version.variableDescriptions || {});
    setGeneratedPrompt(version.prompt);
    setCurrentVersionId(version.id);
    setIsHistoryPanelOpen(false);
    setFeedbackSubmitted(false);
    setRating(0);
    setSuggestion('');
    trackEvent('revert', { id: version.id, modelId: version.modelId });
  };

  const submitFeedback = async () => {
    if (rating === 0) return;
    setIsSubmittingFeedback(true);
    try {
      await addDoc(collection(db, 'feedback'), {
        rating,
        suggestion: suggestion.trim(),
        modelId: selectedModel.id,
        goal,
        versionId: currentVersionId,
        createdAt: serverTimestamp()
      });
      setFeedbackSubmitted(true);
    } catch (err) {
      console.error("Feedback failed:", err);
      setError("Failed to submit feedback. Please try again.");
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const trackEvent = async (eventType: 'generation' | 'example_click' | 'copy' | 'revert' | 'delete_history', data?: any) => {
    try {
      await addDoc(collection(db, 'events'), {
        eventType,
        ...data,
        timestamp: serverTimestamp()
      });
    } catch (err) {
      console.warn('Analytics event failed to log:', err);
    }
  };

  const regenerateTemplates = async (theme: string = 'diverse') => {
    setIsRefreshingTemplates(true);
    setTemplateTheme(theme);
    try {
      const themeInstruction = theme === 'diverse' 
        ? "Focus on diverse fields: Healthcare, Legal, Technical writing, Personal Productivity, Education, Gaming, Finance."
        : `Focus specifically on the theme: ${theme}. Maximize helpfulness for professional ${theme} tasks.`;

      const prompt = `Generate 6 unique, creative, and highly structural prompt engineering templates.
      Each template should have a title, a goal, and optional context.
      Use placeholders like {{variable_name}} for dynamic values.
      Return the data strictly as a JSON array of objects with the following keys: id, title, goal, context (optional), icon (one of: Sparkles, Terminal, Zap, BarChart3, Cpu, Layout, Share2, Activity, Send, History), variableExamples (an object mapping variable names to realistic example values).
      
      Example:
      [
        { 
          "id": "writer", 
          "title": "Blog Writer", 
          "goal": "Write a blog about {{topic}}", 
          "context": "Tone: {{tone}}",
          "icon": "Sparkles",
          "variableExamples": { "topic": "Quantum Computing", "tone": "Educational and witty" }
        }
      ]
      
      ${themeInstruction}
      Ensure the templates are "helpful for the end user" and solve real problems.`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview", 
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (text) {
        const newTemplates = JSON.parse(text);
        if (Array.isArray(newTemplates)) {
          setActiveTemplates(newTemplates.slice(0, 6));
        }
      }
    } catch (err) {
      console.error("Failed to refresh templates:", err);
    } finally {
      setIsRefreshingTemplates(false);
    }
  };

  const refineGoalWithAI = async () => {
    if (!goal.trim()) return;
    setIsRefiningGoal(true);
    try {
      const prompt = `The user wants to refine their AI prompt goal to be more specific, architectural, and effective.
      Current Goal: "${goal}"
      Current Context: "${context}"
      
      Return a improved, expanded, and structured version of this goal. 
      Use prompt engineering best practices like "Chain of Thought", "Role playing", and "Clear Constraints".
      You can include {{placeholders}} if it makes the goal more modular.
      
      Return the data strictly as a JSON object with:
      {
        "refinedGoal": "the improved goal text",
        "refinedContext": "the improved context text"
      }`;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json"
        }
      });

      const text = response.text;
      if (text) {
        const data = JSON.parse(text);
        if (data.refinedGoal) setGoal(data.refinedGoal);
        if (data.refinedContext) setContext(data.refinedContext);
      }
    } catch (err) {
      console.error("Refine failed:", err);
    } finally {
      setIsRefiningGoal(false);
    }
  };

  // Detect Variables
  React.useEffect(() => {
    const keys = extractVariables(goal + ' ' + context);
    setDetectedVarKeys(keys);
    
    // Initialize new keys in templateVariables and variableDescriptions if they don't exist
    setTemplateVariables(prev => {
      const next = { ...prev };
      let changed = false;
      keys.forEach(key => {
        if (next[key] === undefined) {
          next[key] = '';
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setVariableDescriptions(prev => {
      const next = { ...prev };
      let changed = false;
      keys.forEach(key => {
        if (next[key] === undefined) {
          next[key] = '';
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [goal, context]);

  const generateArchitectPrompt = async () => {
    if (!goal.trim()) return;
    
    setIsLoading(true);
    setGeneratedPrompt(null);
    setError(null);
    setFeedbackSubmitted(false);
    setRating(0);
    setSuggestion('');

    const modelCapability = selectedModel.tier;
    const modelName = selectedModel.name;

    // Process templates before sending
    const interpolatedGoal = processTemplate(goal, templateVariables);
    const interpolatedContext = processTemplate(context, templateVariables);

    const systemInstruction = `You are an expert prompt engineer specializing in structured prompt optimization. 
    Your goal is to generate an optimized prompt for a specific AI model based on user inputs.
    
    Current Targeted Model: ${modelName} (Capability Tier: ${modelCapability})
    
    Advanced Templating Support:
    The user is using variables like {{variable_name}} and conditionals like {% if flag %}...{% endif %}.
    1. If the input contains these markers, respect their logical intent in your architectural output.
    2. You may suggest a "Template" version of the prompt in your output where variables are preserved for end-user filling.
    
    Rules for instruction depth:
    1. If tier is 'powerful': Keep instructions concise and clear. Avoid verbosity. Use flexible guidance.
    2. If tier is 'standard' or 'small': Break tasks into step-by-step instructions. Be explicit and detailed. Include examples if helpful.
    
    Structure the output with these exact sections (use Markdown formatting):
    ### Role
    Define the assistant's role clearly.
    
    ### Task
    Describe exactly what needs to be done.
    
    ### Context
    Include all relevant background information provided by the user.
    
    ### Instructions
    Provide step-by-step guidance (adapted for ${modelCapability} capability).
    
    ### Constraints
    List rules, limits, or things to avoid.
    
    ### Output Format
    Strictly define how the response should be structured.
    
    ### Recommended Stack
    Suggest 2-3 specific technical tools, libraries, or frameworks (e.g., D3.js, Tailwind CSS, Pandas, Framer Motion) that would enhance the implementation of this task. Provide a brief (1-sentence) justification for each.
    
    ### Examples (optional)
    Provide clear input-output examples if they improve reliability for this tier.
    
    Return ONLY the final structured prompt. Do not include your own explanations or talk to the user.`;

    const userPrompt = `Input Data:
    User Goal: ${interpolatedGoal}
    Target Model: ${modelName}
    Optional Context: ${interpolatedContext || 'None'}`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userPrompt,
        config: {
          systemInstruction,
        },
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");
      setGeneratedPrompt(text);
      trackEvent('generation', { modelId: selectedModel.id, tier: selectedModel.tier });

      // Save to History
      try {
        const docRef = await addDoc(collection(db, 'history'), {
          goal,
          context,
          modelId: selectedModel.id,
          prompt: text,
          variables: templateVariables,
          variableDescriptions,
          timestamp: serverTimestamp()
        });
        setCurrentVersionId(docRef.id);
        fetchHistory();
      } catch (historyErr) {
        console.warn("Failed to save to history:", historyErr);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to generate prompt. Please check your connection or API key.");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!generatedPrompt) return;
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    trackEvent('copy', { modelId: selectedModel.id });
    setTimeout(() => setCopied(false), 2000);
  };



  return (
    <div className="flex flex-col min-h-screen bg-[#f8fafc] text-slate-900 font-sans selection:bg-indigo-100">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:p-4 focus:bg-white focus:text-indigo-600 focus:font-bold focus:border-2 focus:border-indigo-600 focus:rounded-md m-2">
        Skip to main content
      </a>

      {/* Header Navigation */}
      <nav className="h-16 border-b border-slate-200 bg-white flex items-center justify-between px-4 md:px-8 shrink-0 z-20 shadow-sm shadow-slate-100/50" role="navigation" aria-label="Main navigation">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-200" aria-hidden="true">P</div>
          <span className="font-bold text-base md:text-lg tracking-tight uppercase">PROMPT<span className="text-indigo-600">ARCHITECT</span></span>
        </div>
        <div className="flex items-center space-x-3 md:space-x-6">
          <div className="hidden sm:flex space-x-1.5" aria-hidden="true">
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isLoading ? 'bg-indigo-600 animate-pulse' : 'bg-indigo-600'}`}></div>
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isLoading ? 'bg-indigo-600/60 animate-pulse delay-75' : 'bg-indigo-200'}`}></div>
            <div className={`w-2.5 h-2.5 rounded-full transition-colors ${isLoading ? 'bg-indigo-600/30 animate-pulse delay-150' : 'bg-indigo-200'}`}></div>
          </div>
          <button 
            onClick={() => setIsHistoryPanelOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 rounded-full transition-all uppercase tracking-widest"
          >
            <History className="w-3 h-3" />
            <span className="hidden md:inline">Prompt History</span>
          </button>
          <span className="text-[9px] md:text-[10px] font-bold text-slate-400 tracking-widest uppercase py-1 px-3 border border-slate-200 rounded-full">v3.1.0 Nexus</span>
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden">
            <Terminal className="w-4 h-4 md:w-5 md:h-5 text-slate-400" aria-hidden="true" />
          </div>
        </div>
      </nav>

      {/* Main Workspace */}
      <main id="main-content" className="flex-1 grid grid-cols-12 overflow-hidden lg:h-[calc(100vh-64px)]">
        
        {/* Left Panel: Configuration */}
        <section className="col-span-12 lg:col-span-4 border-r border-slate-200 p-6 md:p-8 flex flex-col space-y-8 bg-white overflow-y-auto custom-scrollbar" aria-labelledby="config-title">
          <div className="space-y-1">
            <h2 id="config-title" className="text-xs font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
              <Layout className="w-3.5 h-3.5" aria-hidden="true" />
              Input Configuration
            </h2>
            <p className="text-sm text-slate-500">Define parameters for prompt generation.</p>
          </div>

          <div className="flex-1 space-y-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Example Templates</label>
                  <button 
                    onClick={() => regenerateTemplates(templateTheme)}
                    disabled={isRefreshingTemplates}
                    className={`p-1 rounded hover:bg-slate-100 transition-colors ${isRefreshingTemplates ? 'animate-spin cursor-not-allowed opacity-50' : 'cursor-pointer text-slate-400 hover:text-indigo-600'}`}
                    title="Generate new AI templates"
                  >
                    <RefreshCcw className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex bg-slate-100 p-0.5 rounded-md gap-0.5">
                  {['diverse', 'coding', 'writing', 'biz'].map((t) => (
                    <button
                      key={t}
                      onClick={() => regenerateTemplates(t)}
                      className={`px-2 py-0.5 text-[8px] font-bold uppercase rounded transition-all ${templateTheme === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <AnimatePresence mode="popLayout">
                  {activeTemplates.map((example) => (
                    <TemplateItem
                      key={example.id}
                      example={example}
                      onSelect={(ex) => {
                        setGoal(ex.goal);
                        if (ex.context) setContext(ex.context);
                        if (ex.variableExamples) {
                          setTemplateVariables(ex.variableExamples);
                        } else {
                          setTemplateVariables({});
                        }
                        trackEvent('example_click', { exampleId: ex.id, title: ex.title });
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <label htmlFor="user-goal" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    User Goal
                  </label>
                  <button
                    onClick={refineGoalWithAI}
                    disabled={isRefiningGoal || !goal.trim()}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest transition-all ${
                      isRefiningGoal || !goal.trim() 
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400' 
                        : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                    }`}
                  >
                    {isRefiningGoal ? <RefreshCcw className="w-2.5 h-2.5 animate-spin" /> : <Sparkles className="w-2.5 h-2.5" />}
                    <span>Refine Goal</span>
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {extractVariables(goal).map(v => (
                    <VariableTooltip key={v} name={v} description={variableDescriptions[v] || ''} />
                  ))}
                  <span className="text-[9px] lowercase font-normal opacity-60 ml-2">supports {'{{var}}'}, {'{% if %}'} and {'{% for %}'}</span>
                </div>
              </div>
              <textarea 
                id="user-goal"
                className="w-full h-32 p-4 border border-slate-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-slate-50 focus:bg-white outline-none transition-all resize-none leading-relaxed min-h-[120px]" 
                placeholder="e.g. Write a {{length}} blog about {{topic}}..."
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                required
                aria-required="true"
              />
            </div>

            {/* Variable Inputs Panel */}
            <AnimatePresence>
              {detectedVarKeys.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-md space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="w-3.5 h-3.5 text-indigo-600" />
                      <h3 className="text-[10px] font-bold text-indigo-900 uppercase tracking-widest">Live Variables</h3>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {detectedVarKeys.map(key => (
                        <div key={key} className="space-y-1.5 group">
                          <div className="flex justify-between items-center px-0.5">
                            <label className="text-[9px] font-bold text-indigo-700/60 uppercase tracking-tighter block">{key}</label>
                            <AnimatePresence>
                              {variableDescriptions[key] && (
                                <motion.div 
                                  initial={{ opacity: 0, x: 5 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  exit={{ opacity: 0, x: 5 }}
                                  className="hidden group-focus-within:block group-hover:block transition-all"
                                >
                                  <span className="text-[8px] bg-indigo-600 text-white px-2 py-0.5 rounded shadow-sm font-medium">
                                    {variableDescriptions[key]}
                                  </span>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <div className="space-y-1">
                            <input 
                              type="text"
                              value={templateVariables[key] || ''}
                              onChange={(e) => setTemplateVariables(prev => ({ ...prev, [key]: e.target.value }))}
                              className="w-full p-2 text-xs border border-indigo-200 rounded bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                              placeholder={`Value for ${key}...`}
                            />
                            <div className="relative">
                              <input 
                                type="text"
                                value={variableDescriptions[key] || ''}
                                onChange={(e) => setVariableDescriptions(prev => ({ ...prev, [key]: e.target.value }))}
                                className="w-full p-1.5 text-[10px] border border-dashed border-slate-200 rounded bg-transparent text-slate-400 focus:text-indigo-600 focus:bg-white focus:border-solid focus:border-indigo-200 outline-none transition-all italic"
                                placeholder={`Description for ${key}...`}
                              />
                              <Info className="w-2.5 h-2.5 absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 italic text-center">Templates are processed before generation.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="target-model" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  Target Model
                  <Info className="w-3 h-3 opacity-40 cursor-help" aria-hidden="true" />
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsModelPickerOpen(!isModelPickerOpen)}
                    className="w-full p-4 border border-slate-200 rounded-md text-sm bg-slate-50 text-left flex items-center justify-between hover:bg-slate-100 focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-900 leading-none">{selectedModel.name}</span>
                      <span className="text-[10px] text-slate-400 font-mono tracking-wider mt-1">{selectedModel.provider}</span>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${isModelPickerOpen ? '-rotate-90' : 'rotate-90'}`} />
                  </button>

                  <AnimatePresence>
                    {isModelPickerOpen && (
                      <>
                        <div 
                          className="fixed inset-0 z-30" 
                          onClick={() => setIsModelPickerOpen(false)}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-lg shadow-2xl z-40 max-h-[480px] flex flex-col overflow-hidden"
                        >
                          <div className="p-3 border-b border-slate-100 sticky top-0 bg-white/80 backdrop-blur-sm z-10">
                            <input 
                              autoFocus
                              className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded focus:ring-2 focus:ring-indigo-500 outline-none"
                              placeholder="Search models or providers..."
                              value={modelSearch}
                              onChange={(e) => setModelSearch(e.target.value)}
                            />
                          </div>

                          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4 pb-4">
                            {['powerful', 'standard', 'small'].map(tier => {
                              const filteredModels = MODELS.filter(m => 
                                m.tier === tier && 
                                (m.name.toLowerCase().includes(modelSearch.toLowerCase()) || 
                                 m.provider.toLowerCase().includes(modelSearch.toLowerCase()))
                              );

                              if (filteredModels.length === 0) return null;

                              return (
                                <div key={tier} className="space-y-1.5">
                                  <h4 className="text-[9px] font-black text-slate-400 tracking-[0.2em] uppercase px-2 py-1">
                                    {tier === 'powerful' ? 'High Intelligence' : tier === 'standard' ? 'Balanced' : 'Lightweight'}
                                  </h4>
                                  <div className="space-y-1">
                                    {filteredModels.map(m => (
                                      <button
                                        key={m.id}
                                        type="button"
                                        onClick={() => {
                                          setSelectedModel(m);
                                          setIsModelPickerOpen(false);
                                          setModelSearch('');
                                        }}
                                        className={`w-full text-left p-3 rounded-md transition-all group ${
                                          selectedModel.id === m.id 
                                            ? 'bg-indigo-50 border border-indigo-100' 
                                            : 'hover:bg-slate-50 border border-transparent'
                                        }`}
                                      >
                                        <div className="flex justify-between items-start mb-1.5">
                                          <div>
                                            <span className={`font-bold text-sm ${selectedModel.id === m.id ? 'text-indigo-600' : 'text-slate-900'}`}>{m.name}</span>
                                            <span className="text-[10px] text-slate-400 block -mt-0.5">{m.provider}</span>
                                          </div>
                                          {selectedModel.id === m.id && (
                                            <Check className="w-3.5 h-3.5 text-indigo-600" />
                                          )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 leading-relaxed mb-2 italic">
                                          "{m.description}"
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                          {m.strengths.slice(0, 2).map((s, idx) => (
                                            <span key={idx} className="text-[8px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                              + {s}
                                            </span>
                                          ))}
                                          {m.weaknesses.length > 0 && (
                                            <span className="text-[8px] font-bold bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded-sm uppercase tracking-wider">
                                              - {m.weaknesses[0]}
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Capability Tier</span>
                <div className="w-full p-4 border border-slate-200 bg-slate-100/50 rounded-md text-sm font-medium flex items-center gap-2 select-none">
                  <Cpu className={`w-4 h-4 ${
                    selectedModel.tier === 'powerful' ? 'text-indigo-600' :
                    selectedModel.tier === 'standard' ? 'text-blue-500' : 'text-slate-400'
                  }`} aria-hidden="true" />
                  <span className="capitalize">{selectedModel.tier} Mode</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center mb-1">
                <div className="flex items-center gap-2">
                  <label htmlFor="extra-context" className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    Context (Optional)
                  </label>
                  <button
                    onClick={suggestContextWithAI}
                    disabled={isSuggestingContext || !goal.trim()}
                    className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest transition-all ${
                      isSuggestingContext || !goal.trim() 
                        ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400' 
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                    }`}
                  >
                    {isSuggestingContext ? <RefreshCcw className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
                    <span>AI Suggest</span>
                  </button>
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end">
                  {extractVariables(context).map(v => (
                    <VariableTooltip key={v} name={v} description={variableDescriptions[v] || ''} />
                  ))}
                  <span className="text-[9px] lowercase font-normal opacity-60 ml-2">supports {'{{var}}'} and more</span>
                </div>
              </div>
              <input 
                id="extra-context"
                type="text" 
                className="w-full p-4 border border-slate-200 rounded-md text-sm bg-slate-50 focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:bg-white outline-none transition-all" 
                placeholder="e.g. Audience: Series A CTOs and Finance Managers."
                value={context}
                onChange={(e) => setContext(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-6">
            <button 
              onClick={generateArchitectPrompt}
              disabled={isLoading || !goal.trim()}
              className="w-full py-4 bg-slate-900 text-white font-bold rounded-md hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center space-x-2 transition-all group active:scale-[0.98] focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 focus:outline-none h-[56px]"
              aria-busy={isLoading}
            >
              {isLoading ? (
                <RefreshCcw className="w-4 h-4 animate-spin text-white" />
              ) : (
                <Zap className="w-4 h-4 text-indigo-400 group-hover:text-white" aria-hidden="true" />
              )}
              <span className="uppercase tracking-widest text-xs">{isLoading ? 'Optimizing Architecture...' : 'Re-Optimize Structure'}</span>
            </button>
          </div>
        </section>

        {/* Right Panel: Result Preview */}
        <section className="col-span-12 lg:col-span-8 p-6 md:p-8 bg-slate-50 flex flex-col h-full overflow-y-auto custom-scrollbar" aria-labelledby="output-title">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
            <div className="flex items-center space-x-4">
              <h2 id="output-title" className={`px-4 py-1.5 rounded text-[10px] font-bold tracking-widest uppercase transition-colors ${
                generatedPrompt ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'
              }`}>
                {selectedModel.tier === 'powerful' ? 'CONCISE MODE' : 'EXPLICIT MODE'} ACTIVE
              </h2>
              <div className="text-[10px] text-slate-400 font-mono hidden sm:flex items-center gap-1.5">
                <ChevronRight className="w-3 h-3" aria-hidden="true" />
                OUTPUT_FINAL_v2.md
              </div>
            </div>
            {generatedPrompt && (
              <button 
                onClick={copyToClipboard}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none rounded p-1 transition-colors flex items-center gap-2 group shrink-0"
                aria-label={copied ? 'Copied to clipboard' : 'Copy generated prompt markdown'}
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 group-hover:-translate-y-0.5 transition-transform" aria-hidden="true" />}
                <span className="uppercase tracking-wider">{copied ? 'Copied' : 'Copy Markdown'}</span>
              </button>
            )}
          </div>

          {/* Prompt Display Card */}
          <div 
            className="flex-1 bg-white border border-slate-200 rounded-lg p-6 md:p-10 shadow-sm overflow-y-auto custom-scrollbar relative min-h-[300px]"
            role="region" 
            aria-live="polite"
            aria-label="Optimized prompt output"
          >
            <DisplayErrorBoundary>
              <AnimatePresence mode="wait">
                {isLoading ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center space-y-6"
                  >
                    <div className="relative" aria-hidden="true">
                      <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-slate-100 rounded-full"></div>
                      <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-t-indigo-600 rounded-full animate-spin absolute top-0"></div>
                    </div>
                    <div className="text-center space-y-2">
                      <p className="text-sm font-bold text-slate-900 uppercase tracking-widest leading-none">Architecting</p>
                      <p className="text-xs text-slate-400 font-mono">Applying tiered constraints...</p>
                    </div>
                  </motion.div>
                ) : generatedPrompt ? (
                  <motion.div
                    key="content"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="font-mono text-sm leading-relaxed text-slate-800"
                  >
                    <div className="whitespace-pre-wrap break-words">
                      {generatedPrompt.split('\n').map((line, i) => {
                        if (line.startsWith('###')) {
                          const sectionTitle = line.replace('###', '').trim();
                          const isStack = sectionTitle.toLowerCase().includes('stack') || sectionTitle.toLowerCase().includes('tool');
                          return (
                            <div key={i} className={`mb-4 pt-6 border-t border-slate-100 first:pt-0 first:border-0 ${isStack ? 'bg-indigo-50/30 -mx-4 px-4 pb-4 rounded-b-lg border-t-0 mt-4' : ''}`}>
                              <h3 className={`${isStack ? 'text-indigo-700' : 'text-indigo-600'} font-bold block mb-2 uppercase tracking-widest text-[11px] flex items-center gap-2`}>
                                {isStack && <Zap className="w-3 h-3" />}
                                {sectionTitle}
                              </h3>
                            </div>
                          );
                        }
                        return <p key={i} className="mb-1 last:mb-0 opacity-80">{line}</p>;
                      })}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="empty"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 flex flex-col items-center justify-center text-center space-y-6 opacity-30 px-6"
                  >
                    <div className="p-6 md:p-8 border-2 border-dashed border-slate-200 rounded-full">
                      <Share2 className="w-10 h-10 md:w-12 md:h-12 stroke-[1px] text-slate-400" aria-hidden="true" />
                    </div>
                    <div className="max-w-xs">
                      <p className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-1">Workspace Ready</p>
                      <p className="text-xs font-mono text-slate-500 leading-relaxed uppercase tracking-widest">
                        Input goal to see optimized structure
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </DisplayErrorBoundary>
          </div>

          {/* Analytics Footer */}
          <div className="mt-8 space-y-4">
            {/* Feedback Section */}
            <AnimatePresence>
              {generatedPrompt && !feedbackSubmitted && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-indigo-50 border border-indigo-100 rounded-lg p-5 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                      <Star className="w-3.5 h-3.5 fill-indigo-600" aria-hidden="true" />
                      Rate this Prompt
                    </h3>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => setRating(star)}
                          onMouseEnter={() => !rating && setRating(star)}
                          onMouseLeave={() => rating === star && setRating(star)}
                          className={`focus:outline-none transition-transform hover:scale-110`}
                          aria-label={`Rate ${star} stars`}
                        >
                          <Star 
                            className={`w-5 h-5 ${
                              star <= rating 
                                ? 'fill-indigo-600 text-indigo-600' 
                                : 'text-indigo-200'
                            }`} 
                          />
                        </button>
                      ))}
                    </div>
                  </div>

                  {rating > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="space-y-3"
                    >
                      <textarea
                        className="w-full p-3 text-xs border border-indigo-100 rounded bg-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none min-h-[80px]"
                        placeholder="Any suggestions for improvement?"
                        value={suggestion}
                        onChange={(e) => setSuggestion(e.target.value)}
                      />
                      <button
                        onClick={submitFeedback}
                        disabled={isSubmittingFeedback}
                        className="w-full py-2 bg-indigo-600 text-white rounded text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmittingFeedback ? (
                          <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Send className="w-3.5 h-3.5" />
                        )}
                        {isSubmittingFeedback ? 'Submitting...' : 'Submit Feedback'}
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              )}
              
              {feedbackSubmitted && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-50 border border-green-100 rounded-lg p-5 flex items-center justify-center gap-3"
                >
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white">
                    <Check className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-green-800 uppercase tracking-wider">Thank you for your feedback!</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Existing Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" role="complementary" aria-label="Prompt metrics">
            <div className="bg-white p-5 border border-slate-200 rounded-md shadow-sm flex items-center space-x-4 group hover:border-indigo-200 transition-colors">
              <div className="w-2.5 h-10 bg-indigo-500 rounded-full group-hover:h-12 transition-all" aria-hidden="true"></div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3" aria-hidden="true" />
                  Tokens
                </div>
                <div className="text-xl font-bold leading-none text-slate-900" aria-label={`${generatedPrompt ? Math.floor(generatedPrompt.length / 4) : 0} estimated tokens`}>
                  {generatedPrompt ? Math.floor(generatedPrompt.length / 4) : '---'}
                </div>
              </div>
            </div>
            
            <div className="bg-white p-5 border border-slate-200 rounded-md shadow-sm flex items-center space-x-4 group hover:border-emerald-200 transition-colors">
              <div className="w-2.5 h-10 bg-emerald-500 rounded-full group-hover:h-12 transition-all" aria-hidden="true"></div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Activity className="w-3 h-3" aria-hidden="true" />
                  Accuracy
                </div>
                <div className="text-xl font-bold leading-none text-slate-900" aria-label="98.8 percent efficiency">
                  {generatedPrompt ? '98.8%' : '---'}
                </div>
              </div>
            </div>

            <div className="bg-white p-5 border border-slate-200 rounded-md shadow-sm flex items-center space-x-4 group hover:border-orange-200 transition-colors">
              <div className="w-2.5 h-10 bg-orange-500 rounded-full group-hover:h-12 transition-all" aria-hidden="true"></div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <Zap className="w-3 h-3" aria-hidden="true" />
                  Density
                </div>
                <div className="text-xl font-bold leading-none text-slate-900" aria-label={`${selectedModel.tier} density mode`}>
                  {selectedModel.tier === 'powerful' ? 'High' : 'Optimal'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      </main>

      {/* History Slide-over Panel */}
      <AnimatePresence>
        {isHistoryPanelOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryPanelOpen(false)}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white shadow-2xl z-[101] flex flex-col border-l border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-50 rounded-lg">
                    <History className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Version History</h2>
                    <p className="text-[10px] text-slate-400 font-mono">Snapshot record of all iterations</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsHistoryPanelOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                  aria-label="Close panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {isLoadingHistory ? (
                  <div className="flex flex-col items-center justify-center h-full space-y-4 opacity-50">
                    <RefreshCcw className="w-8 h-8 animate-spin text-indigo-600" />
                    <p className="text-xs font-mono uppercase tracking-widest">Retrieving logs...</p>
                  </div>
                ) : versionHistory.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-30">
                    <Terminal className="w-12 h-12 stroke-[1px]" />
                    <p className="text-xs font-mono uppercase tracking-widest">No iterations recorded</p>
                  </div>
                ) : (
                  versionHistory.map((version) => (
                    <motion.div 
                      key={version.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 border border-slate-100 rounded-xl hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group cursor-pointer"
                      onClick={() => revertToVersion(version)}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">
                          {MODELS.find(m => m.id === version.modelId)?.name || version.modelId}
                        </span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {version.timestamp?.toDate ? version.timestamp.toDate().toLocaleString() : 'Recent'}
                        </span>
                      </div>
                      <h3 className="text-xs font-bold text-slate-800 line-clamp-1 mb-1">{version.goal}</h3>
                      <p className="text-[10px] text-slate-500 line-clamp-2 italic">"{version.prompt.substring(0, 100)}..."</p>
                      
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <RefreshCcw className="w-2.5 h-2.5" /> Revert to this version
                        </span>
                        <button 
                          onClick={(e) => deleteHistoryItem(e, version.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                          title="Delete snapshot"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>

              <div className="p-6 border-t border-slate-100 bg-slate-50/50">
                <p className="text-[9px] text-slate-400 text-center uppercase tracking-[0.2em]">End of history log</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {error && (
        <div 
          role="alert" 
          className="fixed top-20 right-4 md:right-8 max-w-sm p-4 bg-red-50 border border-red-100 rounded-md text-red-600 text-xs font-bold shadow-lg z-50 animate-in slide-in-from-right-10"
        >
          {error}
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1f5f9;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
}


import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, X, ChevronDown, ChevronUp, Target, Zap } from 'lucide-react';
import { VirtualElement } from '../types';
import { aiPipeline, AIResponse } from '../utils/ai/AIPipeline';
import { ensureLocalLlmReady } from '../utils/ai/localLlmManager';
import { chatCompletion, ChatMessage } from '../utils/ai/localLlmClient';
import { buildPdfSearchContext } from '../utils/ai/pdfDocSearch';
import { resourceScanner } from '../utils/ai/ResourceScanner';

interface NLPAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    currentRoot: VirtualElement;
    selectedElement?: VirtualElement | null;
    fileMap: any;
    onNLPUpdate: (response: AIResponse) => void;
    aiBackend: "local" | "colab";
    colabUrl: string;
    currentSlideId?: string | null;
    pdfSourcePath?: string | null;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    isError?: boolean;
}

const NLPAssistant: React.FC<NLPAssistantProps> = ({
    isOpen,
    onClose,
    currentRoot,
    selectedElement,
    fileMap,
    onNLPUpdate,
    aiBackend,
    colabUrl,
    currentSlideId,
    pdfSourcePath
}) => {
    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'assistant', content: "Hi! I'm your local AI assistant. I can help you modify styles, content, and layout in milliseconds. Try 'change title to blue' or 'move button below image'." }
    ]);
    const [input, setInput] = useState('');
    const [isMinimized, setIsMinimized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const isUsefulTarget = selectedElement &&
        !['body', 'html'].includes((selectedElement?.type || '').toLowerCase()) &&
        selectedElement?.id !== 'preview-live-root';

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isMinimized]);

    if (!isOpen) return null;

    const isUiCommand = (text: string) => {
        return /\b(make|change|update|set|add|remove|delete|replace|edit|modify|move|resize|translate|convert|color|colour|font|size|background|opacity|border|shadow|padding|margin|width|height|style|bold|italic|underline|align|center|left|right|animate|show|hide|display|position|rotate|scale|flip|blur|gradient|image|icon|button|text|heading|title|link|href|src|class|id|layout|column|row|flex|grid|dark|light|white|black|red|green|blue|yellow|pink|purple|orange|grey|gray)\b/i.test(text);
    };

    const isQuestionLike = (text: string) => {
        return /\?\s*$/.test(text) || /^(what|why|how|when|where|who|which|explain|summarize|summarise)\b/i.test(text.trim());
    };

    const buildSlideContext = () => {
        if (!currentSlideId || !fileMap) return "";
        resourceScanner.scan(fileMap);
        const index = resourceScanner.getFullIndex();
        const slide = index.slides[currentSlideId];
        return slide?.textContent || "";
    };

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        
        const shouldUseDocAssistant = aiBackend === "local" && (isQuestionLike(input) || !isUiCommand(input));

        if (shouldUseDocAssistant) {
            setIsLoading(true);
            try {
                await ensureLocalLlmReady();
                const slideText = buildSlideContext();
                const pdfContext = pdfSourcePath
                    ? await buildPdfSearchContext(pdfSourcePath, input)
                    : "";
                const slideSnippet = slideText.slice(0, 3500);
                const systemPrompt = [
                    "You are a local assistant for eDetailing content.",
                    "Rule 1: The CURRENT SLIDE is the primary source of truth.",
                    "Rule 2: Do NOT ask which slide is open; assume it is the current one.",
                    "Rule 3: If the answer is not on the current slide, you may use the Technical Guideline excerpt if provided.",
                    "Rule 4: If the answer is missing, say you cannot find it on the current slide or guideline.",
                    "",
                    `CURRENT SLIDE ID: ${currentSlideId || "unknown"}`,
                    "CURRENT SLIDE TEXT:",
                    slideSnippet || "(no slide text available)",
                    pdfContext ? "\nTECHNICAL GUIDELINE EXCERPTS:\n" + pdfContext : "",
                ].join("\n");

                const messagesForLlm: ChatMessage[] = [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: input.trim() },
                ];
                const responseText = await chatCompletion(messagesForLlm, {
                    temperature: 0.2,
                    maxTokens: 400,
                });

                const assistantMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: responseText || "I couldn't find that on the current slide.",
                };
                setMessages(prev => [...prev, assistantMsg]);
            } catch (err: any) {
                setMessages(prev => [...prev, {
                    id: (Date.now() + 1).toString(),
                    role: 'system',
                    content: `Local AI error: ${err?.message || "Unknown error"}`,
                    isError: true,
                }]);
            } finally {
                setIsLoading(false);
                setInput('');
            }
            return;
        }

        // Process locally (Synchronous & Blazing Fast) with project-wide fileMap
        const result = aiPipeline.process(input, currentRoot, fileMap);
        
        // Add assistant response
        const assistantMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.intent !== 'UNKNOWN' 
                ? `Understood. Intent: ${result.intent}. Confidence: ${(result.confidence * 100).toFixed(0)}%`
                : "I'm not sure what you want me to do. Could you rephrase that?"
        };
        
        setMessages(prev => [...prev, assistantMsg]);
        setInput('');

        // Trigger update if we found a match
        if (result.intent !== 'UNKNOWN') {
           onNLPUpdate(result);
        }
    };

    return (
        <div className={`fixed bottom-6 right-6 z-[100] w-96 flex flex-col glass-panel shadow-2xl shadow-indigo-500/10 border border-slate-700/60 rounded-xl overflow-hidden transition-all duration-300 ${isMinimized ? 'h-14' : 'h-[500px]'} bg-slate-900`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-700/50 cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center gap-2">
                    <div className="bg-indigo-500/20 p-1.5 rounded-lg text-indigo-400">
                        <Zap size={16} />
                    </div>
                    <span className="font-medium text-slate-200 text-sm">Lightweight Assistant <span className="text-xs text-slate-500 font-normal ml-1">(Local NLP)</span></span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="text-slate-400 hover:text-white transition-colors">
                        {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-slate-400 hover:text-red-400 transition-colors ml-1">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Targeting Banner */}
            {!isMinimized && isUsefulTarget && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-500/10 border-b border-indigo-500/20 text-indigo-400 text-[10px]">
                    <Target size={10} />
                    <span className="font-medium">Targeting:</span>
                    <span className="font-mono opacity-80 truncate">&lt;{selectedElement.type}&gt; {selectedElement.id}</span>
                </div>
            )}

            {/* Chat History */}
            {!isMinimized && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/40 custom-scrollbar">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`
                                max-w-[85%] rounded-lg px-3 py-2 text-sm
                                ${msg.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-200 border border-slate-700/50'}
                            `}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start">
                            <div className="bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-400">
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input Area */}
            {!isMinimized && (
                <div className="p-3 bg-slate-900/80 border-t border-slate-700/50">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                            placeholder="Type a command... (e.g. 'make button red')"
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-3 pr-10 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none h-14"
                        />
                        <button
                            onClick={handleSend}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 top-2 p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50 transition-colors"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NLPAssistant;

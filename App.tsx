
import React, { useState, useEffect, useRef } from 'react';
import { Message, Settings, Badge, QuizQuestion, Focus } from './types';
import { INITIAL_SETTINGS, INITIAL_BADGES } from './constants';
import { generateResponse, detectBias, generateQuiz, generateImage } from './services/gemini';

// --- Global Audio Context to avoid exhaustion ---
let sharedAudioCtx: AudioContext | null = null;
const getAudioCtx = () => {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  }
  if (sharedAudioCtx.state === 'suspended') sharedAudioCtx.resume();
  return sharedAudioCtx;
};

// --- Utils ---
const playAudio = async (base64: string) => {
  if (!base64) return;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  
  const ctx = getAudioCtx();
  const dataInt16 = new Int16Array(bytes.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
  
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
};

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = error => reject(error);
  });
};

// --- Component: Simple Markdown Parser ---
const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|_.*?_|`.*?`|\n)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part === '\n') return <br key={i} />;
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} className="font-black text-cyan-600 dark:text-cyan-400">{part.slice(2, -2)}</strong>;
        }
        if ((part.startsWith('*') && part.endsWith('*')) || (part.startsWith('_') && part.endsWith('_'))) {
          return <em key={i} className="italic opacity-90 border-b border-cyan-500/20">{part.slice(1, -1)}</em>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="mono-font bg-slate-200 dark:bg-slate-800/50 px-1.5 py-0.5 rounded text-[0.85em] border border-inherit/10">{part.slice(1, -1)}</code>;
        }
        return part;
      })}
    </>
  );
};

const Sidebar: React.FC<{ 
  settings: Settings; 
  setSettings: (s: Settings) => void;
  badges: Badge[];
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
}> = ({ settings, setSettings, badges, isOpen, onClose, messages }) => {
  const focusLabels: Record<Focus, string> = {
    [Focus.ETHICS]: 'Etika',
    [Focus.METAPHYSICS]: 'Metafisika',
    [Focus.POLITICS]: 'Politik',
    [Focus.LOGIC]: 'Logika',
    [Focus.AESTHETICS]: 'Estetika',
    [Focus.EPISTEMOLOGY]: 'Epistemologi'
  };

  const exportChat = () => {
    const chatContent = messages.map(m => `${m.role === 'user' ? 'USER' : 'LIBRA'}: ${m.parts.map(p => p.text || '[Image]').join(' ')}`).join('\n\n');
    const blob = new Blob([chatContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Diskusi_Libra_AI_${new Date().getTime()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className={`fixed inset-0 bg-slate-950/70 backdrop-blur-md z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`fixed top-0 left-0 h-full w-[320px] border-r flex flex-col transition-transform duration-500 z-50 overflow-hidden ${settings.darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 shadow-2xl'} ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 border-b border-inherit bg-gradient-to-br from-cyan-500/10 to-transparent">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-3xl philosophy-font font-black tracking-tighter text-cyan-600">Libra AI</h2>
            <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-cyan-500"><i className="fas fa-times"></i></button>
          </div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold opacity-50">Kecerdasan Filosofis</p>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scroll">
          <section>
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-4">Fokus Intelektual</label>
            <div className="grid grid-cols-1 gap-2">
              {Object.values(Focus).map(f => (
                <button key={f} onClick={() => setSettings({...settings, focus: f})} className={`p-3 text-xs font-bold rounded-xl border transition-all text-left flex items-center justify-between ${settings.focus === f ? 'bg-cyan-600 text-white border-cyan-500 shadow-lg' : 'border-inherit hover:bg-slate-100 dark:hover:bg-slate-800'}`}>
                  <span>{focusLabels[f]}</span>
                  {settings.focus === f && <i className="fas fa-check-circle text-[10px]"></i>}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex justify-between items-center mb-4">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Ketajaman Analisis</label>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600">{settings.intensity}</span>
            </div>
            <input type="range" min="1" max="10" value={settings.intensity} onChange={(e) => setSettings({...settings, intensity: parseInt(e.target.value)})} className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none accent-cyan-600" />
          </section>

          <section className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block">Fitur</label>
            {[
              { id: 'darkMode', label: 'Mode Gelap', icon: 'fa-moon' },
              { id: 'searchGrounding', label: 'Grounding Web', icon: 'fa-globe', color: 'text-blue-500' },
              { id: 'ttsEnabled', label: 'Narasi Suara', icon: 'fa-volume-high', color: 'text-amber-500' }
            ].map(toggle => (
              <div key={toggle.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 cursor-pointer group" onClick={() => setSettings({...settings, [toggle.id]: !(settings as any)[toggle.id]})}>
                <div className="flex items-center space-x-3">
                  <i className={`fas ${toggle.icon} ${toggle.color || 'opacity-40'} text-xs group-hover:scale-110 transition-transform`}></i>
                  <span className="text-xs font-medium">{toggle.label}</span>
                </div>
                <div className={`w-8 h-4 rounded-full transition-colors relative ${ (settings as any)[toggle.id] ? 'bg-cyan-600' : 'bg-slate-300 dark:bg-slate-600' }`}>
                  <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${ (settings as any)[toggle.id] ? 'left-4.5' : 'left-0.5' } shadow-sm`}></div>
                </div>
              </div>
            ))}
          </section>

          <button onClick={exportChat} className="w-full p-4 rounded-2xl border border-dashed border-cyan-500/30 text-cyan-600 text-xs font-black uppercase tracking-widest hover:bg-cyan-50 transition-all flex items-center justify-center space-x-2">
            <i className="fas fa-download"></i>
            <span>Simpan Diskusi</span>
          </button>

          <section>
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-4">Milestone</label>
            <div className="grid grid-cols-3 gap-3">
              {badges.map(b => (
                <div key={b.id} title={`${b.name}: ${b.description}`} className={`aspect-square flex flex-col items-center justify-center rounded-2xl border transition-all ${b.unlocked ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10' : 'border-slate-100 dark:border-slate-800 grayscale opacity-40'}`}>
                  <span className="text-2xl mb-1">{b.icon}</span>
                  <span className="text-[7px] font-black uppercase text-center leading-tight px-1">{b.name}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

const ChatBubble: React.FC<{ message: Message; darkMode: boolean; onGenerateImage: (prompt: string) => void }> = ({ message, darkMode, onGenerateImage }) => {
  const isUser = message.role === 'user';
  const textPart = message.parts.find(p => p.text)?.text || '';
  const imagePart = message.parts.find(p => p.inlineData);
  const [showThinking, setShowThinking] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(textPart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} w-full mb-10 message-appear`}>
      {!isUser && (
        <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-white mr-4 flex-shrink-0 shadow-2xl border-2 border-cyan-500/50">
          <i className="fas fa-brain text-sm"></i>
        </div>
      )}
      <div className={`group relative max-w-[85%] rounded-[2rem] px-6 py-5 shadow-2xl transition-all ${
        isUser 
          ? 'bg-gradient-to-br from-cyan-700 to-indigo-800 text-white rounded-tr-none' 
          : darkMode 
            ? 'bg-slate-800 text-slate-100 rounded-tl-none border border-slate-700' 
            : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'
      }`}>
        {imagePart && (
          <div className="mb-4 rounded-2xl overflow-hidden border border-white/10 shadow-lg">
            <img src={`data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`} alt="User Input" className="w-full h-auto max-h-[400px] object-contain" />
          </div>
        )}
        
        <div className="text-sm sm:text-[1.1rem] leading-relaxed philosophy-font">
          <FormattedText text={textPart} />
        </div>

        {!isUser && (
          <div className="mt-5 pt-4 border-t border-inherit/10 flex flex-wrap gap-4 items-center">
            {message.metadata?.bias && message.metadata.bias !== "Tidak ada" && message.metadata.bias !== "None" && (
              <div className="text-[10px] uppercase font-black tracking-widest text-red-500 bg-red-500/10 px-3 py-1.5 rounded-full border border-red-500/20 flex items-center">
                <i className="fas fa-triangle-exclamation mr-2"></i> Fallacy: {message.metadata.bias}
              </div>
            )}
            
            <div className="flex gap-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={copyToClipboard} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-500 hover:text-cyan-600 transition-all">
                <i className={`fas ${copied ? 'fa-check text-green-500' : 'fa-copy'}`}></i>
              </button>
              <button onClick={() => onGenerateImage(textPart)} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-500 hover:text-cyan-600 transition-all">
                <i className="fas fa-wand-magic-sparkles"></i>
              </button>
              {message.metadata?.audioData && (
                <button onClick={() => playAudio(message.metadata?.audioData || '')} className="w-9 h-9 flex items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg hover:scale-110 transition-all">
                  <i className="fas fa-volume-up"></i>
                </button>
              )}
            </div>
          </div>
        )}

        {!isUser && message.metadata?.thinking && (
          <div className="mt-3">
            <button onClick={() => setShowThinking(!showThinking)} className="text-[10px] uppercase font-black tracking-tighter opacity-30 hover:opacity-100 flex items-center">
              <i className={`fas fa-chevron-${showThinking ? 'down' : 'right'} mr-2`}></i> 
              {showThinking ? 'Tutup Analisis' : 'Buka Jalur Pemikiran Logika'}
            </button>
            {showThinking && (
              <div className="mt-3 p-5 bg-slate-900/5 dark:bg-white/5 rounded-2xl text-[12px] mono-font border border-inherit/10 italic leading-relaxed text-slate-500 dark:text-slate-400">
                {message.metadata.thinking}
              </div>
            )}
          </div>
        )}

        {!isUser && message.metadata?.latency && (
          <div className="absolute -bottom-6 left-2 text-[9px] uppercase tracking-[0.2em] font-black opacity-20">
            Latency: {message.metadata.latency}ms | Sintesis Stabil
          </div>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', parts: [{ text: "Salam dari cakrawala akal budi. Saya adalah **Libra AI**. Mari kita bedah realitas dengan pisau logika hari ini. \n\nApa yang mengganjal di pikiran Anda, atau ingin Anda _diskusikan_ lebih dalam?" }], timestamp: Date.now() }
  ]);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [badges, setBadges] = useState<Badge[]>(INITIAL_BADGES);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<{mimeType: string, data: string} | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const base64 = await fileToBase64(file);
      setSelectedImage({ mimeType: file.type, data: base64 });
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!input.trim() && !selectedImage) || isTyping) return;
    
    const parts: any[] = [];
    if (selectedImage) parts.push({ inlineData: selectedImage });
    if (input.trim()) parts.push({ text: input.trim() });

    const userMsg: Message = { role: 'user', parts, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setIsTyping(true);

    try {
      const biasPromise = detectBias(input.trim());
      const responsePromise = generateResponse([...messages, userMsg], settings);
      const [bias, { text, metadata }] = await Promise.all([biasPromise, responsePromise]);
      
      // Jika ada audio dan TTS aktif, putar otomatis
      if (metadata.audioData && settings.ttsEnabled) {
        setTimeout(() => playAudio(metadata.audioData), 500);
      }
      
      setMessages(prev => [...prev, { role: 'model', parts: [{ text }], metadata: { ...metadata, bias }, timestamp: Date.now() }]);
      updateAchievements(userMsg);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'model', parts: [{ text: "**Gangguan Dialektika**: Anomali sistemik terdeteksi. Silakan segarkan premis Anda." }], timestamp: Date.now() }]);
    } finally { setIsTyping(false); }
  };

  const updateAchievements = (msg: Message) => {
    setBadges(prev => prev.map(b => {
      if (b.id === 'visionary' && msg.parts.some(p => p.inlineData)) b.unlocked = true;
      if (b.id === 'stubborn_soul') b.progress = Math.min(b.total, b.progress + 1);
      if (b.progress >= b.total) b.unlocked = true;
      return { ...b };
    }));
  };

  const handleVisualize = async (text: string) => {
    setIsTyping(true);
    try {
      const imgData = await generateImage(text);
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last && last.role === 'model') return [...prev.slice(0, -1), { ...last, metadata: { ...last.metadata, generatedImage: imgData } }];
        return prev;
      });
    } catch (e) { console.error(e); } finally { setIsTyping(false); }
  };

  return (
    <div className={`flex h-screen w-full transition-all duration-500 overflow-hidden ${settings.darkMode ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-50 text-slate-900'}`}>
      <Sidebar settings={settings} setSettings={setSettings} badges={badges} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} messages={messages} />
      
      <div className="flex-1 flex flex-col relative h-full">
        <header className="h-16 sm:h-20 border-b border-inherit glass flex items-center justify-between px-6 sm:px-10 sticky top-0 z-10">
          <div className="flex items-center space-x-6">
            <button onClick={() => setIsSidebarOpen(true)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-all shadow-sm">
              <i className="fas fa-bars-staggered text-cyan-600"></i>
            </button>
            <div className="hidden sm:block">
              <h1 className="philosophy-font font-black text-2xl text-cyan-600 leading-none">Libra AI</h1>
              <div className="flex items-center space-x-2 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <p className="text-[10px] uppercase font-black tracking-widest opacity-40">Dialectica Engine v3.5 Stable</p>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex -space-x-2">
              {badges.filter(b => b.unlocked).slice(0, 3).map(b => (
                <div key={b.id} className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border-2 border-cyan-500 flex items-center justify-center text-sm shadow-lg" title={b.name}>{b.icon}</div>
              ))}
            </div>
            <button 
              onClick={async () => { setIsTyping(true); setQuizQuestions(await generateQuiz(messages)); setShowQuiz(true); setIsTyping(false); }} 
              className="text-[11px] font-black uppercase tracking-widest px-6 py-3 rounded-2xl bg-cyan-600 text-white shadow-xl shadow-cyan-500/30 hover:bg-cyan-700 transition-all active:scale-95"
            >
              Uji Nalar
            </button>
          </div>
        </header>

        <main ref={scrollRef} className="flex-1 overflow-y-auto px-4 sm:px-16 pt-10 pb-40 space-y-6 custom-scroll">
          <div className="max-w-4xl mx-auto w-full">
            {messages.map((m, i) => (
              <ChatBubble key={i} message={m} darkMode={settings.darkMode} onGenerateImage={handleVisualize} />
            ))}
            {isTyping && (
              <div className="flex justify-start w-full mb-12 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-slate-900 border-2 border-cyan-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
                   <i className="fas fa-meteor text-cyan-500 text-xs animate-bounce"></i>
                </div>
                <div className="rounded-[2rem] px-8 py-5 glass border border-cyan-500/20 flex items-center space-x-4 ml-4">
                  <div className="flex space-x-1">
                    <span className="w-1.5 h-1.5 bg-cyan-600 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-1.5 h-1.5 bg-cyan-600 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-1.5 h-1.5 bg-cyan-600 rounded-full animate-bounce"></span>
                  </div>
                  <span className="text-cyan-600 text-xs font-black uppercase tracking-[0.2em]">Merangkai Logika</span>
                </div>
              </div>
            )}
          </div>
        </main>

        <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-16 flex flex-col items-center">
          {selectedImage && (
            <div className="mb-4 p-3 bg-white dark:bg-slate-800 rounded-3xl shadow-2xl border-2 border-cyan-500/50 relative animate-in fade-in slide-in-from-bottom-4 duration-300">
              <img src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`} className="h-28 w-auto rounded-2xl shadow-inner" alt="Preview" />
              <button onClick={() => setSelectedImage(null)} className="absolute -top-3 -right-3 bg-red-600 text-white w-8 h-8 rounded-full text-sm shadow-xl flex items-center justify-center border-4 border-white dark:border-slate-800 transition-transform active:scale-90">
                <i className="fas fa-times"></i>
              </button>
            </div>
          )}
          <footer className="w-full max-w-4xl glass p-3 rounded-[3rem] border border-slate-200/50 dark:border-slate-700/50 shadow-[0_25px_60px_rgba(8,112,184,0.2)]">
            <form onSubmit={handleSend} className="relative flex items-center space-x-4">
              <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-4 text-cyan-600 hover:bg-cyan-100/50 dark:hover:bg-slate-800 rounded-full transition-all group" title="Analisis Gambar">
                <i className="fas fa-camera-retro text-2xl group-hover:scale-110"></i>
              </button>
              <input 
                type="text" 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Lontarkan pertanyaan atau unggah bukti empiris..." 
                className="flex-1 h-14 bg-transparent outline-none text-base sm:text-lg px-2 placeholder:opacity-20 placeholder:font-light" 
              />
              <button 
                type="submit" 
                disabled={isTyping || (!input.trim() && !selectedImage)} 
                className="h-14 w-16 bg-gradient-to-br from-cyan-600 to-indigo-700 text-white rounded-[1.8rem] hover:shadow-cyan-500/40 hover:shadow-2xl disabled:opacity-10 transition-all active:scale-95 flex items-center justify-center shadow-lg"
              >
                <i className="fas fa-bolt-lightning text-xl"></i>
              </button>
            </form>
          </footer>
        </div>

        {showQuiz && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-slate-950/98 backdrop-blur-3xl">
            <div className={`max-w-2xl w-full p-12 rounded-[4rem] shadow-[0_40px_120px_rgba(0,0,0,0.6)] border ${settings.darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className="flex justify-between items-center mb-12">
                <div>
                  <h3 className="philosophy-font text-5xl font-black text-cyan-600">Audit Nalar</h3>
                  <p className="text-[11px] uppercase font-black tracking-[0.4em] opacity-40 mt-3">Verifikasi Rantai Konsistensi</p>
                </div>
                <button onClick={() => setShowQuiz(false)} className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-2xl hover:bg-red-600 hover:text-white transition-all shadow-inner"><i className="fas fa-xmark"></i></button>
              </div>
              <div className="space-y-8 max-h-[50vh] overflow-y-auto pr-6 custom-scroll">
                {quizQuestions.map((q, idx) => (
                  <div key={idx} className="p-10 rounded-[3rem] border-2 border-inherit/10 bg-inherit/5 shadow-inner group hover:border-cyan-500/40 transition-all duration-500">
                    <p className="text-xl font-bold mb-6 leading-relaxed italic">"{idx + 1}. {q.question}"</p>
                    <div className="grid gap-4">
                      {q.options?.map((opt, oIdx) => (
                        <button key={oIdx} onClick={() => alert(`${opt === q.correctAnswer ? 'KONSISTEN. Rantai logika Anda utuh.' : 'KONTRAKTIF. Terdeteksi anomali berpikir.'}\n\n${q.explanation}`)} className="text-left text-sm p-5 rounded-2xl border-2 border-inherit hover:bg-cyan-600 hover:text-white hover:border-cyan-500 transition-all active:scale-[0.97] shadow-sm font-medium">{opt}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowQuiz(false)} className="w-full mt-12 h-20 bg-gradient-to-r from-cyan-600 to-indigo-700 text-white font-black uppercase tracking-[0.4em] rounded-3xl hover:opacity-90 transition-all shadow-2xl shadow-cyan-500/30">Akhiri Assessment</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

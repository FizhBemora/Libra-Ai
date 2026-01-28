
export type Role = 'user' | 'model';

export interface MessageMetadata {
  latency?: number;
  bias?: string;
  groundingUrls?: Array<{ uri: string; title: string }>;
  thinking?: string;
  audioData?: string; // base64
  generatedImage?: string; // base64
}

export interface MessagePart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

export interface Message {
  role: Role;
  parts: MessagePart[];
  metadata?: MessageMetadata;
  timestamp: number;
}

export enum Focus {
  ETHICS = 'Ethics',
  METAPHYSICS = 'Metaphysics',
  POLITICS = 'Politics',
  LOGIC = 'Logic',
  AESTHETICS = 'Aesthetics',
  EPISTEMOLOGY = 'Epistemology'
}

export interface Settings {
  intensity: number; // 1-10
  formality: 'Formal' | 'Casual';
  focus: Focus;
  silentMode: boolean;
  debateMode: boolean;
  darkMode: boolean;
  searchGrounding: boolean;
  mapsGrounding: boolean;
  ttsEnabled: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number;
  total: number;
}

export interface QuizQuestion {
  type: 'multiple_choice' | 'typing';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

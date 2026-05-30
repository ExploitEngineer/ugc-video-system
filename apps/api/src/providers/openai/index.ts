// OpenAI provider adapter (stub) — GPT Image 2 + LLM reasoning/critique.
//
// Adapter boundary: agent/skill code depends on these interfaces only,
// never on the `openai` SDK directly, so the model is swappable.
// Real implementation lands in F4 (image gen) / F5 (vision critique).

/** A reference image passed into an image-gen or vision call. */
export interface ImageRef {
  /** Public or signed URL, or a base64 data URI. */
  source: string;
  mime?: string;
}

export interface GenerateImageInput {
  prompt: string;
  /** Optional reference images (product upload, prior sheets, …). */
  refs?: ImageRef[];
  size?: string;
}

export interface GenerateImageResult {
  /** Raw image bytes of the generated composite sheet. */
  bytes: Uint8Array;
  mime: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Images for vision/critique turns. */
  images?: ImageRef[];
}

export interface OpenAIProvider {
  /** LLM reasoning / prompt building (and vision when `images` present). */
  chat(messages: ChatMessage[]): Promise<string>;
  /** GPT Image 2 generation → composite reference/storyboard sheet. */
  generateImage(input: GenerateImageInput): Promise<GenerateImageResult>;
}

const notImplemented = (name: string): never => {
  throw new Error(`OpenAIProvider.${name} not implemented (lands in F4/F5)`);
};

/** Stub factory. Replace internals in F4/F5; the interface is the contract. */
export function createOpenAIProvider(): OpenAIProvider {
  return {
    chat: () => notImplemented("chat"),
    generateImage: () => notImplemented("generateImage"),
  };
}

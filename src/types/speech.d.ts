// Web Speech API Type Declarations

interface SpeechRecognitionEvent {
  readonly resultIndex: number
  readonly results: {
    readonly length: number
    [index: number]: {
      readonly length: number
      [index: number]: {
        readonly transcript: string
        readonly confidence: number
      }
    }
  }
}

interface SpeechRecognitionErrorEvent {
  readonly error: string
  readonly message?: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null
  onend: ((this: SpeechRecognition, ev: Event) => any) | null
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null
  start(): void
  stop(): void
  abort(): void
}

declare var SpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

declare var webkitSpeechRecognition: {
  prototype: SpeechRecognition
  new (): SpeechRecognition
}

/**
 * Shared Voice Synthesizer Module for Smriti Saathi
 * Slow, clear speech synthesis with sentence queuing, rate control, and language selection.
 */

let speechQueue = [];
let isSpeaking = false;
let currentUtterance = null;
let currentAudio = null;
let loadedVoices = [];

// Voice speed setting cache
let currentVoiceSpeed = parseFloat(localStorage.getItem('smriti_voice_speed') || '0.65');

// Map language codes to BCP 47 locales
const LANG_MAP = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  as: 'as-IN',
};

// Initialize voices and listen for voiceschanged
function initVoices() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    loadedVoices = window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      loadedVoices = window.speechSynthesis.getVoices();
    };
  }
}
initVoices();

export function setVoiceSpeed(speed) {
  currentVoiceSpeed = parseFloat(speed);
  localStorage.setItem('smriti_voice_speed', String(currentVoiceSpeed));
}

export function getVoiceSpeed() {
  return currentVoiceSpeed;
}

export function getLoadedVoices() {
  if (loadedVoices.length === 0 && typeof window !== 'undefined' && 'speechSynthesis' in window) {
    loadedVoices = window.speechSynthesis.getVoices();
  }
  return loadedVoices;
}

export function hasVoiceForLanguage(langCode = 'hi') {
  const targetTag = LANG_MAP[langCode] || langCode;
  const voices = getLoadedVoices();
  return voices.some(v => v.lang.toLowerCase().startsWith(targetTag.toLowerCase()) || v.lang.toLowerCase().startsWith(langCode));
}

/**
 * Cancels all current speech and empties the queue.
 * Called automatically when screen or route changes.
 */
export function cancelSpeech() {
  speechQueue = [];
  isSpeaking = false;

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
}

/**
 * Splits text into sentences by punctuation (. ? ! ।)
 */
function splitIntoSentences(text) {
  if (!text) return [];
  return text
    .split(/([।?!.।\n]+)/)
    .reduce((acc, piece, idx) => {
      if (idx % 2 === 0) {
        if (piece.trim()) acc.push(piece.trim());
      } else if (acc.length > 0) {
        acc[acc.length - 1] += piece;
      }
      return acc;
    }, []);
}

/**
 * Speaks text using TTS queue with 400ms pause between sentences.
 * @param {string} text The text to speak
 * @param {object} options { lang: 'hi', speed: 0.65, onComplete: () => {} }
 */
export function speak(text, options = {}) {
  if (!text || typeof window === 'undefined') return;

  const lang = options.lang || localStorage.getItem('smriti_elder_language') || localStorage.getItem('smriti_language') || 'hi';
  const speed = options.speed !== undefined ? options.speed : currentVoiceSpeed;

  if (!('speechSynthesis' in window)) {
    console.warn('[Voice] SpeechSynthesis API not supported');
    options.onComplete?.();
    return;
  }

  // Cancel any ongoing utterance before starting a fresh speech block
  cancelSpeech();

  const sentences = splitIntoSentences(text);
  speechQueue = [...sentences];

  function processQueue() {
    if (speechQueue.length === 0) {
      isSpeaking = false;
      options.onComplete?.();
      return;
    }

    isSpeaking = true;
    const sentence = speechQueue.shift();
    const utterance = new SpeechSynthesisUtterance(sentence);
    currentUtterance = utterance;

    utterance.rate = speed;
    utterance.pitch = 1.0;
    utterance.lang = LANG_MAP[lang] || lang;

    // Pick matching voice
    const voices = getLoadedVoices();
    const targetTag = (LANG_MAP[lang] || lang).toLowerCase();
    const matchingVoice = voices.find(v => v.lang.toLowerCase().replace('_', '-').startsWith(targetTag))
      || voices.find(v => v.lang.toLowerCase().startsWith(lang));

    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onend = () => {
      // 400ms pause between short sentences per spec
      setTimeout(() => {
        processQueue();
      }, 400);
    };

    utterance.onerror = (e) => {
      console.warn('[Voice] Speech error:', e);
      setTimeout(() => {
        processQueue();
      }, 200);
    };

    window.speechSynthesis.speak(utterance);
  }

  processQueue();
}

/**
 * Plays pre-recorded audio buffer or URL
 */
export function playAudio(source, onComplete) {
  cancelSpeech();
  try {
    const audio = new Audio(source);
    currentAudio = audio;
    audio.onended = () => {
      currentAudio = null;
      onComplete?.();
    };
    audio.onerror = () => {
      currentAudio = null;
      onComplete?.();
    };
    audio.play().catch(err => {
      console.warn('[Voice] Audio play error:', err);
      onComplete?.();
    });
  } catch (err) {
    console.warn('[Voice] PlayAudio failed:', err);
    onComplete?.();
  }
}

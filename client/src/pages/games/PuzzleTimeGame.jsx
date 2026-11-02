import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Trophy,
  RotateCcw,
  Eye,
  EyeOff,
  CheckCircle2,
  Sparkles,
  Volume2,
  RefreshCw,
  Camera,
  Image as ImageIcon,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';

// 10 Picture Puzzle Categories with SVG illustrations
const PUZZLE_CATEGORIES = [
  {
    id: 'bird',
    name: 'Bird Puzzle',
    labelKey: 'games.puzzle_categories.bird',
    defaultLabel: 'Bird Puzzle (पक्षी पहेली)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="%23A7F3D0"/>
          <stop offset="100%" stop-color="%2338BDF8"/>
        </linearGradient>
      </defs>
      <rect width="500" height="300" fill="url(%23bg)"/>
      <circle cx="80" cy="70" r="45" fill="%23FEF08A"/>
      <path d="M 0 240 Q 150 180 300 230 T 500 210 L 500 300 L 0 300 Z" fill="%2315803D"/>
      <path d="M 120 280 Q 240 160 360 210" stroke="%2378350F" stroke-width="16" fill="none" stroke-linecap="round"/>
      <path d="M 230 190 Q 280 150 330 170" stroke="%2378350F" stroke-width="10" fill="none" stroke-linecap="round"/>
      <!-- Peacock / Colorful Bird -->
      <ellipse cx="260" cy="140" rx="36" ry="24" fill="%230284C7"/>
      <circle cx="285" cy="120" r="16" fill="%230369A1"/>
      <circle cx="290" cy="116" r="3" fill="%23FFFFFF"/>
      <polygon points="298,118 316,122 298,126" fill="%23F59E0B"/>
      <!-- Tail Feathers -->
      <path d="M 230 145 C 170 110, 130 140, 100 120" stroke="%2310B981" stroke-width="20" stroke-linecap="round" fill="none"/>
      <circle cx="100" cy="120" r="10" fill="%23047857"/>
      <circle cx="100" cy="120" r="5" fill="%23FBBF24"/>
      <path d="M 230 155 C 180 145, 140 175, 110 165" stroke="%23059669" stroke-width="18" stroke-linecap="round" fill="none"/>
      <circle cx="110" cy="165" r="9" fill="%23047857"/>
      <circle cx="110" cy="165" r="4" fill="%2338BDF8"/>
    </svg>`,
  },
  {
    id: 'vegetable',
    name: 'Vegetable Puzzle',
    labelKey: 'games.puzzle_categories.vegetable',
    defaultLabel: 'Vegetable Puzzle (सब्ज़ी पहेली)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23FEF3C7"/>
      <!-- Wicker Basket -->
      <ellipse cx="250" cy="220" rx="190" ry="60" fill="%23D97706"/>
      <ellipse cx="250" cy="205" rx="170" ry="45" fill="%23B45309"/>
      <!-- Pumpkin -->
      <circle cx="190" cy="160" r="45" fill="%23EA580C"/>
      <circle cx="225" cy="160" r="45" fill="%23F97316"/>
      <rect x="200" y="110" width="12" height="20" rx="4" fill="%2315803D"/>
      <!-- Eggplant -->
      <ellipse cx="300" cy="165" rx="35" ry="50" transform="rotate(25 300 165)" fill="%236B21A8"/>
      <polygon points="275,120 290,115 305,125" fill="%2316A34A"/>
      <!-- Carrots -->
      <polygon points="340,195 385,210 330,225" fill="%23F97316"/>
      <!-- Tomatoes -->
      <circle cx="140" cy="210" r="28" fill="%23DC2626"/>
      <circle cx="148" cy="202" r="6" fill="%23FFFFFF" opacity="0.4"/>
      <circle cx="370" cy="180" r="26" fill="%23EF4444"/>
    </svg>`,
  },
  {
    id: 'fruit',
    name: 'Fruit Puzzle',
    labelKey: 'games.puzzle_categories.fruit',
    defaultLabel: 'Fruit Puzzle (फल पहेली)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23ECFDF5"/>
      <!-- Banana leaf -->
      <ellipse cx="250" cy="210" rx="210" ry="70" fill="%2316A34A"/>
      <line x1="40" y1="210" x2="460" y2="210" stroke="%2315803D" stroke-width="4"/>
      <!-- Golden Mangoes -->
      <ellipse cx="210" cy="155" rx="42" ry="56" transform="rotate(-20 210 155)" fill="%23FBBF24"/>
      <ellipse cx="270" cy="150" rx="42" ry="56" transform="rotate(20 270 150)" fill="%23F59E0B"/>
      <!-- Apples -->
      <circle cx="140" cy="170" r="34" fill="%23DC2626"/>
      <circle cx="350" cy="175" r="32" fill="%23E11D48"/>
      <!-- Pomegranate Slice -->
      <circle cx="240" cy="205" r="26" fill="%23BE123C"/>
      <circle cx="240" cy="205" r="16" fill="%23FDA4AF"/>
    </svg>`,
  },
  {
    id: 'flower',
    name: 'Flower Puzzle',
    labelKey: 'games.puzzle_categories.flower',
    defaultLabel: 'Flower Puzzle (कमल का फूल)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23E0F2FE"/>
      <!-- Pond Waves -->
      <path d="M 0 180 Q 125 160 250 180 T 500 180 L 500 300 L 0 300 Z" fill="%230284C7"/>
      <!-- Lily Pads -->
      <ellipse cx="120" cy="230" rx="80" ry="30" fill="%23059669"/>
      <ellipse cx="380" cy="240" rx="85" ry="32" fill="%23047857"/>
      <!-- Lotus Flower Petals -->
      <ellipse cx="250" cy="160" rx="24" ry="50" fill="%23F43F5E"/>
      <ellipse cx="225" cy="165" rx="22" ry="46" transform="rotate(-25 225 165)" fill="%23FB7185"/>
      <ellipse cx="275" cy="165" rx="22" ry="46" transform="rotate(25 275 165)" fill="%23FB7185"/>
      <ellipse cx="205" cy="175" rx="20" ry="42" transform="rotate(-50 205 175)" fill="%23FDA4AF"/>
      <ellipse cx="295" cy="175" rx="20" ry="42" transform="rotate(50 295 175)" fill="%23FDA4AF"/>
      <!-- Golden center -->
      <circle cx="250" cy="165" r="14" fill="%23FBBF24"/>
    </svg>`,
  },
  {
    id: 'temple',
    name: 'Temple & Traditional Objects',
    labelKey: 'games.puzzle_categories.temple',
    defaultLabel: 'Temple & Traditional Objects (शांतिपूर्ण मंदिर)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23FEF9C3"/>
      <!-- Temple Shikhara -->
      <polygon points="250,30 200,160 300,160" fill="%23D97706"/>
      <polygon points="250,20 245,35 255,35" fill="%23F59E0B"/>
      <!-- Kalasha & Flag -->
      <circle cx="250" cy="20" r="7" fill="%23FBBF24"/>
      <line x1="250" y1="20" x2="250" y2="5" stroke="%23DC2626" stroke-width="2"/>
      <polygon points="250,5 275,12 250,19" fill="%23EA580C"/>
      <!-- Base Sanctum -->
      <rect x="180" y="160" width="140" height="90" fill="%23B45309"/>
      <!-- Doorway -->
      <path d="M 220 250 L 220 200 Q 250 180 280 200 L 280 250 Z" fill="%23451A03"/>
      <!-- Golden Diya Oil Lamps -->
      <ellipse cx="140" cy="245" rx="24" ry="10" fill="%23F59E0B"/>
      <path d="M 140 235 Q 140 215 144 210 Q 148 215 148 235 Z" fill="%23EA580C"/>
      <ellipse cx="360" cy="245" rx="24" ry="10" fill="%23F59E0B"/>
      <path d="M 360 235 Q 360 215 364 210 Q 368 215 368 235 Z" fill="%23EA580C"/>
      <!-- Temple Bells -->
      <path d="M 80 50 L 80 90 M 70 90 L 90 90 L 85 110 L 75 110 Z" stroke="%23D97706" stroke-width="4" fill="%23FBBF24"/>
    </svg>`,
  },
  {
    id: 'animal',
    name: 'Animal Puzzle',
    labelKey: 'games.puzzle_categories.animal',
    defaultLabel: 'Animal Puzzle (हाथी पहेली)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23F0FDF4"/>
      <rect y="210" width="500" height="90" fill="%2322C55E"/>
      <!-- Friendly Royal Elephant -->
      <ellipse cx="260" cy="160" rx="90" ry="70" fill="%2364748B"/>
      <!-- Legs -->
      <rect x="190" y="190" width="30" height="75" rx="10" fill="%23475569"/>
      <rect x="235" y="190" width="28" height="75" rx="10" fill="%23475569"/>
      <rect x="280" y="190" width="28" height="75" rx="10" fill="%23475569"/>
      <rect x="315" y="190" width="28" height="75" rx="10" fill="%23475569"/>
      <!-- Head -->
      <circle cx="160" cy="130" r="50" fill="%2364748B"/>
      <!-- Ear -->
      <ellipse cx="185" cy="135" rx="26" ry="40" fill="%23475569"/>
      <!-- Trunk -->
      <path d="M 135 145 Q 90 190 120 220 Q 130 225 135 215" stroke="%2364748B" stroke-width="20" stroke-linecap="round" fill="none"/>
      <!-- Eye -->
      <circle cx="145" cy="118" r="4" fill="%230F172A"/>
      <!-- Decorative Shawl -->
      <rect x="230" y="110" width="70" height="60" rx="8" fill="%23DC2626"/>
      <rect x="238" y="118" width="54" height="44" rx="4" fill="%23FBBF24"/>
    </svg>`,
  },
  {
    id: 'nature',
    name: 'Nature Puzzle',
    labelKey: 'games.puzzle_categories.nature',
    defaultLabel: 'Nature Puzzle (प्रकृति और पहाड़)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23BAE6FD"/>
      <!-- Sun -->
      <circle cx="250" cy="120" r="45" fill="%23FBBF24"/>
      <!-- Himalayan Snowy Peaks -->
      <polygon points="120,70 10,240 230,240" fill="%230284C7"/>
      <polygon points="120,70 80,130 160,130" fill="%23FFFFFF"/>
      <polygon points="360,60 220,240 500,240" fill="%230369A1"/>
      <polygon points="360,60 320,120 400,120" fill="%23FFFFFF"/>
      <!-- Tea hills -->
      <path d="M 0 210 Q 140 170 280 220 T 500 200 L 500 300 L 0 300 Z" fill="%2315803D"/>
      <path d="M 0 240 Q 160 210 320 250 T 500 240 L 500 300 L 0 300 Z" fill="%23166534"/>
    </svg>`,
  },
  {
    id: 'household',
    name: 'Household Objects Puzzle',
    labelKey: 'games.puzzle_categories.household',
    defaultLabel: 'Household Objects (घरेलू वस्तुएं)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23FFFBEB"/>
      <!-- Wooden Table -->
      <rect y="210" width="500" height="90" fill="%2378350F"/>
      <!-- Traditional Brass Chai Kettle -->
      <ellipse cx="170" cy="170" rx="55" ry="45" fill="%23D97706"/>
      <ellipse cx="170" cy="120" rx="30" ry="8" fill="%23B45309"/>
      <circle cx="170" cy="110" r="7" fill="%23F59E0B"/>
      <!-- Kettle Handle & Spout -->
      <path d="M 125 150 C 90 120, 90 90, 150 90 C 210 90, 210 120, 215 150" stroke="%23451A03" stroke-width="10" fill="none"/>
      <path d="M 215 150 Q 250 140 250 120" stroke="%23D97706" stroke-width="14" fill="none" stroke-linecap="round"/>
      <!-- Chai Glasses -->
      <polygon points="320,150 350,150 345,210 325,210" fill="%2393C5FD" opacity="0.8"/>
      <rect x="323" y="165" width="24" height="40" fill="%23D97706" opacity="0.8"/>
      <polygon points="370,150 400,150 395,210 375,210" fill="%2393C5FD" opacity="0.8"/>
      <rect x="373" y="165" width="24" height="40" fill="%23D97706" opacity="0.8"/>
    </svg>`,
  },
  {
    id: 'transport',
    name: 'Transport Puzzle',
    labelKey: 'games.puzzle_categories.transport',
    defaultLabel: 'Transport Puzzle (साइकिल रिक्शा)',
    image: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300" width="100%" height="100%">
      <rect width="500" height="300" fill="%23FEF2F2"/>
      <!-- Street Road -->
      <rect y="230" width="500" height="70" fill="%23334155"/>
      <line x1="0" y1="265" x2="500" y2="265" stroke="%23F8FAFC" stroke-dasharray="25,20" stroke-width="5"/>
      <!-- Cycle Rickshaw Wheels -->
      <circle cx="150" cy="225" r="40" fill="none" stroke="%230F172A" stroke-width="8"/>
      <circle cx="150" cy="225" r="6" fill="%230F172A"/>
      <circle cx="340" cy="225" r="40" fill="none" stroke="%230F172A" stroke-width="8"/>
      <circle cx="340" cy="225" r="6" fill="%230F172A"/>
      <!-- Rickshaw Body & Canopy -->
      <path d="M 280 215 L 380 215 L 370 150 Q 320 110 260 140 Z" fill="%23DC2626"/>
      <path d="M 260 140 Q 320 110 380 145" stroke="%23FBBF24" stroke-width="8" fill="none"/>
      <!-- Front Bicycle Frame -->
      <line x1="150" y1="225" x2="200" y2="160" stroke="%232563EB" stroke-width="8"/>
      <line x1="200" y1="160" x2="230" y2="160" stroke="%230F172A" stroke-width="8"/>
      <line x1="190" y1="180" x2="280" y2="215" stroke="%232563EB" stroke-width="8"/>
    </svg>`,
  },
  {
    id: 'family',
    name: 'Family Photo Puzzle',
    labelKey: 'games.puzzle_categories.family',
    defaultLabel: 'Family Photo Puzzle (परिवार की तस्वीर पहेली)',
    isFamilyPhoto: true,
    image: null,
  },
];

// Difficulty configuration: controls exact piece count
const DIFFICULTY_CONFIG = {
  easy: { cols: 5, rows: 2, total: 10, label: 'Easy (10 pieces)' },
  medium: { cols: 5, rows: 3, total: 15, label: 'Medium (15 pieces)' },
  hard: { cols: 5, rows: 4, total: 20, label: 'Hard (20 pieces)' },
};

export default function PuzzleTimeGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [difficulty, setDifficulty] = useState('easy'); // 'easy' (10) | 'medium' (15) | 'hard' (20)
  const [selectedCategoryId, setSelectedCategoryId] = useState('flower');
  const [familyPhotoUrl, setFamilyPhotoUrl] = useState(null);
  const [pieces, setPieces] = useState([]);
  const [selectedPieceIndex, setSelectedPieceIndex] = useState(null);
  const [showReference, setShowReference] = useState(false);
  const [moves, setMoves] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);

  // Load family photo for Category 10
  useEffect(() => {
    fetch('/api/family/members', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.members) {
          const withPhoto = d.members.find((m) => m.hasPhoto || m.has_photo || m.photoUrl);
          if (withPhoto) {
            setFamilyPhotoUrl(withPhoto.photoUrl || `/api/family/members/${withPhoto.id}/photo`);
          }
        }
      })
      .catch(() => {});
  }, []);

  const currentCategory = PUZZLE_CATEGORIES.find((c) => c.id === selectedCategoryId) || PUZZLE_CATEGORIES[3];
  const activeImage = currentCategory.isFamilyPhoto
    ? familyPhotoUrl || PUZZLE_CATEGORIES[3].image
    : currentCategory.image;

  const currentConfig = DIFFICULTY_CONFIG[difficulty];

  // Initialize or reset puzzle
  const initPuzzle = () => {
    cancelSpeech();
    const { cols, rows, total } = currentConfig;

    const original = Array.from({ length: total }, (_, idx) => ({
      id: idx,
      targetIndex: idx,
      targetRow: Math.floor(idx / cols),
      targetCol: idx % cols,
    }));

    // Shuffle until not in solved order
    let shuffled = [...original].sort(() => Math.random() - 0.5);
    while (shuffled.every((p, idx) => p.targetIndex === idx)) {
      shuffled = [...original].sort(() => Math.random() - 0.5);
    }

    setPieces(shuffled);
    setSelectedPieceIndex(null);
    setGameOver(false);
    setMoves(0);
    setStartTime(Date.now());
    setElapsedTime(0);

    const isHi = i18n.language.startsWith('hi');
    const isTa = i18n.language.startsWith('ta');
    const welcomeVoice = isHi
      ? `पहेली समय! किसी भी दो टुकड़ों को छूकर उनकी जगह बदलें और तस्वीर पूरी करें।`
      : isTa
      ? `புதிர் நேரம்! இரண்டு துண்டுகளைத் தொட்டு மாற்றி படத்தை முடிக்கவும்.`
      : `Puzzle Time! Tap any two pieces to swap and arrange the picture.`;

    speak(welcomeVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.75 });
  };

  useEffect(() => {
    initPuzzle();
  }, [difficulty, selectedCategoryId, familyPhotoUrl]);

  // Elapsed timer
  useEffect(() => {
    if (gameOver) return;
    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime, gameOver]);

  // Handle piece click/tap to swap
  const handlePieceClick = (index) => {
    if (gameOver) return;

    if (selectedPieceIndex === null) {
      setSelectedPieceIndex(index);
    } else if (selectedPieceIndex === index) {
      // Deselect if tapped again
      setSelectedPieceIndex(null);
    } else {
      // Swap the two pieces
      const updated = [...pieces];
      const temp = updated[selectedPieceIndex];
      updated[selectedPieceIndex] = updated[index];
      updated[index] = temp;

      setPieces(updated);
      setSelectedPieceIndex(null);
      setMoves((m) => m + 1);

      // Check win condition
      const isSolved = updated.every((p, idx) => p.targetIndex === idx);
      if (isSolved) {
        setGameOver(true);
        confetti({ particleCount: 90, spread: 70 });

        const isHi = i18n.language.startsWith('hi');
        const isTa = i18n.language.startsWith('ta');
        const winVoice = isHi
          ? `बधाई हो! आपने पहेली बहुत सुंदर तरीके से सुलझा ली!`
          : isTa
          ? `வாழ்த்துகள்! நீங்கள் புதிரை அழகாக முடித்துவிட்டீர்கள்!`
          : `Congratulations! You solved the picture puzzle beautifully!`;

        speak(winVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });

        // Save session
        fetch('/api/games/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            clientSessionId: `puzzle-${Date.now()}`,
            gameType: 'puzzle_time',
            level: difficulty,
            step: difficulty === 'easy' ? 'E1' : difficulty === 'medium' ? 'M1' : 'H1',
            score: difficulty === 'easy' ? 40 : difficulty === 'medium' ? 60 : 80,
            accuracy: 100,
            durationSeconds: Math.floor((Date.now() - startTime) / 1000),
          }),
        }).catch(() => {});
      }
    }
  };

  const { cols, rows, total } = currentConfig;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-600" />
              {t(currentCategory.labelKey, currentCategory.defaultLabel)}
            </h1>
            <p className="text-xs text-slate-500">
              {total} pieces ({difficulty.toUpperCase()}) • Tap any two tiles to swap
            </p>
          </div>
        </div>

        {/* Difficulty Selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto">
          {Object.entries(DIFFICULTY_CONFIG).map(([lvl, conf]) => (
            <button
              key={lvl}
              onClick={() => setDifficulty(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-colors ${
                difficulty === lvl
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lvl} ({conf.total}p)
            </button>
          ))}
        </div>
      </div>

      {/* 10 Categories Carousel / Pills */}
      <div className="mb-5 overflow-x-auto pb-2 flex gap-2 scrollbar-none">
        {PUZZLE_CATEGORIES.map((cat) => {
          const isSelected = selectedCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3.5 py-2 rounded-2xl text-xs font-bold whitespace-nowrap border transition-all flex items-center gap-1.5 flex-shrink-0 ${
                isSelected
                  ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {cat.isFamilyPhoto ? <Camera className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
              {t(cat.labelKey, cat.defaultLabel.split('(')[0].trim())}
            </button>
          );
        })}
      </div>

      {/* Controls Bar: Moves, Time, Show Original, Reset */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 mb-5 flex flex-wrap items-center justify-between gap-3 text-xs font-bold">
        <div className="flex items-center gap-4">
          <span className="text-slate-600">
            Moves: <strong className="text-slate-900 text-sm">{moves}</strong>
          </span>
          <span className="text-slate-600">
            Time: <strong className="text-slate-900 text-sm">{elapsedTime}s</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReference(!showReference)}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5"
          >
            {showReference ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showReference ? 'Hide Original' : 'Show Original'}
          </button>
          <button
            onClick={initPuzzle}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Reference Image Modal / Preview */}
      {showReference && (
        <div className="mb-5 p-3 bg-white rounded-3xl border-2 border-indigo-200 shadow-sm text-center">
          <span className="text-xs font-bold text-slate-500 block mb-2">Original Reference Picture:</span>
          <div className="w-full max-w-sm mx-auto h-40 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
            <img src={activeImage} alt="Reference" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* Puzzle Board Grid */}
      <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-sm">
        <div
          className="grid gap-1.5 sm:gap-2 mx-auto w-full max-w-xl aspect-[5/3] rounded-2xl overflow-hidden bg-slate-100 p-1.5 sm:p-2 border-2 border-slate-200"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
        >
          {pieces.map((piece, currentSlotIndex) => {
            const isSelected = selectedPieceIndex === currentSlotIndex;
            const isCorrectlyPlaced = piece.targetIndex === currentSlotIndex;

            // Compute background offset for this piece's target position
            const posX = cols > 1 ? (piece.targetCol / (cols - 1)) * 100 : 0;
            const posY = rows > 1 ? (piece.targetRow / (rows - 1)) * 100 : 0;

            return (
              <div
                key={piece.id}
                onClick={() => handlePieceClick(currentSlotIndex)}
                className={`relative rounded-xl cursor-pointer transition-all overflow-hidden border-2 select-none active:scale-95 ${
                  isSelected
                    ? 'ring-4 ring-indigo-500 border-white z-10 scale-105 shadow-lg'
                    : isCorrectlyPlaced
                    ? 'border-emerald-400/80 shadow-sm'
                    : 'border-white/80 hover:border-indigo-300'
                }`}
                style={{
                  backgroundImage: `url("${activeImage}")`,
                  backgroundSize: `${cols * 100}% ${rows * 100}%`,
                  backgroundPosition: `${posX}% ${posY}%`,
                }}
              >
                {/* Subtle indicator when piece is in its correct place */}
                {isCorrectlyPlaced && !gameOver && (
                  <div className="absolute top-1 right-1 w-3 h-3 bg-emerald-500 rounded-full border border-white shadow" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Completion Modal */}
      {gameOver && (
        <div className="mt-6 p-6 bg-emerald-50 border-2 border-emerald-300 rounded-3xl text-center space-y-4 shadow-lg animate-fade-in">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto" />
          <h2 className="text-2xl font-black text-slate-800">Puzzle Solved Beautifully!</h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            You completed the <strong>{currentCategory.name}</strong> ({difficulty.toUpperCase()} • {total} pieces)
            in <strong>{moves} moves</strong> and <strong>{elapsedTime} seconds</strong>!
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={initPuzzle}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl text-xs shadow-md"
            >
              Play Again
            </button>
            <button
              onClick={() => {
                const nextIdx = (PUZZLE_CATEGORIES.findIndex((c) => c.id === selectedCategoryId) + 1) % PUZZLE_CATEGORIES.length;
                setSelectedCategoryId(PUZZLE_CATEGORIES[nextIdx].id);
              }}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold py-3 px-6 rounded-2xl text-xs"
            >
              Next Picture ➔
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

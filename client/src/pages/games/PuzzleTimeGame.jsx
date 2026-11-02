import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Trophy,
  RotateCcw,
  Sparkles,
  Volume2,
  Lightbulb,
  CheckCircle2,
  Camera,
  Image as ImageIcon,
  Check,
  HelpCircle,
  Clock,
  Layers,
  ChevronRight,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { speak, cancelSpeech } from '../../utils/voice';
import { queueOfflineSession } from '../../utils/offlineSync';
import {
  PUZZLE_CATEGORIES,
  DIFFICULTY_PRESETS,
  renderArtworkToCanvas,
  sliceMasterCanvas,
} from './puzzleArtwork';

export default function PuzzleTimeGame() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  // Configuration state
  const [difficulty, setDifficulty] = useState('easy'); // 'easy' (2x2) | 'medium' (3x3) | 'hard' (4x4)
  const [selectedCategoryId, setSelectedCategoryId] = useState('flower');
  const [familyPhotoUrl, setFamilyPhotoUrl] = useState(null);

  // Sliced puzzle state
  const [loadingArtwork, setLoadingArtwork] = useState(true);
  const [referenceImageUrl, setReferenceImageUrl] = useState(null);
  const [boardSlots, setBoardSlots] = useState([]); // Array of size total: piece or null
  const [trayPieces, setTrayPieces] = useState([]); // Array of unplaced pieces

  // Interaction state
  const [selectedPiece, setSelectedPiece] = useState(null); // { piece, source: 'tray' | 'slot', index }
  const [draggedItem, setDraggedItem] = useState(null); // { piece, source: 'tray' | 'slot', index }
  const [touchPos, setTouchPos] = useState(null); // For mobile touch drag preview

  // Session metrics
  const [moves, setMoves] = useState(0);
  const [hintsCount, setHintsCount] = useState(0);
  const [startTime, setStartTime] = useState(Date.now());
  const [elapsedTime, setElapsedTime] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [voiceSpoken, setVoiceSpoken] = useState(false);

  const masterCanvasRef = useRef(null);

  const currentCategory = PUZZLE_CATEGORIES.find((c) => c.id === selectedCategoryId) || PUZZLE_CATEGORIES[0];
  const config = DIFFICULTY_PRESETS[difficulty] || DIFFICULTY_PRESETS.easy;
  const { rows, cols, total } = config;

  // 1. Fetch family member photo if available
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

  // 2. Generate Master Canvas Artwork and Slices
  useEffect(() => {
    let active = true;
    setLoadingArtwork(true);

    async function generatePuzzle() {
      try {
        const offscreen = document.createElement('canvas');
        offscreen.width = 600;
        offscreen.height = 400;

        await renderArtworkToCanvas(offscreen, selectedCategoryId, familyPhotoUrl);

        if (!active) return;

        const { referenceUrl, pieces } = sliceMasterCanvas(offscreen, rows, cols);

        setReferenceImageUrl(referenceUrl);

        // Shuffle pieces for the tray
        let shuffled = [...pieces].sort(() => Math.random() - 0.5);
        // Ensure not in exact solved order
        if (shuffled.every((p, idx) => p.targetIndex === idx)) {
          shuffled = shuffled.reverse();
        }

        setTrayPieces(shuffled);
        setBoardSlots(new Array(total).fill(null));
        setSelectedPiece(null);
        setMoves(0);
        setHintsCount(0);
        setGameOver(false);
        setStartTime(Date.now());
        setElapsedTime(0);
        setLoadingArtwork(false);

        // Warm welcome instruction
        const isHi = i18n.language.startsWith('hi');
        const isTa = i18n.language.startsWith('ta');
        const welcomeVoice = isHi
          ? `पहेली समय! दाईं ओर की पूरी तस्वीर को देखें, और बाईं ओर टुकड़ों को सही जगह पर लगाएं।`
          : isTa
          ? `புதிர் நேரம்! வலதுபுறம் உள்ள முழு படத்தைப் பார்த்து, இடதுபுறம் துண்டுகளை சரியான இடத்தில் வைக்கவும்.`
          : `Puzzle Time! Look at the original picture on the right, and arrange the matching pieces on the left.`;

        cancelSpeech();
        speak(welcomeVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.75 });
      } catch (err) {
        console.error('[PuzzleTimeGame] Error generating puzzle:', err);
        setLoadingArtwork(false);
      }
    }

    generatePuzzle();

    return () => {
      active = false;
      cancelSpeech();
    };
  }, [selectedCategoryId, difficulty, familyPhotoUrl]);

  // 3. Elapsed timer
  useEffect(() => {
    if (gameOver || loadingArtwork) return;
    const timer = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime, gameOver, loadingArtwork]);

  // 4. Check Win Condition
  const checkWinCondition = (currentSlots) => {
    // Must be completely filled and every piece in targetIndex
    const allFilled = currentSlots.every((p) => p !== null);
    if (!allFilled) return false;

    const isMatch = currentSlots.every((p, idx) => p && p.targetIndex === idx);
    if (isMatch) {
      setGameOver(true);
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.6 } });

      const isHi = i18n.language.startsWith('hi');
      const isTa = i18n.language.startsWith('ta');
      const winVoice = isHi
        ? `अद्भुत! आपने तस्वीर को बिल्कुल सही और सुंदर ढंग से पूरा कर लिया!`
        : isTa
        ? `அற்புதம்! நீங்கள் படத்தை மிகச் சரியாக முடித்துவிட்டீர்கள்!`
        : `Magnificent! You arranged the entire picture perfectly!`;

      speak(winVoice, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.8 });

      // Save session with adaptive tracking
      const duration = Math.max(1, Math.floor((Date.now() - startTime) / 1000));
      const sessionData = {
        clientSessionId: `puzzle-${Date.now()}`,
        gameType: 'puzzle_time',
        level: difficulty,
        step: difficulty === 'easy' ? 'E1' : difficulty === 'medium' ? 'M1' : 'H1',
        score: difficulty === 'easy' ? 40 : difficulty === 'medium' ? 70 : 100,
        accuracy: 100,
        hintsCount,
        errorsCount: Math.max(0, moves - total),
        durationSeconds: duration,
        totalQuestions: total,
        correctAnswers: total,
        incorrectAnswers: 0,
        completionStatus: 'completed',
      };

      fetch('/api/games/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(sessionData),
      }).catch(() => {
        queueOfflineSession(sessionData);
      });
    }
    return isMatch;
  };

  // 5. Piece Placement & Swapping Logic
  const placePieceIntoSlot = (pieceItem, targetSlotIndex) => {
    if (gameOver) return;

    const newSlots = [...boardSlots];
    const newTray = [...trayPieces];
    const existingInSlot = newSlots[targetSlotIndex];

    if (pieceItem.source === 'tray') {
      // Remove from tray
      const trayIdx = newTray.findIndex((p) => p.id === pieceItem.piece.id);
      if (trayIdx !== -1) {
        newTray.splice(trayIdx, 1);
      }
      // If target slot had a piece, return it to tray
      if (existingInSlot) {
        newTray.push(existingInSlot);
      }
      newSlots[targetSlotIndex] = pieceItem.piece;
    } else if (pieceItem.source === 'slot') {
      const sourceSlotIndex = pieceItem.index;
      // Swap slots
      newSlots[sourceSlotIndex] = existingInSlot;
      newSlots[targetSlotIndex] = pieceItem.piece;
    }

    setBoardSlots(newSlots);
    setTrayPieces(newTray);
    setSelectedPiece(null);
    setMoves((m) => m + 1);

    // Supportive feedback on correct placement
    if (pieceItem.piece.targetIndex === targetSlotIndex) {
      const isHi = i18n.language.startsWith('hi');
      const isTa = i18n.language.startsWith('ta');
      const phrase = isHi ? `शाबाश!` : isTa ? `நன்று!` : `Great placement!`;
      speak(phrase, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.85 });
    }

    checkWinCondition(newSlots);
  };

  const returnPieceToTray = (pieceItem) => {
    if (pieceItem.source !== 'slot') return;

    const newSlots = [...boardSlots];
    const newTray = [...trayPieces];

    newSlots[pieceItem.index] = null;
    newTray.push(pieceItem.piece);

    setBoardSlots(newSlots);
    setTrayPieces(newTray);
    setSelectedPiece(null);
    setMoves((m) => m + 1);
  };

  // 6. Accessible Tap-to-Place Handler
  const handleSlotClick = (slotIndex) => {
    if (gameOver) return;

    if (selectedPiece) {
      placePieceIntoSlot(selectedPiece, slotIndex);
    } else if (boardSlots[slotIndex]) {
      // Select the piece in this slot
      setSelectedPiece({
        piece: boardSlots[slotIndex],
        source: 'slot',
        index: slotIndex,
      });
    }
  };

  const handleTrayPieceClick = (piece, index) => {
    if (gameOver) return;

    if (selectedPiece && selectedPiece.piece.id === piece.id) {
      setSelectedPiece(null);
    } else {
      setSelectedPiece({
        piece,
        source: 'tray',
        index,
      });
    }
  };

  // 7. Hint Helper: Automatically places one misplaced piece into its correct position
  const handleUseHint = () => {
    if (gameOver) return;

    // Find first empty or misplaced slot
    let targetSlot = -1;
    for (let i = 0; i < total; i++) {
      if (!boardSlots[i] || boardSlots[i].targetIndex !== i) {
        targetSlot = i;
        break;
      }
    }

    if (targetSlot === -1) return;

    // Find the piece that belongs in targetSlot
    // Check in tray first
    const pieceInTray = trayPieces.find((p) => p.targetIndex === targetSlot);
    if (pieceInTray) {
      placePieceIntoSlot({ piece: pieceInTray, source: 'tray' }, targetSlot);
      setHintsCount((h) => h + 1);
      return;
    }

    // Check in another board slot
    const currentSlotOfPiece = boardSlots.findIndex((p) => p && p.targetIndex === targetSlot);
    if (currentSlotOfPiece !== -1) {
      placePieceIntoSlot(
        { piece: boardSlots[currentSlotOfPiece], source: 'slot', index: currentSlotOfPiece },
        targetSlot
      );
      setHintsCount((h) => h + 1);
    }
  };

  // 8. HTML5 Drag and Drop Handlers
  const handleDragStart = (e, piece, source, index) => {
    setDraggedItem({ piece, source, index });
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: piece.id, source, index }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDropOnSlot = (e, slotIndex) => {
    e.preventDefault();
    if (!draggedItem) return;
    placePieceIntoSlot(draggedItem, slotIndex);
    setDraggedItem(null);
  };

  const handleDropOnTray = (e) => {
    e.preventDefault();
    if (!draggedItem) return;
    if (draggedItem.source === 'slot') {
      returnPieceToTray(draggedItem);
    }
    setDraggedItem(null);
  };

  // 9. Mobile Touch Drag Handlers
  const handleTouchStart = (e, piece, source, index) => {
    const touch = e.touches[0];
    setDraggedItem({ piece, source, index });
    setTouchPos({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e) => {
    if (!draggedItem) return;
    const touch = e.touches[0];
    setTouchPos({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e) => {
    if (!draggedItem || !touchPos) {
      setDraggedItem(null);
      setTouchPos(null);
      return;
    }

    // Identify element under drop coordinate
    const el = document.elementFromPoint(touchPos.x, touchPos.y);
    const slotEl = el ? el.closest('[data-slot-index]') : null;

    if (slotEl) {
      const targetSlot = parseInt(slotEl.getAttribute('data-slot-index'), 10);
      if (!isNaN(targetSlot)) {
        placePieceIntoSlot(draggedItem, targetSlot);
      }
    } else {
      const trayEl = el ? el.closest('[data-piece-tray]') : null;
      if (trayEl && draggedItem.source === 'slot') {
        returnPieceToTray(draggedItem);
      }
    }

    setDraggedItem(null);
    setTouchPos(null);
  };

  const correctlyPlacedCount = boardSlots.filter((p, idx) => p && p.targetIndex === idx).length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/games')}
            className="p-2.5 text-slate-500 hover:text-slate-800 rounded-full hover:bg-slate-100 transition-colors"
            title="Back to Games"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-indigo-600" />
              {t(currentCategory.labelKey, currentCategory.defaultLabel)}
            </h1>
            <p className="text-xs text-slate-500">
              {config.label} • {t('games.puzzle_instruction', 'Drag or tap pieces into the target board')}
            </p>
          </div>
        </div>

        {/* Difficulty Selector */}
        <div className="flex bg-slate-100 p-1 rounded-2xl self-start sm:self-auto border border-slate-200">
          {Object.entries(DIFFICULTY_PRESETS).map(([lvl, conf]) => (
            <button
              key={lvl}
              onClick={() => setDifficulty(lvl)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                difficulty === lvl
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {lvl} ({conf.rows}×{conf.cols})
            </button>
          ))}
        </div>
      </div>

      {/* 10 Categories Carousel */}
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

      {/* Stats Bar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 mb-6 flex flex-wrap items-center justify-between gap-3 text-xs font-bold shadow-sm">
        <div className="flex items-center gap-5">
          <span className="text-slate-600 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-indigo-500" />
            Placed: <strong className="text-slate-900 text-sm">{correctlyPlacedCount} / {total}</strong>
          </span>
          <span className="text-slate-600 flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-amber-500" />
            Time: <strong className="text-slate-900 text-sm">{elapsedTime}s</strong>
          </span>
          <span className="text-slate-600">
            Moves: <strong className="text-slate-900 text-sm">{moves}</strong>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleUseHint}
            disabled={gameOver || correctlyPlacedCount === total}
            className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Hint (संकेत)
          </button>
          <button
            onClick={() => {
              // Re-shuffle current pieces
              setTrayPieces([...trayPieces, ...boardSlots.filter(Boolean)].sort(() => Math.random() - 0.5));
              setBoardSlots(new Array(total).fill(null));
              setSelectedPiece(null);
            }}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center gap-1.5 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* RESPONSIVE TWO-PANEL LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT PANEL: Puzzle Board & Pieces Tray */}
        <div className="lg:col-span-7 space-y-5">
          {/* 1. Puzzle Target Board */}
          <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Puzzle Board (पहेली बोर्ड)
              </h2>
              <span className="text-xs text-slate-500">
                {cols}×{rows} Grid ({total} pieces)
              </span>
            </div>

            <div
              className="grid gap-2 sm:gap-2.5 mx-auto w-full aspect-[3/2] rounded-2xl overflow-hidden bg-slate-100 p-2 sm:p-3 border-2 border-slate-300"
              style={{
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: total }).map((_, slotIndex) => {
                const placedPiece = boardSlots[slotIndex];
                const isSelected = selectedPiece?.source === 'slot' && selectedPiece?.index === slotIndex;
                const isCorrect = placedPiece && placedPiece.targetIndex === slotIndex;

                return (
                  <div
                    key={slotIndex}
                    data-slot-index={slotIndex}
                    onClick={() => handleSlotClick(slotIndex)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDropOnSlot(e, slotIndex)}
                    className={`relative rounded-xl border-2 transition-all flex items-center justify-center cursor-pointer select-none overflow-hidden ${
                      placedPiece
                        ? isSelected
                          ? 'border-indigo-600 ring-4 ring-indigo-400/50 shadow-md scale-102 z-10'
                          : isCorrect
                          ? 'border-emerald-500 shadow-sm'
                          : 'border-slate-300 hover:border-indigo-400'
                        : selectedPiece
                        ? 'border-dashed border-indigo-400 bg-indigo-50/50 hover:bg-indigo-100/60'
                        : 'border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100'
                    }`}
                  >
                    {placedPiece ? (
                      <div
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, placedPiece, 'slot', slotIndex)}
                        onTouchStart={(e) => handleTouchStart(e, placedPiece, 'slot', slotIndex)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className="w-full h-full relative"
                      >
                        <img
                          src={placedPiece.imgDataUrl}
                          alt={`Slot ${slotIndex + 1}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        {/* Correct placement badge */}
                        {isCorrect && (
                          <div className="absolute top-1.5 right-1.5 bg-emerald-500 text-white p-1 rounded-full shadow-sm">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center p-2">
                        <span className="text-[11px] font-bold text-slate-400 block">
                          Slot {slotIndex + 1}
                        </span>
                        <span className="text-[9px] text-slate-400">Empty</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 2. Shuffled Pieces Tray (Bank) */}
          <div
            data-piece-tray="true"
            onDragOver={handleDragOver}
            onDrop={handleDropOnTray}
            className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Puzzle Pieces Tray ({trayPieces.length} remaining)
              </h3>
              <span className="text-[11px] text-slate-500">
                Tap or drag a piece to place it
              </span>
            </div>

            {trayPieces.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-slate-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1.5" />
                <p className="text-xs font-bold text-slate-700">
                  All pieces are placed on the board!
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Swap pieces on the board if needed to match the original image.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {trayPieces.map((piece, idx) => {
                  const isSelected = selectedPiece?.source === 'tray' && selectedPiece?.piece.id === piece.id;

                  return (
                    <div
                      key={piece.id}
                      onClick={() => handleTrayPieceClick(piece, idx)}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, piece, 'tray', idx)}
                      onTouchStart={(e) => handleTouchStart(e, piece, 'tray', idx)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      className={`relative rounded-2xl aspect-[3/2] overflow-hidden border-2 cursor-pointer transition-all shadow-sm active:scale-95 ${
                        isSelected
                          ? 'border-indigo-600 ring-4 ring-indigo-400/60 scale-105 z-10'
                          : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'
                      }`}
                    >
                      <img
                        src={piece.imgDataUrl}
                        alt={`Piece ${piece.id}`}
                        className="w-full h-full object-cover pointer-events-none"
                      />
                      <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                        Piece #{idx + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: Complete Original Reference Image */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-black text-slate-800 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-600" />
                Original Reference Image (मूल संदर्भ तस्वीर)
              </h2>
              <span className="text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full">
                Target View
              </span>
            </div>

            {/* Reference Image View */}
            <div className="w-full aspect-[3/2] rounded-2xl overflow-hidden border-2 border-slate-300 shadow-inner bg-slate-100 relative group">
              {referenceImageUrl ? (
                <img
                  src={referenceImageUrl}
                  alt={currentCategory.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                  Loading picture...
                </div>
              )}
            </div>

            {/* Cultural Caption & Guidance */}
            <div className="mt-4 p-3.5 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-xs font-bold text-slate-700">
                {currentCategory.description}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Keep your eye on this complete picture while placing the puzzle pieces on the left!
              </p>
            </div>

            {/* Accessible Audio Instruction button */}
            <button
              onClick={() => {
                const isHi = i18n.language.startsWith('hi');
                const isTa = i18n.language.startsWith('ta');
                const msg = isHi
                  ? `यह ${currentCategory.defaultLabel} की तस्वीर है। टुकड़ों को इसी तरह मिलाकर पूरा करें।`
                  : isTa
                  ? `இது ${currentCategory.name} படம். அதே போல் துண்டுகளைச் சேர்த்து முடிக்கவும்.`
                  : `This is the complete ${currentCategory.name}. Look closely at the shapes and arrange your pieces to match.`;
                cancelSpeech();
                speak(msg, { lang: isHi ? 'hi' : isTa ? 'ta' : 'en', rate: 0.75 });
              }}
              className="mt-4 w-full py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Volume2 className="w-4 h-4" />
              Listen to Guidance (मार्गदर्शन सुनें)
            </button>
          </div>
        </div>
      </div>

      {/* Floating Touch Drag Indicator for Mobile/Tablet */}
      {draggedItem && touchPos && (
        <div
          className="fixed pointer-events-none z-50 w-24 h-16 rounded-xl overflow-hidden border-2 border-indigo-500 shadow-2xl scale-110 opacity-90"
          style={{
            left: `${touchPos.x - 48}px`,
            top: `${touchPos.y - 32}px`,
          }}
        >
          <img src={draggedItem.piece.imgDataUrl} alt="Moving" className="w-full h-full object-cover" />
        </div>
      )}

      {/* Completion Modal */}
      {gameOver && (
        <div className="mt-8 p-6 sm:p-8 bg-emerald-50 border-2 border-emerald-400 rounded-3xl text-center space-y-4 shadow-xl animate-fade-in max-w-xl mx-auto">
          <Trophy className="w-16 h-16 text-amber-500 mx-auto animate-bounce" />
          <h2 className="text-2xl font-black text-slate-800">
            Puzzle Solved Beautifully! (पहेली हल हो गई!)
          </h2>
          <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
            You completed <strong>{currentCategory.name}</strong> ({difficulty.toUpperCase()} • {total} pieces)
            in <strong>{moves} moves</strong> and <strong>{elapsedTime} seconds</strong> with {hintsCount} hints.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => {
                // Re-init current category
                setBoardSlots(new Array(total).fill(null));
                setTrayPieces([...trayPieces, ...boardSlots.filter(Boolean)].sort(() => Math.random() - 0.5));
                setMoves(0);
                setHintsCount(0);
                setGameOver(false);
                setStartTime(Date.now());
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-2xl text-xs shadow-md transition-colors"
            >
              Play Again (फिर से खेलें)
            </button>
            <button
              onClick={() => {
                const nextIdx =
                  (PUZZLE_CATEGORIES.findIndex((c) => c.id === selectedCategoryId) + 1) %
                  PUZZLE_CATEGORIES.length;
                setSelectedCategoryId(PUZZLE_CATEGORIES[nextIdx].id);
              }}
              className="bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-bold py-3 px-6 rounded-2xl text-xs transition-colors"
            >
              Next Picture (अगली तस्वीर) ➔
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

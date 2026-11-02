/**
 * Puzzle Artwork Generator & Canvas Slicing Engine
 * Creates rich, high-resolution canvas illustrations and real photographic slices
 * completely immune to blank tiles, SVG encoding bugs, and CSS background errors.
 */

export const PUZZLE_CATEGORIES = [
  {
    id: 'flower',
    name: 'Lotus Flower',
    labelKey: 'games.puzzle_categories.flower',
    defaultLabel: 'Lotus Pond (कमल का फूल)',
    description: 'A sacred pink lotus blooming peacefully upon a serene morning pond.',
  },
  {
    id: 'peacock',
    name: 'Royal Peacock',
    labelKey: 'games.puzzle_categories.bird',
    defaultLabel: 'Royal Peacock (सुंदर मोर)',
    description: 'India\'s national bird with majestic turquoise and emerald feathers.',
  },
  {
    id: 'temple',
    name: 'Heritage Temple',
    labelKey: 'games.puzzle_categories.temple',
    defaultLabel: 'Peaceful Temple (शांतिपूर्ण मंदिर)',
    description: 'An ancient heritage temple with glowing evening diya oil lamps.',
  },
  {
    id: 'elephant',
    name: 'Gentle Elephant',
    labelKey: 'games.puzzle_categories.animal',
    defaultLabel: 'Gentle Elephant (सजा हुआ हाथी)',
    description: 'A royal, decorated Asian elephant walking through tranquil greens.',
  },
  {
    id: 'nature',
    name: 'Himalayan Nature',
    labelKey: 'games.puzzle_categories.nature',
    defaultLabel: 'Himalayas & Hills (प्रकृति और पहाड़)',
    description: 'Golden morning sunshine illuminating snowy Himalayan mountain peaks.',
  },
  {
    id: 'chai',
    name: 'Traditional Chai Kettle',
    labelKey: 'games.puzzle_categories.household',
    defaultLabel: 'Brass Chai Kettle (गरमा-गरम चाय)',
    description: 'A traditional brass kettle brewing aromatic morning tea.',
  },
  {
    id: 'fruit',
    name: 'Fresh Harvest Fruits',
    labelKey: 'games.puzzle_categories.fruit',
    defaultLabel: 'Fresh Fruits (स्वादिष्ट ताजे फल)',
    description: 'Golden Alphonso mangoes, crisp apples, and ripe pomegranates.',
  },
  {
    id: 'vegetable',
    name: 'Farm Harvest Basket',
    labelKey: 'games.puzzle_categories.vegetable',
    defaultLabel: 'Farm Vegetables (सब्जियों की टोकरी)',
    description: 'Rich harvest pumpkin, purple eggplants, and vine-fresh red tomatoes.',
  },
  {
    id: 'transport',
    name: 'Cycle Rickshaw',
    labelKey: 'games.puzzle_categories.transport',
    defaultLabel: 'Cycle Rickshaw (साइकिल रिक्शा)',
    description: 'A nostalgic cycle rickshaw journey along a peaceful tree-lined avenue.',
  },
  {
    id: 'family',
    name: 'Family Photograph',
    labelKey: 'games.puzzle_categories.family',
    defaultLabel: 'Family Photo (परिवार की तस्वीर)',
    description: 'A cherished photograph of your loving family members.',
    isFamilyPhoto: true,
  },
];

export const DIFFICULTY_PRESETS = {
  easy: { rows: 2, cols: 2, total: 4, label: 'Easy (2×2 = 4 pieces)' },
  medium: { rows: 3, cols: 3, total: 9, label: 'Medium (3×3 = 9 pieces)' },
  hard: { rows: 4, cols: 4, total: 16, label: 'Hard (4×4 = 16 pieces)' },
};

/**
 * Draws high-resolution canvas artwork for the selected category.
 */
export async function renderArtworkToCanvas(canvas, categoryId, familyPhotoUrl = null) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // If family photo is requested and available
  if (categoryId === 'family' && familyPhotoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = familyPhotoUrl;
      });

      // Draw image scaled cover
      const hRatio = width / img.naturalWidth;
      const vRatio = height / img.naturalHeight;
      const ratio = Math.max(hRatio, vRatio);
      const centerShiftX = (width - img.naturalWidth * ratio) / 2;
      const centerShiftY = (height - img.naturalHeight * ratio) / 2;

      ctx.drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        img.naturalHeight,
        centerShiftX,
        centerShiftY,
        img.naturalWidth * ratio,
        img.naturalHeight * ratio
      );
      return;
    } catch {
      console.warn('[PuzzleArtwork] Failed to load family photo on canvas, falling back to lotus theme.');
    }
  }

  // Draw custom rich illustrations
  switch (categoryId) {
    case 'peacock':
      drawPeacock(ctx, width, height);
      break;
    case 'temple':
      drawTemple(ctx, width, height);
      break;
    case 'elephant':
      drawElephant(ctx, width, height);
      break;
    case 'nature':
      drawNature(ctx, width, height);
      break;
    case 'chai':
      drawChai(ctx, width, height);
      break;
    case 'fruit':
      drawFruit(ctx, width, height);
      break;
    case 'vegetable':
      drawVegetables(ctx, width, height);
      break;
    case 'transport':
      drawTransport(ctx, width, height);
      break;
    case 'flower':
    default:
      drawLotus(ctx, width, height);
      break;
  }
}

/**
 * 1. LOTUS POND
 */
function drawLotus(ctx, w, h) {
  // Morning Sky & Pond Gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
  skyGrad.addColorStop(0, '#bae6fd');
  skyGrad.addColorStop(0.4, '#e0f2fe');
  skyGrad.addColorStop(0.65, '#0284c7');
  skyGrad.addColorStop(1, '#075985');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, w, h);

  // Radiant Golden Sun
  const sunGrad = ctx.createRadialGradient(w * 0.5, h * 0.35, 10, w * 0.5, h * 0.35, 90);
  sunGrad.addColorStop(0, '#fef08a');
  sunGrad.addColorStop(0.4, '#fde047');
  sunGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = sunGrad;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.35, 90, 0, Math.PI * 2);
  ctx.fill();

  // Water ripples
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  for (let y = h * 0.55; y < h; y += 22) {
    ctx.fillRect(w * 0.1, y, w * 0.8, 3);
  }

  // Lily pads
  function drawPad(cx, cy, rx, ry) {
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 1.8);
    ctx.lineTo(cx, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#166534';
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  drawPad(w * 0.2, h * 0.72, 80, 30);
  drawPad(w * 0.8, h * 0.74, 95, 34);
  drawPad(w * 0.5, h * 0.86, 110, 36);

  // Blooming Lotus Flower Center
  const cx = w * 0.5;
  const cy = h * 0.65;

  // Outer Petals
  ctx.fillStyle = '#fb7185';
  for (let angle = -60; angle <= 60; angle += 20) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, -55, 24, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Inner Petals (Pink to White)
  ctx.fillStyle = '#fda4af';
  for (let angle = -40; angle <= 40; angle += 20) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.beginPath();
    ctx.ellipse(0, -42, 18, 48, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Center Golden Seed Head
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(cx, cy - 10, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#d97706';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 * Math.PI) / 180;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * 8, cy - 10 + Math.sin(a) * 8, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 2. ROYAL PEACOCK
 */
function drawPeacock(ctx, w, h) {
  // Garden Backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#ecfdf5');
  bg.addColorStop(1, '#a7f3d0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Lush Foliage
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.arc(w * 0.15, h * 0.9, 130, 0, Math.PI * 2);
  ctx.arc(w * 0.85, h * 0.95, 140, 0, Math.PI * 2);
  ctx.fill();

  // Majestic Feather Fan (Behind)
  const cx = w * 0.45;
  const cy = h * 0.65;
  const featherColors = ['#047857', '#0284c7', '#0d9488'];

  for (let a = -75; a <= 75; a += 15) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((a * Math.PI) / 180);

    // Stem
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -160);
    ctx.stroke();

    // Eye Feather
    ctx.fillStyle = featherColors[Math.abs(a) % featherColors.length];
    ctx.beginPath();
    ctx.ellipse(0, -160, 22, 32, 0, 0, Math.PI * 2);
    ctx.fill();

    // Gold Ring
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(0, -160, 14, 20, 0, 0, Math.PI * 2);
    ctx.fill();

    // Center Blue pupil
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.arc(0, -160, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Branch
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(w * 0.1, h * 0.8);
  ctx.quadraticCurveTo(w * 0.45, h * 0.75, w * 0.9, h * 0.82);
  ctx.stroke();

  // Peacock Body (Royal Turquoise Blue)
  const bodyGrad = ctx.createLinearGradient(cx, cy - 70, cx + 40, cy + 40);
  bodyGrad.addColorStop(0, '#0369a1');
  bodyGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = bodyGrad;

  ctx.beginPath();
  ctx.ellipse(cx, cy, 38, 55, -0.2, 0, Math.PI * 2);
  ctx.fill();

  // Slender Neck & Head
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy - 30);
  ctx.quadraticCurveTo(cx - 25, cy - 90, cx - 10, cy - 110);
  ctx.arc(cx, cy - 115, 20, Math.PI, 0, false);
  ctx.quadraticCurveTo(cx + 20, cy - 80, cx + 20, cy - 20);
  ctx.closePath();
  ctx.fill();

  // Crown Feathers (Kalgi)
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 2;
  for (let c = -15; c <= 15; c += 15) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 130);
    ctx.lineTo(cx + c, cy - 155);
    ctx.stroke();
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(cx + c, cy - 155, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eye & Beak
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 116, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx - 5, cy - 116, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Golden Beak
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy - 118);
  ctx.lineTo(cx - 30, cy - 114);
  ctx.lineTo(cx - 15, cy - 110);
  ctx.closePath();
  ctx.fill();
}

/**
 * 3. PEACEFUL TEMPLE & DIYA
 */
function drawTemple(ctx, w, h) {
  // Sunset Dusk Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#fef3c7');
  sky.addColorStop(0.5, '#fed7aa');
  sky.addColorStop(1, '#ea580c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Temple Platform / Courtyard
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0, h * 0.75, w, h * 0.25);
  ctx.fillStyle = '#9a3412';
  ctx.fillRect(w * 0.1, h * 0.72, w * 0.8, 14);

  // Grand Temple Tower (Shikhara)
  const cx = w * 0.5;
  ctx.fillStyle = '#b45309';
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.1);
  ctx.lineTo(cx - 90, h * 0.72);
  ctx.lineTo(cx + 90, h * 0.72);
  ctx.closePath();
  ctx.fill();

  // Layered architectural tiers
  ctx.fillStyle = '#d97706';
  for (let y = h * 0.25; y < h * 0.7; y += 45) {
    const widthAtY = (y / (h * 0.72)) * 170;
    ctx.fillRect(cx - widthAtY / 2, y, widthAtY, 10);
  }

  // Golden Kalasha & Saffron Flag
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(cx, h * 0.08, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.08);
  ctx.lineTo(cx, h * 0.02);
  ctx.stroke();

  // Saffron Dhwaja (Flag)
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.moveTo(cx, h * 0.02);
  ctx.lineTo(cx + 40, h * 0.05);
  ctx.lineTo(cx, h * 0.08);
  ctx.closePath();
  ctx.fill();

  // Sanctum Arch Doorway
  ctx.fillStyle = '#451a03';
  ctx.beginPath();
  ctx.arc(cx, h * 0.6, 32, Math.PI, 0);
  ctx.rect(cx - 32, h * 0.6, 64, h * 0.12);
  ctx.fill();

  // Golden Diya Lamps
  function drawDiya(x, y) {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.ellipse(x, y, 26, 12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sacred Flame
    const flameGrad = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 20);
    flameGrad.addColorStop(0, '#fef08a');
    flameGrad.addColorStop(0.5, '#f97316');
    flameGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.arc(x, y - 14, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  drawDiya(w * 0.2, h * 0.78);
  drawDiya(w * 0.8, h * 0.78);
}

/**
 * 4. GENTLE ROYAL ELEPHANT
 */
function drawElephant(ctx, w, h) {
  // Jungle Nature Backdrop
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#e0f2fe');
  bg.addColorStop(0.6, '#dcfce7');
  bg.addColorStop(1, '#15803d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const cx = w * 0.52;
  const cy = h * 0.55;

  // Elephant Body (Slate Gray)
  ctx.fillStyle = '#64748b';

  // Back legs
  ctx.fillRect(cx - 85, cy + 30, 36, 100);
  ctx.fillRect(cx + 55, cy + 30, 36, 100);

  // Large Round Torso
  ctx.beginPath();
  ctx.ellipse(cx, cy, 110, 85, 0, 0, Math.PI * 2);
  ctx.fill();

  // Front legs
  ctx.fillStyle = '#475569';
  ctx.fillRect(cx - 50, cy + 40, 38, 95);
  ctx.fillRect(cx + 20, cy + 40, 38, 95);

  // Head
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.arc(cx - 95, cy - 25, 60, 0, Math.PI * 2);
  ctx.fill();

  // Big Flapping Ear
  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.ellipse(cx - 65, cy - 20, 32, 50, 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Gentle Trunk
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 130, cy - 10);
  ctx.quadraticCurveTo(cx - 180, cy + 50, cx - 150, cy + 90);
  ctx.quadraticCurveTo(cx - 130, cy + 105, cx - 120, cy + 85);
  ctx.stroke();

  // Ivory Tusk
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath();
  ctx.moveTo(cx - 130, cy + 5);
  ctx.quadraticCurveTo(cx - 150, cy + 15, cx - 140, cy + 35);
  ctx.quadraticCurveTo(cx - 135, cy + 20, cx - 125, cy + 15);
  ctx.closePath();
  ctx.fill();

  // Kind Eye
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx - 115, cy - 40, 5, 0, Math.PI * 2);
  ctx.fill();

  // Embroidered Ceremonial Shawl (Jhool)
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.roundRect(cx - 45, cy - 60, 90, 80, 10);
  ctx.fill();
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 6;
  ctx.stroke();
}

/**
 * 5. HIMALAYAN PEAKS & SUN
 */
function drawNature(ctx, w, h) {
  // Clear Sky
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#38bdf8');
  sky.addColorStop(0.5, '#bae6fd');
  sky.addColorStop(1, '#fed7aa');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Golden Morning Sun
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath();
  ctx.arc(w * 0.75, h * 0.28, 55, 0, Math.PI * 2);
  ctx.fill();

  // Distant Himalayan Mountain Range (Navy/Teal)
  ctx.fillStyle = '#0369a1';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.65);
  ctx.lineTo(w * 0.28, h * 0.22);
  ctx.lineTo(w * 0.55, h * 0.65);
  ctx.closePath();
  ctx.fill();

  // Snowy White Peak 1
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(w * 0.28, h * 0.22);
  ctx.lineTo(w * 0.2, h * 0.35);
  ctx.lineTo(w * 0.36, h * 0.35);
  ctx.closePath();
  ctx.fill();

  // Mountain 2 (Highest)
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(w * 0.38, h * 0.7);
  ctx.lineTo(w * 0.62, h * 0.15);
  ctx.lineTo(w * 0.88, h * 0.7);
  ctx.closePath();
  ctx.fill();

  // Snowy Peak 2
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(w * 0.62, h * 0.15);
  ctx.lineTo(w * 0.53, h * 0.32);
  ctx.lineTo(w * 0.71, h * 0.32);
  ctx.closePath();
  ctx.fill();

  // Rolling Emerald Green Hills
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.68);
  ctx.quadraticCurveTo(w * 0.35, h * 0.55, w * 0.7, h * 0.72);
  ctx.lineTo(w, h * 0.7);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#166534';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.8);
  ctx.quadraticCurveTo(w * 0.6, h * 0.65, w, h * 0.82);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

/**
 * 6. TRADITIONAL BRASS CHAI KETTLE
 */
function drawChai(ctx, w, h) {
  // Warm Home Background
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#fef3c7');
  bg.addColorStop(1, '#ffedd5');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Wooden Table
  ctx.fillStyle = '#78350f';
  ctx.fillRect(0, h * 0.65, w, h * 0.35);
  ctx.fillStyle = '#92400e';
  ctx.fillRect(0, h * 0.65, w, 16);

  // Brass Kettle Center
  const kx = w * 0.38;
  const ky = h * 0.52;

  // Kettle Base & Belly
  const brassGrad = ctx.createRadialGradient(kx - 20, ky - 20, 10, kx, ky, 80);
  brassGrad.addColorStop(0, '#fef08a');
  brassGrad.addColorStop(0.5, '#f59e0b');
  brassGrad.addColorStop(1, '#b45309');
  ctx.fillStyle = brassGrad;

  ctx.beginPath();
  ctx.ellipse(kx, ky, 75, 62, 0, 0, Math.PI * 2);
  ctx.fill();

  // Kettle Spout
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.moveTo(kx + 55, ky - 10);
  ctx.quadraticCurveTo(kx + 110, ky - 25, kx + 115, ky - 60);
  ctx.lineTo(kx + 100, ky - 62);
  ctx.quadraticCurveTo(kx + 85, ky - 20, kx + 45, ky + 15);
  ctx.closePath();
  ctx.fill();

  // Kettle Lid & Knob
  ctx.fillStyle = '#b45309';
  ctx.fillRect(kx - 35, ky - 75, 70, 16);
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(kx, ky - 82, 12, 0, Math.PI * 2);
  ctx.fill();

  // Steam Curls
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(kx + 105, ky - 70);
  ctx.quadraticCurveTo(kx + 120, ky - 100, kx + 100, ky - 130);
  ctx.stroke();

  // Cutting Chai Glass
  const gx = w * 0.72;
  const gy = h * 0.58;

  // Glass Silhouette
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.beginPath();
  ctx.moveTo(gx - 25, gy - 40);
  ctx.lineTo(gx + 25, gy - 40);
  ctx.lineTo(gx + 20, gy + 35);
  ctx.lineTo(gx - 20, gy + 35);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Golden Spiced Tea inside glass
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.moveTo(gx - 22, gy - 15);
  ctx.lineTo(gx + 22, gy - 15);
  ctx.lineTo(gx + 18, gy + 32);
  ctx.lineTo(gx - 18, gy + 32);
  ctx.closePath();
  ctx.fill();
}

/**
 * 7. FRESH HARVEST FRUITS
 */
function drawFruit(ctx, w, h) {
  // Gentle Cream Background
  ctx.fillStyle = '#f0fdf4';
  ctx.fillRect(0, 0, w, h);

  // Large Green Banana Leaf Mat
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.65, w * 0.45, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#15803d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(w * 0.05, h * 0.65);
  ctx.lineTo(w * 0.95, h * 0.65);
  ctx.stroke();

  // Golden Mangoes (Alphonso)
  function drawMango(x, y, rot) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((rot * Math.PI) / 180);
    const grad = ctx.createRadialGradient(-10, -10, 10, 0, 0, 50);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.6, '#f59e0b');
    grad.addColorStop(1, '#ea580c');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, 42, 60, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawMango(w * 0.38, h * 0.52, -25);
  drawMango(w * 0.56, h * 0.5, 20);

  // Crisp Red Apples
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(w * 0.24, h * 0.6, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w * 0.74, h * 0.6, 40, 0, Math.PI * 2);
  ctx.fill();

  // Pomegranate Slice
  ctx.fillStyle = '#9f1239';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.68, 35, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fda4af';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.68, 26, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
}

/**
 * 8. FARM VEGETABLES BASKET
 */
function drawVegetables(ctx, w, h) {
  // Rustic Kitchen Table
  ctx.fillStyle = '#fffbeb';
  ctx.fillRect(0, 0, w, h);

  // Wicker Basket
  ctx.fillStyle = '#d97706';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.65, w * 0.42, 100, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#92400e';
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.62, w * 0.38, 75, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ripe Orange Pumpkin
  ctx.fillStyle = '#ea580c';
  ctx.beginPath();
  ctx.arc(w * 0.35, h * 0.5, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.ellipse(w * 0.35, h * 0.5, 32, 55, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pumpkin Stem
  ctx.fillStyle = '#15803d';
  ctx.fillRect(w * 0.33, h * 0.35, 12, 22);

  // Purple Eggplant (Brinjal)
  ctx.fillStyle = '#581c87';
  ctx.beginPath();
  ctx.ellipse(w * 0.62, h * 0.52, 38, 56, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#15803d';
  ctx.beginPath();
  ctx.arc(w * 0.68, h * 0.38, 16, 0, Math.PI * 2);
  ctx.fill();

  // Fresh Vine Tomatoes
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.65, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(w * 0.76, h * 0.62, 30, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * 9. HERITAGE CYCLE RICKSHAW
 */
function drawTransport(ctx, w, h) {
  // Street Scene
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#fef2f2');
  sky.addColorStop(0.7, '#f8fafc');
  sky.addColorStop(1, '#334155');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Road Asphalt
  ctx.fillStyle = '#334155';
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.setLineDash([25, 20]);
  ctx.beginPath();
  ctx.moveTo(0, h * 0.86);
  ctx.lineTo(w, h * 0.86);
  ctx.stroke();
  ctx.setLineDash([]);

  // Wheels (Black with Silver Spokes)
  function drawWheel(wx, wy, rad) {
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(wx, wy, rad, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    for (let a = 0; a < 8; a++) {
      const angle = (a * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + Math.cos(angle) * rad, wy + Math.sin(angle) * rad);
      ctx.stroke();
    }
  }

  const wy = h * 0.72;
  drawWheel(w * 0.28, wy, 48);
  drawWheel(w * 0.72, wy, 48);

  // Rickshaw Passenger Seat & Canopy
  ctx.fillStyle = '#dc2626';
  ctx.beginPath();
  ctx.moveTo(w * 0.58, h * 0.68);
  ctx.lineTo(w * 0.84, h * 0.68);
  ctx.lineTo(w * 0.82, h * 0.42);
  ctx.quadraticCurveTo(w * 0.68, h * 0.32, w * 0.54, h * 0.44);
  ctx.closePath();
  ctx.fill();

  // Gold Canopy Trim
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 8;
  ctx.stroke();

  // Bicycle Front Frame
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(w * 0.28, wy);
  ctx.lineTo(w * 0.4, h * 0.5);
  ctx.lineTo(w * 0.46, h * 0.5);
  ctx.moveTo(w * 0.38, h * 0.58);
  ctx.lineTo(w * 0.58, h * 0.68);
  ctx.stroke();
}

/**
 * Slices the master canvas into discrete piece PNG data URLs
 */
export function sliceMasterCanvas(masterCanvas, rows, cols) {
  const referenceUrl = masterCanvas.toDataURL('image/png');
  const pieceW = masterCanvas.width / cols;
  const pieceH = masterCanvas.height / rows;

  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = pieceW;
  tileCanvas.height = pieceH;
  const tileCtx = tileCanvas.getContext('2d');

  const pieces = [];
  let id = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      tileCtx.clearRect(0, 0, pieceW, pieceH);

      // Extract slice
      tileCtx.drawImage(
        masterCanvas,
        c * pieceW,
        r * pieceH,
        pieceW,
        pieceH,
        0,
        0,
        pieceW,
        pieceH
      );

      // Subtle jigsaw bevel outline to make piece distinct
      tileCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      tileCtx.lineWidth = 2;
      tileCtx.strokeRect(1, 1, pieceW - 2, pieceH - 2);

      const pieceDataUrl = tileCanvas.toDataURL('image/png');

      pieces.push({
        id,
        targetIndex: id,
        targetRow: r,
        targetCol: c,
        imgDataUrl: pieceDataUrl,
      });

      id++;
    }
  }

  return { referenceUrl, pieces };
}

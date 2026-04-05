import { createCanvas, loadImage } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

const BRAND = {
  bgDark:       '#0d1117',
  bgDarker:     '#090d12',
  brandAmber:   '#E8862A',
  profitGreen:  '#00E676',
  profitSoft:   '#69F0AE',
  lossRed:      '#FF4444',
  lossSoft:     '#FF6B6B',
  candleGreen:  '#00E676',
  candleRed:    '#FF4444',
  textWhite:    '#FFFFFF',
  textLight:    '#c9d1d9',
  textMuted:    '#6e7681',
  textDark:     '#3d4a5c',
  lineSubtle:   'rgba(255,255,255,0.06)',
  gridLine:     'rgba(255,255,255,0.04)',
};

function roundRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function renderPositionCard(filename: string, positionInfo: any, mockCandles: number[]) {
  const S = 2; 
  const logicalW = 800; 
  
  const headerH = 74;
  const blockH = 340; 
  const footerH = 36;
  const PAD = 40;
  
  const logicalH = headerH + blockH + footerH + 40;
  
  const canvas = createCanvas(logicalW * S, logicalH * S);
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  // 1. Background
  const bg = ctx.createLinearGradient(0, 0, logicalW * 0.3, logicalH);
  bg.addColorStop(0, BRAND.bgDark);
  bg.addColorStop(1, BRAND.bgDarker);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // Load bg_card for cyberpunk dots
  const bgImgPath = path.resolve(__dirname, '../public/bg_card.png');
  const bgImg = await loadImage(bgImgPath).catch(()=>null);
  if (bgImg) {
    ctx.globalAlpha = 0.12;
    ctx.drawImage(bgImg, 0, 0, logicalW, logicalH);
    ctx.globalAlpha = 1.0;
  }

  // vignette
  const vig = ctx.createRadialGradient(logicalW/2, logicalH/2, logicalH*0.5, logicalW/2, logicalH/2, logicalW*0.65);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.15)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // 2. Header
  const logoImgPath = path.resolve(__dirname, '../public/logo_foxblaze.png');
  const logoImg = await loadImage(logoImgPath).catch(()=>null);
  if (logoImg) {
    const logoW = Math.round(40 * (logoImg.width / logoImg.height));
    ctx.drawImage(logoImg, PAD, 16, logoW, 40);
  }
  ctx.fillStyle = BRAND.brandAmber;
  ctx.font = 'bold 22px "Arial"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('FOXBLAZE', PAD + 48, 25);
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = '9px "Arial"';
  ctx.fillText('A C T I V E   P O S I T I O N S', PAD + 48, 45);

  ctx.textAlign = 'right';
  ctx.fillStyle = positionInfo.uPnl >= 0 ? BRAND.profitGreen : BRAND.lossRed;
  ctx.font = 'bold 26px "Arial"';
  ctx.fillText(`${positionInfo.uPnl >= 0 ? '+' : '-'}$${Math.abs(positionInfo.uPnl).toFixed(2)}`, logicalW - PAD, 27);
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = '9px "Arial"';
  ctx.fillText('TOTAL UNREALIZED PNL', logicalW - PAD, 45);

  // base header line
  ctx.beginPath();
  ctx.strokeStyle = BRAND.lineSubtle;
  ctx.moveTo(PAD, headerH);
  ctx.lineTo(logicalW - PAD, headerH);
  ctx.stroke();

  // 3. Position Block
  let cy = headerH + 30;

  // -- Asset Name & Badge
  const isLong = positionInfo.side === 'LONG';
  const sideColor = isLong ? BRAND.profitGreen : BRAND.lossRed;
  const sideColorRgb = isLong ? '0,230,118' : '255,68,68';

  // Draw Badge
  ctx.font = 'bold 12px "Arial"';
  const badgeW = ctx.measureText(positionInfo.side).width + 24;
  roundRect(ctx, PAD, cy, badgeW, 26, 4);
  ctx.fillStyle = `rgba(${sideColorRgb}, 0.1)`;
  ctx.fill();
  ctx.strokeStyle = `rgba(${sideColorRgb}, 0.3)`;
  ctx.stroke();
  ctx.fillStyle = sideColor;
  ctx.textAlign = 'center';
  ctx.fillText(positionInfo.side, PAD + badgeW/2, cy + 13);

  // -- Asset Title
  ctx.textAlign = 'left';
  ctx.fillStyle = BRAND.textWhite;
  ctx.font = 'bold 28px "Arial"';
  ctx.fillText(positionInfo.asset, PAD + badgeW + 16, cy + 14);

  // -- PnL & ROE 
  ctx.textAlign = 'right';
  ctx.fillStyle = positionInfo.uPnl >= 0 ? BRAND.profitGreen : BRAND.lossRed;
  ctx.font = 'bold 24px "Arial"';
  const roeStr = `(${(positionInfo.roe * 100).toFixed(2)}%)`;
  ctx.fillText(`${positionInfo.uPnl >= 0 ? '+' : '-'}$${Math.abs(positionInfo.uPnl).toFixed(2)}  ${roeStr}`, logicalW - PAD, cy + 14);

  cy += 48;

  // -- Metrics Row
  const metrics = [
    { label: 'SIZE', val: positionInfo.sizeUsd },
    { label: 'ENTRY', val: `$${positionInfo.entry}` },
    { label: 'LEVERAGE', val: `${positionInfo.leverage}x` },
    { label: 'MARK', val: `$${positionInfo.mark}` }
  ];
  
  const mWidth = (logicalW - 2 * PAD) / metrics.length;
  ctx.textAlign = 'center';
  for (let i=0; i<metrics.length; i++) {
    const mx = PAD + i * mWidth + mWidth/2;
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '10px "Arial"';
    ctx.fillText(metrics[i].label, mx, cy);
    ctx.fillStyle = BRAND.textWhite;
    ctx.font = 'bold 16px "Arial"';
    ctx.fillText(metrics[i].val, mx, cy + 20);
  }

  cy += 50;

  // -- Line Chart Area
  const chH = 140;
  const chW = logicalW - 2 * PAD;
  const chX = PAD;
  const chY = cy;

  // grid
  ctx.strokeStyle = BRAND.gridLine;
  ctx.lineWidth = 1;
  for (let i=0; i<=4; i++) {
    ctx.beginPath();
    ctx.moveTo(chX, chY + (i*chH/4));
    ctx.lineTo(chX + chW, chY + (i*chH/4));
    ctx.stroke();
  }

  // Draw chart line
  const maxP = Math.max(...mockCandles, positionInfo.entry);
  const minP = Math.min(...mockCandles, positionInfo.entry);
  const spread = (maxP - minP) || 1;
  const PADDING = spread * 0.15;
  const calcY = (val: number) => chY + chH - ((val - (minP - PADDING)) / (spread + 2*PADDING)) * chH;

  ctx.beginPath();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  for (let i=0; i<mockCandles.length; i++) {
    const x = chX + (i / (mockCandles.length - 1)) * chW;
    const y = calcY(mockCandles[i]);
    if (i===0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Glow under line
  const grad = ctx.createLinearGradient(0, chY, 0, chY + chH);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.lineTo(chX + chW, chY + chH);
  ctx.lineTo(chX, chY + chH);
  ctx.fillStyle = grad;
  ctx.fill();

  // -- Entry Line (Dashed)
  const entryY = calcY(positionInfo.entry);
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = BRAND.textMuted;
  ctx.lineWidth = 1.5;
  ctx.moveTo(chX, entryY);
  ctx.lineTo(chX + chW, entryY);
  ctx.stroke();
  ctx.setLineDash([]);

  // -- Entry Tag
  ctx.font = 'bold 10px "Arial"';
  const tagText = `ENTRY ${positionInfo.entry}`;
  const tagW = ctx.measureText(tagText).width + 12;
  const tagY = entryY - 8;
  
  // Clear the dashed line underneath the tag
  ctx.clearRect(chX - 2, tagY - 2, tagW + 4, 20);
  
  roundRect(ctx, chX, tagY, tagW, 16, 2);
  ctx.fillStyle = BRAND.bgDarker;
  ctx.fill();
  ctx.strokeStyle = BRAND.textMuted;
  ctx.stroke();
  
  ctx.fillStyle = BRAND.textLight;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(tagText, chX + tagW/2, entryY + 8);

  // -- Current Price Dot
  const currentY = calcY(mockCandles[mockCandles.length - 1]);
  ctx.beginPath();
  ctx.arc(chX + chW, currentY, 4, 0, Math.PI*2);
  ctx.fillStyle = sideColor;
  ctx.fill();
  
  // Current price pulse
  ctx.beginPath();
  ctx.arc(chX + chW, currentY, 12, 0, Math.PI*2);
  ctx.fillStyle = `rgba(${sideColorRgb}, 0.2)`;
  ctx.fill();

  cy += chH + 40;

  // 4. Footer
  ctx.beginPath();
  ctx.strokeStyle = BRAND.lineSubtle;
  ctx.moveTo(PAD, cy);
  ctx.lineTo(logicalW - PAD, cy);
  ctx.stroke();

  ctx.fillStyle = BRAND.textDark;
  ctx.font = '9px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText('Automatic Signal Execution // Confirming Trend...', logicalW/2, cy + 18);

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buf);
  console.log('✅ Generated ' + filename);
}

const longCandles: number[] = [];
let pL = 59000;
for(let i=0; i<50; i++) {
  pL += (Math.random() - 0.45) * 500;
  longCandles.push(pL);
}

const shortCandles: number[] = [];
let pS = 0.054;
for(let i=0; i<50; i++) {
  pS += (Math.random() - 0.55) * 0.001;
  shortCandles.push(pS);
}

// Generate test cards
async function run() {
  await renderPositionCard('./test_pos_long.png', {
    asset: 'BTC/USD',
    side: 'LONG',
    uPnl: 145.20,
    roe: 0.154, // 15.4%
    sizeUsd: '8,500.00',
    entry: 59000,
    leverage: 10,
    mark: longCandles[longCandles.length-1].toFixed(2)
  }, longCandles);

  await renderPositionCard('./test_pos_short.png', {
    asset: 'DOGE/USD',
    side: 'SHORT',
    uPnl: -24.50,
    roe: -0.062, // -6.2%
    sizeUsd: '1,200.00',
    entry: 0.054,
    leverage: 20,
    mark: shortCandles[shortCandles.length-1].toFixed(4)
  }, shortCandles);
}

run();

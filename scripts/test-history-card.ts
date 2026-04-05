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

async function renderHistoryCard(filename: string, histories: any[]) {
  const S = 2;
  const logicalW = 800; // Wide enough to look like a pro terminal
  
  const headerH = 74;
  const rowH = 68;
  const footerH = 36;
  const PAD = 40;
  
  const logicalH = headerH + 20 + (histories.length * rowH) + footerH;
  
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
  const bgImg = await loadImage(path.resolve(__dirname, '../public/bg_card.png')).catch(()=>null);
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
  const logoImg = await loadImage(path.resolve(__dirname, '../public/logo_foxblaze.png')).catch(()=>null);
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
  ctx.fillText('T R A D I N G   H I S T O R Y', PAD + 48, 45);

  const totalPnl = histories.reduce((acc, h) => acc + (h.pnl || 0), 0);
  ctx.textAlign = 'right';
  ctx.fillStyle = totalPnl >= 0 ? BRAND.profitGreen : BRAND.lossRed;
  ctx.font = 'bold 26px "Arial"';
  ctx.fillText(`${totalPnl >= 0 ? '+' : '-'}$${Math.abs(totalPnl).toFixed(2)}`, logicalW - PAD, 27);
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = '9px "Arial"';
  ctx.fillText('REALIZED PNL (RECENT)', logicalW - PAD, 45);

  // base header line
  ctx.beginPath();
  ctx.strokeStyle = BRAND.lineSubtle;
  ctx.moveTo(PAD, headerH);
  ctx.lineTo(logicalW - PAD, headerH);
  ctx.stroke();

  // 3. History Rows
  let cy = headerH + 20;

  for (let i = 0; i < histories.length; i++) {
    const h = histories[i];
    
    // Status color
    const isClosed = h.status === 'CLOSED';
    const pnl = h.pnl || 0;
    const isProfit = pnl >= 0;
    
    // Draw dot for time
    ctx.beginPath();
    ctx.arc(PAD + 4, cy + rowH/2, 4, 0, Math.PI*2);
    ctx.fillStyle = isClosed ? BRAND.textMuted : BRAND.lossRed; // FAILED = red dot
    ctx.fill();

    // Line connecting dots
    if (i < histories.length - 1) {
      ctx.beginPath();
      ctx.moveTo(PAD + 4, cy + rowH/2 + 8);
      ctx.lineTo(PAD + 4, cy + rowH + rowH/2 - 8);
      ctx.strokeStyle = BRAND.lineSubtle;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Asset & Side
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    
    // side
    const isLongStr = h.side.toUpperCase() === 'LONG';
    const sideColor = isLongStr ? BRAND.profitGreen : BRAND.lossRed;
    
    ctx.font = 'bold 16px "Arial"';
    const assetW = ctx.measureText(h.asset).width;
    ctx.fillStyle = BRAND.textWhite;
    ctx.fillText(`${h.asset}`, PAD + 24, cy + 20);

    // badge
    ctx.font = 'bold 9px "Arial"';
    const sideT = `${h.side.toUpperCase()} ${h.leverage}x`;
    const tagW = ctx.measureText(sideT).width + 12;
    roundRect(ctx, PAD + 24 + assetW + 8, cy + 12, tagW, 16, 2);
    ctx.fillStyle = `rgba(${isLongStr ? '0,230,118' : '255,68,68'}, 0.1)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${isLongStr ? '0,230,118' : '255,68,68'}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = sideColor;
    ctx.textAlign = 'center';
    ctx.fillText(sideT, PAD + 24 + assetW + 8 + tagW/2, cy + 20);

    // Date
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '11px "Arial"';
    ctx.fillText(h.date, PAD + 24, cy + 44);

    if (isClosed) {
      // Entry / Exit
      const fmtP = (p: number) => {
        if (p >= 1000) return p.toFixed(1);
        if (p >= 1) return p.toFixed(3);
        return p.toFixed(4);
      };

      ctx.fillStyle = BRAND.textLight;
      ctx.font = '13px "Arial"';
      ctx.fillText(`$${fmtP(h.entry)} → $${fmtP(h.exit)}`, PAD + 250, cy + 20);

      const sizeUsd = h.size * h.entry;
      ctx.fillStyle = BRAND.textMuted;
      ctx.font = '11px "Arial"';
      ctx.fillText(`Vol: $${sizeUsd.toFixed(2)}`, PAD + 250, cy + 44);

      // PNL
      ctx.textAlign = 'right';
      ctx.fillStyle = isProfit ? BRAND.profitGreen : BRAND.lossRed;
      ctx.font = 'bold 20px "Arial"';
      ctx.fillText(`${isProfit ? '+' : '-'}$${Math.abs(pnl).toFixed(2)}`, logicalW - PAD, cy + 20);

      // ROE
      const roe = (pnl / (sizeUsd / h.leverage)) * 100;
      ctx.fillStyle = isProfit ? BRAND.profitSoft : BRAND.lossSoft;
      ctx.font = '12px "Arial"';
      ctx.fillText(`(${isProfit ? '+' : ''}${roe.toFixed(2)}%)`, logicalW - PAD, cy + 44);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = BRAND.lossRed;
      ctx.font = 'bold 16px "Arial"';
      ctx.fillText(`FAILED / REJECTED`, logicalW - PAD, cy + 32);
    }

    // separator
    ctx.beginPath();
    ctx.strokeStyle = BRAND.lineSubtle;
    ctx.moveTo(PAD + 24, cy + rowH);
    ctx.lineTo(logicalW - PAD, cy + rowH);
    ctx.stroke();

    cy += rowH;
  }

  cy += 10;

  // 4. Footer
  ctx.beginPath();
  ctx.strokeStyle = BRAND.lineSubtle;
  ctx.moveTo(PAD, cy);
  ctx.lineTo(logicalW - PAD, cy);
  ctx.stroke();

  ctx.fillStyle = BRAND.textDark;
  ctx.font = '9px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText('Displaying latest 10 trades // FoxBlaze AI', logicalW/2, cy + 18);

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buf);
  console.log('✅ Generated ' + filename);
}

const mockHistories = [
  { asset: 'BTC', side: 'LONG', leverage: 10, status: 'CLOSED', entry: 59000, exit: 60500, size: 0.1, pnl: 150, date: '2026-04-05 10:15:00' },
  { asset: 'ETH', side: 'SHORT', leverage: 15, status: 'CLOSED', entry: 3200, exit: 3100, size: 2, pnl: 200, date: '2026-04-05 09:30:15' },
  { asset: 'SOL', side: 'LONG', leverage: 20, status: 'CLOSED', entry: 180, exit: 175, size: 10, pnl: -50, date: '2026-04-04 22:11:45' },
  { asset: 'DOGE', side: 'LONG', leverage: 5, status: 'FAILED', entry: 0.15, exit: 0, size: 1000, pnl: 0, date: '2026-04-04 15:20:00' },
  { asset: 'XRP', side: 'SHORT', leverage: 10, status: 'CLOSED', entry: 0.50, exit: 0.52, size: 5000, pnl: -100, date: '2026-04-03 11:05:00' },
];

// Generate test cards
renderHistoryCard('./test_history.png', mockHistories);

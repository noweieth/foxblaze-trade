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

async function renderPnlCard(filename: string, pnlData: number[], timeframe: string, totalPnl: number) {
  const S = 2;
  const logicalW = 800; 
  const logicalH = 460;
  
  const canvas = createCanvas(logicalW * S, logicalH * S);
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  // Background
  const bg = ctx.createLinearGradient(0, 0, logicalW * 0.3, logicalH);
  bg.addColorStop(0, BRAND.bgDark);
  bg.addColorStop(1, BRAND.bgDarker);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, logicalW, logicalH);

  const bgImg = await loadImage(path.resolve(__dirname, '../public/bg_card.png')).catch(()=>null);
  if (bgImg) {
    ctx.globalAlpha = 0.12;
    ctx.drawImage(bgImg, 0, 0, logicalW, logicalH);
    ctx.globalAlpha = 1.0;
  }

  // Header 
  const PAD = 40;
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
  ctx.fillText('P N L   A N A L Y S I S', PAD + 48, 45);

  const isProfit = totalPnl >= 0;
  const pnlColor = isProfit ? BRAND.profitGreen : BRAND.lossRed;
  
  ctx.textAlign = 'right';
  ctx.fillStyle = pnlColor;
  ctx.font = 'bold 36px "Arial"';
  ctx.fillText(`${isProfit ? '+' : '-'}$${Math.abs(totalPnl).toFixed(2)}`, logicalW - PAD, 27);
  ctx.fillStyle = BRAND.textMuted;
  ctx.font = '9px "Arial"';
  ctx.fillText(`${timeframe.toUpperCase()} REALIZED PNL`, logicalW - PAD, 45);

  const headerH = 74;
  ctx.beginPath();
  ctx.strokeStyle = BRAND.lineSubtle;
  ctx.moveTo(PAD + 10, headerH);
  ctx.lineTo(logicalW - PAD - 10, headerH);
  ctx.stroke();

  // Chart Area
  const chY = headerH + 30;
  const chH = 260;
  const chW = logicalW - 2 * PAD;
  const chX = PAD;

  // grid
  ctx.strokeStyle = BRAND.gridLine;
  ctx.lineWidth = 1;
  const lines = 4;
  for (let i = 0; i <= lines; i++) {
    const y = chY + (i * chH) / lines;
    ctx.beginPath();
    ctx.moveTo(chX, y);
    ctx.lineTo(chX + chW, y);
    ctx.stroke();
  }

  // Calculate coordinates
  // For PnL, we want exactly 0 line if it crosses it
  const maxP = Math.max(...pnlData, 0);
  const minP = Math.min(...pnlData, 0);
  const spread = maxP - minP || 1;
  const PADDING = spread * 0.15;
  const actualMin = minP - PADDING;
  const actualMax = maxP + PADDING;
  const actualSpread = actualMax - actualMin;
  
  const calcY = (val: number) => chY + chH - ((val - actualMin) / actualSpread) * chH;

  const zeroY = calcY(0);
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = BRAND.textMuted;
  ctx.lineWidth = 1;
  ctx.moveTo(chX, zeroY);
  ctx.lineTo(chX + chW, zeroY);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Pnl Line
  ctx.beginPath();
  ctx.strokeStyle = pnlColor;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  
  for (let i = 0; i < pnlData.length; i++) {
    const x = chX + (i / (Math.max(1, pnlData.length - 1))) * chW;
    const y = calcY(pnlData[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Gradient under line
  const grad = ctx.createLinearGradient(0, chY, 0, chY + chH);
  if (isProfit) {
    grad.addColorStop(0, 'rgba(0, 230, 118, 0.2)');
    grad.addColorStop(1, 'rgba(0, 230, 118, 0)');
  } else {
    grad.addColorStop(0, 'rgba(255, 68, 68, 0.2)');
    grad.addColorStop(1, 'rgba(255, 68, 68, 0)');
  }
  
  ctx.lineTo(chX + chW, chY + chH);
  ctx.lineTo(chX, chY + chH);
  ctx.fillStyle = grad;
  ctx.fill();

  // Final Dot
  if (pnlData.length > 0) {
    const finalIndex = pnlData.length - 1;
    const fx = chX + chW;
    const fy = calcY(pnlData[finalIndex]);
    ctx.beginPath();
    ctx.arc(fx, fy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, 14, 0, Math.PI * 2);
    ctx.fillStyle = isProfit ? 'rgba(0,230,118,0.2)' : 'rgba(255,68,68,0.2)';
    ctx.fill();
  }

  // Footer
  const footerY = logicalH - 36;
  ctx.beginPath();
  ctx.strokeStyle = BRAND.lineSubtle;
  ctx.moveTo(PAD + 10, footerY);
  ctx.lineTo(logicalW - PAD - 10, footerY);
  ctx.stroke();

  ctx.fillStyle = BRAND.textDark;
  ctx.font = '9px "Arial"';
  ctx.textAlign = 'center';
  ctx.fillText('foxblaze.trade // Realized PnL Growth', logicalW / 2, footerY + 18);

  const buf = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buf);
  console.log('✅ Generated ' + filename);
}

// Mock Data
// cumulative pnl over 7 days tracking up
const mockProfitData = [0, 50, 20, 100, 80, 210, 195, 305];
// cumulative pnl tracking down
const mockLossData = [0, -20, 10, -50, -80, -30, -110, -140];

renderPnlCard('./test_pnl_profit.png', mockProfitData, '7d', mockProfitData[mockProfitData.length - 1]);
renderPnlCard('./test_pnl_loss.png', mockLossData, '7d', mockLossData[mockLossData.length - 1]);

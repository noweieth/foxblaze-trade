import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D, Image, registerFont } from 'canvas';
import * as path from 'path';

// ─── Balanced Color Palette (v7) ─────────────────────────────────
// Brand accent = warm amber (fire, not blood)
// Red = ONLY for loss/short values
// Green = ONLY for profit/long values
export const BRAND = {
  // Background
  bgDark:       '#072722',
  bgDarker:     '#041a16',

  // Brand accent (teal)
  brandTeal:    '#96FCE4',

  // Semantic (PnL-only)
  profitGreen:  '#00E676',
  profitSoft:   '#69F0AE',
  lossRed:      '#FF4444',
  lossSoft:     '#FF6B6B',

  // Candles
  candleGreen:  '#00E676',
  candleRed:    '#FF4444',

  // Text
  textWhite:    '#FFFFFF',
  textLight:    '#c9d1d9',
  textMuted:    '#6e7681',
  textDark:     '#3d4a5c',

  // Structural
  lineSubtle:   'rgba(255,255,255,0.06)',
  lineFaint:    'rgba(255,255,255,0.025)',
  gridLine:     'rgba(255,255,255,0.04)',
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

@Injectable()
export class CardRenderer implements OnModuleInit {
  private readonly logger = new Logger(CardRenderer.name);
  private logoImg!: Image;
  private bgImg!: Image;
  private fox1Img!: Image;
  private fox2Img!: Image;
  private foxTextImg!: Image;

  async onModuleInit() {
    const publicDir = path.resolve(process.cwd(), 'public');
    
    try { registerFont(path.join(publicDir, 'fonts', 'Inter-Regular.ttf'), { family: 'Inter' }); } catch(e){}
    try { registerFont(path.join(publicDir, 'fonts', 'Inter-Medium.ttf'), { family: 'Inter', weight: '500' }); } catch(e){}
    try { registerFont(path.join(publicDir, 'fonts', 'Inter-Bold.ttf'), { family: 'Inter', weight: 'bold' }); } catch(e){}
    try { registerFont(path.join(publicDir, 'fonts', 'Inter-Black.ttf'), { family: 'Inter', weight: '900' }); } catch(e){}
    try { registerFont(path.join(publicDir, 'fonts', 'Inter-Italic.ttf'), { family: 'Inter', style: 'italic' }); } catch(e){}
    try { registerFont(path.join(publicDir, 'fonts', 'Teodor-Bold.ttf'), { family: 'Teodor', weight: 'bold' }); } catch(e){}
    try { registerFont(path.join(publicDir, 'fonts', 'Teodor-Regular.ttf'), { family: 'Teodor' }); } catch(e){}

    try {
      this.logoImg = await loadImage(path.join(publicDir, 'logo_foxblaze.png'));
      this.bgImg = await loadImage(path.join(publicDir, 'bg_card.png'));
      try {
         this.fox1Img = await loadImage(path.join(publicDir, 'fox_1.png'));
         this.fox2Img = await loadImage(path.join(publicDir, 'fox_2.png'));
         this.foxTextImg = await loadImage(path.join(publicDir, 'foxblaze_text.png'));
         this.logger.log('✅ New PnL assets loaded (fox_1, fox_2, foxblaze_text)');
      } catch(e) {}
      this.logger.log('✅ Brand assets loaded (logo_foxblaze.png, bg_card.png)');
    } catch (e: any) {
      this.logger.error(`⚠️ Failed to load brand assets: ${e.message}. Cards will render without images.`);
    }
  }

  // ─── Scale factor (2x for Telegram crispness) ─────────────────────
  readonly SCALE = 2;

  // ─── Core: Canvas với branded background ──────────────────────────

  createCard(logicalW: number, logicalH: number): { canvas: Canvas; ctx: CanvasRenderingContext2D; w: number; h: number } {
    const S = this.SCALE;
    const canvas = createCanvas(logicalW * S, logicalH * S);
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);

    const w = logicalW;
    const h = logicalH;

    // Base gradient
    const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
    bg.addColorStop(0, BRAND.bgDark);
    bg.addColorStop(1, BRAND.bgDarker);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Cyberpunk pattern (12% opacity — very subtle)
    if (this.bgImg) {
      ctx.globalAlpha = 0.12;
      ctx.drawImage(this.bgImg, 0, 0, w, h);
      ctx.globalAlpha = 1.0;
    }

    // Depth overlay
    const depth = ctx.createLinearGradient(0, 0, 0, h);
    depth.addColorStop(0, 'rgba(13, 17, 23, 0.1)');
    depth.addColorStop(1, 'rgba(9, 13, 18, 0.3)');
    ctx.fillStyle = depth;
    ctx.fillRect(0, 0, w, h);

    // Gentle vignette
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.5, w / 2, h / 2, w * 0.65);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.15)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    return { canvas, ctx, w, h };
  }

  // ─── Header ──────────────────────────────────────────────────────

  drawHeader(
    ctx: CanvasRenderingContext2D,
    opts: {
      width: number;
      rightLabel?: string;
      rightLabelColor?: string;
      rightSubtitle?: string;
      rightBadge?: string;
      rightBadgeColor?: string;
      subtitle?: string;
    }
  ): number {
    const PAD = 32;
    const hTop = 16;
    let cx = PAD;

    // Logo
    if (this.logoImg) {
      const logoH = 40;
      const logoW = Math.round(logoH * (this.logoImg.width / this.logoImg.height));
      ctx.drawImage(this.logoImg, cx, hTop + 4, logoW, logoH);
      cx += logoW + 12;
    }

    const tcY = hTop + 24;

    // Brand name — amber
    ctx.fillStyle = BRAND.brandTeal;
    ctx.font = 'bold 22px "Arial"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOXBLAZE', cx, tcY - 9);

    // Sub-brand
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '11px "Arial"';
    ctx.fillText(opts.subtitle || 'T R A D I N G   B O T', cx, tcY + 12);

    // Right label
    if (opts.rightLabel) {
      ctx.textAlign = 'right';
      ctx.fillStyle = opts.rightLabelColor || BRAND.textWhite;
      ctx.font = 'bold 22px "Arial"';
      ctx.fillText(opts.rightLabel, opts.width - PAD, tcY - 9);

      if (opts.rightSubtitle) {
        let offsetX = opts.width - PAD;
        if (opts.rightBadge) {
          ctx.font = '11px "Arial"';
          ctx.fillStyle = opts.rightBadgeColor || BRAND.textMuted;
          ctx.textAlign = 'right';
          ctx.fillText(opts.rightBadge, offsetX, tcY + 12);
          const badgeW = ctx.measureText(opts.rightBadge).width;
          offsetX -= badgeW + 6; // gap between price and badge
        }

        ctx.fillStyle = BRAND.textLight;
        ctx.font = '11px "Arial"';
        ctx.textAlign = 'right';
        ctx.fillText(opts.rightSubtitle, offsetX, tcY + 12);
      }
    }

    // Separator — neutral white gradient
    const sepY = 74;
    const sg = ctx.createLinearGradient(PAD + 10, 0, opts.width - PAD - 10, 0);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.15, 'rgba(255,255,255,0.06)');
    sg.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    sg.addColorStop(0.85, 'rgba(255,255,255,0.06)');
    sg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.strokeStyle = sg;
    ctx.lineWidth = 1;
    ctx.moveTo(PAD + 10, sepY);
    ctx.lineTo(opts.width - PAD - 10, sepY);
    ctx.stroke();

    return sepY + 6; // return Y after header
  }

  // ─── Footer ───────────────────────────────────────────────────────

  drawFooter(ctx: CanvasRenderingContext2D, w: number, h: number, tipText: string): void {
    const PAD = 32;
    const fY = h - 36;

    const fg = ctx.createLinearGradient(PAD + 10, 0, w - PAD - 10, 0);
    fg.addColorStop(0, 'rgba(255,255,255,0)');
    fg.addColorStop(0.3, 'rgba(255,255,255,0.03)');
    fg.addColorStop(0.7, 'rgba(255,255,255,0.03)');
    fg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1;
    ctx.moveTo(PAD + 10, fY);
    ctx.lineTo(w - PAD - 10, fY);
    ctx.stroke();

    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '11px "Arial"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tipText, w / 2, fY + 15);
  }

  // ─── Table ────────────────────────────────────────────────────────

  drawTable(
    ctx: CanvasRenderingContext2D,
    opts: {
      headers: { text: string; pct: number; align: 'left' | 'center' | 'right' }[];
      rows: { 
        values: string[]; 
        colors?: string[];
        badge?: { colIndex: number; text: string; color: string; bgAlpha: number; borderAlpha: number; };
      }[];
      startY: number;
      tableWidth: number;
      startX?: number;
    }
  ): number {
    const PAD = opts.startX ?? 32;
    const tW = opts.tableWidth;
    const headerH = 36;
    const rowH = 52;
    let y = opts.startY;

    // Column positions
    const colXs: number[] = [];
    let ax = PAD;
    for (const h of opts.headers) { colXs.push(ax); ax += tW * h.pct; }
    const colWs = opts.headers.map(h => tW * h.pct);

    // Header row
    roundRect(ctx, PAD, y, tW, headerH, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = BRAND.lineSubtle;
    ctx.lineWidth = 1;
    ctx.moveTo(PAD, y + headerH);
    ctx.lineTo(PAD + tW, y + headerH);
    ctx.stroke();

    ctx.font = 'bold 10px "Arial"';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = BRAND.textMuted;
    for (let i = 0; i < opts.headers.length; i++) {
      const h = opts.headers[i];
      ctx.textAlign = h.align;
      const tx = h.align === 'left' ? colXs[i] + 14
               : h.align === 'right' ? colXs[i] + colWs[i] - 14
               : colXs[i] + colWs[i] / 2;
      ctx.fillText(h.text, tx, y + headerH / 2);
    }
    y += headerH;

    // Data rows
    for (let r = 0; r < opts.rows.length; r++) {
      const row = opts.rows[r];

      ctx.beginPath();
      ctx.strokeStyle = BRAND.lineFaint;
      ctx.lineWidth = 1;
      ctx.moveTo(PAD, y + rowH);
      ctx.lineTo(PAD + tW, y + rowH);
      ctx.stroke();

      ctx.textBaseline = 'middle';
      const rcy = y + rowH / 2;

      for (let i = 0; i < row.values.length; i++) {
        const h = opts.headers[i];
        ctx.textAlign = h.align;
        
        const tx = h.align === 'left' ? colXs[i] + 14
                 : h.align === 'right' ? colXs[i] + colWs[i] - 14
                 : colXs[i] + colWs[i] / 2;
                 
        if (row.badge && row.badge.colIndex === i) {
           this.drawBadge(ctx, tx, rcy, row.badge.text, row.badge.color, row.badge.bgAlpha, row.badge.borderAlpha);
        } else {
           ctx.fillStyle = row.colors?.[i] || BRAND.textLight;
           
           // If value contains a newline (e.g. for PnL + ROE), draw 2 lines
           if (row.values[i].includes('\n')) {
              const lines = row.values[i].split('\n');
              ctx.font = 'bold 16px "Arial"';
              ctx.fillText(lines[0], tx, rcy - 8);
              
              ctx.font = '11px "Arial"';
              // If we have a specific color for the 2nd line, we might want to use it, but for now we'll inherit the same color or use a slightly dimmed version
              // Actually, we pass colors in the array, so we'll just use the same row color (red or green)
              ctx.fillStyle = row.colors?.[i] === BRAND.profitGreen ? BRAND.profitSoft : (row.colors?.[i] === BRAND.lossRed ? BRAND.lossSoft : BRAND.textMuted);
              ctx.fillText(lines[1], tx, rcy + 10);
           } else {
              ctx.font = i === 0 ? 'bold 16px "Arial"' : '14px "Arial"';
              ctx.fillText(row.values[i], tx, rcy);
           }
        }
      }
      y += rowH;
    }

    return y;
  }

  // ─── Badge (LONG/SHORT) ───────────────────────────────────────────

  drawBadge(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    text: string,
    color: string,
    bgAlpha = 0.08,
    borderAlpha = 0.25,
  ): void {
    ctx.font = 'bold 10px "Arial"';
    const tw = ctx.measureText(text).width;
    const bW = tw + 22, bH = 22;
    const bX = x - bW / 2, bY = y - bH / 2;

    roundRect(ctx, bX, bY, bW, bH, 4);
    // Extract RGB from hex color for rgba
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    ctx.fillStyle = `rgba(${r},${g},${b},${bgAlpha})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${r},${g},${b},${borderAlpha})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }

  // ─── Position Chart Block (v8) ────────────────────────────────────

  drawPositionChartBlock(
    ctx: CanvasRenderingContext2D,
    opts: {
      startY: number;
      width: number;
      asset: string;
      side: string;
      uPnl: number;
      roe: number;
      metrics: { label: string; val: string }[];
      candles: number[];
      entryPrice: number;
      tpPrice?: number | null;
      slPrice?: number | null;
    }
  ): number {
    const PAD = 40;
    let cy = opts.startY;
    const w = opts.width;

    // -- Asset Name & Badge
    const isLong = opts.side.toUpperCase() === 'LONG';
    const sideColor = isLong ? BRAND.profitGreen : BRAND.lossRed;
    const sideColorRgb = isLong ? '0,230,118' : '255,68,68';

    // Draw Badge
    ctx.font = 'bold 12px "Arial"';
    const badgeW = ctx.measureText(opts.side).width + 24;
    roundRect(ctx, PAD, cy, badgeW, 26, 4);
    ctx.fillStyle = `rgba(${sideColorRgb}, 0.1)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${sideColorRgb}, 0.3)`;
    ctx.lineWidth = 1;
    ctx.stroke();
    
    ctx.fillStyle = sideColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.side, PAD + badgeW/2, cy + 13);

    // -- Asset Title
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.textWhite;
    ctx.font = 'bold 28px "Arial"';
    ctx.fillText(opts.asset, PAD + badgeW + 16, cy + 14);

    // -- PnL & ROE 
    ctx.textAlign = 'right';
    ctx.fillStyle = opts.uPnl >= 0 ? BRAND.profitGreen : BRAND.lossRed;
    ctx.font = 'bold 24px "Arial"';
    const roeStr = `(${(opts.roe * 100).toFixed(2)}%)`;
    const pnlSign = opts.uPnl >= 0 ? '+' : '-';
    ctx.fillText(`${pnlSign}$${Math.abs(opts.uPnl).toFixed(2)}  ${roeStr}`, w - PAD, cy + 14);

    cy += 48;

    // -- Metrics Row
    const mWidth = (w - 2 * PAD) / opts.metrics.length;
    ctx.textAlign = 'center';
    for (let i = 0; i < opts.metrics.length; i++) {
      const mx = PAD + i * mWidth + mWidth/2;
      ctx.fillStyle = BRAND.textMuted;
      ctx.font = '10px "Arial"';
      ctx.fillText(opts.metrics[i].label, mx, cy);
      ctx.fillStyle = BRAND.textWhite;
      ctx.font = opts.metrics.length > 4 ? 'bold 14px "Arial"' : 'bold 16px "Arial"';
      ctx.fillText(opts.metrics[i].val, mx, cy + 20);
    }

    cy += 50;

    // -- Line Chart Area
    const chH = 140;
    const chW = w - 2 * PAD;
    const chX = PAD;
    const chY = cy;

    // grid lines for chart
    ctx.strokeStyle = BRAND.gridLine;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(chX, chY + (i * chH / 4));
      ctx.lineTo(chX + chW, chY + (i * chH / 4));
      ctx.stroke();
    }

    // Chart Line processing
    const maxP = Math.max(...opts.candles, opts.entryPrice);
    const minP = Math.min(...opts.candles, opts.entryPrice);
    const spread = (maxP - minP) || 1;
    const PADDING = spread * 0.15;
    const calcY = (val: number) => {
      let y = chY + chH - ((val - (minP - PADDING)) / (spread + 2 * PADDING)) * chH;
      // Clamp to chart boundaries
      y = Math.max(chY + 12, Math.min(y, chY + chH - 12));
      return y;
    };

    ctx.beginPath();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5; // thicker line for beauty
    ctx.lineJoin = 'round';
    for (let i = 0; i < opts.candles.length; i++) {
      const x = chX + (i / (opts.candles.length - 1)) * chW;
      const y = chY + chH - ((opts.candles[i] - (minP - PADDING)) / (spread + 2 * PADDING)) * chH; // pure Y for candles
      if (i === 0) ctx.moveTo(x, y);
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

    // Helper to draw dashed line & tag
    const drawLineAndTag = (price: number, label: string, color: string, isBgDark: boolean = true) => {
      const y = calcY(price);
      
      // Line
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.moveTo(chX, y);
      ctx.lineTo(chX + chW, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tag
      ctx.font = 'bold 10px "Arial"';
      const tagText = `${label} ${price}`;
      const tagW = ctx.measureText(tagText).width + 12;
      const tagY = y - 8;

      roundRect(ctx, chX, tagY, tagW, 16, 2);
      ctx.fillStyle = isBgDark ? BRAND.bgDarker : color;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      ctx.fillStyle = isBgDark ? BRAND.textLight : '#FFFFFF';
      if (!isBgDark) {
         // for filled backgrounds like GiWei SL (if we want, else just leave dark bg)
         // ACTUALLY GiWei SL box is dark red with a red border and red text, or just solid.
         // Let's stick to dark bg with colored border and colored text to match FoxBlaze aesthetic.
      }
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tagText, chX + tagW/2, y);
    };

    // Draw Entry
    drawLineAndTag(opts.entryPrice, opts.side.toUpperCase(), BRAND.textMuted, true);

    // Draw TP
    if (opts.tpPrice) {
      drawLineAndTag(opts.tpPrice, 'TP', BRAND.profitGreen, true);
    }

    // Draw SL
    if (opts.slPrice) {
      drawLineAndTag(opts.slPrice, 'SL', BRAND.lossRed, true);
    }

    // -- Current Price Dot
    const currentY = calcY(opts.candles[opts.candles.length - 1]);
    ctx.beginPath();
    ctx.arc(chX + chW, currentY, 4, 0, Math.PI * 2);
    ctx.fillStyle = sideColor;
    ctx.fill();
    
    // Pulse ring
    ctx.beginPath();
    ctx.arc(chX + chW, currentY, 12, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${sideColorRgb}, 0.2)`;
    ctx.fill();

    return cy + chH + 50; // return new Y position
  }

  // ─── History List Block (v8) ──────────────────────────────────────

  drawHistoryList(
    ctx: CanvasRenderingContext2D,
    opts: {
      startY: number;
      width: number;
      histories: {
        asset: string;
        side: string;
        leverage: number;
        status: string;
        entry: number;
        exit?: number;
        size: number;
        pnl?: number;
        date: string;
      }[];
    }
  ): number {
    const PAD = 40;
    const logicalW = opts.width;
    let cy = opts.startY;
    const rowH = 68;

    for (let i = 0; i < opts.histories.length; i++) {
      const h = opts.histories[i];
      
      const isClosed = h.status === 'CLOSED';
      const pnl = h.pnl || 0;
      const isProfit = pnl >= 0;
      
      // Draw dot for time
      ctx.beginPath();
      ctx.arc(PAD + 4, cy + rowH/2, 4, 0, Math.PI * 2);
      ctx.fillStyle = isClosed ? BRAND.textMuted : BRAND.lossRed;
      ctx.fill();

      // Line connecting dots
      if (i < opts.histories.length - 1) {
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
      
      const isLongStr = h.side.toUpperCase() === 'LONG';
      const sideColor = isLongStr ? BRAND.profitGreen : BRAND.lossRed;
      
      ctx.font = 'bold 16px "Arial"';
      ctx.fillStyle = BRAND.textWhite;
      ctx.fillText(`${h.asset}`, PAD + 24, cy + 20);

      const assetW = ctx.measureText(h.asset).width;

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

      if (isClosed && h.exit) {
        // Entry / Exit
        const fmtP = (p: number) => {
          if (p >= 1) return p.toFixed(2);
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
        ctx.fillText(`(${isProfit ? '+' : '-'}${Math.abs(roe).toFixed(2)}%)`, logicalW - PAD, cy + 44);
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

    return cy + 10;
  }

  // ─── PNL Chart Block (v8) ─────────────────────────────────────────

  drawPnlChart(
    ctx: CanvasRenderingContext2D,
    opts: {
      startY: number;
      width: number;
      height: number;
      pnlData: number[]; // e.g. cumulative daily pnl
    }
  ): number {
    const PAD = 40;
    const cy = opts.startY;
    const w = opts.width;
    
    // We'll occupy whatever is left in opts.height minus some footer padding
    const chH = opts.height - cy - 50; 
    const chW = w - 2 * PAD;
    const chX = PAD;
    const chY = cy;

    if (opts.pnlData.length === 0) return cy; // Safety

    const isProfit = opts.pnlData[opts.pnlData.length - 1] >= 0;
    const pnlColor = isProfit ? BRAND.profitGreen : BRAND.lossRed;

    // Grid lines
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

    const maxP = Math.max(...opts.pnlData, 0);
    const minP = Math.min(...opts.pnlData, 0);
    const spread = maxP - minP || 1;
    const PADDING = spread * 0.15;
    const actualMin = minP - PADDING;
    const actualMax = maxP + PADDING;
    const actualSpread = actualMax - actualMin;

    const calcY = (val: number) => chY + chH - ((val - actualMin) / actualSpread) * chH;

    // Zero-line (baseline)
    const zeroY = calcY(0);
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = BRAND.textMuted;
    ctx.lineWidth = 1;
    ctx.moveTo(chX, zeroY);
    ctx.lineTo(chX + chW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Line chart
    ctx.beginPath();
    ctx.strokeStyle = pnlColor;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    
    for (let i = 0; i < opts.pnlData.length; i++) {
      const x = chX + (i / (Math.max(1, opts.pnlData.length - 1))) * chW;
      const y = calcY(opts.pnlData[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Gradient filling under line
    const grad = ctx.createLinearGradient(0, chY, 0, chY + chH);
    if (isProfit) {
      grad.addColorStop(0, 'rgba(0, 230, 118, 0.2)');
      grad.addColorStop(1, 'rgba(0, 230, 118, 0)');
    } else {
      grad.addColorStop(0, 'rgba(255, 68, 68, 0.2)');
      grad.addColorStop(1, 'rgba(255, 68, 68, 0)');
    }
    
    // Complete the path for fill
    ctx.lineTo(chX + chW, chY + chH);
    ctx.lineTo(chX, chY + chH);
    ctx.fillStyle = grad;
    ctx.fill();

    // Final point dot
    const finalIndex = opts.pnlData.length - 1;
    const fx = chX + chW;
    const fy = calcY(opts.pnlData[finalIndex]);
    ctx.beginPath();
    ctx.arc(fx, fy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(fx, fy, 14, 0, Math.PI * 2);
    ctx.fillStyle = isProfit ? 'rgba(0,230,118,0.2)' : 'rgba(255,68,68,0.2)';
    ctx.fill();

    return cy + chH + 20;
  }

  /**
   * Reference-matched Full-card renderer for closed position.
   * Size: 1024 x 512
   */
  async drawNewClosedPositionCard(
    ctx: CanvasRenderingContext2D,
    opts: {
      width: number;
      height: number;
      username: string;
      asset: string;
      side: string;
      leverage: number;
      entry: number;
      exit: number;
      size: number;
      pnl: number;
      roe: number;
      hideProfit: boolean;
      avatarImage?: Image | null;
      assetLogo?: Image | null;
    }
  ): Promise<void> {
    const w = opts.width;
    const h = opts.height;
    const isProfit = opts.pnl >= 0;
    
    const tealProfit = '#2EEBA5';
    const redLoss = '#FF4444';

    ctx.save();

    // ─── Background ───────────────
    ctx.fillStyle = '#05110E';
    ctx.fillRect(0, 0, w, h);

    // ─── Right Side FOX Art (draw early, behind everything) ───────────────
    ctx.save();
    const useFox2 = Math.random() > 0.5;
    const foxImg = useFox2 ? this.fox2Img : this.fox1Img;
    if (foxImg) {
      // Use screen blend mode so the black background of the image becomes transparent
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.6; 
      
      const fH = h + 200; // Oversize
      const fW = fH * (foxImg.width / foxImg.height);
      ctx.drawImage(foxImg, w - fW + 160, -100, fW, fH);
    }
    ctx.restore();

    const PAD = 70;

    // ─── Format helpers ───────────────
    const formatPrice = (num: number) => {
       if (num >= 1) {
          if (Number.isInteger(num)) return num.toLocaleString('en-US');
          return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
       }
       return num.toFixed(4);
    };
    const formatPnl = (num: number) => {
       return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // ─── TOP LEFT: Avatar + Username ───────────────
    const topY = 55;
    const avSize = 36;
    
    if (opts.avatarImage) {
       ctx.save();
       ctx.beginPath();
       ctx.arc(PAD + avSize/2, topY + avSize/2, avSize/2, 0, Math.PI * 2);
       ctx.clip();
       ctx.drawImage(opts.avatarImage, PAD, topY, avSize, avSize);
       ctx.restore();
    } else if (this.logoImg) {
       ctx.save();
       ctx.beginPath();
       ctx.arc(PAD + avSize/2, topY + avSize/2, avSize/2, 0, Math.PI * 2);
       ctx.fillStyle = '#0A1814';
       ctx.fill();
       ctx.strokeStyle = 'rgba(255,255,255,0.15)';
       ctx.lineWidth = 1;
       ctx.stroke();
       ctx.clip();
       const logoP = 8;
       ctx.drawImage(this.logoImg, PAD + logoP, topY + logoP, avSize - logoP*2, avSize - logoP*2);
       ctx.restore();
    } else {
       ctx.fillStyle = '#111D1A';
       ctx.beginPath();
       ctx.arc(PAD + avSize/2, topY + avSize/2, avSize/2, 0, Math.PI * 2);
       ctx.fill();
       ctx.strokeStyle = 'rgba(255,255,255,0.15)';
       ctx.lineWidth = 1;
       ctx.stroke();
       ctx.fillStyle = BRAND.textWhite;
       ctx.font = '500 18px "Inter", sans-serif';
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillText(opts.username.charAt(0).toUpperCase(), PAD + avSize/2, topY + avSize/2 + 1);
    }
    
    ctx.fillStyle = BRAND.textWhite;
    ctx.font = 'bold 32px "Inter", sans-serif'; 
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.username, PAD + avSize + 14, topY + avSize/2 + 1);

    // ─── CENTER LEFT: Asset Icon + Name + Badge ───────────────
    const midY = 240; // Increased spacing to prevent overlapping
    const iconSize = 52;
    
    // Circle icon
    if (!opts.assetLogo) {
       ctx.beginPath();
       ctx.arc(PAD + iconSize/2, midY + iconSize/2, iconSize/2, 0, Math.PI*2);
       ctx.fillStyle = '#0A1814';
       ctx.fill();
       ctx.strokeStyle = 'rgba(255,255,255,0.15)';
       ctx.lineWidth = 1;
       ctx.stroke();
    }
    
    if (opts.assetLogo) {
       ctx.save();
       ctx.beginPath();
       ctx.arc(PAD + iconSize/2, midY + iconSize/2, iconSize/2, 0, Math.PI*2);
       ctx.clip();
       ctx.drawImage(opts.assetLogo, PAD, midY, iconSize, iconSize);
       ctx.restore();
    } else if (this.logoImg) {
       ctx.save();
       ctx.beginPath();
       ctx.arc(PAD + iconSize/2, midY + iconSize/2, iconSize/2 - 1, 0, Math.PI*2);
       ctx.clip();
       const lp = 8;
       ctx.drawImage(this.logoImg, PAD + lp, midY + lp, iconSize - lp*2, iconSize - lp*2);
       ctx.restore();
    } else {
       ctx.fillStyle = '#FFFFFF';
       ctx.font = '28px "Inter", sans-serif';
       ctx.textAlign = 'center';
       ctx.textBaseline = 'middle';
       ctx.fillText('◆', PAD + iconSize/2, midY + iconSize/2 + 1);
    }

    // Asset Name — regular weight Teodor (thinner than bold)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '68px "Teodor", serif'; 
    ctx.fillStyle = '#FFFFFF';
    const assetX = PAD + iconSize + 18;
    const assetCY = midY + iconSize/2;
    ctx.fillText(opts.asset, assetX, assetCY);
    const assetW = ctx.measureText(opts.asset).width;

    // "LONG 10X" Hyperliquid-style pill badge
    const isLong = opts.side.toUpperCase() === 'LONG';
    const badgeText = `${opts.side.toUpperCase()} ${opts.leverage}X`;
    const badgeColor = isLong ? tealProfit : redLoss;
    
    ctx.font = 'bold 26px "Teodor", serif'; 
    const badgePadX = 16;
    const badgePadY = 8;
    const badgeTextW = ctx.measureText(badgeText).width;
    const badgeW = badgeTextW + badgePadX * 2;
    const badgeH = 26 + badgePadY * 2;
    const badgeX = assetX + assetW + 20;
    const badgeY = assetCY - badgeH / 2;
    
    ctx.fillStyle = isLong ? 'rgba(46, 235, 165, 0.15)' : 'rgba(255, 68, 68, 0.15)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    ctx.fill();
    
    ctx.fillStyle = badgeColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, badgeX + badgeW/2, badgeY + badgeH/2 + 1);

    // ─── HERO PNL ───────────────
    ctx.save();
    const pnlY = 420; // Adjusted down
    ctx.fillStyle = isProfit ? tealProfit : redLoss;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    
    if (opts.hideProfit) {
        const roeStr = `${isProfit ? '+' : ''}${(opts.roe * 100).toFixed(2)}%`;
        ctx.font = '110px "Teodor", serif';
        ctx.fillText(roeStr, PAD, pnlY);
    } else {
        const sign = isProfit ? '+' : '-';
        const pnlNum = `${sign}${formatPnl(Math.abs(opts.pnl))}`;
        ctx.font = '110px "Teodor", serif';
        ctx.fillText(pnlNum, PAD, pnlY);
        const numW = ctx.measureText(pnlNum).width;
        // USDT suffix smaller, aligned to baseline
        ctx.font = '500 44px "Inter", sans-serif';
        ctx.fillText(' USDT', PAD + numW, pnlY);
    }
    ctx.restore();

    // ─── BOTTOM ROW: Metrics + Logo (aligned baselines) ───────────────
    const labelY = h - 145;
    const valueY = h - 95;
    const colSpacing = 220;

    const metrics = [
      { label: 'Entry', val: `$${formatPrice(opts.entry)}` },
      { label: 'Exit', val: `$${formatPrice(opts.exit)}` },
      { label: 'Size', val: opts.hideProfit ? '***' : `$${formatPrice(opts.size)}` }
    ];

    for(let i=0; i<metrics.length; i++) {
       const mx = PAD + i * colSpacing;
       ctx.fillStyle = '#6B7A8D';
       ctx.font = '20px "Inter", sans-serif';
       ctx.textAlign = 'left';
       ctx.textBaseline = 'alphabetic';
       ctx.fillText(metrics[i].label, mx, labelY);

       ctx.fillStyle = '#FFFFFF';
       ctx.font = '500 32px "Inter", sans-serif';
       ctx.fillText(metrics[i].val, mx, valueY);
    }

    // ─── BOTTOM RIGHT LOGO — vertically centered with metrics ───────────────
    if (this.foxTextImg) {
       const tw = 260;
       const th = tw * (this.foxTextImg.height / this.foxTextImg.width);
       // Align logo center with midpoint between labelY and valueY
       const metricsCenter = (labelY + valueY) / 2;
       ctx.drawImage(this.foxTextImg, w - tw - PAD, metricsCenter - th/2, tw, th);
    }

    ctx.restore();
  }

  async generateNewClosedPositionBuffer(
    botInstance: any,
    opts: {
      telegramId: bigint;
      username: string;
      asset: string;
      side: string;
      leverage: number;
      entry: number;
      exit: number;
      size: number;
      pnl: number;
      roe: number;
      hideProfit: boolean;
    }
  ): Promise<Buffer> {
    const w = 1600;
    const h = 920;
    
    // Setup canvas: Scale down to exactly 1280px width (0.8 scale)
    // Telegram aggressively compresses anything over 1280px, causing blur.
    const S = 0.8;
    const canvas = createCanvas(w * S, h * S);
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    
    // Fetch Avatar
    let avatarImage: Image | null = null;
    if (botInstance && botInstance.token) {
       try {
          const photos = await botInstance.api.getUserProfilePhotos(Number(opts.telegramId), { limit: 1 });
          if (photos.total_count > 0) {
             const fileId = photos.photos[0][0].file_id;
             const file = await botInstance.api.getFile(fileId);
             const url = `https://api.telegram.org/file/bot${botInstance.token}/${file.file_path}`;
             avatarImage = await loadImage(url);
          }
       } catch(e: any) {
          this.logger.warn(`Could not load avatar for ${opts.telegramId}: ${e.message}`);
       }
    }

    // Fetch Token SVG Logo from Hyperliquid
    let assetLogo: Image | null = null;
    if (opts.asset) {
       try {
          const fetchLogoUrl = (url: string) => new Promise<Buffer>((resolve, reject) => {
             const https = require('https');
             https.get(url, (res: any) => {
                if (res.statusCode !== 200) return reject(new Error(`Not found: ${res.statusCode}`));
                let data = '';
                res.on('data', (c: any) => data += c);
                res.on('end', () => {
                   let svg = data;
                   if (!svg.includes('<svg')) return reject(new Error('HTML fallback returned, not an SVG'));
                   if (!svg.includes('width=')) svg = svg.replace('<svg', '<svg width="200" height="200"');
                   resolve(Buffer.from(svg));
                });
             }).on('error', reject);
          });
          
          let svgBuf: Buffer;
          const assetUpper = opts.asset.toUpperCase();
          try {
             svgBuf = await fetchLogoUrl(`https://app.hyperliquid.xyz/coins/${assetUpper}.svg`);
          } catch(e) {
             // Fallback for pre-launch or special tokens like GOLD -> xyz:GOLD
             svgBuf = await fetchLogoUrl(`https://app.hyperliquid.xyz/coins/xyz:${assetUpper}.svg`);
          }
          
          assetLogo = await loadImage(svgBuf);
       } catch(e) {
          // fallback to standard logo if fetch fails silently
          this.logger.warn(`Could not load Hyperliquid SVG for asset ${opts.asset}`);
       }
    }

    try {
        await this.drawNewClosedPositionCard(ctx, { ...opts, width: w, height: h, avatarImage, assetLogo });
    } catch(e) {
        this.logger.error("Failed to render new closed position card", e);
    }
    
    return this.toBuffer(canvas);
  }

  // ─── PREMIUM CARD ───────────────────────────────────────────────
  
  drawPremiumCard(
    ctx: CanvasRenderingContext2D,
    opts: {
      width: number;
      height: number;
      username: string;
      autoCopy: boolean;
      copySize: number;
      isActivated: boolean;
    }
  ): void {
    const w = opts.width;
    const h = opts.height;
    const color = opts.autoCopy ? BRAND.profitGreen : BRAND.lossRed;

    ctx.save();

    const PAD = 48;
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px "Arial"';
    const brandTextW = ctx.measureText('FOXBLAZE').width;

    let logoW = 0;
    const logoH = 48;
    const logoGap = 14;
    if (this.logoImg) {
      logoW = Math.round(logoH * (this.logoImg.width / this.logoImg.height));
    }
    const totalW = logoW + (logoW > 0 ? logoGap : 0) + brandTextW;
    const startX = (w - totalW) / 2;

    if (this.logoImg) {
      ctx.drawImage(this.logoImg, startX, PAD, logoW, logoH);
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.brandTeal;
    ctx.font = 'bold 28px "Arial"';
    const textX = startX + logoW + (logoW > 0 ? logoGap : 0);
    ctx.fillText('FOXBLAZE', textX, PAD + 18);

    ctx.fillStyle = BRAND.brandTeal; // Teal tone for premium
    ctx.font = '12px "Arial"';
    ctx.fillText('⭐   P R E M I U M   A C C O U N T', textX, PAD + 40);

    // USERNAME Hero
    const heroY = 220;
    ctx.textAlign = 'center';
    ctx.fillStyle = BRAND.textWhite;
    ctx.font = '900 80px "Arial"';
    ctx.fillText(opts.username.toUpperCase(), w / 2, heroY);

    if (opts.isActivated) {
      // STATUS BADGE
      const roeY = 320;
      const actText = `STATUS: ACTIVATED`;
      ctx.font = 'bold 24px "Arial"';
      const rw = ctx.measureText(actText).width + 60;
      const rh = 48;
      roundRect(ctx, w / 2 - rw / 2, roeY - rh / 2, rw, rh, rh / 2);
      ctx.fillStyle = 'rgba(0, 230, 118, 0.12)';
      ctx.fill();
      ctx.fillStyle = BRAND.profitGreen;
      ctx.fillText(actText, w / 2, roeY);

      // AUTO COPY STATUS
      const copyY = 440;
      const acText = `AUTO-COPY: ${opts.autoCopy ? 'ENABLED' : 'DISABLED'}`;
      ctx.font = 'bold 32px "Arial"';
      const cw = ctx.measureText(acText).width + 64;
      const chHeight = 64;
      roundRect(ctx, w / 2 - cw / 2, copyY - chHeight / 2, cw, chHeight, 8);
      ctx.fillStyle = opts.autoCopy ? 'rgba(0, 230, 118, 0.1)' : 'rgba(255, 68, 68, 0.1)';
      ctx.fill();
      ctx.strokeStyle = opts.autoCopy ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 68, 68, 0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(acText, w / 2, copyY);

      // MARGIN INFO
      const infoY = 560;
      ctx.font = '24px "Arial"';
      ctx.fillStyle = BRAND.textLight;
      ctx.fillText(`Default Copy Margin: $${opts.copySize} USDC`, w / 2, infoY);
      
      const subInfoY = 620;
      ctx.font = '16px "Arial"';
      ctx.fillStyle = BRAND.textMuted;
      ctx.fillText('⭐   VIP Signals   ·   🤖   Auto-Copy Trade   ·   🚀   High Risk Config', w / 2, subInfoY);

    } else {
      ctx.fillStyle = BRAND.textMuted;
      ctx.font = '24px "Arial"';
      ctx.fillText('ACCOUNT NOT ACTIVATED', w / 2, 400);
    }

    // FOOTER
    ctx.font = '14px "Arial"';
    ctx.fillStyle = BRAND.textDark;
    ctx.fillText('foxblaze.trade · Complete Control', w / 2, h - 40);

    ctx.restore();
  }

  async generatePremiumCardBuffer(opts: { username: string, autoCopy: boolean, copySize: number, isActivated: boolean }): Promise<Buffer> {
    const w = 1000;
    const h = 750;
    const { canvas, ctx } = this.createCard(w, h);
    
    try {
        if (this.bgImg) {
           // Draw the full background image at a reduced opacity to not overwhelm the text
           ctx.globalAlpha = 0.25;
           ctx.drawImage(this.bgImg, 0, 0, w, h);
           ctx.globalAlpha = 1.0;
        }
    } catch (e) {
        this.logger.error("Failed to load background for Premium Card", e);
    }

    this.drawPremiumCard(ctx, { width: w, height: h, ...opts });
    return this.toBuffer(canvas);
  }

  // ─── Utils ─────────────────────────────────────────────────────────

  toBuffer(canvas: Canvas): Buffer {
    return canvas.toBuffer('image/png');
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCanvas, loadImage, Canvas, CanvasRenderingContext2D, Image } from 'canvas';
import * as path from 'path';

// ─── Balanced Color Palette (v7) ─────────────────────────────────
// Brand accent = warm amber (fire, not blood)
// Red = ONLY for loss/short values
// Green = ONLY for profit/long values
export const BRAND = {
  // Background
  bgDark:       '#0d1117',
  bgDarker:     '#090d12',

  // Brand accent (amber — fox fire 🔥)
  brandAmber:   '#E8862A',

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

  async onModuleInit() {
    const publicDir = path.resolve(process.cwd(), 'public');
    try {
      this.logoImg = await loadImage(path.join(publicDir, 'logo_foxblaze.png'));
      this.bgImg = await loadImage(path.join(publicDir, 'bg_card.png'));
      this.logger.log('✅ Brand assets loaded (logo + bg)');
    } catch (e: any) {
      this.logger.warn(`⚠️ Brand assets not found: ${e.message}`);
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
    ctx.fillStyle = BRAND.brandAmber;
    ctx.font = 'bold 22px "Arial"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOXBLAZE', cx, tcY - 9);

    // Sub-brand
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '9px "Arial"';
    ctx.fillText(opts.subtitle || 'T R A D I N G   B O T', cx, tcY + 10);

    // Right label
    if (opts.rightLabel) {
      ctx.textAlign = 'right';
      ctx.fillStyle = opts.rightLabelColor || BRAND.textWhite;
      ctx.font = 'bold 26px "Arial"';
      ctx.fillText(opts.rightLabel, opts.width - PAD, tcY - 8);

      if (opts.rightSubtitle) {
        ctx.fillStyle = BRAND.textMuted;
        ctx.font = '9px "Arial"';
        ctx.fillText(opts.rightSubtitle, opts.width - PAD, tcY + 10);
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

    ctx.fillStyle = BRAND.textDark;
    ctx.font = '9px "Arial"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tipText, w / 2, fY + 18);
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
   * Full-card renderer for closed position.
   * Designed for 1000x1000 canvas with SVG background already drawn.
   * Modern, minimalist, focused layout.
   */
  drawClosedPositionCard(
    ctx: CanvasRenderingContext2D,
    opts: {
      width: number;
      height: number;
      asset: string;
      side: string;
      leverage: number;
      entry: number;
      exit: number;
      pnl: number;
      roe: number;
    }
  ): void {
    const w = opts.width;
    const h = opts.height;
    const isProfit = opts.pnl >= 0;
    const color = isProfit ? BRAND.profitGreen : BRAND.lossRed;
    const sign = isProfit ? '+' : '';

    ctx.save();

    // ─── HEADER (centered) ────────────────────────────────────────
    const PAD = 48;

    ctx.textBaseline = 'middle';
    ctx.font = 'bold 28px "Arial"';
    const brandTextW = ctx.measureText('FOXBLAZE').width;

    // Calculate total branding width (logo + gap + text)
    let logoW = 0;
    const logoH = 48;
    const logoGap = 14;
    if (this.logoImg) {
      logoW = Math.round(logoH * (this.logoImg.width / this.logoImg.height));
    }
    const totalW = logoW + (logoW > 0 ? logoGap : 0) + brandTextW;
    const startX = (w - totalW) / 2;

    // Logo
    if (this.logoImg) {
      ctx.drawImage(this.logoImg, startX, PAD, logoW, logoH);
    }

    // Brand name
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.brandAmber;
    ctx.font = 'bold 28px "Arial"';
    const textX = startX + logoW + (logoW > 0 ? logoGap : 0);
    ctx.fillText('FOXBLAZE', textX, PAD + 18);

    // Subtitle
    ctx.fillStyle = BRAND.textMuted;
    ctx.font = '12px "Arial"';
    ctx.fillText('P O S I T I O N   C L O S E D', textX, PAD + 40);

    // ─── SIDE + ASSET BADGE (centered, upper area) ───────────────
    const badgeY = 200;
    const badgeText = `${opts.side.toUpperCase()}  ·  ${opts.asset}  ·  ${opts.leverage}x`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 24px "Arial"';

    const bw = ctx.measureText(badgeText).width + 56;
    const bh = 52;

    roundRect(ctx, w / 2 - bw / 2, badgeY - bh / 2, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = BRAND.textLight;
    ctx.fillText(badgeText, w / 2, badgeY);

    // ─── HERO: PNL $ (centered, dominant) ────────────────────────
    const heroY = 420;
    const pnlText = `${sign}$${Math.abs(opts.pnl).toFixed(2)}`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 120px "Arial"';
    ctx.fillStyle = color;
    ctx.fillText(pnlText, w / 2, heroY);

    // ─── ROE % BADGE (below PNL) ─────────────────────────────────
    const roeY = 530;
    const roeText = `${sign}${Math.abs(opts.roe).toFixed(2)}%`;
    ctx.font = 'bold 28px "Arial"';

    const rw = ctx.measureText(roeText).width + 40;
    const rh = 48;

    roundRect(ctx, w / 2 - rw / 2, roeY - rh / 2, rw, rh, rh / 2);
    ctx.fillStyle = isProfit ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 68, 68, 0.12)';
    ctx.fill();

    ctx.fillStyle = color;
    ctx.fillText(roeText, w / 2, roeY);

    // ─── INFO LINE (entry → exit, subtle) ────────────────────────
    const infoY = 640;
    ctx.font = '20px "Arial"';
    ctx.fillStyle = BRAND.textMuted;
    ctx.textBaseline = 'middle';
    
    const entryStr = opts.entry >= 1 ? opts.entry.toFixed(2) : opts.entry.toFixed(4);
    const exitStr = opts.exit >= 1 ? opts.exit.toFixed(2) : opts.exit.toFixed(4);
    ctx.fillText(`Entry $${entryStr}   →   Exit $${exitStr}`, w / 2, infoY);

    // ─── FOOTER ──────────────────────────────────────────────────
    ctx.font = '14px "Arial"';
    ctx.fillStyle = BRAND.textDark;
    ctx.fillText('foxblaze.trade · Auto-generated Trade Report', w / 2, h - 40);

    ctx.restore();
  }

  // ─── Utils ─────────────────────────────────────────────────────────

  toBuffer(canvas: Canvas): Buffer {
    return canvas.toBuffer('image/png');
  }
}

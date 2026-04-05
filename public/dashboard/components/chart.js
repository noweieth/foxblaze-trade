// Canvas based PnL Chart

let pnlChartInstance = null;

function renderPnLChart(canvasId, labels, values) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Determine colors
    const lineColor = '#3b82f6'; // Modern Blue
    const gradientTop = 'rgba(59, 130, 246, 0.3)';
    const gradientBottom = 'rgba(59, 130, 246, 0)';

    // Dimensions
    let width = canvas.offsetWidth;
    // Set internal resolution
    canvas.width = width;
    canvas.height = 200;
    const height = canvas.height;

    const padding = { top: 30, right: 20, bottom: 30, left: 50 };
    const maxVal = Math.max(...values, 5); // At least 5 for scale
    const minVal = 0; // Users can't be negative, start at 0
    let range = maxVal - minVal;
    if (range === 0) range = 1;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw Grid & Labels
    ctx.fillStyle = '#656565';
    ctx.font = '12px Inter';
    ctx.textAlign = 'right';

    // Y Axis (3 lines)
    for (let i = 0; i <= 2; i++) {
        const val = minVal + (range * i) / 2;
        const y = height - padding.bottom - ((val - minVal) / range) * (height - padding.top - padding.bottom);
        
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.strokeStyle = '#2d2d2d';
        ctx.stroke();

        ctx.fillText(Math.round(val).toString(), padding.left - 10, y + 4);
    }

    // X Axis Labels (start and end)
    ctx.textAlign = 'left';
    ctx.fillText(labels[0], padding.left, height - 10);
    ctx.textAlign = 'right';
    ctx.fillText(labels[labels.length - 1], width - padding.right, height - 10);

    // Line Path
    const getX = (index) => padding.left + (index / Math.max(1, labels.length - 1)) * (width - padding.left - padding.right);
    const getY = (val) => height - padding.bottom - ((val - minVal) / range) * (height - padding.top - padding.bottom);

    ctx.beginPath();
    ctx.moveTo(getX(0), getY(values[0]));
    for (let i = 1; i < values.length; i++) {
        ctx.lineTo(getX(i), getY(values[i]));
    }
    
    // Draw Gradient
    const grad = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    grad.addColorStop(0, gradientTop);
    grad.addColorStop(1, gradientBottom);
    
    ctx.lineTo(getX(values.length - 1), height - padding.bottom);
    ctx.lineTo(getX(0), height - padding.bottom);
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(values[0]));
    for (let i = 1; i < values.length; i++) {
        ctx.lineTo(getX(i), getY(values[i]));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Data points
    for (let i = 0; i < values.length; i++) {
        ctx.beginPath();
        ctx.arc(getX(i), getY(values[i]), 3, 0, 2 * Math.PI);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = lineColor;
        ctx.stroke();
    }
}

async function fetchAndRenderChart(range = '7d') {
    try {
        const res = await fetch(`/api/admin/stats/users-chart?range=${range}`);
        const result = await res.json();
        if (result.status === 'success') {
            renderPnLChart('pnl-chart', result.data.labels, result.data.values);
        }
    } catch(e) {
        console.error("Chart fetch error", e);
    }
}

// Window resize handling
window.addEventListener('resize', () => {
    const activeRange = document.querySelector('.time-filters span.active')?.innerText.toLowerCase() || '7d';
    fetchAndRenderChart(activeRange);
});

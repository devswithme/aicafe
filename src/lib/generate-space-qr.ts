import QRCode from "qrcode";

const CANVAS_WIDTH = 900;
const CANVAS_HEIGHT = 1200;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

export async function generateSpaceQrPng({
  chatUrl,
  spaceName,
  logo,
}: {
  chatUrl: string;
  spaceName: string;
  logo: string | null;
}): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const padding = 72;
  const watermarkHeight = 150;
  const titleHeight = 56;
  const qrSize = Math.min(
    CANVAS_WIDTH - padding * 2,
    CANVAS_HEIGHT - padding * 2 - watermarkHeight - titleHeight - 32,
  );
  const qrX = (CANVAS_WIDTH - qrSize) / 2;
  const qrY = padding + titleHeight + 16;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.fillStyle = "#111111";
  ctx.font = "bold 40px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(spaceName, CANVAS_WIDTH / 2, padding + titleHeight / 2);

  const qrDataUrl = await QRCode.toDataURL(chatUrl, {
    errorCorrectionLevel: "H",
    margin: 1,
    width: qrSize,
    color: { dark: "#111111", light: "#ffffff" },
  });

  const qrImage = await loadImage(qrDataUrl);
  ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  const logoSize = Math.round(qrSize * 0.22);
  const logoX = qrX + (qrSize - logoSize) / 2;
  const logoY = qrY + (qrSize - logoSize) / 2;
  const logoPad = Math.round(logoSize * 0.18);

  ctx.fillStyle = "#ffffff";
  drawRoundedRect(
    ctx,
    logoX - logoPad,
    logoY - logoPad,
    logoSize + logoPad * 2,
    logoSize + logoPad * 2,
    16,
  );
  ctx.fill();

  const logoSrc = logo ?? "/fav.svg";
  try {
    const logoImage = await loadImage(logoSrc);
    drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 12);
    ctx.save();
    ctx.clip();
    ctx.drawImage(logoImage, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } catch {
    const fallback = await loadImage("/fav.svg");
    drawRoundedRect(ctx, logoX, logoY, logoSize, logoSize, 12);
    ctx.save();
    ctx.clip();
    ctx.drawImage(fallback, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  }

  const watermarkTop = CANVAS_HEIGHT - watermarkHeight;
  ctx.strokeStyle = "#e5e5e5";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(padding, watermarkTop);
  ctx.lineTo(CANVAS_WIDTH - padding, watermarkTop);
  ctx.stroke();

  const brandMarkSize = 44;
  const watermarkText = "AI Cafe by Fydemy";
  ctx.font = "500 28px system-ui, -apple-system, sans-serif";
  const textWidth = ctx.measureText(watermarkText).width;
  const groupWidth = brandMarkSize + 14 + textWidth;
  const groupX = (CANVAS_WIDTH - groupWidth) / 2;
  const brandY = watermarkTop + (watermarkHeight - brandMarkSize) / 2;

  const brandMark = await loadImage("/fav.svg");
  ctx.drawImage(brandMark, groupX, brandY, brandMarkSize, brandMarkSize);

  ctx.fillStyle = "#666666";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(
    watermarkText,
    groupX + brandMarkSize + 14,
    watermarkTop + watermarkHeight / 2,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Failed to export PNG"))),
      "image/png",
    );
  });
}

export async function downloadSpaceQr(options: {
  chatUrl: string;
  spaceName: string;
  logo: string | null;
  filename: string;
}) {
  const blob = await generateSpaceQrPng(options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = options.filename;
  link.click();
  URL.revokeObjectURL(url);
}

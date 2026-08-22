'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, RotateCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

const MASK_SIZE = 288; // Anzeige-Größe der Maske (px)
const OUTPUT_SIZE = 512; // Export-Auflösung (quadratisch)
const MAX_BYTES = 1024 * 1024;

/**
 * Overlay zum Zuschneiden des Profilbilds: kreisrunde Maske, 
 * verschchieb- und per Slider zoombar. Bestätigt wird immer ein quadratischer,
 * zentrischer Ausschnitt als JPEG ≤ 1 MB.
 */
export function AvatarCropDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const [loaded, setLoaded] = useState<{ url: string; w: number; h: number } | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pending, setPending] = useState(false);

  const natural = loaded ? { w: loaded.w, h: loaded.h } : { w: 0, h: 0 };
  // Scale so, dass die Maske immer vollständig bedeckt ist.
  const baseScale = natural.w > 0 ? Math.max(MASK_SIZE / natural.w, MASK_SIZE / natural.h) : 1;
  const scale = baseScale * zoom;
  const imgW = natural.w * scale;
  const imgH = natural.h * scale;

  // Bild per objectURL laden; State erst im async-onload-Callback setzen.
  useEffect(() => {
    let cancelled = false;
    const u = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (cancelled) {
        URL.revokeObjectURL(u);
        return;
      }
      setLoaded({ url: u, w: img.naturalWidth, h: img.naturalHeight });
      imgRef.current = img;
    };
    img.src = u;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(u);
    };
  }, [file]);

  // Escape schließt Abbrechen — bewusst kein Volume an Native-Dialogen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Beim Zoomen Position neu begrenzen, damit die Maske nie leer bleibt.
  function clamp(p: { x: number; y: number }) {
    const maxX = Math.max(0, (imgW - MASK_SIZE) / 2);
    const maxY = Math.max(0, (imgH - MASK_SIZE) / 2);
    return { x: Math.min(maxX, Math.max(-maxX, p.x)), y: Math.min(maxY, Math.max(-maxY, p.y)) };
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, baseX: pos.x, baseY: pos.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    setPos(
      clamp({
        x: drag.current.baseX + (e.clientX - drag.current.startX),
        y: drag.current.baseY + (e.clientY - drag.current.startY),
      }),
    );
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img) return;
    setPending(true);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setPending(false);
      return;
    }
    // Anzeige-Maske (MASK_SIZE) auf Export-Auflösung hochskaliert übertragen.
    const f = OUTPUT_SIZE / MASK_SIZE;
    const w = imgW * f;
    const h = imgH * f;
    let quality = 0.85;
    let blob = await render(canvas, ctx, img, w, h, f, quality);
    while (blob.size > MAX_BYTES && quality > 0.4) {
      quality -= 0.15;
      blob = await render(canvas, ctx, img, w, h, f, quality);
    }
    onConfirm(blob);
    setPending(false);
  }

  async function render(
    canvas: HTMLCanvasElement,
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    w: number,
    h: number,
    f: number,
    quality: number,
  ): Promise<Blob> {
    ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    ctx.drawImage(
      img,
      OUTPUT_SIZE / 2 + pos.x * f - w / 2,
      OUTPUT_SIZE / 2 + pos.y * f - h / 2,
      w,
      h,
    );
    return new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encodieren fehlgeschlagen'))), 'image/jpeg', quality),
    );
  }

  return (
    <div className="bg-background/80 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur">
      <div className="bg-card border-border w-full max-w-sm rounded-xl border p-6 shadow-xl">
        <h2 className="mb-1 text-lg font-semibold">Profilbild zuschneiden</h2>
        <p className="text-muted-foreground mb-5 text-sm">
          Bild verschieben und zoomen — der Kreis zeigt den Ausschnitt.
        </p>

        <div className="mb-4 flex justify-center">
          <div
            className="border-ring relative cursor-grab touch-none overflow-hidden rounded-full border-4 ring-4 ring-transparent select-none active:cursor-grabbing"
            style={{ width: MASK_SIZE, height: MASK_SIZE }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="img"
            aria-label="Bildausschnitt-Vorschau"
          >
            {loaded && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={loaded.url}
                alt=""
                draggable={false}
                className="absolute top-1/2 left-1/2 max-w-none"
                style={{
                  width: imgW || undefined,
                  height: imgH || undefined,
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                }}
              />
            )}
          </div>
        </div>

        <label className="mb-6 block text-sm">
          <span className="text-muted-foreground mb-1 block text-xs">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => {
              setZoom(Number(e.target.value));
              setPos(clamp(pos));
            }}
            className="w-full"
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setPos({ x: 0, y: 0 })}>
            <RotateCcw className="h-4 w-4" /> Zurücksetzen
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel}>
              <X className="h-4 w-4" /> Abbrechen
            </Button>
            <Button size="sm" onClick={confirm} disabled={pending || natural.w === 0}>
              <Check className="h-4 w-4" /> {pending ? 'Lädt …' : 'Übernehmen'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

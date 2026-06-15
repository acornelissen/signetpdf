// The signature pad: a canvas the user draws on with the pointer, exporting a
// transparent-background PNG (Uint8Array) for embedding as a SignatureStamp.
// Drawing strokes onto a transparent canvas keeps the background clear, so the
// stamp composites cleanly over the page on save (m4-5).

/** Encode PNG bytes as a `data:image/png;base64,...` URL for an <img> src. */
export function pngBytesToDataUrl(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

/** Decode a `data:...;base64,<payload>` URL to raw bytes. */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  if (base64.length === 0) {
    return new Uint8Array(0);
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export interface SignaturePad {
  /** The canvas element to mount in the UI. */
  readonly element: HTMLCanvasElement;
  /** True until the user has drawn at least one stroke; reset by clear(). */
  isEmpty(): boolean;
  /** Erase all strokes and reset to empty. */
  clear(): void;
  /** Export the drawing as a transparent-background PNG. */
  exportPng(): Uint8Array;
}

/** Create a signature pad with a transparent canvas of the given pixel size. */
export function createSignaturePad(width: number, height: number): SignaturePad {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.className = "signature-pad";

  const context = canvas.getContext("2d");
  if (context) {
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f0f0f";
  }

  let empty = true;
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  const pointAt = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    empty = false;
    const { x, y } = pointAt(event);
    lastX = x;
    lastY = y;
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!drawing || !context) {
      return;
    }
    const { x, y } = pointAt(event);
    context.beginPath();
    context.moveTo(lastX, lastY);
    context.lineTo(x, y);
    context.stroke();
    lastX = x;
    lastY = y;
  });

  const endStroke = (): void => {
    drawing = false;
  };
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointerleave", endStroke);

  return {
    element: canvas,
    isEmpty: () => empty,
    clear() {
      context?.clearRect(0, 0, canvas.width, canvas.height);
      empty = true;
      drawing = false;
    },
    exportPng() {
      return dataUrlToBytes(canvas.toDataURL("image/png"));
    },
  };
}

"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const containerId = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          onScan(decodedText);
          scanner.stop().catch(() => {});
        },
        () => {}
      )
      .catch((err) => console.error("camera start failed", err));

    return () => {
      scannerRef.current?.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[28px] bg-ink">
      <div id={containerId} className="h-full w-full [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
      {(["top-4 left-4 border-l-2 border-t-2", "top-4 right-4 border-r-2 border-t-2", "bottom-4 left-4 border-l-2 border-b-2", "bottom-4 right-4 border-r-2 border-b-2"] as const).map(
        (pos) => (
          <div key={pos} className={`pointer-events-none absolute h-8 w-8 rounded-sm border-emerald-bright ${pos}`} />
        )
      )}
    </div>
  );
}

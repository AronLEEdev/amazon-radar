'use client';

import { useState } from 'react';
import { ChevronRight, Copy, Check } from 'lucide-react';

export function RawJson({ data }: { data: unknown }) {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-3 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((x) => !x)}
          className="flex items-center gap-1 text-xs font-medium text-zinc-700"
        >
          <ChevronRight
            size={12}
            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          payload ({Math.round(text.length / 1024)} KB)
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      {expanded ? (
        <pre className="max-h-[480px] overflow-auto bg-zinc-950 p-3 font-mono text-[11px] leading-snug text-zinc-100">
          {text}
        </pre>
      ) : null}
    </div>
  );
}

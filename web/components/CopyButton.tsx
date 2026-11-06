"use client";

import { useState } from "react";
import { Icon } from "./Icons";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      aria-label={done ? "Copied" : label}
      title={done ? "Copied" : label}
      data-done={done}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        } catch {
          /* clipboard blocked: the text is still selectable */
        }
      }}
    >
      <Icon id={done ? "i-ok" : "i-copy"} size={15} />
      <span role="status" className="sr">{done ? "Copied" : ""}</span>
    </button>
  );
}

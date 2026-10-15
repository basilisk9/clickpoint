"use client";

import type { ReactNode } from "react";
import { Tex } from "./Tex";

/* Richtext: the ONLY markup a card's prose may contain.
   $...$ inline LaTeX · $$...$$ display LaTeX · **bold** · *italic*
   Everything visual beyond this comes from the shared design system, so a
   card can never smuggle in its own styling or an unsafe tag. */

const TOKEN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\*\*[^*]+?\*\*|\*[^*\n]+?\*)/g;

export function Rich({ text }: { text: string }): ReactNode {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        if (part.startsWith("$$"))
          return (
            <Tex key={index} block>
              {part.slice(2, -2)}
            </Tex>
          );
        if (part.startsWith("$"))
          return <Tex key={index}>{part.slice(1, -1)}</Tex>;
        if (part.startsWith("**"))
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("*"))
          return <em key={index}>{part.slice(1, -1)}</em>;
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

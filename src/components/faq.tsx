"use client";

import { useState } from "react";
import { faq } from "@/lib/faq";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="pop divide-y-2 divide-ink/10 overflow-hidden bg-card">
      {faq.map((entry, index) => {
        const expanded = open === index;
        return (
          <div key={entry.question} className="px-5 sm:px-6">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={`faq-answer-${index}`}
              onClick={() => setOpen(expanded ? null : index)}
              className="flex w-full cursor-pointer items-center justify-between gap-6 py-4.5 text-left text-[15.5px] font-medium text-ink transition-colors duration-200 hover:text-accent-deep"
            >
              {entry.question}
              <span
                className={`faq-plus grid size-7 shrink-0 place-items-center rounded-full border-2 border-ink bg-sun text-[16px] font-bold leading-none text-ink transition-transform duration-300 ${
                  expanded ? "is-open" : ""
                }`}
                aria-hidden
              >
                +
              </span>
            </button>
            <div
              id={`faq-answer-${index}`}
              className={`faq-panel ${expanded ? "is-open" : ""}`}
            >
              <div className="overflow-hidden">
                <p className="max-w-[62ch] pb-5 pr-8 text-[14px] leading-relaxed text-muted">
                  {entry.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

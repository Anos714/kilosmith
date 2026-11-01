"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { TOOL_ICONS } from "@/components/icons";
import { tools, type ToolId } from "@/lib/site";
import ResizeTool from "@/components/tools/resize";
import CropTool from "@/components/tools/crop";
import CompressTool from "@/components/tools/compress";
import ConvertTool from "@/components/tools/convert";
import GifTool from "@/components/tools/gif";
import MemeTool from "@/components/tools/meme";
import FaviconTool from "@/components/tools/favicon";
import { Spinner } from "@/components/ui";

const VideoTool = dynamic(() => import("@/components/tools/video"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center gap-2 text-[13px] text-muted">
      <Spinner /> loading the encoder…
    </div>
  ),
});

const MAP: Record<ToolId, React.ComponentType> = {
  resize: ResizeTool,
  crop: CropTool,
  compress: CompressTool,
  convert: ConvertTool,
  video: VideoTool,
  gif: GifTool,
  meme: MemeTool,
  favicon: FaviconTool,
};

export default function ToolSwitcher() {
  const [active, setActive] = useState<ToolId>("resize");
  const [mounted, setMounted] = useState<ToolId[]>(["resize"]);

  function select(id: ToolId) {
    setActive(id);
    setMounted((previous) => (previous.includes(id) ? previous : [...previous, id]));
  }

  const current = tools.find((tool) => tool.id === active)!;

  return (
    <div className="pop scroll-mt-24 overflow-hidden bg-card">
      <div
        role="tablist"
        aria-label="Tools"
        className="grid grid-cols-2 gap-2 border-b-[2.5px] border-ink bg-paper-2 p-3 sm:grid-cols-4 lg:grid-cols-8"
      >
        {tools.map((tool, index) => {
          const Icon = TOOL_ICONS[tool.icon as keyof typeof TOOL_ICONS];
          const isActive = tool.id === active;
          return (
            <button
              key={tool.id}
              id={`tab-${tool.id}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={mounted.includes(tool.id) ? `panel-${tool.id}` : undefined}
              onClick={() => select(tool.id)}
              className={`group relative rounded-2xl border-2 px-3 py-2.5 text-left transition-all duration-200 ${
                isActive
                  ? `border-ink ${tool.color} -translate-y-0.5 shadow-[3px_3px_0_var(--color-shadow)]`
                  : "border-ink/15 bg-card/80 text-ink-2 hover:-translate-y-0.5 hover:border-ink hover:bg-card hover:shadow-[2px_2px_0_var(--color-shadow)]"
              }`}
            >
              <span className="block font-[family-name:var(--font-display)] text-[11px] font-medium text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 font-[family-name:var(--font-display)] text-[14px] font-medium">
                <span
                  className={`grid size-5 place-items-center rounded-full border-2 border-ink/70 ${tool.color}`}
                  aria-hidden
                >
                  <Icon size={12} />
                </span>
                {tool.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink/10 bg-paper-2 px-4 py-5 sm:px-6">
        <div>
          <h2 className="text-[26px] leading-none text-ink">{current.name}</h2>
          <p className="mt-2 max-w-[60ch] text-[13.5px] text-muted">{current.blurb}</p>
        </div>
        <span className="sticker rotate-2 bg-butter text-[12px]">free · no account</span>
      </div>

      <div className="bg-paper p-3 sm:p-5">
        {mounted.map((id) => {
          const Tool = MAP[id];
          return (
            <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={id !== active}>
              <Tool />
            </div>
          );
        })}
      </div>
    </div>
  );
}

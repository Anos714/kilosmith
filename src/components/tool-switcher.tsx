"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { TOOL_ICONS } from "@/components/icons";
import { tools, type ToolId } from "@/lib/site";
import ResizeTool from "@/components/tools/resize";
import CompressTool from "@/components/tools/compress";
import ConvertTool from "@/components/tools/convert";
import GifTool from "@/components/tools/gif";
import MemeTool from "@/components/tools/meme";
import FaviconTool from "@/components/tools/favicon";
import { Spinner } from "@/components/ui";

const VideoTool = dynamic(() => import("@/components/tools/video"), {
  ssr: false,
  loading: () => (
    <div className="flex h-48 items-center justify-center gap-2 text-[12px] text-zinc-500">
      <Spinner /> loading the encoder…
    </div>
  ),
});

const MAP: Record<ToolId, React.ComponentType> = {
  resize: ResizeTool,
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
    <div id="tools">
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tools.map((tool) => {
          const Icon = TOOL_ICONS[tool.icon as keyof typeof TOOL_ICONS];
          const isActive = tool.id === active;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => select(tool.id)}
              aria-pressed={isActive}
              className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-[12.5px] transition ${
                isActive
                  ? "border-acid/40 bg-acid/10 text-acid"
                  : "border-line bg-panel text-zinc-400 hover:border-line-2 hover:text-zinc-200"
              }`}
            >
              <Icon size={14} />
              {tool.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3 overflow-hidden rounded-[16px] border border-line bg-panel/60">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-[14px] font-medium text-zinc-100">{current.name}</h2>
            <p className="mt-0.5 text-[12px] text-zinc-500">{current.blurb}</p>
          </div>
          <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-zinc-500">
            free · no account
          </span>
        </div>

        <div className="p-4">
          {mounted.map((id) => {
            const Tool = MAP[id];
            return (
              <div key={id} hidden={id !== active}>
                <Tool />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

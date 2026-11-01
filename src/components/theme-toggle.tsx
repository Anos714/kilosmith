"use client";

import { IconMoon, IconSun } from "@/components/icons";
import { applyTheme, isDark } from "@/lib/theme";

export function ThemeToggle() {
  return (
    <button
      type="button"
      aria-label="Switch between day and night"
      title="Day or night — your files still never leave this device"
      onClick={() => applyTheme(!isDark())}
      className="wiggle grid size-10 shrink-0 place-items-center rounded-full border-2 border-ink bg-paper-2 text-ink shadow-[2px_2px_0_var(--color-shadow)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac hover:shadow-[3px_3px_0_var(--color-shadow)] active:translate-y-0.5 active:shadow-none"
    >
      <span className="dark:hidden">
        <IconMoon size={17} />
      </span>
      <span className="hidden dark:block">
        <IconSun size={17} />
      </span>
    </button>
  );
}

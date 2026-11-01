export const THEME_KEY = "kilosmith-theme";

const PAPER = "#fff9ee";
const NIGHT = "#1a1030";

export function isDark() {
  return document.documentElement.classList.contains("dark");
}

/** Paint the theme, retint the browser chrome, and remember the choice. */
export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? NIGHT : PAPER);
  try {
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  } catch {
    /* Private mode: the tab still flips, it just forgets. */
  }
}

/** Runs before first paint so the page never flashes cream at night-owls. */
export const themeBootstrap = `(function(){try{var s=localStorage.getItem("${THEME_KEY}");var d=s?s==="dark":matchMedia("(prefers-color-scheme: dark)").matches;if(!d)return;var r=document.documentElement;r.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","${NIGHT}");}catch(e){}})();`;

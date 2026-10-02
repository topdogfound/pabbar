export interface ParsedUserAgent {
  browser: string;
  os: string;
  mobile: boolean;
}

const BROWSERS: [RegExp, string][] = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: [RegExp, string][] = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

/** Small, dependency-free user agent summary for the sessions list. */
export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: "Unknown browser", os: "Unknown device", mobile: false };
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "Unknown browser";
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1] ?? "Unknown device";
  return { browser, os, mobile: /Android|iPhone|iPad|iPod|Mobile/.test(ua) };
}

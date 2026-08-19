"use client";

import CodeMirror from "@uiw/react-codemirror";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { StreamLanguage } from "@codemirror/language";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { properties } from "@codemirror/legacy-modes/mode/properties";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { xml } from "@codemirror/lang-xml";
import { yaml } from "@codemirror/lang-yaml";
import { oneDark } from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function languageFor(filename: string) {
  const ext = extOf(filename);
  switch (ext) {
    case "json":
      return json();
    case "yaml":
    case "yml":
      return yaml();
    case "js":
    case "mjs":
    case "cjs":
      return javascript();
    case "ts":
    case "tsx":
      return javascript({ typescript: true });
    case "jsx":
      return javascript({ jsx: true });
    case "xml":
    case "svg":
      return xml();
    case "html":
    case "htm":
      return html();
    case "md":
    case "markdown":
      return markdown();
    case "css":
      return css();
    case "sh":
    case "bash":
      return StreamLanguage.define(shell);
    case "lua":
      return StreamLanguage.define(lua);
    case "ini":
    case "cfg":
    case "conf":
    case "properties":
    case "vdf":
    case "toml":
    case "env":
      return StreamLanguage.define(properties);
    default:
      return undefined;
  }
}

const panelEditorTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#06090e",
      color: "#e8eef6",
      fontSize: "12px",
      height: "100%",
    },
    ".cm-scroller": {
      fontFamily: "var(--font-mono, IBM Plex Mono, ui-monospace, monospace)",
      lineHeight: "1.55",
    },
    "&.cm-focused": {
      outline: "2px solid rgba(61, 156, 253, 0.35)",
      outlineOffset: "-1px",
    },
    ".cm-gutters": {
      backgroundColor: "#0a0f16",
      color: "#8b9bb0",
      borderRight: "1px solid #243041",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "#121821",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(61, 156, 253, 0.06)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(61, 156, 253, 0.22) !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#3d9cfd",
    },
    ".cm-panels": {
      backgroundColor: "#121821",
      color: "#e8eef6",
    },
    ".cm-panels.cm-panels-top": {
      borderBottom: "1px solid #243041",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #243041",
    },
    ".cm-tooltip": {
      backgroundColor: "#121821",
      color: "#e8eef6",
      border: "1px solid #243041",
    },
  },
  { dark: true },
);

export function FileCodeEditor({
  value,
  onChange,
  filename,
  className,
  height,
}: {
  value: string;
  onChange: (value: string) => void;
  filename: string;
  className?: string;
  height?: string;
}) {
  const extensions = useMemo(() => {
    const lang = languageFor(filename);
    const exts = [oneDark, panelEditorTheme, EditorView.lineWrapping];
    if (lang) exts.push(lang);
    return exts;
  }, [filename]);

  return (
    <CodeMirror
      value={value}
      height={height ?? "100%"}
      theme="none"
      className={cn(
        "overflow-hidden rounded-lg bg-[#06090e] text-foreground",
        className,
      )}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        bracketMatching: true,
        autocompletion: false,
      }}
    />
  );
}

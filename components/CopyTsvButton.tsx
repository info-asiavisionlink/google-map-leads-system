"use client";

import { useState } from "react";

type CopyTsvButtonProps = {
  copyText: string;
  disabled?: boolean;
};

export default function CopyTsvButton({
  copyText,
  disabled = false,
}: CopyTsvButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!copyText) return;

    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("クリップボードへのコピーに失敗:", err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !copyText}
      className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {copied ? "コピーしました" : "スプレッドシート用にコピー"}
    </button>
  );
}

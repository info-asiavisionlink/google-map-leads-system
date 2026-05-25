"use client";

import dynamic from "next/dynamic";

const SearchPage = dynamic(() => import("@/components/SearchPage"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 text-sm text-gray-600">
      読み込み中…
    </div>
  ),
});

export default function SearchPageClient() {
  return <SearchPage />;
}

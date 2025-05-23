"use client"
import FileUploader from "@/components/FileUploader";
import { useState } from "react";

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);

  const handleFilesSelected = async (files) => {
    setIsProcessing(true);
    setError(null);
    setResults(null);
    try {
      const formData = new FormData();
      // Only support single file for parse/route.js
      formData.append("file", files[0]);
      const response = await fetch("/api/v1/parse", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process PDF");
      }
      const data = await response.json();
      setResults(data);
    } catch (err) {
      setError(err.message || "An error occurred while processing the PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 gap-16 sm:p-20 font-[family-name:var(--font-geist-sans)]">
      <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
        <h1>File Upload and Document Processing Using AI</h1>
        <FileUploader onFilesSelected={handleFilesSelected} disabled={isProcessing} />
        {isProcessing && <div className="text-blue-600 mt-4">Processing...</div>}
        {error && <div className="text-red-600 mt-4">{error}</div>}
        {results && (
          <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
            <h2 className="font-bold mb-2">Results</h2>
            <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(results, null, 2)}</pre>
          </div>
        )}
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
        @2023 Your Company Name. All rights reserved.
      </footer>
    </div>
  );
}

"use client"
import FileUploader from "@/components/FileUploader";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FiInfo, FiUpload, FiSearch, FiChevronDown, FiX } from "react-icons/fi";

const MODEL_OPTIONS = [
  { value: "llama3:2", label: "Llama 3.2" },
  { value: "snowflake-arctic-embed2", label: "Snowflake Arctic Embed 2" },
  { value: "text-embedding-ada-002", label: "OpenAI Ada 002" },
];

export default function Home() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMetadata, setSelectedMetadata] = useState(null);
  const [selectedModel, setSelectedModel] = useState(MODEL_OPTIONS[0].value);

  const handleFilesSelected = async (files) => {
    setIsProcessing(true);
    setError(null);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append("file", files[0]);
      formData.append("model", selectedModel);
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

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsProcessing(true);
    setError(null);
    setSearchResults([]);
    setSelectedMetadata(null);
    try {
      const response = await fetch(`/api/v1/search?query=${encodeURIComponent(searchQuery)}&model=${selectedModel}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to search documents");
      }
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (err) {
      setError(err.message || "An error occurred while searching");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 text-gray-900 flex flex-col">
      <header className="w-full flex items-center justify-between px-8 py-5 border-b bg-white/90 backdrop-blur sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <FiInfo className="text-blue-600 text-2xl" />
          <span className="font-bold text-xl tracking-tight">AI Document Processing</span>
        </div>
        <Select value={selectedModel} onValueChange={setSelectedModel}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Select Model" />
          </SelectTrigger>
          <SelectContent>
            {MODEL_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>
      <main className="flex flex-col gap-10 items-center w-full max-w-3xl mx-auto py-10 px-2 flex-1">
        <Card className="w-full shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FiUpload className="text-blue-500" /> Upload a Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <FileUploader onFilesSelected={handleFilesSelected} disabled={isProcessing} />
            {isProcessing && <div className="text-blue-600 mt-4 animate-pulse">Processing...</div>}
            {error && <div className="text-red-600 mt-4 font-medium">{error}</div>}
            {results && (
              <ScrollArea className="mt-4 h-64 w-full rounded border bg-muted p-2">
                <div className="flex flex-col gap-6">
                  {results.chunks && results.chunks.map((chunk, idx) => (
                    <div key={idx} className="relative group bg-white rounded-lg shadow p-5 border border-gray-100 hover:shadow-lg transition-all">
                      {chunk.length > 300 && (
                        <span className="absolute -top-4 left-4 bg-blue-100 text-blue-600 rounded-full px-3 py-1 text-xs font-bold flex items-center gap-1 shadow">
                          <FiInfo className="inline-block" /> Chunk
                        </span>
                      )}
                      <div className="text-base whitespace-pre-wrap break-words leading-relaxed font-mono">
                        {chunk}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        {/* Semantic Search UI */}
        <Card className="w-full shadow-md border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <FiSearch className="text-blue-500" /> Semantic Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <Input
                type="text"
                placeholder="Search documents..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={isProcessing}
                className="flex-1"
              />
              <Button type="submit" disabled={isProcessing || !searchQuery.trim()} className="flex items-center gap-2">
                <FiSearch /> Search
              </Button>
            </form>
            {searchResults.length > 0 && (
              <ScrollArea className="h-72 w-full rounded border bg-muted p-2">
                <div className="flex flex-col gap-4">
                  {searchResults.map((result, idx) => (
                    <Card key={idx} className="bg-white border border-gray-200 rounded-lg shadow hover:shadow-lg transition-all">
                      <CardContent className="p-4 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-green-100 text-green-700 px-2 py-1 text-xs font-semibold">
                            {(result.relevance * 100).toFixed(1)}% Relevant
                          </Badge>
                          {result.content.length > 300 && (
                            <Badge className="bg-blue-100 text-blue-600 px-2 py-1 text-xs font-semibold flex items-center gap-1">
                              <FiInfo className="inline-block mr-1" /> Chunk
                            </Badge>
                          )}
                        </div>
                        <div className="text-base whitespace-pre-wrap break-words leading-relaxed font-mono">
                          {result.content}
                        </div>
                        <div className="flex justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            onClick={() => setSelectedMetadata(result.metadata)}
                            type="button"
                          >
                            <FiChevronDown className="inline-block mr-1" /> Metadata
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
        {/* Metadata Dropdown */}
        {selectedMetadata && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-white border border-gray-300 rounded shadow-lg p-4 w-full max-w-md z-50 animate-fade-in">
            <div className="flex justify-between items-center mb-2">
              <span className="font-bold">Document Metadata</span>
              <Button onClick={() => setSelectedMetadata(null)} variant="ghost" size="sm"><FiX /></Button>
            </div>
            <ScrollArea className="max-h-64">
              <pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(selectedMetadata, null, 2)}</pre>
            </ScrollArea>
          </div>
        )}
      </main>
      <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center text-xs text-muted-foreground py-4">
        @2023 The Lycra Company. All rights reserved.
      </footer>
    </div>
  );
}
